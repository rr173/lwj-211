export class CellStore {
  constructor() {
    this.map = new Map();
    this.count = 0;
  }

  static key(x, y) {
    return `${x},${y}`;
  }

  set(x, y, colonyId) {
    const key = CellStore.key(x, y);
    if (!this.map.has(key)) {
      this.count++;
    }
    this.map.set(key, { x, y, colonyId });
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
    if (this.map.has(key)) {
      this.map.delete(key);
      this.count--;
      return true;
    }
    return false;
  }

  clear() {
    this.map.clear();
    this.count = 0;
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
    return [...this.map.values()];
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
    let count = 0;
    for (const cell of this.map.values()) {
      if (cell.colonyId === colonyId) {
        count++;
      }
    }
    return count;
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
