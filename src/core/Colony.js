import { Rule } from './Rule.js';
import { eventBus } from './EventBus.js';

let colonyIdCounter = 0;

const DEFAULT_WAVEFORMS = ['sine', 'square', 'triangle', 'sawtooth'];

export class Colony {
  constructor(rule) {
    this.id = 'colony_' + (++colonyIdCounter) + '_' + Math.random().toString(36).substr(2, 5);
    this.rule = rule;
    this.paused = false;
    this.prevCount = 0;
    this.currentCount = 0;
    this.growthRateHistory = [];
    this.mutationHistory = [];
    this.lastMutationCheck = 0;

    const index = colonyIdCounter - 1;
    this.musicConfig = {
      waveform: DEFAULT_WAVEFORMS[index % DEFAULT_WAVEFORMS.length],
      octaveOffset: 0,
      enabled: true
    };
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

  recordGrowthRate() {
    const rate = this.getGrowthRate();
    this.growthRateHistory.push(rate);
    if (this.growthRateHistory.length > 100) {
      this.growthRateHistory.shift();
    }
  }

  getAverageGrowthRate(lastN = 100) {
    if (this.growthRateHistory.length === 0) return 0;
    const recent = this.growthRateHistory.slice(-lastN);
    return recent.reduce((sum, r) => sum + r, 0) / recent.length;
  }

  shouldCheckMutation(currentGeneration) {
    return currentGeneration > 0 && currentGeneration % 100 === 0 && currentGeneration > this.lastMutationCheck;
  }

  recordMutation(generation, oldBS, newBS) {
    this.mutationHistory.push({
      generation,
      oldBS,
      newBS,
      timestamp: Date.now()
    });
    this.lastMutationCheck = generation;
    eventBus.emit('colony:mutated', {
      colonyId: this.id,
      colonyName: this.name,
      generation,
      oldBS,
      newBS
    });
  }

  applyRandomMutation() {
    const oldBS = this.rule.toBSString();
    const mutateBirth = Math.random() < 0.5;
    const targetSet = mutateBirth ? this.rule.birth : this.rule.survival;
    const values = [...targetSet];
    
    if (values.length > 0 && Math.random() < 0.5) {
      const removeIndex = Math.floor(Math.random() * values.length);
      targetSet.delete(values[removeIndex]);
    } else {
      const availableNumbers = [];
      for (let i = 0; i <= 8; i++) {
        if (!targetSet.has(i)) availableNumbers.push(i);
      }
      if (availableNumbers.length > 0) {
        const addIndex = Math.floor(Math.random() * availableNumbers.length);
        targetSet.add(availableNumbers[addIndex]);
      }
    }
    
    const newBS = this.rule.toBSString();
    if (oldBS !== newBS) {
      return { oldBS, newBS };
    }
    return null;
  }

  setMusicWaveform(waveform) {
    this.musicConfig.waveform = waveform;
    eventBus.emit('colony:musicConfigChanged', this);
  }

  setMusicOctaveOffset(offset) {
    this.musicConfig.octaveOffset = Math.max(-2, Math.min(2, offset));
    eventBus.emit('colony:musicConfigChanged', this);
  }

  setMusicEnabled(enabled) {
    this.musicConfig.enabled = enabled;
    eventBus.emit('colony:musicConfigChanged', this);
  }

  toJSON() {
    return {
      id: this.id,
      rule: this.rule.toJSON(),
      paused: this.paused,
      prevCount: this.prevCount,
      currentCount: this.currentCount,
      growthRateHistory: [...this.growthRateHistory],
      mutationHistory: [...this.mutationHistory],
      lastMutationCheck: this.lastMutationCheck,
      musicConfig: { ...this.musicConfig }
    };
  }

  static fromJSON(data) {
    const colony = new Colony(Rule.fromJSON(data.rule));
    colony.id = data.id;
    colony.paused = data.paused || false;
    colony.prevCount = data.prevCount || 0;
    colony.currentCount = data.currentCount || 0;
    colony.growthRateHistory = data.growthRateHistory || [];
    colony.mutationHistory = data.mutationHistory || [];
    colony.lastMutationCheck = data.lastMutationCheck || 0;
    if (data.musicConfig) {
      colony.musicConfig = { ...data.musicConfig };
    }
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
