import { Rule } from '../core/Rule.js';
import { findConnectedComponents, normalizeCoordinates, hashStructure, coordinateSetEquals, getCentroid, evolveStructure, STRUCTURE_TYPES } from '../patterns/StructureUtils.js';

const MOORE = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const VN = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export const SEED_TYPES = {
  CROSS: 'cross',
  RANDOM_30: 'random_30'
};

export const FITNESS_PRESETS = {
  MAX_EXPANSION: 'max_expansion',
  MAX_CONTRACTION: 'max_contraction',
  MAX_OSCILLATORS: 'max_oscillators',
  FASTEST_EXTINCTION: 'fastest_extinction',
  CUSTOM: 'custom'
};

export class FitnessEvalEngine {
  constructor(width = 50, height = 50) {
    this.width = width;
    this.height = height;
    this.grid = new Uint8Array(width * height);
    this.rule = null;
    this.generation = 0;
    this.history = [];
    this.cellCounts = [];
  }

  setRule(rule) {
    this.rule = rule;
  }

  getIndex(x, y) {
    return y * this.width + x;
  }

  isInBounds(x, y) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  setCell(x, y, value) {
    if (!this.isInBounds(x, y)) return;
    this.grid[this.getIndex(x, y)] = value;
  }

  getCell(x, y) {
    if (!this.isInBounds(x, y)) return 0;
    return this.grid[this.getIndex(x, y)];
  }

  clear() {
    this.grid.fill(0);
    this.generation = 0;
    this.history = [];
    this.cellCounts = [];
  }

  seedCross() {
    this.clear();
    const cx = Math.floor(this.width / 2);
    const cy = Math.floor(this.height / 2);
    this.setCell(cx, cy, 1);
    this.setCell(cx - 1, cy, 1);
    this.setCell(cx + 1, cy, 1);
    this.setCell(cx, cy - 1, 1);
    this.setCell(cx, cy + 1, 1);
    this.recordState();
  }

  seedRandom(density = 0.3) {
    this.clear();
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (Math.random() < density) {
          this.setCell(x, y, 1);
        }
      }
    }
    this.recordState();
  }

  seedFromType(seedType) {
    if (seedType === SEED_TYPES.CROSS) {
      this.seedCross();
    } else if (seedType === SEED_TYPES.RANDOM_30) {
      this.seedRandom(0.3);
    }
  }

  recordState() {
    const count = this.countCells();
    this.cellCounts.push(count);
    this.history.push(new Uint8Array(this.grid));
  }

  countCells() {
    let count = 0;
    for (let i = 0; i < this.grid.length; i++) {
      if (this.grid[i] === 1) count++;
    }
    return count;
  }

  step() {
    if (!this.rule) return;

    const offsets = this.rule.neighborhood === 'vonneumann' ? VN : MOORE;
    const newGrid = new Uint8Array(this.width * this.height);
    const birth = this.rule.birth;
    const survival = this.rule.survival;

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        let neighborCount = 0;
        for (const [dx, dy] of offsets) {
          const nx = x + dx;
          const ny = y + dy;
          if (this.isInBounds(nx, ny) && this.grid[this.getIndex(nx, ny)] === 1) {
            neighborCount++;
          }
        }

        const idx = this.getIndex(x, y);
        const current = this.grid[idx];

        if (current === 1) {
          if (survival.has(neighborCount)) {
            newGrid[idx] = 1;
          }
        } else {
          if (birth.has(neighborCount)) {
            newGrid[idx] = 1;
          }
        }
      }
    }

    this.grid = newGrid;
    this.generation++;
    this.recordState();
  }

  run(maxGenerations, stopOnExtinction = false) {
    for (let i = 0; i < maxGenerations; i++) {
      this.step();
      if (stopOnExtinction && this.countCells() === 0) {
        break;
      }
    }
  }

  getStats() {
    const initialCount = this.cellCounts[0] || 0;
    const finalCount = this.cellCounts[this.cellCounts.length - 1] || 0;
    const generations = this.generation;
    const maxCount = Math.max(...this.cellCounts);
    const minCount = Math.min(...this.cellCounts);

    return {
      initialCount,
      finalCount,
      generations,
      maxCount,
      minCount,
      cellCounts: [...this.cellCounts]
    };
  }

  countOscillators(maxPeriod = 60) {
    const cells = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.grid[this.getIndex(x, y)] === 1) {
          cells.push({ x, y });
        }
      }
    }

    if (cells.length === 0) return 0;

    const components = findConnectedComponents(cells);
    let oscillatorCount = 0;

    for (const component of components) {
      if (component.size < 3 || component.size > 200) continue;

      const isOscillator = this._checkOscillator(component.cells, maxPeriod);
      if (isOscillator) {
        oscillatorCount++;
      }
    }

    return oscillatorCount;
  }

  _checkOscillator(initialCells, maxPeriod) {
    const history = [];
    let currentCells = initialCells;

    for (let i = 0; i < maxPeriod * 3; i++) {
      history.push(currentCells);
      currentCells = evolveStructure(currentCells, this.rule);
      if (currentCells.length === 0) return false;
    }

    for (let period = 2; period <= maxPeriod; period++) {
      let isOscillator = true;
      for (let start = 0; start < history.length - period * 2; start += period) {
        const cellsA = history[start];
        const cellsB = history[start + period];
        const normA = normalizeCoordinates(cellsA);
        const normB = normalizeCoordinates(cellsB);
        if (!coordinateSetEquals(normA.cells, normB.cells)) {
          isOscillator = false;
          break;
        }
      }
      if (isOscillator) return true;
    }

    return false;
  }

  evaluate(preset, customExpression = null) {
    const stats = this.getStats();

    switch (preset) {
      case FITNESS_PRESETS.MAX_EXPANSION:
        return stats.finalCount;

      case FITNESS_PRESETS.MAX_CONTRACTION:
        if (stats.finalCount === 0) return -1;
        return -stats.finalCount;

      case FITNESS_PRESETS.MAX_OSCILLATORS:
        return this.countOscillators();

      case FITNESS_PRESETS.FASTEST_EXTINCTION:
        if (stats.finalCount > 0) return -1;
        return -stats.generations;

      case FITNESS_PRESETS.CUSTOM:
        if (!customExpression) return 0;
        try {
          const { finalCount, initialCount, generations, maxCount, minCount } = stats;
          return eval(customExpression);
        } catch (e) {
          console.error('Custom fitness expression error:', e);
          return -Infinity;
        }

      default:
        return 0;
    }
  }

  getFinalCells() {
    const cells = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.grid[this.getIndex(x, y)] === 1) {
          cells.push({ x, y });
        }
      }
    }
    return cells;
  }

  clone() {
    const clone = new FitnessEvalEngine(this.width, this.height);
    clone.grid = new Uint8Array(this.grid);
    clone.rule = this.rule;
    clone.generation = this.generation;
    clone.history = this.history.map(h => new Uint8Array(h));
    clone.cellCounts = [...this.cellCounts];
    return clone;
  }
}

export function getPresetConfig(preset) {
  switch (preset) {
    case FITNESS_PRESETS.MAX_EXPANSION:
      return {
        seedType: SEED_TYPES.CROSS,
        maxGenerations: 200,
        stopOnExtinction: false,
        description: '从5个细胞的十字种子跑200代后活细胞数最多'
      };
    case FITNESS_PRESETS.MAX_CONTRACTION:
      return {
        seedType: SEED_TYPES.RANDOM_30,
        maxGenerations: 200,
        stopOnExtinction: false,
        description: '从30%密度50x50随机种子跑200代后活细胞数最少且不全灭'
      };
    case FITNESS_PRESETS.MAX_OSCILLATORS:
      return {
        seedType: SEED_TYPES.RANDOM_30,
        maxGenerations: 300,
        stopOnExtinction: false,
        description: '跑300代后画布上能识别出的振荡体数量最多'
      };
    case FITNESS_PRESETS.FASTEST_EXTINCTION:
      return {
        seedType: SEED_TYPES.RANDOM_30,
        maxGenerations: 500,
        stopOnExtinction: true,
        description: '从30%密度50x50随机种子跑到全灭所需代数最少'
      };
    default:
      return {
        seedType: SEED_TYPES.CROSS,
        maxGenerations: 200,
        stopOnExtinction: false,
        description: '自定义适应度函数'
      };
  }
}
