export class ResourceField {
  constructor() {
    this.resources = new Map();
    this.pendingRecovery = new Map();
    this.showHeatmap = false;
    this.generation = 0;
    this.lastNetChange = 0;
  }

  static key(x, y) {
    return `${x},${y}`;
  }

  initialize(viewState, density = 0.3) {
    this.resources.clear();
    this.pendingRecovery.clear();

    const { minX, minY, maxX, maxY } = viewState.getVisibleRect();
    const expandX = Math.floor((maxX - minX) * 0.5);
    const expandY = Math.floor((maxY - minY) * 0.5);
    const actualMinX = minX - expandX;
    const actualMaxX = maxX + expandX;
    const actualMinY = minY - expandY;
    const actualMaxY = maxY + expandY;

    for (let x = actualMinX; x <= actualMaxX; x++) {
      for (let y = actualMinY; y <= actualMaxY; y++) {
        if (Math.random() < density) {
          const value = Math.floor(Math.random() * 61) + 20;
          this.set(x, y, value);
        }
      }
    }
  }

  get(x, y) {
    const key = ResourceField.key(x, y);
    return this.resources.get(key) || 0;
  }

  set(x, y, value) {
    const key = ResourceField.key(x, y);
    const clampedValue = Math.max(0, Math.min(100, Math.floor(value)));
    if (clampedValue === 0) {
      this.resources.delete(key);
    } else {
      this.resources.set(key, clampedValue);
    }
  }

  add(x, y, amount) {
    const current = this.get(x, y);
    const newValue = current + amount;
    this.set(x, y, newValue);
    return newValue;
  }

  consume(x, y, amount) {
    const current = this.get(x, y);
    if (current <= 0) return 0;
    
    const consumed = Math.min(current, amount);
    const newValue = current - consumed;
    this.set(x, y, newValue);
    
    if (newValue === 0) {
      this.scheduleRecovery(x, y);
    }
    
    return consumed;
  }

  scheduleRecovery(x, y) {
    const key = ResourceField.key(x, y);
    if (!this.pendingRecovery.has(key)) {
      this.pendingRecovery.set(key, { x, y, generationConsumed: this.generation });
    }
  }

  processRecovery(currentGeneration) {
    this.generation = currentGeneration;
    const recovered = [];
    
    for (const [key, info] of this.pendingRecovery.entries()) {
      const generationsPassed = currentGeneration - info.generationConsumed;
      if (generationsPassed >= 10 && generationsPassed % 10 === 0) {
        const current = this.get(info.x, info.y);
        if (current < 100) {
          const newValue = Math.min(100, current + 1);
          this.set(info.x, info.y, newValue);
          if (newValue >= 100) {
            recovered.push(key);
          }
        } else {
          recovered.push(key);
        }
      }
    }
    
    for (const key of recovered) {
      this.pendingRecovery.delete(key);
    }
  }

  toggleHeatmap() {
    this.showHeatmap = !this.showHeatmap;
    return this.showHeatmap;
  }

  getHeatmapColor(value) {
    const ratio = value / 100;
    const r = Math.floor(255 * (1 - ratio));
    const g = Math.floor(255 * ratio);
    const b = 0;
    const a = 0.4 + ratio * 0.3;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  getTotalResources() {
    let total = 0;
    for (const value of this.resources.values()) {
      total += value;
    }
    return total;
  }

  getNonZeroEntries() {
    const entries = [];
    for (const [key, value] of this.resources.entries()) {
      const comma = key.indexOf(',');
      const x = parseInt(key.slice(0, comma), 10);
      const y = parseInt(key.slice(comma + 1), 10);
      entries.push({ x, y, value });
    }
    return entries;
  }

  clear() {
    this.resources.clear();
    this.pendingRecovery.clear();
    this.lastNetChange = 0;
  }

  clone() {
    const clone = new ResourceField();
    clone.resources = new Map(this.resources);
    clone.pendingRecovery = new Map();
    for (const [k, v] of this.pendingRecovery.entries()) {
      clone.pendingRecovery.set(k, { ...v });
    }
    clone.showHeatmap = this.showHeatmap;
    clone.generation = this.generation;
    clone.lastNetChange = this.lastNetChange;
    return clone;
  }

  copyFrom(other) {
    this.resources = new Map(other.resources);
    this.pendingRecovery = new Map();
    for (const [k, v] of other.pendingRecovery.entries()) {
      this.pendingRecovery.set(k, { ...v });
    }
    this.showHeatmap = other.showHeatmap;
    this.generation = other.generation;
    this.lastNetChange = other.lastNetChange;
  }

  toJSON() {
    const resources = [];
    for (const [key, value] of this.resources.entries()) {
      const comma = key.indexOf(',');
      const x = parseInt(key.slice(0, comma), 10);
      const y = parseInt(key.slice(comma + 1), 10);
      resources.push({ x, y, v: value });
    }
    
    const recovery = [];
    for (const [key, info] of this.pendingRecovery.entries()) {
      recovery.push({
        x: info.x,
        y: info.y,
        gen: info.generationConsumed
      });
    }
    
    return {
      resources,
      recovery,
      generation: this.generation
    };
  }

  static fromJSON(data) {
    const field = new ResourceField();
    if (data && data.resources) {
      for (const entry of data.resources) {
        field.set(entry.x, entry.y, entry.v);
      }
    }
    if (data && data.recovery) {
      for (const entry of data.recovery) {
        const key = ResourceField.key(entry.x, entry.y);
        field.pendingRecovery.set(key, {
          x: entry.x,
          y: entry.y,
          generationConsumed: entry.gen
        });
      }
    }
    if (data && data.generation !== undefined) {
      field.generation = data.generation;
    }
    return field;
  }
}
