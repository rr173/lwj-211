import { Topology, TOPOLOGY_TYPES } from './Topology.js';

export class CellStore {
  constructor() {
    this.map = new Map();
    this.count = 0;
    this.colonyCounts = new Map();
    this._cellsCache = null;
    this._keysCache = null;
  }

  static key(...args) {
    return Topology.key(...args);
  }

  _makeCellData(...args) {
    const colonyId = args[args.length - 1];
    const coords = args.slice(0, -1);
    const topology = Topology.getType();

    if (topology === TOPOLOGY_TYPES.TRIANGULAR) {
      const [row, col, dir] = coords;
      return { row, col, dir, x: col, y: row, colonyId };
    } else {
      const [x, y] = coords;
      return { x, y, row: y, col: x, q: x, r: y, colonyId };
    }
  }

  set(...args) {
    const key = CellStore.key(...args.slice(0, -1));
    const colonyId = args[args.length - 1];
    const existing = this.map.get(key);

    if (existing) {
      if (existing.colonyId !== colonyId) {
        this.colonyCounts.set(existing.colonyId, (this.colonyCounts.get(existing.colonyId) || 1) - 1);
        this.colonyCounts.set(colonyId, (this.colonyCounts.get(colonyId) || 0) + 1);
      }
    } else {
      this.count++;
      this.colonyCounts.set(colonyId, (this.colonyCounts.get(colonyId) || 0) + 1);
    }

    this.map.set(key, this._makeCellData(...args));
    this._cellsCache = null;
    this._keysCache = null;
  }

  get(...args) {
    const key = CellStore.key(...args);
    return this.map.get(key) || null;
  }

  has(...args) {
    return this.map.has(CellStore.key(...args));
  }

  delete(...args) {
    const key = CellStore.key(...args);
    const existing = this.map.get(key);
    if (existing) {
      this.map.delete(key);
      this.count--;
      this.colonyCounts.set(existing.colonyId, (this.colonyCounts.get(existing.colonyId) || 1) - 1);
      this._cellsCache = null;
      this._keysCache = null;
      return true;
    }
    return false;
  }

  clear() {
    this.map.clear();
    this.count = 0;
    this.colonyCounts.clear();
    this._cellsCache = null;
    this._keysCache = null;
  }

  size() {
    return this.count;
  }

  forEach(callback) {
    for (const cell of this.map.values()) {
      const topology = Topology.getType();
      if (topology === TOPOLOGY_TYPES.TRIANGULAR) {
        callback(cell.row, cell.col, cell.dir, cell.colonyId);
      } else {
        callback(cell.x, cell.y, cell.colonyId);
      }
    }
  }

  getAllCells() {
    if (!this._cellsCache) {
      this._cellsCache = [];
      for (const [key, cell] of this.map.entries()) {
        this._cellsCache.push({ ...cell, key });
      }
    }
    return this._cellsCache;
  }

  getAllKeys() {
    if (!this._keysCache) {
      this._keysCache = [...this.map.keys()];
    }
    return this._keysCache;
  }

  getCellsInRect(minX, minY, maxX, maxY) {
    const result = [];
    for (const cell of this.map.values()) {
      const cx = cell.x !== undefined ? cell.x : cell.col;
      const cy = cell.y !== undefined ? cell.y : cell.row;
      if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) {
        result.push(cell);
      }
    }
    return result;
  }

  getCellsByColony(colonyId) {
    const result = [];
    for (const cell of this.map.values()) {
      if (cell.colonyId === colonyId) {
        result.push(cell);
      }
    }
    return result;
  }

  countByColony(colonyId) {
    return this.colonyCounts.get(colonyId) || 0;
  }

  toJSON() {
    const cells = [];
    const topology = Topology.getType();
    for (const cell of this.map.values()) {
      if (topology === TOPOLOGY_TYPES.TRIANGULAR) {
        cells.push({ row: cell.row, col: cell.col, dir: cell.dir, c: cell.colonyId });
      } else if (topology === TOPOLOGY_TYPES.HEXAGONAL) {
        cells.push({ q: cell.q, r: cell.r, c: cell.colonyId });
      } else {
        cells.push({ x: cell.x, y: cell.y, c: cell.colonyId });
      }
    }
    return {
      topology,
      cells
    };
  }

  static fromJSON(data) {
    const store = new CellStore();
    const topology = data.topology || TOPOLOGY_TYPES.SQUARE;
    const cells = data.cells || data;
    Topology.setType(topology);

    for (const cell of cells) {
      if (topology === TOPOLOGY_TYPES.TRIANGULAR) {
        const row = cell.row !== undefined ? cell.row : cell.y;
        const col = cell.col !== undefined ? cell.col : cell.x;
        const dir = cell.dir !== undefined ? cell.dir : ((row + col) % 2 === 0 ? 0 : 1);
        store.set(row, col, dir, cell.c);
      } else if (topology === TOPOLOGY_TYPES.HEXAGONAL) {
        const q = cell.q !== undefined ? cell.q : cell.x;
        const r = cell.r !== undefined ? cell.r : cell.y;
        store.set(q, r, cell.c);
      } else {
        store.set(cell.x, cell.y, cell.c);
      }
    }
    return store;
  }
}
