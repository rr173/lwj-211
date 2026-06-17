import { ReplayManager } from './ReplayManager.js';

const MOORE = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const VN = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export class ArenaEngine {
  constructor(width = 200, height = 200) {
    this.width = width;
    this.height = height;
    this.grid = new Uint8Array(width * height);
    this.colonyGrid = new Int32Array(width * height);
    this.nextGrid = new Uint8Array(width * height);
    this.nextColonyGrid = new Int32Array(width * height);
    this.wallGrid = new Uint8Array(width * height);
    this.contestants = new Map();
    this.generation = 0;
    this.running = false;
    this.animationFrameId = null;
    this.lastStepTime = 0;
    this.speed = 1000;
    this.cellCounts = new Map();
    this.eliminationTimeline = [];
    this.eliminatedColonies = new Set();
    this.replayManager = new ReplayManager(width, height);
  }

  getIndex(x, y) {
    return y * this.width + x;
  }

  isValid(x, y) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  getCell(x, y) {
    if (!this.isValid(x, y)) return { alive: false, colonyId: null };
    const idx = this.getIndex(x, y);
    return {
      alive: this.grid[idx] === 1,
      colonyId: this.colonyGrid[idx] >= 0 ? this.colonyGrid[idx] : null
    };
  }

  setCell(x, y, alive, colonyId = -1) {
    if (!this.isValid(x, y)) return;
    const idx = this.getIndex(x, y);
    if (this.wallGrid[idx] === 1) return;
    this.grid[idx] = alive ? 1 : 0;
    this.colonyGrid[idx] = colonyId;
  }

  setWall(x, y, isWall = true) {
    if (!this.isValid(x, y)) return;
    const idx = this.getIndex(x, y);
    this.wallGrid[idx] = isWall ? 1 : 0;
    if (isWall) {
      this.grid[idx] = 0;
      this.colonyGrid[idx] = -1;
    }
  }

  isWall(x, y) {
    if (!this.isValid(x, y)) return true;
    const idx = this.getIndex(x, y);
    return this.wallGrid[idx] === 1;
  }

  clearWalls() {
    this.wallGrid.fill(0);
  }

  addContestant(colonyId, rule, color, name) {
    this.contestants.set(colonyId, { rule, color, name });
    this.cellCounts.set(colonyId, 0);
  }

  removeContestant(colonyId) {
    this.contestants.delete(colonyId);
    this.cellCounts.delete(colonyId);
  }

  clearContestants() {
    this.contestants.clear();
    this.cellCounts.clear();
  }

  initializePopulation(colonyId, centerX, centerY, size = 40, density = 0.3) {
    const halfSize = Math.floor(size / 2);
    const minX = Math.max(0, centerX - halfSize);
    const maxX = Math.min(this.width - 1, centerX + halfSize - 1);
    const minY = Math.max(0, centerY - halfSize);
    const maxY = Math.min(this.height - 1, centerY + halfSize - 1);
    
    let cellsPlaced = 0;
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const idx = this.getIndex(x, y);
        if (this.wallGrid[idx] === 1) continue;
        if (Math.random() < density) {
          this.setCell(x, y, true, colonyId);
          cellsPlaced++;
        }
      }
    }
    
    const minCells = 50;
    if (cellsPlaced < minCells) {
      const centerX2 = Math.floor((minX + maxX) / 2);
      const centerY2 = Math.floor((minY + maxY) / 2);
      for (let i = 0; i < minCells - cellsPlaced; i++) {
        const ox = Math.floor(Math.random() * 11) - 5;
        const oy = Math.floor(Math.random() * 11) - 5;
        const x = centerX2 + ox;
        const y = centerY2 + oy;
        if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
          const idx = this.getIndex(x, y);
          if (this.wallGrid[idx] !== 1) {
            this.setCell(x, y, true, colonyId);
          }
        }
      }
    }
    
    this.updateCellCounts();
    console.log(`initializePopulation: colonyId=${colonyId}, cellsPlaced=${cellsPlaced}, finalCount=${this.cellCounts.get(colonyId) || 0}`);
  }

  applyTerrainTemplate(templateName) {
    this.clearWalls();
    
    switch (templateName) {
      case 'fourWalls':
        for (let x = 0; x < this.width; x++) {
          this.setWall(x, 0, true);
          this.setWall(x, this.height - 1, true);
        }
        for (let y = 0; y < this.height; y++) {
          this.setWall(0, y, true);
          this.setWall(this.width - 1, y, true);
        }
        break;
        
      case 'centerWall':
        const centerX = Math.floor(this.width / 2);
        const centerY = Math.floor(this.height / 2);
        const wallSize = Math.floor(this.height * 0.4);
        const halfWall = Math.floor(wallSize / 2);
        for (let y = centerY - halfWall; y <= centerY + halfWall; y++) {
          this.setWall(centerX, y, true);
        }
        for (let x = centerX - halfWall; x <= centerX + halfWall; x++) {
          this.setWall(x, centerY, true);
        }
        break;
        
      case 'maze':
        this._generateMaze();
        break;
        
      case 'blank':
      default:
        break;
    }
  }

  _generateMaze() {
    const cellSize = 20;
    const cols = Math.floor(this.width / cellSize);
    const rows = Math.floor(this.height / cellSize);
    
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const x = i * cellSize;
        const y = j * cellSize;
        
        if (i === 0 || i === cols - 1 || j === 0 || j === rows - 1) {
          for (let dx = 0; dx < cellSize; dx++) {
            this.setWall(x + dx, y, true);
            this.setWall(x + dx, y + cellSize - 1, true);
          }
          for (let dy = 0; dy < cellSize; dy++) {
            this.setWall(x, y + dy, true);
            this.setWall(x + cellSize - 1, y + dy, true);
          }
        } else {
          if (Math.random() < 0.3) {
            for (let dx = 0; dx < cellSize; dx++) {
              this.setWall(x + dx, y, true);
            }
          }
          if (Math.random() < 0.3) {
            for (let dy = 0; dy < cellSize; dy++) {
              this.setWall(x, y + dy, true);
            }
          }
        }
      }
    }
  }

  countNeighbors(x, y, rule) {
    const offsets = rule.neighborhood === 'vonneumann' ? VN : MOORE;
    let counts = new Map();
    let total = 0;
    
    for (const [dx, dy] of offsets) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.isValid(nx, ny)) continue;
      
      const nidx = this.getIndex(nx, ny);
      if (this.wallGrid[nidx] === 1) continue;
      
      if (this.grid[nidx] === 1) {
        const cid = this.colonyGrid[nidx];
        counts.set(cid, (counts.get(cid) || 0) + 1);
        total++;
      }
    }
    
    return { counts, total };
  }

  step() {
    this.nextGrid.fill(0);
    this.nextColonyGrid.fill(-1);
    
    const candidates = new Map();
    
    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        const idx = this.getIndex(x, y);
        if (this.wallGrid[idx] === 1) {
          this.nextGrid[idx] = 0;
          this.nextColonyGrid[idx] = -1;
          continue;
        }
        
        const isAlive = this.grid[idx] === 1;
        const colonyId = this.colonyGrid[idx];
        
        for (const [cid, contestant] of this.contestants) {
          if (this.eliminatedColonies.has(cid)) continue;
          
          const { counts } = this.countNeighbors(x, y, contestant.rule);
          const n = counts.get(cid) || 0;
          
          if (isAlive && colonyId === cid) {
            if (contestant.rule.shouldSurvive(n)) {
              const key = `${x},${y}`;
              if (!candidates.has(key)) candidates.set(key, []);
              candidates.get(key).push({ x, y, cid, n, birth: 0, rule: contestant.rule });
            }
          } else if (!isAlive) {
            if (contestant.rule.shouldBirth(n)) {
              const key = `${x},${y}`;
              if (!candidates.has(key)) candidates.set(key, []);
              candidates.get(key).push({ x, y, cid, n, birth: 1, rule: contestant.rule });
            }
          }
        }
      }
    }
    
    for (const [key, list] of candidates) {
      if (list.length === 1) {
        const c = list[0];
        const idx = this.getIndex(c.x, c.y);
        this.nextGrid[idx] = 1;
        this.nextColonyGrid[idx] = c.cid;
      } else {
        let winner = list[0];
        for (let i = 1; i < list.length; i++) {
          const c = list[i];
          if (c.n > winner.n || (c.n === winner.n && c.rule.priority > winner.rule.priority)) {
            winner = c;
          }
        }
        if (winner) {
          const idx = this.getIndex(winner.x, winner.y);
          this.nextGrid[idx] = 1;
          this.nextColonyGrid[idx] = winner.cid;
        }
      }
    }
    
    const tempGrid = this.grid;
    const tempColonyGrid = this.colonyGrid;
    this.grid = this.nextGrid;
    this.colonyGrid = this.nextColonyGrid;
    this.nextGrid = tempGrid;
    this.nextColonyGrid = tempColonyGrid;
    
    this.generation++;
    this.updateCellCounts();
    this.checkEliminations();
    this.replayManager.recordFrame(this.generation, this.grid, this.colonyGrid, this.cellCounts);
    
    return this.checkTermination();
  }

  updateCellCounts() {
    for (const cid of this.contestants.keys()) {
      this.cellCounts.set(cid, 0);
    }
    
    for (let i = 0; i < this.grid.length; i++) {
      if (this.grid[i] === 1) {
        const cid = this.colonyGrid[i];
        if (cid >= 0 && this.contestants.has(cid)) {
          this.cellCounts.set(cid, (this.cellCounts.get(cid) || 0) + 1);
        }
      }
    }
  }

  checkEliminations() {
    for (const [cid, count] of this.cellCounts) {
      if (count === 0 && !this.eliminatedColonies.has(cid) && this.generation > 0) {
        this.eliminatedColonies.add(cid);
        this.eliminationTimeline.push({
          generation: this.generation,
          colonyId: cid,
          name: this.contestants.get(cid)?.name || cid
        });
      }
    }
  }

  checkTermination() {
    const totalAlive = Array.from(this.cellCounts.values()).reduce((sum, c) => sum + c, 0);
    
    if (totalAlive === 0) {
      return {
        terminated: true,
        reason: 'extinction',
        winner: null,
        message: '全部灭亡'
      };
    }
    
    for (const [cid, count] of this.cellCounts) {
      if (this.eliminatedColonies.has(cid)) continue;
      const ratio = count / totalAlive;
      if (ratio > 0.8) {
        return {
          terminated: true,
          reason: 'dominance',
          winner: cid,
          message: `${this.contestants.get(cid)?.name || cid} 占据统治地位`
        };
      }
    }
    
    if (this.generation >= 2000) {
      return {
        terminated: true,
        reason: 'timeout',
        winner: null,
        message: '达到最大代数，平局'
      };
    }
    
    return { terminated: false };
  }

  start(callback) {
    this.running = true;
    this.lastStepTime = performance.now();
    this.replayManager.startRecording(this.contestants);
    this.updateCellCounts();
    this.replayManager.recordFrame(0, this.grid, this.colonyGrid, this.cellCounts);
    this.loop(callback);
  }

  stop() {
    this.running = false;
    this.replayManager.stopRecording();
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  loop(callback) {
    if (!this.running) return;
    
    const now = performance.now();
    const interval = 1000 / this.speed;
    
    if (now - this.lastStepTime >= interval) {
      const steps = Math.min(Math.floor((now - this.lastStepTime) / interval), 10);
      let result = { terminated: false };
      
      for (let i = 0; i < steps && !result.terminated; i++) {
        result = this.step();
      }
      
      this.lastStepTime = now;
      
      if (callback) {
        callback(result, this.getState());
      }
      
      if (result.terminated) {
        this.stop();
        return;
      }
    }
    
    this.animationFrameId = requestAnimationFrame(() => this.loop(callback));
  }

  getState() {
    return {
      generation: this.generation,
      cellCounts: new Map(this.cellCounts),
      eliminatedColonies: new Set(this.eliminatedColonies),
      eliminationTimeline: [...this.eliminationTimeline],
      totalAlive: Array.from(this.cellCounts.values()).reduce((sum, c) => sum + c, 0)
    };
  }

  reset() {
    this.stop();
    this.grid.fill(0);
    this.colonyGrid.fill(-1);
    this.nextGrid.fill(0);
    this.nextColonyGrid.fill(-1);
    this.generation = 0;
    this.eliminatedColonies.clear();
    this.eliminationTimeline = [];
    this.replayManager.reset();
    this.updateCellCounts();
  }

  clear() {
    this.reset();
    this.clearContestants();
  }
}
