import { Rule } from './Rule.js';
import { eventBus } from './EventBus.js';

let colonyIdCounter = 0;

export class Colony {
  constructor(rule) {
    this.id = 'colony_' + (++colonyIdCounter) + '_' + Math.random().toString(36).substr(2, 5);
    this.rule = rule;
    this.paused = false;
    this.prevCount = 0;
    this.currentCount = 0;
  }

  get name() {
    return this.rule.name;
  }

  get color() {
    return this.rule.color;
  }

  togglePause() {
    this.paused = !this.paused;
    eventBus.emit('colony:updated', this);
    return this.paused;
  }

  getGrowthRate() {
    if (this.prevCount === 0) return 0;
    return ((this.currentCount - this.prevCount) / this.prevCount) * 100;
  }

  toJSON() {
    return {
      id: this.id,
      rule: this.rule.toJSON(),
      paused: this.paused
    };
  }

  static fromJSON(data) {
    const colony = new Colony(Rule.fromJSON(data.rule));
    colony.id = data.id;
    colony.paused = data.paused || false;
    const match = data.id.match(/colony_(\d+)_/);
    if (match) {
      colonyIdCounter = Math.max(colonyIdCounter, parseInt(match[1], 10));
    }
    return colony;
  }
}

export class ColonyManager {
  constructor() {
    this.colonies = new Map();
    this.selectedColonyId = null;
  }

  addColony(colony) {
    this.colonies.set(colony.id, colony);
    if (!this.selectedColonyId) {
      this.selectedColonyId = colony.id;
    }
    eventBus.emit('colony:added', colony);
    eventBus.emit('colony:selected', colony);
    return colony;
  }

  removeColony(colonyId) {
    if (this.colonies.has(colonyId)) {
      this.colonies.delete(colonyId);
      if (this.selectedColonyId === colonyId) {
        this.selectedColonyId = this.colonies.keys().next().value || null;
      }
      eventBus.emit('colony:removed', colonyId);
    }
  }

  getColony(colonyId) {
    return this.colonies.get(colonyId) || null;
  }

  getAll() {
    return [...this.colonies.values()];
  }

  getSelected() {
    return this.colonies.get(this.selectedColonyId) || null;
  }

  selectColony(colonyId) {
    if (this.colonies.has(colonyId)) {
      this.selectedColonyId = colonyId;
      eventBus.emit('colony:selected', this.colonies.get(colonyId));
    }
  }

  clear() {
    this.colonies.clear();
    this.selectedColonyId = null;
  }

  toJSON() {
    return this.getAll().map(c => c.toJSON());
  }

  static fromJSON(data) {
    const manager = new ColonyManager();
    for (const colonyData of data) {
      const colony = Colony.fromJSON(colonyData);
      manager.colonies.set(colony.id, colony);
      if (!manager.selectedColonyId) {
        manager.selectedColonyId = colony.id;
      }
    }
    return manager;
  }
}
