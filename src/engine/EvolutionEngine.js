import { eventBus } from '../core/EventBus.js';

const MOORE = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const VN = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export class EvolutionEngine {
  constructor(cellStore, colonyManager) {
    this.cellStore = cellStore;
    this.colonyManager = colonyManager;
    this.generation = 0;
    this.running = false;
    this.speed = 30;
    this.collisionStrategy = 'priority';
    this.lastStepTime = 0;
    this.animationFrameId = null;
    this.history = [];
    this.maxHistoryLength = 100;
  }

  setSpeed(speed) {
    this.speed = speed;
  }

  setCollisionStrategy(strategy) {
    this.collisionStrategy = strategy;
    eventBus.emit('settings:changed');
  }

  toggleRunning() {
    this.running = !this.running;
    if (this.running) this.start();
    else this.stop();
    eventBus.emit('engine:runningChanged', this.running);
    return this.running;
  }

  start() {
    this.running = true;
    this.lastStepTime = performance.now();
    this.loop();
  }

  stop() {
    this.running = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  reset() {
    this.stop();
    this.generation = 0;
    this.history = [];
    this.cellStore.clear();
    eventBus.emit('state:updated');
    eventBus.emit('generation:changed', this.generation);
  }

  loop() {
    if (!this.running) return;
    const now = performance.now();
    const interval = 1000 / this.speed;
    if (now - this.lastStepTime >= interval) {
      try {
        const steps = this.speed >= 60 ? Math.min(Math.floor((now - this.lastStepTime) / interval), 5) : 1;
        for (let i = 0; i < steps; i++) this.step();
        this.lastStepTime = now;
      } catch (e) {
        console.error('Evolution error:', e);
      }
    }
    this.animationFrameId = requestAnimationFrame(() => this.loop());
  }

  step() {
    const cellStore = this.cellStore;
    const allColonies = this.colonyManager.getAll();
    const activeColonies = [];
    for (let i = 0; i < allColonies.length; i++) {
      if (!allColonies[i].paused) activeColonies.push(allColonies[i]);
      allColonies[i].prevCount = allColonies[i].currentCount;
    }
    if (activeColonies.length === 0) return;

    const allCells = cellStore.getAllCells();
    const cellCount = allCells.length;

    const cellsX = new Array(cellCount);
    const cellsY = new Array(cellCount);
    const cellsKey = new Array(cellCount);
    const cellsColony = new Array(cellCount);
    for (let i = 0; i < cellCount; i++) {
      const c = allCells[i];
      cellsX[i] = c.x;
      cellsY[i] = c.y;
      cellsKey[i] = c.key;
      cellsColony[i] = c.colonyId;
    }

    const neighborMap = {};

    for (let ai = 0; ai < activeColonies.length; ai++) {
      const colony = activeColonies[ai];
      const cid = colony.id;
      const offsets = colony.rule.neighborhood === 'vonneumann' ? VN : MOORE;
      const nbLen = offsets.length;

      for (let celli = 0; celli < cellCount; celli++) {
        if (cellsColony[celli] !== cid) continue;
        const cellx = cellsX[celli];
        const celly = cellsY[celli];

        for (let ni = 0; ni < nbLen; ni++) {
          const nx = cellx + offsets[ni][0];
          const ny = celly + offsets[ni][1];
          const key = nx + ',' + ny;
          let counts = neighborMap[key];
          if (!counts) {
            counts = {};
            neighborMap[key] = counts;
          }
          counts[cid] = (counts[cid] || 0) + 1;
        }
      }
    }

    const newMap = new Map();
    const newColonyCounts = new Map();
    let newCount = 0;

    const candidates = {};

    for (let ai = 0; ai < activeColonies.length; ai++) {
      const colony = activeColonies[ai];
      const rule = colony.rule;
      const cid = colony.id;
      const survival = rule.survival;

      for (let celli = 0; celli < cellCount; celli++) {
        if (cellsColony[celli] !== cid) continue;
        const key = cellsKey[celli];
        const counts = neighborMap[key];
        const n = counts ? (counts[cid] || 0) : 0;
        if (survival.has(n)) {
          if (!candidates[key]) candidates[key] = [];
          candidates[key].push({ x: cellsX[celli], y: cellsY[celli], cid, colony, n, birth: 0 });
        }
      }
    }

    const existingMap = cellStore.map;
    for (const key in neighborMap) {
      if (existingMap.has(key)) continue;
      const counts = neighborMap[key];
      const comma = key.indexOf(',');
      const x = +key.slice(0, comma);
      const y = +key.slice(comma + 1);

      for (let ai = 0; ai < activeColonies.length; ai++) {
        const colony = activeColonies[ai];
        const n = counts[colony.id] || 0;
        if (colony.rule.birth.has(n)) {
          if (!candidates[key]) candidates[key] = [];
          candidates[key].push({ x, y, cid: colony.id, colony, n, birth: 1 });
        }
      }
    }

    const strategy = this.collisionStrategy;

    for (const key in candidates) {
      if (newMap.has(key)) continue;
      const list = candidates[key];
      let winner = null;

      if (list.length === 1) {
        winner = list[0];
      } else {
        if (strategy === 'priority') {
          winner = list[0];
          for (let i = 1; i < list.length; i++) {
            const c = list[i];
            if (c.colony.rule.priority > winner.colony.rule.priority ||
                (c.colony.rule.priority === winner.colony.rule.priority && c.n > winner.n)) {
              winner = c;
            }
          }
        } else if (strategy === 'competition') {
          winner = list[0];
          for (let i = 1; i < list.length; i++) {
            const c = list[i];
            if (c.n > winner.n ||
                (c.n === winner.n && c.colony.rule.priority > winner.colony.rule.priority)) {
              winner = c;
            }
          }
        } else if (strategy === 'peace') {
          const existing = existingMap.get(key);
          if (existing) {
            for (let i = 0; i < list.length; i++) {
              const c = list[i];
              if (c.birth === 0 && c.cid === existing.colonyId) {
                winner = c;
                break;
              }
            }
          } else {
            winner = list[0];
            for (let i = 1; i < list.length; i++) {
              const c = list[i];
              if (c.colony.rule.priority > winner.colony.rule.priority) {
                winner = c;
              }
            }
          }
        }
      }

      if (winner) {
        newMap.set(key, { x: winner.x, y: winner.y, colonyId: winner.cid });
        newCount++;
        newColonyCounts.set(winner.cid, (newColonyCounts.get(winner.cid) || 0) + 1);
      }
    }

    const pausedIds = {};
    for (let i = 0; i < allColonies.length; i++) {
      if (allColonies[i].paused) pausedIds[allColonies[i].id] = true;
    }

    for (let i = 0; i < cellCount; i++) {
      if (pausedIds[cellsColony[i]]) {
        const key = cellsKey[i];
        if (!newMap.has(key)) {
          newMap.set(key, { x: cellsX[i], y: cellsY[i], colonyId: cellsColony[i] });
          newCount++;
          newColonyCounts.set(cellsColony[i], (newColonyCounts.get(cellsColony[i]) || 0) + 1);
        }
      }
    }

    cellStore.map = newMap;
    cellStore.count = newCount;
    cellStore.colonyCounts = newColonyCounts;
    cellStore._cellsCache = null;
    cellStore._keysCache = null;

    for (let i = 0; i < allColonies.length; i++) {
      allColonies[i].currentCount = cellStore.countByColony(allColonies[i].id);
    }

    this.generation++;
    this.recordHistory();

    eventBus.emit('state:updated');
    eventBus.emit('generation:changed', this.generation);
  }

  recordHistory() {
    const allColonies = this.colonyManager.getAll();
    const snapshot = {};
    for (let i = 0; i < allColonies.length; i++) {
      snapshot[allColonies[i].id] = allColonies[i].currentCount;
    }
    this.history.push({ generation: this.generation, snapshot });
    if (this.history.length > this.maxHistoryLength) this.history.shift();
    eventBus.emit('history:updated', this.history);
  }

  toJSON() {
    return {
      generation: this.generation,
      collisionStrategy: this.collisionStrategy,
      speed: this.speed
    };
  }

  loadFromJSON(data) {
    this.generation = data.generation || 0;
    this.collisionStrategy = data.collisionStrategy || 'priority';
    this.speed = data.speed || 30;
    this.history = [];
  }
}
