import { Rule } from '../core/Rule.js';

const MOORE_OFFSETS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const VN_OFFSETS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export class ChallengeEngine {
  constructor(level) {
    this.level = level;
    this.width = level.width;
    this.height = level.height;
    this.maxCells = level.maxCells;
    this.maxSteps = level.maxSteps;

    const parsed = Rule.parseBS(level.rule);
    this.rule = {
      birth: parsed.birth,
      survival: parsed.survival,
      neighborhood: 'moore'
    };

    this.grid = new Uint8Array(this.width * this.height);
    this.generation = 0;
    this.running = false;
    this.animationFrameId = null;
    this.speed = 30;
    this.lastStepTime = 0;

    this.peakCells = 0;
    this.peakGeneration = 0;
    this.historySnapshots = [];
    this.maxHistorySnapshots = 200;

    this.isPeriodic = false;
    this.periodLength = 0;
    this.periodStartGen = 0;

    this.forbiddenSet = new Set();
    if (level.forbidden) {
      for (const rect of level.forbidden) {
        for (let y = rect.y1; y <= rect.y2; y++) {
          for (let x = rect.x1; x <= rect.x2; x++) {
            this.forbiddenSet.add(this._key(x, y));
          }
        }
      }
    }

    this.placementZone = level.placementZone || null;
  }

  _key(x, y) {
    return `${x},${y}`;
  }

  _idx(x, y) {
    return y * this.width + x;
  }

  _inBounds(x, y) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  isForbidden(x, y) {
    if (!this._inBounds(x, y)) return true;
    return this.forbiddenSet.has(this._key(x, y));
  }

  canPlace(x, y) {
    if (!this._inBounds(x, y)) return false;
    if (this.isForbidden(x, y)) return false;
    if (this.placementZone) {
      const z = this.placementZone;
      if (x < z.x1 || x > z.x2 || y < z.y1 || y > z.y2) return false;
    }
    return true;
  }

  setCell(x, y, alive = true) {
    if (!this.canPlace(x, y)) return false;
    const idx = this._idx(x, y);
    const wasAlive = this.grid[idx] === 1;
    if (alive && !wasAlive) {
      this.grid[idx] = 1;
      return true;
    } else if (!alive && wasAlive) {
      this.grid[idx] = 0;
      return true;
    }
    return false;
  }

  getCell(x, y) {
    if (!this._inBounds(x, y)) return 0;
    return this.grid[this._idx(x, y)];
  }

  toggleCell(x, y) {
    if (!this.canPlace(x, y)) return false;
    const idx = this._idx(x, y);
    this.grid[idx] = this.grid[idx] === 1 ? 0 : 1;
    return true;
  }

  clearCells() {
    this.grid.fill(0);
    this.generation = 0;
    this.peakCells = 0;
    this.peakGeneration = 0;
    this.historySnapshots = [];
    this.isPeriodic = false;
    this.periodLength = 0;
    this.periodStartGen = 0;
  }

  countCells() {
    let count = 0;
    for (let i = 0; i < this.grid.length; i++) {
      if (this.grid[i] === 1) count++;
    }
    return count;
  }

  countCellsInRegion(x1, y1, x2, y2) {
    let count = 0;
    for (let y = Math.max(0, y1); y <= Math.min(this.height - 1, y2); y++) {
      for (let x = Math.max(0, x1); x <= Math.min(this.width - 1, x2); x++) {
        if (this.grid[this._idx(x, y)] === 1) count++;
      }
    }
    return count;
  }

  step() {
    if (this.generation >= this.maxSteps) return false;

    const newGrid = new Uint8Array(this.width * this.height);
    const offsets = this.rule.neighborhood === 'vonneumann' ? VN_OFFSETS : MOORE_OFFSETS;

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        let neighbors = 0;
        for (const [dx, dy] of offsets) {
          const nx = x + dx;
          const ny = y + dy;
          if (this._inBounds(nx, ny) && this.grid[this._idx(nx, ny)] === 1) {
            neighbors++;
          }
        }

        const idx = this._idx(x, y);
        const isAlive = this.grid[idx] === 1;

        if (isAlive) {
          if (this.rule.survival.has(neighbors)) {
            newGrid[idx] = 1;
          }
        } else {
          if (this.rule.birth.has(neighbors)) {
            newGrid[idx] = 1;
          }
        }
      }
    }

    this.grid = newGrid;
    this.generation++;

    const count = this.countCells();
    if (count > this.peakCells) {
      this.peakCells = count;
      this.peakGeneration = this.generation;
    }

    this._recordSnapshot();
    this._checkPeriodic();

    return true;
  }

  _recordSnapshot() {
    const count = this.countCells();
    const snapshot = {
      generation: this.generation,
      count,
      hash: this._computeHash()
    };
    this.historySnapshots.push(snapshot);
    if (this.historySnapshots.length > this.maxHistorySnapshots) {
      this.historySnapshots.shift();
    }
  }

  _computeHash() {
    let hash = 0;
    for (let i = 0; i < this.grid.length; i++) {
      if (this.grid[i] === 1) {
        hash = ((hash << 5) - hash + i) | 0;
      }
    }
    return hash;
  }

  _checkPeriodic() {
    if (this.historySnapshots.length < 10) return;

    const currentHash = this.historySnapshots[this.historySnapshots.length - 1].hash;
    const currentCount = this.historySnapshots[this.historySnapshots.length - 1].count;

    for (let i = this.historySnapshots.length - 2; i >= 0; i--) {
      if (this.historySnapshots[i].count === currentCount &&
          this.historySnapshots[i].hash === currentHash) {
        if (this._verifyPeriod(i)) {
          this.isPeriodic = true;
          this.periodStartGen = this.historySnapshots[i].generation;
          this.periodLength = this.generation - this.periodStartGen;
          return;
        }
      }
    }
  }

  _verifyPeriod(startIdx) {
    const periodLen = this.historySnapshots.length - 1 - startIdx;
    if (periodLen < 2) return false;

    for (let i = 0; i < periodLen; i++) {
      const a = this.historySnapshots[startIdx + i];
      const b = this.historySnapshots[startIdx + i + periodLen];
      if (!b) continue;
      if (a.count !== b.count || a.hash !== b.hash) return false;
    }
    return true;
  }

  start(onStep, onComplete) {
    if (this.running) return;
    this.running = true;
    this.lastStepTime = performance.now();
    this._loop(onStep, onComplete);
  }

  _loop(onStep, onComplete) {
    if (!this.running) return;

    const now = performance.now();
    const interval = 1000 / this.speed;

    if (now - this.lastStepTime >= interval) {
      const steps = this.speed >= 60 ? Math.min(Math.floor((now - this.lastStepTime) / interval), 5) : 1;
      for (let i = 0; i < steps; i++) {
        if (!this.step()) {
          this.running = false;
          if (onComplete) onComplete();
          return;
        }
      }
      this.lastStepTime = now;
      if (onStep) onStep();
    }

    this.animationFrameId = requestAnimationFrame(() => this._loop(onStep, onComplete));
  }

  stop() {
    this.running = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  setSpeed(speed) {
    this.speed = speed;
  }

  getStats() {
    return {
      generation: this.generation,
      maxSteps: this.maxSteps,
      currentCells: this.countCells(),
      peakCells: this.peakCells,
      peakGeneration: this.peakGeneration,
      isPeriodic: this.isPeriodic,
      periodLength: this.periodLength,
      periodStartGen: this.periodStartGen,
      initialCells: this._initialCells || 0
    };
  }

  setInitialCells(count) {
    this._initialCells = count;
  }
}
