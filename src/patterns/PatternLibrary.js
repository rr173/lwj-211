import { eventBus } from '../core/EventBus.js';
import { STRUCTURE_TYPES, hashStructure, normalizeCoordinates, structureToRLE } from './StructureUtils.js';

export const SOURCE_LABELS = {
  canvas: '主画布',
  arena: '竞技场',
  genelab: '基因实验室试跑',
  custom: '自定义',
  imported: '导入'
};

export class PatternLibrary {
  constructor() {
    this.entries = new Map();
    this.hashIndex = new Set();
    this.maxEntries = 500;
    this.loadFromStorage();
  }
  
  addEntry(entry, options = {}) {
    const { skipEvent = false } = options;
    
    if (this.hashIndex.has(entry.hash)) {
      return null;
    }
    
    if (this.entries.size >= this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      const oldest = this.entries.get(oldestKey);
      this.hashIndex.delete(oldest.hash);
      this.entries.delete(oldestKey);
    }
    
    if (!entry.rle) {
      entry.rle = structureToRLE(entry.cells);
    }
    
    this.entries.set(entry.id, entry);
    this.hashIndex.add(entry.hash);
    
    if (!skipEvent) {
      eventBus.emit('library:entryAdded', entry);
      eventBus.emit('library:updated', this.getEntries());
    }
    
    this.saveToStorage();
    return entry;
  }
  
  removeEntry(entryId) {
    const entry = this.entries.get(entryId);
    if (entry) {
      this.hashIndex.delete(entry.hash);
      this.entries.delete(entryId);
      eventBus.emit('library:entryRemoved', entryId);
      eventBus.emit('library:updated', this.getEntries());
      this.saveToStorage();
      return true;
    }
    return false;
  }
  
  getEntry(entryId) {
    return this.entries.get(entryId) || null;
  }
  
  hasHash(hash) {
    return this.hashIndex.has(hash);
  }
  
  getEntries(filter = {}) {
    let results = [...this.entries.values()];
    
    if (filter.type) {
      results = results.filter(e => e.type === filter.type);
    }
    
    if (filter.source) {
      results = results.filter(e => e.source === filter.source);
    }
    
    if (filter.minCells !== undefined) {
      results = results.filter(e => e.cellCount >= filter.minCells);
    }
    
    if (filter.maxCells !== undefined) {
      results = results.filter(e => e.cellCount <= filter.maxCells);
    }
    
    if (filter.period !== undefined) {
      results = results.filter(e => e.period === filter.period);
    }
    
    if (filter.colonyName) {
      results = results.filter(e => 
        e.colonyName.toLowerCase().includes(filter.colonyName.toLowerCase())
      );
    }
    
    if (filter.search) {
      results = this.applySearch(results, filter.search);
    }
    
    results.sort((a, b) => b.discoveredAt - a.discoveredAt);
    
    if (filter.limit) {
      results = results.slice(0, filter.limit);
    }
    
    return results;
  }
  
  applySearch(entries, searchQuery) {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return entries;
    
    const cellRangeMatch = query.match(/^(\d+)\s*-\s*(\d+)$/);
    if (cellRangeMatch) {
      const min = parseInt(cellRangeMatch[1], 10);
      const max = parseInt(cellRangeMatch[2], 10);
      return entries.filter(e => e.cellCount >= min && e.cellCount <= max);
    }
    
    const periodMatch = query.match(/^p\s*(\d+)$/i);
    if (periodMatch) {
      const period = parseInt(periodMatch[1], 10);
      return entries.filter(e => e.period === period);
    }
    
    return entries.filter(e => {
      if (e.colonyName.toLowerCase().includes(query)) return true;
      if (e.type.toLowerCase().includes(query)) return true;
      if (e.direction && e.direction.toLowerCase().includes(query)) return true;
      if (SOURCE_LABELS[e.source]?.toLowerCase().includes(query)) return true;
      return false;
    });
  }
  
  getCounts() {
    const counts = {
      total: this.entries.size,
      [STRUCTURE_TYPES.STILL_LIFE]: 0,
      [STRUCTURE_TYPES.OSCILLATOR]: 0,
      [STRUCTURE_TYPES.SPACESHIP]: 0,
      bySource: {}
    };
    
    for (const entry of this.entries.values()) {
      if (counts[entry.type] !== undefined) {
        counts[entry.type]++;
      }
      counts.bySource[entry.source] = (counts.bySource[entry.source] || 0) + 1;
    }
    
    return counts;
  }
  
  mergeEntries(entriesToMerge) {
    let mergedCount = 0;
    
    for (const entry of entriesToMerge) {
      if (!entry.hash || !entry.cells) continue;
      
      const { cells: normalized } = normalizeCoordinates(entry.cells);
      const hash = hashStructure(normalized);
      
      if (!this.hashIndex.has(hash)) {
        const newEntry = {
          ...entry,
          id: 'struct_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          hash,
          cells: normalized,
          source: entry.source || 'imported',
          discoveredAt: entry.discoveredAt || Date.now(),
          discoveredGeneration: entry.discoveredGeneration || 0
        };
        
        if (this.addEntry(newEntry, { skipEvent: true })) {
          mergedCount++;
        }
      }
    }
    
    if (mergedCount > 0) {
      eventBus.emit('library:updated', this.getEntries());
      this.saveToStorage();
    }
    
    return mergedCount;
  }
  
  clear() {
    this.entries.clear();
    this.hashIndex.clear();
    eventBus.emit('library:cleared');
    eventBus.emit('library:updated', []);
    this.saveToStorage();
  }
  
  toJSON() {
    return [...this.entries.values()];
  }
  
  static fromJSON(data) {
    const library = new PatternLibrary();
    if (Array.isArray(data)) {
      library.mergeEntries(data);
    }
    return library;
  }
  
  saveToStorage() {
    try {
      const data = this.toJSON();
      localStorage.setItem('pattern_library', JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to save pattern library:', e);
    }
  }
  
  loadFromStorage() {
    try {
      const stored = localStorage.getItem('pattern_library');
      if (stored) {
        const data = JSON.parse(stored);
        for (const entry of data) {
          const { cells: normalized } = normalizeCoordinates(entry.cells);
          const hash = hashStructure(normalized);
          entry.hash = hash;
          entry.cells = normalized;
          if (!entry.rle) {
            entry.rle = structureToRLE(entry.cells);
          }
          this.entries.set(entry.id, entry);
          this.hashIndex.add(hash);
        }
      }
    } catch (e) {
      console.warn('Failed to load pattern library:', e);
      this.entries.clear();
      this.hashIndex.clear();
    }
  }
  
  exportAsJSON() {
    const data = {
      version: 1,
      exportedAt: Date.now(),
      entries: this.toJSON()
    };
    return JSON.stringify(data, null, 2);
  }
  
  importFromJSON(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      const entries = data.entries || data;
      const mergedCount = this.mergeEntries(entries);
      return { success: true, mergedCount };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}
