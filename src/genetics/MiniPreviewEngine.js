import { Rule } from '../core/Rule.js';

const MOORE = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const VN = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export class MiniPreviewEngine {
  constructor() {
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCtx = this.offscreenCanvas.getContext('2d');
    this.size = 60;
    this.cellSize = 4;
    this.gridSize = 15;
    this.offscreenCanvas.width = this.size;
    this.offscreenCanvas.height = this.size;
    this.scheduledPreviews = new Map();
    this.isProcessing = false;
  }

  generateRandomSeed() {
    const cells = new Map();
    const centerX = Math.floor(this.gridSize / 2);
    const centerY = Math.floor(this.gridSize / 2);
    
    for (let i = 0; i < 8; i++) {
      const dx = Math.floor(Math.random() * 3) - 1;
      const dy = Math.floor(Math.random() * 3) - 1;
      const x = centerX + dx;
      const y = centerY + dy;
      const key = `${x},${y}`;
      cells.set(key, { x, y, alive: true });
    }
    
    return cells;
  }

  countNeighbors(cells, x, y, rule) {
    const offsets = rule.neighborhood === 'vonneumann' ? VN : MOORE;
    let count = 0;
    
    for (const [dx, dy] of offsets) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= this.gridSize || ny < 0 || ny >= this.gridSize) continue;
      const key = `${nx},${ny}`;
      if (cells.has(key) && cells.get(key).alive) {
        count++;
      }
    }
    
    return count;
  }

  step(cells, rule) {
    const newCells = new Map();
    const toCheck = new Set();
    
    for (const [key, cell] of cells) {
      if (!cell.alive) continue;
      toCheck.add(key);
      const offsets = rule.neighborhood === 'vonneumann' ? VN : MOORE;
      for (const [dx, dy] of offsets) {
        const nx = cell.x + dx;
        const ny = cell.y + dy;
        if (nx < 0 || nx >= this.gridSize || ny < 0 || ny >= this.gridSize) continue;
        toCheck.add(`${nx},${ny}`);
      }
    }
    
    for (const key of toCheck) {
      const [x, y] = key.split(',').map(Number);
      const neighborCount = this.countNeighbors(cells, x, y, rule);
      const isAlive = cells.has(key) && cells.get(key).alive;
      
      let shouldLive = false;
      if (isAlive) {
        shouldLive = rule.shouldSurvive(neighborCount);
      } else {
        shouldLive = rule.shouldBirth(neighborCount);
      }
      
      if (shouldLive) {
        newCells.set(key, { x, y, alive: true });
      }
    }
    
    return newCells;
  }

  runSimulation(rule) {
    const history = [];
    let cells = this.generateRandomSeed();
    history.push({ cells: new Map(cells), count: cells.size });
    
    for (let i = 0; i < 10; i++) {
      cells = this.step(cells, rule);
      history.push({ cells: new Map(cells), count: cells.size });
    }
    
    return history;
  }

  analyzeBehavior(history) {
    const counts = history.map(h => h.count);
    const initialCount = counts[0];
    const finalCount = counts[counts.length - 1];
    
    if (finalCount === 0) {
      return { type: 'dieout', label: '消亡', trend: -1 };
    }
    
    const variance = counts.reduce((sum, c, i) => {
      if (i === 0) return 0;
      return sum + Math.abs(c - counts[i - 1]);
    }, 0) / (counts.length - 1);
    
    const growthRatio = finalCount / Math.max(1, initialCount);
    
    if (variance > initialCount * 0.3 && growthRatio < 1.5) {
      return { type: 'oscillate', label: '震荡', trend: 0 };
    } else if (growthRatio > 1.2) {
      return { type: 'expand', label: '膨胀', trend: 1 };
    } else if (growthRatio < 0.8) {
      return { type: 'shrink', label: '收缩', trend: -1 };
    } else {
      return { type: 'stable', label: '稳定', trend: 0 };
    }
  }

  renderToCanvas(history, canvas, color = '#4fc3f7') {
    const ctx = canvas.getContext('2d');
    const finalState = history[history.length - 1];
    const cellSize = canvas.width / this.gridSize;
    
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = color;
    for (const cell of finalState.cells.values()) {
      if (!cell.alive) continue;
      const sx = cell.x * cellSize;
      const sy = cell.y * cellSize;
      ctx.fillRect(sx + 0.5, sy + 0.5, cellSize - 1, cellSize - 1);
    }
    
    const behavior = this.analyzeBehavior(history);
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = behavior.trend > 0 ? '#4caf50' : behavior.trend < 0 ? '#f44336' : '#ffb74d';
    ctx.fillText(behavior.label, canvas.width / 2, canvas.height - 4);
    
    return behavior;
  }

  schedulePreview(geneId, rule, canvas, callback) {
    this.scheduledPreviews.set(geneId, { rule, canvas, callback });
    this.processQueue();
  }

  cancelPreview(geneId) {
    this.scheduledPreviews.delete(geneId);
  }

  async processQueue() {
    if (this.isProcessing || this.scheduledPreviews.size === 0) return;
    
    this.isProcessing = true;
    
    const entries = [...this.scheduledPreviews.entries()];
    this.scheduledPreviews.clear();
    
    for (const [geneId, { rule, canvas, callback }] of entries) {
      await new Promise(resolve => setTimeout(resolve, 0));
      
      try {
        const history = this.runSimulation(rule);
        const behavior = this.renderToCanvas(history, canvas, rule.color);
        if (callback) callback(behavior, history);
      } catch (e) {
        console.error('Preview error:', e);
      }
    }
    
    this.isProcessing = false;
    if (this.scheduledPreviews.size > 0) {
      this.processQueue();
    }
  }
}

export const miniPreviewEngine = new MiniPreviewEngine();
