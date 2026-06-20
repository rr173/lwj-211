import { eventBus } from '../core/EventBus.js';

const MAX_LOGS = 50;

function formatTime(ts) {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  const s = d.getSeconds().toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export class CollaborationUI {
  constructor(containerId, collabManager) {
    this.container = document.getElementById(containerId);
    this.collabManager = collabManager;
    this.logs = [];
    this.connected = false;
    this.peerCount = 1;
    this.syncWaiting = false;

    if (!this.container) {
      console.warn('Collaboration container not found:', containerId);
      return;
    }

    this._buildHTML();
    this._bindEvents();
    this._bindEventBus();
    if (this.collabManager && this.collabManager.connected) {
      this.connected = true;
    }
    this._updateConnectionStatus();
  }

  _buildHTML() {
    this.container.innerHTML = `
      <div class="panel-header">
        <h3>多人协作</h3>
      </div>
      <div class="panel-section">
        <div class="collab-status">
          <div class="collab-status-row">
            <span class="collab-status-label">连接状态:</span>
            <span class="collab-status-value" id="collab-status-text">
              <span class="collab-dot collab-dot-off"></span>
              未连接
            </span>
          </div>
          <div class="collab-status-row">
            <span class="collab-status-label">频道:</span>
            <span class="collab-status-value mono">cell-automata-sync</span>
          </div>
          <div class="collab-status-row">
            <span class="collab-status-label">在线人数:</span>
            <span class="collab-status-value" id="collab-peer-count">1</span>
          </div>
          <div class="collab-status-row">
            <span class="collab-status-label">我的ID:</span>
            <span class="collab-status-value mono" id="collab-self-id">--</span>
          </div>
          <div id="collab-sync-waiting" class="collab-sync-hint" style="display:none;margin-top:8px;padding:8px;background:rgba(255,183,77,0.15);border-radius:4px;color:#ffb74d;font-size:12px;">
            正在等待同步状态...
          </div>
        </div>
      </div>
      <div class="panel-section">
        <div class="section-title">操作日志</div>
        <div id="collab-log-list" class="collab-log-list">
          <div class="empty-hint" style="padding:16px;text-align:center;color:#666;font-size:12px;">
            暂无操作记录
          </div>
        </div>
      </div>
      <div class="panel-section">
        <button id="collab-toggle-btn" class="primary-btn" style="width:100%;">
          断开连接
        </button>
      </div>
    `;

    this.statusText = document.getElementById('collab-status-text');
    this.peerCountEl = document.getElementById('collab-peer-count');
    this.selfIdEl = document.getElementById('collab-self-id');
    this.logListEl = document.getElementById('collab-log-list');
    this.toggleBtn = document.getElementById('collab-toggle-btn');
    this.syncWaitingEl = document.getElementById('collab-sync-waiting');

    if (this.collabManager) {
      this.selfIdEl.textContent = this.collabManager.peerId;
    }
  }

  _bindEvents() {
    if (this.toggleBtn) {
      this.toggleBtn.addEventListener('click', () => {
        if (!this.collabManager) return;
        if (this.connected) {
          this.collabManager.disconnect();
        } else {
          this.collabManager.reconnect();
        }
      });
    }
  }

  _bindEventBus() {
    eventBus.on('collab:connected', (data) => {
      this.connected = true;
      this._updateConnectionStatus();
      if (data.peerId && this.selfIdEl) {
        this.selfIdEl.textContent = data.peerId;
      }
      this._addLogLocal('连接成功', '已加入协作频道', data.peerId || 'local');
    });

    eventBus.on('collab:disconnected', () => {
      this.connected = false;
      this._updateConnectionStatus();
      this._addLogLocal('已断开', '离开协作频道', 'local');
    });

    eventBus.on('collab:peerList', (data) => {
      this.peerCount = data.count || 1;
      if (this.peerCountEl) {
        this.peerCountEl.textContent = this.peerCount.toString();
      }
    });

    eventBus.on('collab:log', (log) => {
      this._addLog(log);
    });

    eventBus.on('collab:syncState', (data) => {
      if (this.syncWaitingEl) {
        this.syncWaitingEl.style.display = data.waiting ? 'block' : 'none';
      }
      if (!data.waiting && !data.isFirst) {
        this._addLogLocal('同步完成', '已从其他实例同步当前状态', 'local');
      }
      if (!data.waiting && data.isFirst) {
        this._addLogLocal('首个实例', '当前为第一个标签页，无需同步', 'local');
      }
    });
  }

  _updateConnectionStatus() {
    if (!this.statusText) return;
    if (this.connected) {
      this.statusText.innerHTML = '<span class="collab-dot collab-dot-on"></span>已连接';
      if (this.toggleBtn) {
        this.toggleBtn.textContent = '断开连接';
        this.toggleBtn.classList.remove('collab-btn-off');
      }
    } else {
      this.statusText.innerHTML = '<span class="collab-dot collab-dot-off"></span>未连接';
      if (this.toggleBtn) {
        this.toggleBtn.textContent = '重新连接';
        this.toggleBtn.classList.add('collab-btn-off');
      }
    }
  }

  _addLogLocal(type, desc, peerId) {
    this._addLog({
      time: Date.now(),
      type,
      desc,
      peerId
    });
  }

  _addLog(log) {
    if (!this.logListEl) return;

    this.logs.push(log);
    if (this.logs.length > MAX_LOGS) {
      this.logs.shift();
    }

    this._renderLogs();
  }

  _renderLogs() {
    if (!this.logListEl) return;

    if (this.logs.length === 0) {
      this.logListEl.innerHTML = '<div class="empty-hint" style="padding:16px;text-align:center;color:#666;font-size:12px;">暂无操作记录</div>';
      return;
    }

    this.logListEl.innerHTML = this.logs.map(log => {
      const peerShort = (log.peerId === 'local' || !log.peerId)
        ? '本地'
        : log.peerId.slice(0, 4);
      const isLocal = log.peerId === 'local' || (this.collabManager && log.peerId === this.collabManager.peerId);
      const peerClass = isLocal ? 'collab-log-peer-local' : 'collab-log-peer-remote';
      const peerLabel = isLocal ? '本地' : peerShort;

      return `
        <div class="collab-log-item">
          <div class="collab-log-time">${formatTime(log.time)}</div>
          <div class="collab-log-peer ${peerClass}">${peerLabel}</div>
          <div class="collab-log-type">${this._escapeHtml(log.type || '')}</div>
          <div class="collab-log-desc">${this._escapeHtml(log.desc || '')}</div>
        </div>
      `;
    }).join('');

    this.logListEl.scrollTop = this.logListEl.scrollHeight;
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
