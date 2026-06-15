export class CellStore {
  constructor() {
    this.map = new Map();
    this.count = 0;
    this.colonyCounts = new Map();
    this._cellsCache = null;
    this._keysCache = null;
  }

  static key(x, y) {
    return `${x},${y}`;
  }

  set(x, y, colonyId) {
    const key = CellStore.key(x, y);
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
    
    this.map.set(key, { x, y, colonyId });
    this._cellsCache = null;
    this._keysCache = null;
  }

  get(x, y) {
    const key = CellStore.key(x, y);
    return this.map.get(key) || null;
  }

  has(x, y) {
    return this.map.has(CellStore.key(x, y));
  }

  delete(x, y) {
    const key = CellStore.key(x, y);
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
      callback(cell.x, cell.y, cell.colonyId);
    }
  }

  getAllCells() {
    if (!this._cellsCache) {
      this._cellsCache = [];
      for (const [key, cell] of this.map.entries()) {
        this._cellsCache.push({ x: cell.x, y: cell.y, colonyId: cell.colonyId, key });
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
      if (cell.x >= minX && cell.x <= maxX && cell.y >= minY && cell.y <= maxY) {
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
    for (const cell of this.map.values()) {
      cells.push({ x: cell.x, y: cell.y, c: cell.colonyId });
    }
    return cells;
  }

  static fromJSON(cells) {
    const store = new CellStore();
    for (const cell of cells) {
      store.set(cell.x, cell.y, cell.c);
    }
    return store;
  }
}
