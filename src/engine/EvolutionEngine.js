import { eventBus } from '../core/EventBus.js';

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
    if (this.running) {
      this.start();
    } else {
      this.stop();
    }
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
        const stepsToRun = this.speed >= 60 ? Math.floor((now - this.lastStepTime) / interval) : 1;
        for (let i = 0; i < Math.min(stepsToRun, 5); i++) {
          this.step();
        }
        this.lastStepTime = now;
      } catch (e) {
        console.error('Evolution error:', e);
      }
    }

    this.animationFrameId = requestAnimationFrame(() => this.loop());
  }

  step() {
    const colonies = this.colonyManager.getAll().filter(c => !c.paused);
    if (colonies.length === 0) return;

    for (const colony of this.colonyManager.getAll()) {
      colony.prevCount = colony.currentCount;
    }

    const allCells = this.cellStore.getAllCells();
    const neighborCounts = new Map();

    for (const colony of colonies) {
      const rule = colony.rule;
      const colonyCells = allCells.filter(c => c.colonyId === colony.id);
      
      for (const cell of colonyCells) {
        const neighbors = rule.getNeighbors(cell.x, cell.y);
        for (const [nx, ny] of neighbors) {
          const key = `${nx},${ny}`;
          if (!neighborCounts.has(key)) {
            neighborCounts.set(key, new Map());
          }
          const colonyMap = neighborCounts.get(key);
          colonyMap.set(colony.id, (colonyMap.get(colony.id) || 0) + 1);
        }
      }
    }

    const candidates = new Map();

    for (const [posKey, colonyMap] of neighborCounts) {
      const [x, y] = posKey.split(',').map(Number);
      const currentCell = this.cellStore.get(x, y);

      for (const colony of colonies) {
        const rule = colony.rule;
        const count = colonyMap.get(colony.id) || 0;

        if (currentCell && currentCell.colonyId === colony.id) {
          if (rule.shouldSurvive(count)) {
            if (!candidates.has(posKey)) {
              candidates.set(posKey, []);
            }
            candidates.get(posKey).push({
              x, y,
              colonyId: colony.id,
              colony,
              count,
              isBirth: false
            });
          }
        } else if (!currentCell) {
          if (rule.shouldBirth(count)) {
            if (!candidates.has(posKey)) {
              candidates.set(posKey, []);
            }
            candidates.get(posKey).push({
              x, y,
              colonyId: colony.id,
              colony,
              count,
              isBirth: true
            });
          }
        }
      }
    }

    const newStore = new this.cellStore.constructor();

    for (const cell of allCells) {
      const key = `${cell.x},${cell.y}`;
      const cellCandidates = candidates.get(key);
      
      if (cellCandidates && cellCandidates.length > 0) {
        const survivorCandidate = cellCandidates.find(c => c.colonyId === cell.colonyId && !c.isBirth);
        if (survivorCandidate) {
          continue;
        }
      }

      const colony = this.colonyManager.getColony(cell.colonyId);
      if (colony && colony.paused) {
        newStore.set(cell.x, cell.y, cell.colonyId);
      }
    }

    for (const [posKey, cellCandidates] of candidates) {
      const [x, y] = posKey.split(',').map(Number);
      const existingCell = this.cellStore.get(x, y);
      const pausedColonyCell = newStore.get(x, y);
      
      if (pausedColonyCell) continue;

      let winner = null;

      if (cellCandidates.length === 1) {
        winner = cellCandidates[0];
      } else if (cellCandidates.length > 1) {
        if (this.collisionStrategy === 'priority') {
          winner = cellCandidates.reduce((best, curr) => {
            if (!best) return curr;
            if (curr.colony.rule.priority > best.colony.rule.priority) return curr;
            if (curr.colony.rule.priority === best.colony.rule.priority && curr.count > best.count) return curr;
            return best;
          }, null);
        } else if (this.collisionStrategy === 'competition') {
          winner = cellCandidates.reduce((best, curr) => {
            if (!best) return curr;
            if (curr.count > best.count) return curr;
            if (curr.count === best.count && curr.colony.rule.priority > best.colony.rule.priority) return curr;
            return best;
          }, null);
        } else if (this.collisionStrategy === 'peace') {
          const survivalCandidates = cellCandidates.filter(c => !c.isBirth);
          if (survivalCandidates.length > 0) {
            if (survivalCandidates.length === 1) {
              winner = survivalCandidates[0];
            } else {
              winner = survivalCandidates.reduce((best, curr) => {
                if (!best) return curr;
                if (curr.colony.rule.priority > best.colony.rule.priority) return curr;
                return best;
              }, null);
            }
          } else if (!existingCell) {
            if (cellCandidates.length === 1) {
              winner = cellCandidates[0];
            } else {
              winner = cellCandidates.reduce((best, curr) => {
                if (!best) return curr;
                if (curr.colony.rule.priority > best.colony.rule.priority) return curr;
                return best;
              }, null);
            }
          }
        }
      }

      if (winner) {
        newStore.set(winner.x, winner.y, winner.colonyId);
      }
    }

    this.cellStore.map = newStore.map;
    this.cellStore.count = newStore.count;

    for (const colony of this.colonyManager.getAll()) {
      colony.currentCount = this.cellStore.countByColony(colony.id);
    }

    this.generation++;
    this.recordHistory();

    eventBus.emit('state:updated');
    eventBus.emit('generation:changed', this.generation);
  }

  recordHistory() {
    const snapshot = {};
    for (const colony of this.colonyManager.getAll()) {
      snapshot[colony.id] = colony.currentCount;
    }
    this.history.push({
      generation: this.generation,
      snapshot
    });
    if (this.history.length > this.maxHistoryLength) {
      this.history.shift();
    }
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
