import { eventBus } from '../core/EventBus.js';
import { Colony, ColonyManager } from '../core/Colony.js';
import { Rule } from '../core/Rule.js';
import { ResourceField } from '../core/ResourceField.js';
import { TerrainLayer } from '../terrain/TerrainLayer.js';

const CHANNEL_NAME = 'cell-automata-sync';
const HEARTBEAT_INTERVAL = 5000;
const PEER_TIMEOUT = 10000;
const CURSOR_INTERVAL = 200;
const SYNC_WAIT_TIMEOUT = 3000;

function generatePeerId() {
  return Array.from({ length: 8 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

function peerIdToColor(peerId) {
  let hash = 0;
  for (let i = 0; i < peerId.length; i++) {
    hash = ((hash << 5) - hash) + peerId.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 55%)`;
}

export class CollaborationManager {
  constructor(cellStore, colonyManager, engine, patternManager, historyManager, resourceField, terrainLayer) {
    this.cellStore = cellStore;
    this.colonyManager = colonyManager;
    this.engine = engine;
    this.patternManager = patternManager;
    this.historyManager = historyManager;
    this.resourceField = resourceField;
    this.terrainLayer = terrainLayer;

    this.peerId = generatePeerId();
    this.channel = null;
    this.connected = false;
    this.disconnectedManually = false;

    this.peers = new Map();
    this.peerColors = new Map();

    this.pendingBatch = null;
    this.batchTimer = null;

    this.lastCursorX = null;
    this.lastCursorY = null;
    this.cursorOnCanvas = false;
    this.cursorTimer = null;

    this.heartbeatTimer = null;
    this.peerCleanupTimer = null;

    this.waitingForSync = false;
    this.syncWaitTimer = null;
    this.syncResponseReceived = false;

    this.remoteCursors = new Map();

    this.isApplyingRemote = false;
    this._lastEvolutionMsgTime = 0;
    this._lastCollisionMsgTime = 0;

    this._unsubscribers = [];
  }

  connect() {
    if (this.channel) return;

    try {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = (e) => this._handleMessage(e.data);
      this.connected = true;
      this.disconnectedManually = false;
    } catch (e) {
      console.error('Failed to create BroadcastChannel:', e);
      this.connected = false;
      return false;
    }

    window.addEventListener('beforeunload', this._onBeforeUnload);

    this._setupLocalListeners();
    this._startHeartbeat();
    this._startPeerCleanup();
    this._startCursorBroadcast();

    this._waitForInitialSync();

    eventBus.emit('collab:connected', {
      peerId: this.peerId,
      connected: true
    });

    return true;
  }

  disconnect() {
    this.disconnectedManually = true;
    this.connected = false;

    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }

    window.removeEventListener('beforeunload', this._onBeforeUnload);

    this._unsubscribers.forEach(unsub => {
      try { unsub(); } catch (e) {}
    });
    this._unsubscribers = [];

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.peerCleanupTimer) {
      clearInterval(this.peerCleanupTimer);
      this.peerCleanupTimer = null;
    }
    if (this.cursorTimer) {
      clearInterval(this.cursorTimer);
      this.cursorTimer = null;
    }
    if (this.syncWaitTimer) {
      clearTimeout(this.syncWaitTimer);
      this.syncWaitTimer = null;
    }
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    this.remoteCursors.clear();
    this.peers.clear();

    eventBus.emit('collab:cursorsUpdated', []);
    eventBus.emit('collab:disconnected', {
      peerId: this.peerId,
      connected: false
    });
  }

  reconnect() {
    this.disconnectedManually = false;
    return this.connect();
  }

  _onBeforeUnload = () => {
    if (this.channel) {
      this._sendMessage('peer_leave', {});
    }
    this.disconnect();
  };

  _setupLocalListeners() {
    const unsub1 = eventBus.on('colony:added', (colony) => {
      if (this.isApplyingRemote) return;
      this._sendMessage('rule_added', {
        colonyId: colony.id,
        rule: colony.rule.toJSON()
      });
      this._addLog('创建规则', colony.rule.name, this.peerId);
    });

    const unsub2 = eventBus.on('colony:removed', (colonyId) => {
      if (this.isApplyingRemote) return;
      this._sendMessage('rule_removed', { colonyId });
      this._addLog('删除规则', '', this.peerId);
    });

    const unsub3 = eventBus.on('colony:updated', (colony) => {
      if (this.isApplyingRemote) return;
      if (!colony || !colony.rule) return;
      this._sendMessage('rule_updated', {
        colonyId: colony.id,
        rule: colony.rule.toJSON(),
        paused: colony.paused
      });
    });

    const unsub4 = eventBus.on('settings:changed', () => {
      if (this.isApplyingRemote) return;
      const ts = Date.now();
      this._lastCollisionMsgTime = ts;
      this._sendMessage('collision_changed', {
        strategy: this.engine.collisionStrategy,
        __ts: ts
      });
      this._addLog('切换碰撞策略', this._strategyName(this.engine.collisionStrategy), this.peerId);
    });

    const unsub5 = eventBus.on('engine:runningChanged', (running) => {
      if (this.isApplyingRemote) return;
      const ts = Date.now();
      this._lastEvolutionMsgTime = ts;
      if (running) {
        this._sendMessage('evolution_start', { __ts: ts });
        this._addLog('开始演化', '', this.peerId);
      } else {
        this._sendMessage('evolution_stop', { __ts: ts });
        this._addLog('暂停演化', '', this.peerId);
      }
    });

    const unsub6 = eventBus.on('generation:changed', (gen) => {
    });

    const unsub7 = eventBus.on('mouse:hover', (world) => {
      const x = (world && world.x !== null && world.x !== undefined) ? world.x : null;
      const y = (world && world.y !== null && world.y !== undefined) ? world.y : null;
      this.cursorOnCanvas = (x !== null && y !== null);
      if (this.cursorOnCanvas) {
        this.lastCursorX = x;
        this.lastCursorY = y;
      }
    });

    const unsub8 = eventBus.on('pattern:placed', (data) => {
      if (this.isApplyingRemote) return;
    });

    this._unsubscribers.push(unsub1, unsub2, unsub3, unsub4, unsub5, unsub6, unsub7, unsub8);
  }

  _strategyName(s) {
    if (s === 'priority') return '优先级模式';
    if (s === 'competition') return '竞争模式';
    if (s === 'peace') return '和平模式';
    return s;
  }

  _waitForInitialSync() {
    this.waitingForSync = true;
    this.syncResponseReceived = false;

    this.syncWaitTimer = setTimeout(() => {
      if (!this.syncResponseReceived) {
        this.waitingForSync = false;
        this.syncWaitTimer = null;
        eventBus.emit('collab:syncState', {
          waiting: false,
          isFirst: true
        });
      }
    }, SYNC_WAIT_TIMEOUT);
  }

  _startHeartbeat() {
    const sendHeartbeat = () => {
      if (!this.connected || !this.channel) return;
      this._sendMessage('heartbeat', {
        generation: this.engine.generation,
        cellCount: this.cellStore.size()
      });
    };
    sendHeartbeat();
    this.heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
  }

  _startPeerCleanup() {
    this.peerCleanupTimer = setInterval(() => {
      const now = Date.now();
      const expired = [];
      for (const [pid, info] of this.peers.entries()) {
        if (now - info.lastSeen > PEER_TIMEOUT) {
          expired.push(pid);
        }
      }
      for (const pid of expired) {
        this.peers.delete(pid);
        this.remoteCursors.delete(pid);
        this.peerColors.delete(pid);
      }
      if (expired.length > 0) {
        this._emitPeerList();
        eventBus.emit('collab:cursorsUpdated', this._getCursorsArray());
      }
    }, 2000);
  }

  _startCursorBroadcast() {
    this.cursorTimer = setInterval(() => {
      if (!this.connected || !this.channel) return;
      if (this.cursorOnCanvas && this.lastCursorX !== null) {
        this._sendMessage('cursor', {
          x: this.lastCursorX,
          y: this.lastCursorY
        });
      } else {
        this._sendMessage('cursor', null);
      }
    }, CURSOR_INTERVAL);
  }

  _handleMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (!msg.type || !msg.peerId || msg.peerId === this.peerId) return;
    if (!this.connected) return;

    if (msg.targetPeerId && msg.targetPeerId !== this.peerId) return;

    if (msg.type !== 'heartbeat' && msg.type !== 'cursor') {
      console.log('[Collab] recv', msg.type, 'from', msg.peerId.slice(0, 4), msg.payload);
    }

    this._updatePeer(msg.peerId);

    switch (msg.type) {
      case 'heartbeat':
        this._handleHeartbeat(msg);
        break;
      case 'sync_request':
        this._handleSyncRequest(msg);
        break;
      case 'sync_response':
        this._handleSyncResponse(msg);
        break;
      case 'cells_batch':
        this._handleCellsBatch(msg);
        break;
      case 'evolution_step':
        this._handleEvolutionStep(msg);
        break;
      case 'evolution_start':
        this._handleEvolutionStart(msg);
        break;
      case 'evolution_stop':
        this._handleEvolutionStop(msg);
        break;
      case 'evolution_reset':
        this._handleEvolutionReset(msg);
        break;
      case 'rule_added':
        this._handleRuleAdded(msg);
        break;
      case 'rule_updated':
        this._handleRuleUpdated(msg);
        break;
      case 'rule_removed':
        this._handleRuleRemoved(msg);
        break;
      case 'collision_changed':
        this._handleCollisionChanged(msg);
        break;
      case 'pattern_placed':
        this._handlePatternPlaced(msg);
        break;
      case 'cursor':
        this._handleCursor(msg);
        break;
      case 'peer_leave':
        this._handlePeerLeave(msg);
        break;
    }
  }

  _updatePeer(peerId) {
    const existing = this.peers.get(peerId);
    const wasNew = !existing;
    this.peers.set(peerId, {
      lastSeen: Date.now()
    });
    if (!this.peerColors.has(peerId)) {
      this.peerColors.set(peerId, peerIdToColor(peerId));
    }
    if (wasNew) {
      this._emitPeerList();
    }
  }

  _emitPeerList() {
    eventBus.emit('collab:peerList', {
      count: this.peers.size + 1,
      peers: [...this.peers.keys()],
      selfId: this.peerId
    });
  }

  _handleHeartbeat(msg) {
    const payload = msg.payload || {};

    if (this.waitingForSync && !this.syncResponseReceived) {
      this._sendMessage('sync_request', {});
    }
  }

  _handleSyncRequest(msg) {
    const state = this._buildFullState();
    this._sendMessage('sync_response', state, msg.peerId);
  }

  _buildFullState() {
    return {
      generation: this.engine.generation,
      collisionStrategy: this.engine.collisionStrategy,
      running: this.engine.running,
      speed: this.engine.speed,
      colonies: this.colonyManager.toJSON(),
      cells: this.cellStore.toJSON(),
      resources: this.resourceField ? this.resourceField.toJSON() : null,
      terrain: this.terrainLayer ? this.terrainLayer.toJSON() : null
    };
  }

  _handleSyncResponse(msg) {
    if (!this.waitingForSync || this.syncResponseReceived) return;
    this.syncResponseReceived = true;
    this.waitingForSync = false;

    if (this.syncWaitTimer) {
      clearTimeout(this.syncWaitTimer);
      this.syncWaitTimer = null;
    }

    this._applyFullState(msg.payload || {});

    eventBus.emit('collab:syncState', {
      waiting: false,
      isFirst: false
    });
    this._addLog('同步状态完成', `从 ${msg.peerId.slice(0, 4)}`, msg.peerId);
  }

  _applyFullState(state) {
    this.isApplyingRemote = true;
    try {
      this.engine.stop();

      this.colonyManager.clear();
      this.cellStore.clear();
      if (this.resourceField) this.resourceField.clear();

      this.engine.generation = state.generation || 0;
      this.engine.collisionStrategy = state.collisionStrategy || 'priority';
      this.engine.speed = state.speed || 30;

      if (state.colonies) {
        for (const colonyData of state.colonies) {
          const colony = Colony.fromJSON(colonyData);
          this.colonyManager.colonies.set(colony.id, colony);
          if (!this.colonyManager.selectedColonyId) {
            this.colonyManager.selectedColonyId = colony.id;
          }
        }
      }

      if (state.cells) {
        for (const cell of state.cells) {
          this.cellStore.set(cell.x, cell.y, cell.c);
        }
      }

      if (this.resourceField && state.resources) {
        this.resourceField.copyFrom(ResourceField.fromJSON(state.resources));
      }

      if (this.terrainLayer && state.terrain) {
        this.terrainLayer.copyFrom(TerrainLayer.fromJSON(state.terrain));
      }

      const sel = document.getElementById('collision-strategy');
      if (sel) sel.value = this.engine.collisionStrategy;
      const slider = document.getElementById('speed-slider');
      if (slider) slider.value = this.engine.speed;
      const speedVal = document.getElementById('speed-value');
      if (speedVal) {
        speedVal.textContent = this.engine.speed === 100 ? '尽可能快' : `${this.engine.speed}代/秒`;
      }

      if (state.running) {
        this.engine.start();
      }

      eventBus.emit('state:updated');
      eventBus.emit('generation:changed', this.engine.generation);
      eventBus.emit('colony:selected', this.colonyManager.getSelected());
    } finally {
      this.isApplyingRemote = false;
    }
  }

  _handleCellsBatch(msg) {
    const payload = msg.payload || {};
    const ops = payload.operations || [];
    const ts = msg.timestamp || 0;

    this.isApplyingRemote = true;
    let setCount = 0;
    let delCount = 0;
    try {
      for (const op of ops) {
        if (op.op === 'set') {
          this.cellStore.set(op.x, op.y, op.colonyId);
          setCount++;
        } else if (op.op === 'delete') {
          this.cellStore.delete(op.x, op.y);
          delCount++;
        }
      }
      eventBus.emit('state:updated');
    } finally {
      this.isApplyingRemote = false;
    }

    const parts = [];
    if (setCount > 0) parts.push(`画了${setCount}个细胞`);
    if (delCount > 0) parts.push(`擦了${delCount}个细胞`);
    if (parts.length > 0) {
      this._addLog('细胞操作', parts.join('，'), msg.peerId);
    }
  }

  _handleEvolutionStep(msg) {
    const ts = msg.payload?.__ts || msg.timestamp || 0;
    if (ts < this._lastEvolutionMsgTime) return;
    this._lastEvolutionMsgTime = ts;

    if (this.engine.running) return;
    this.isApplyingRemote = true;
    try {
      this.engine.step();
    } finally {
      this.isApplyingRemote = false;
    }
    this._addLog('推进演化', '1代', msg.peerId);
  }

  _handleEvolutionStart(msg) {
    const ts = msg.payload?.__ts || msg.timestamp || 0;
    if (ts < this._lastEvolutionMsgTime) return;
    this._lastEvolutionMsgTime = ts;

    if (this.engine.running) return;
    this.isApplyingRemote = true;
    try {
      this.engine.start();
      eventBus.emit('engine:runningChanged', true);
    } finally {
      this.isApplyingRemote = false;
    }
    this._addLog('开始演化', '', msg.peerId);
  }

  _handleEvolutionStop(msg) {
    const ts = msg.payload?.__ts || msg.timestamp || 0;
    if (ts < this._lastEvolutionMsgTime) return;
    this._lastEvolutionMsgTime = ts;

    if (!this.engine.running) return;
    this.isApplyingRemote = true;
    try {
      this.engine.stop();
      eventBus.emit('engine:runningChanged', false);
    } finally {
      this.isApplyingRemote = false;
    }
    this._addLog('暂停演化', '', msg.peerId);
  }

  _handleEvolutionReset(msg) {
    this.isApplyingRemote = true;
    try {
      this.engine.reset();
    } finally {
      this.isApplyingRemote = false;
    }
    this._addLog('重置画布', '', msg.peerId);
  }

  _handleRuleAdded(msg) {
    const payload = msg.payload || {};
    if (this.colonyManager.getColony(payload.colonyId)) return;

    this.isApplyingRemote = true;
    try {
      const rule = Rule.fromJSON(payload.rule);
      const colony = new Colony(rule);
      colony.id = payload.colonyId;
      this.colonyManager.addColony(colony);
    } finally {
      this.isApplyingRemote = false;
    }
    this._addLog('创建规则', payload.rule?.name || '', msg.peerId);
  }

  _handleRuleUpdated(msg) {
    const payload = msg.payload || {};
    const colony = this.colonyManager.getColony(payload.colonyId);
    if (!colony || !payload.rule) return;

    this.isApplyingRemote = true;
    try {
      const newRule = Rule.fromJSON(payload.rule);
      newRule.id = colony.rule.id;
      colony.rule = newRule;
      if (payload.paused !== undefined) {
        colony.paused = payload.paused;
      }
      eventBus.emit('colony:updated', colony);
      eventBus.emit('state:updated');
    } finally {
      this.isApplyingRemote = false;
    }
  }

  _handleRuleRemoved(msg) {
    const payload = msg.payload || {};
    if (!this.colonyManager.getColony(payload.colonyId)) return;

    this.isApplyingRemote = true;
    try {
      const cells = this.cellStore.getCellsByColony(payload.colonyId);
      for (const cell of cells) {
        this.cellStore.delete(cell.x, cell.y);
      }
      this.colonyManager.removeColony(payload.colonyId);
      eventBus.emit('state:updated');
    } finally {
      this.isApplyingRemote = false;
    }
    this._addLog('删除规则', '', msg.peerId);
  }

  _handleCollisionChanged(msg) {
    const payload = msg.payload || {};
    const ts = payload.__ts || msg.timestamp || 0;
    if (ts < this._lastCollisionMsgTime) return;
    this._lastCollisionMsgTime = ts;

    if (this.engine.collisionStrategy === payload.strategy) return;
    this.isApplyingRemote = true;
    try {
      this.engine.setCollisionStrategy(payload.strategy);
      const sel = document.getElementById('collision-strategy');
      if (sel) sel.value = payload.strategy;
    } finally {
      this.isApplyingRemote = false;
    }
    this._addLog('切换碰撞策略', this._strategyName(payload.strategy), msg.peerId);
  }

  _handlePatternPlaced(msg) {
    const payload = msg.payload || {};
    const cells = payload.cells || [];
    const startX = payload.offsetX || 0;
    const startY = payload.offsetY || 0;
    const colonyId = payload.colonyId;

    if (!this.colonyManager.getColony(colonyId)) return;

    this.isApplyingRemote = true;
    try {
      for (const [dx, dy] of cells) {
        this.cellStore.set(startX + dx, startY + dy, colonyId);
      }
      eventBus.emit('state:updated');
    } finally {
      this.isApplyingRemote = false;
    }
    this._addLog('放置图案', `${cells.length}个细胞`, msg.peerId);
  }

  _handleCursor(msg) {
    const payload = msg.payload;
    const peerId = msg.peerId;

    if (payload === null || payload === undefined || payload.x === null) {
      if (this.remoteCursors.has(peerId)) {
        this.remoteCursors.delete(peerId);
        eventBus.emit('collab:cursorsUpdated', this._getCursorsArray());
      }
      return;
    }

    this.remoteCursors.set(peerId, {
      x: payload.x,
      y: payload.y,
      color: this.peerColors.get(peerId) || '#fff',
      peerId
    });
    eventBus.emit('collab:cursorsUpdated', this._getCursorsArray());
  }

  _handlePeerLeave(msg) {
    this.peers.delete(msg.peerId);
    this.remoteCursors.delete(msg.peerId);
    this.peerColors.delete(msg.peerId);
    this._emitPeerList();
    eventBus.emit('collab:cursorsUpdated', this._getCursorsArray());
  }

  _getCursorsArray() {
    return [...this.remoteCursors.values()];
  }

  _sendMessage(type, payload, targetPeerId = null) {
    if (!this.channel || !this.connected) return false;

    const msg = {
      type,
      peerId: this.peerId,
      timestamp: Date.now(),
      payload
    };

    if (targetPeerId) {
      msg.targetPeerId = targetPeerId;
    }

    try {
      this.channel.postMessage(msg);
      return true;
    } catch (e) {
      console.error('Failed to send message:', e);
      return false;
    }
  }

  _addLog(type, desc, peerId) {
    eventBus.emit('collab:log', {
      time: Date.now(),
      type,
      desc,
      peerId
    });
  }

  recordCellOperation(op, x, y, colonyId = null) {
    if (!this.connected) return;
    if (this.isApplyingRemote) return;

    if (!this.pendingBatch) {
      this.pendingBatch = {
        operations: [],
        hasChanges: false
      };
    }

    this.pendingBatch.operations.push({
      op,
      x,
      y,
      colonyId
    });
    this.pendingBatch.hasChanges = true;

    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this._flushBatch();
      }, 50);
    }
  }

  _flushBatch() {
    if (!this.pendingBatch || !this.pendingBatch.hasChanges) {
      this.batchTimer = null;
      this.pendingBatch = null;
      return;
    }

    const ops = this.pendingBatch.operations;
    this._sendMessage('cells_batch', {
      operations: ops
    });

    this.batchTimer = null;
    this.pendingBatch = null;
  }

  flushBatchImmediate() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this._flushBatch();
    }
  }

  recordEvolutionStep() {
    if (!this.connected || this.isApplyingRemote) return;
    const ts = Date.now();
    this._lastEvolutionMsgTime = ts;
    this._sendMessage('evolution_step', { __ts: ts });
    this._addLog('推进演化', '1代', this.peerId);
  }

  recordEvolutionReset() {
    if (!this.connected || this.isApplyingRemote) return;
    this._sendMessage('evolution_reset', {});
    this._addLog('重置画布', '', this.peerId);
  }

  recordPatternPlaced(cells, offsetX, offsetY, colonyId) {
    if (!this.connected || this.isApplyingRemote) return;
    this._sendMessage('pattern_placed', {
      cells,
      offsetX,
      offsetY,
      colonyId
    });
    this._addLog('放置图案', `${cells.length}个细胞`, this.peerId);
  }

  recordCollisionChange(strategy) {
    if (!this.connected || this.isApplyingRemote) return;
    const ts = Date.now();
    this._lastCollisionMsgTime = ts;
    this._sendMessage('collision_changed', {
      strategy,
      __ts: ts
    });
    this._addLog('切换碰撞策略', this._strategyName(strategy), this.peerId);
  }
}
