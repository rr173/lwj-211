import { eventBus } from '../core/EventBus.js';
import {
  STRUCTURE_TYPES,
  normalizeCoordinates,
  hashStructure,
  findConnectedComponents,
  getCentroid,
  coordinateSetEquals,
  evolveStructure
} from './StructureUtils.js';

export class PatternRecognizer {
  constructor(cellStore, colonyManager, patternLibrary) {
    this.cellStore = cellStore;
    this.colonyManager = colonyManager;
    this.patternLibrary = patternLibrary;
    
    this.enabled = true;
    this.scanInterval = 10;
    this.trackGenerations = 30;
    this.maxTrackPeriod = 60;
    this.minStructureSize = 3;
    this.maxStructureSize = 500;
    
    this.lastScanGeneration = -1;
    this.trackingCandidates = new Map();
    this.idleTaskQueue = [];
    this.isProcessingIdle = false;
    
    this.bindEvents();
  }
  
  bindEvents() {
    eventBus.on('generation:changed', (gen) => this.onGeneration(gen));
  }
  
  setEnabled(enabled) {
    this.enabled = enabled;
  }
  
  onGeneration(generation) {
    if (!this.enabled) return;
    
    if (generation % this.scanInterval === 0 && generation !== this.lastScanGeneration) {
      this.lastScanGeneration = generation;
      this.queueIdleTask(() => this.scanCanvas(generation));
    }
    
    this.queueIdleTask(() => this.updateTracking(generation));
  }
  
  queueIdleTask(task) {
    this.idleTaskQueue.push(task);
    if (!this.isProcessingIdle) {
      this.processIdleTasks();
    }
  }
  
  processIdleTasks() {
    if (this.idleTaskQueue.length === 0) {
      this.isProcessingIdle = false;
      return;
    }
    
    this.isProcessingIdle = true;
    
    const deadline = performance.now() + 8;
    
    while (this.idleTaskQueue.length > 0 && performance.now() < deadline) {
      const task = this.idleTaskQueue.shift();
      try {
        task();
      } catch (e) {
        console.error('Idle task error:', e);
      }
    }
    
    if (this.idleTaskQueue.length > 0) {
      requestAnimationFrame(() => this.processIdleTasks());
    } else {
      this.isProcessingIdle = false;
    }
  }
  
  scanCanvas(generation) {
    const allCells = this.cellStore.getAllCells();
    if (allCells.length === 0) return;
    
    const components = findConnectedComponents(allCells);
    
    for (const component of components) {
      if (component.size < this.minStructureSize || component.size > this.maxStructureSize) {
        continue;
      }
      
      const { cells: normalizedCells } = normalizeCoordinates(component.cells);
      const hash = hashStructure(normalizedCells);
      
      if (this.patternLibrary.hasHash(hash)) {
        continue;
      }
      
      if (this.trackingCandidates.has(hash)) {
        continue;
      }
      
      const colonyId = component.colonyIds.length === 1 ? component.colonyIds[0] : null;
      const colony = colonyId ? this.colonyManager.getColony(colonyId) : null;
      
      this.trackingCandidates.set(hash, {
        hash,
        initialCells: component.cells,
        normalizedCells,
        colonyId,
        colonyName: colony?.name || '混合群落',
        colonyColor: colony?.color || '#888888',
        startGeneration: generation,
        history: [],
        centroids: [],
        maxPeriodChecked: 0,
        status: 'tracking'
      });
    }
  }
  
  updateTracking(currentGeneration) {
    const toRemove = [];
    
    for (const [hash, candidate] of this.trackingCandidates) {
      const elapsed = currentGeneration - candidate.startGeneration;
      
      if (elapsed <= this.trackGenerations + this.maxTrackPeriod) {
        this.evolveCandidate(candidate, elapsed);
      }
      
      if (candidate.status === 'classified' || elapsed > this.trackGenerations + this.maxTrackPeriod * 2) {
        if (candidate.status === 'classified') {
          this.addToLibrary(candidate, currentGeneration);
        }
        toRemove.push(hash);
      }
    }
    
    for (const hash of toRemove) {
      this.trackingCandidates.delete(hash);
    }
  }
  
  evolveCandidate(candidate, elapsed) {
    let currentCells;
    
    if (elapsed < candidate.history.length) {
      currentCells = candidate.history[elapsed];
    } else {
      if (candidate.history.length > 0) {
        currentCells = candidate.history[candidate.history.length - 1];
      } else {
        currentCells = candidate.initialCells;
      }
      
      for (let i = candidate.history.length; i <= elapsed && i < 200; i++) {
        const colony = candidate.colonyId ? this.colonyManager.getColony(candidate.colonyId) : null;
        const rule = colony?.rule || { birth: new Set([3]), survival: new Set([2, 3]) };
        
        currentCells = evolveStructure(currentCells, rule);
        
        if (currentCells.length === 0) {
          candidate.status = 'died';
          break;
        }
        
        candidate.history.push(currentCells);
        candidate.centroids.push(getCentroid(currentCells));
      }
    }
    
    if (candidate.status !== 'tracking') return;
    
    this.classifyCandidate(candidate, elapsed);
  }
  
  classifyCandidate(candidate, elapsed) {
    if (elapsed < 30) return;
    
    const { cells: baseNorm } = normalizeCoordinates(candidate.history[0]);
    
    if (elapsed >= 30) {
      let isStillLife = true;
      for (let i = 1; i <= Math.min(30, candidate.history.length - 1); i++) {
        const { cells: norm } = normalizeCoordinates(candidate.history[i]);
        if (!coordinateSetEquals(baseNorm, norm)) {
          isStillLife = false;
          break;
        }
      }
      
      if (isStillLife) {
        candidate.type = STRUCTURE_TYPES.STILL_LIFE;
        candidate.period = 1;
        candidate.status = 'classified';
        return;
      }
    }
    
    const maxPeriod = Math.min(this.maxTrackPeriod, elapsed - 1);
    for (let period = 2; period <= maxPeriod; period++) {
      if (candidate.maxPeriodChecked >= period) continue;
      
      const startIdx = Math.max(0, elapsed - period * 3);
      const samples = [];
      
      for (let i = startIdx; i <= elapsed - period; i += period) {
        if (candidate.history[i] && candidate.history[i + period]) {
          samples.push([candidate.history[i], candidate.history[i + period]]);
        }
      }
      
      if (samples.length >= 2) {
        let isOscillator = true;
        let isSpaceship = true;
        const translations = [];
        
        for (const [cellsA, cellsB] of samples) {
          const normA = normalizeCoordinates(cellsA);
          const normB = normalizeCoordinates(cellsB);
          
          if (!coordinateSetEquals(normA.cells, normB.cells)) {
            isOscillator = false;
            isSpaceship = false;
            break;
          }
          
          const centroidA = getCentroid(cellsA);
          const centroidB = getCentroid(cellsB);
          const dx = centroidB.x - centroidA.x;
          const dy = centroidB.y - centroidA.y;
          
          translations.push({ dx, dy });
          
          if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
            isOscillator = false;
          }
        }
        
        if (isOscillator) {
          candidate.type = STRUCTURE_TYPES.OSCILLATOR;
          candidate.period = period;
          candidate.status = 'classified';
          return;
        }
        
        if (isSpaceship && translations.length >= 2) {
          const consistent = translations.every(t => 
            Math.abs(t.dx - translations[0].dx) < 0.5 && 
            Math.abs(t.dy - translations[0].dy) < 0.5
          );
          
          if (consistent && (Math.abs(translations[0].dx) > 0.1 || Math.abs(translations[0].dy) > 0.1)) {
            candidate.type = STRUCTURE_TYPES.SPACESHIP;
            candidate.period = period;
            candidate.velocity = {
              dx: translations[0].dx / period,
              dy: translations[0].dy / period
            };
            candidate.direction = this.getDirection(translations[0].dx, translations[0].dy);
            candidate.status = 'classified';
            return;
          }
        }
      }
      
      candidate.maxPeriodChecked = period;
    }
  }
  
  getDirection(dx, dy) {
    if (Math.abs(dx) < 0.1 && dy < -0.1) return '上';
    if (Math.abs(dx) < 0.1 && dy > 0.1) return '下';
    if (dx > 0.1 && Math.abs(dy) < 0.1) return '右';
    if (dx < -0.1 && Math.abs(dy) < 0.1) return '左';
    if (dx > 0.1 && dy < -0.1) return '右上';
    if (dx < -0.1 && dy < -0.1) return '左上';
    if (dx > 0.1 && dy > 0.1) return '右下';
    if (dx < -0.1 && dy > 0.1) return '左下';
    return '未知';
  }
  
  addToLibrary(candidate, currentGeneration) {
    const { cells: normalizedCells, width, height } = normalizeCoordinates(candidate.initialCells);
    const hash = hashStructure(normalizedCells);
    
    const entry = {
      id: 'struct_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      hash,
      type: candidate.type,
      period: candidate.period || 1,
      cellCount: normalizedCells.length,
      width,
      height,
      cells: normalizedCells,
      colonyName: candidate.colonyName,
      colonyColor: candidate.colonyColor,
      discoveredGeneration: candidate.startGeneration,
      discoveredAt: Date.now(),
      source: 'canvas',
      velocity: candidate.velocity,
      direction: candidate.direction,
      evolutionFrames: candidate.history.slice(0, (candidate.period || 1) * 3)
    };
    
    this.patternLibrary.addEntry(entry);
  }
  
  scanCellList(cells, options = {}) {
    const {
      minSize = 3,
      maxSize = 500,
      maxGenerations = 500,
      source = 'custom',
      colonyId = null,
      rule = null,
      onProgress = null
    } = options;
    
    return new Promise((resolve) => {
      const components = findConnectedComponents(cells);
      const results = [];
      let processed = 0;
      
      const processNext = () => {
        if (processed >= components.length) {
          resolve(results);
          return;
        }
        
        const component = components[processed++];
        
        if (onProgress) {
          onProgress(processed, components.length);
        }
        
        if (component.size < minSize || component.size > maxSize) {
          setTimeout(processNext, 0);
          return;
        }
        
        this.analyzeComponent(component, rule, maxGenerations).then(result => {
          if (result) {
            result.source = source;
            result.colonyId = colonyId;
            results.push(result);
          }
          setTimeout(processNext, 0);
        });
      };
      
      processNext();
    });
  }
  
  async analyzeComponent(component, rule = null, maxGenerations = 200) {
    const { cells: normalizedCells } = normalizeCoordinates(component.cells);
    const hash = hashStructure(normalizedCells);
    
    if (this.patternLibrary.hasHash(hash)) {
      return null;
    }
    
    const colony = component.colonyIds.length === 1 
      ? this.colonyManager.getColony(component.colonyIds[0]) 
      : null;
    
    const effectiveRule = rule || colony?.rule || { birth: new Set([3]), survival: new Set([2, 3]) };
    
    const history = [];
    const centroids = [];
    let currentCells = component.cells;
    
    for (let i = 0; i < maxGenerations; i++) {
      history.push(currentCells);
      centroids.push(getCentroid(currentCells));
      
      currentCells = evolveStructure(currentCells, effectiveRule);
      
      if (currentCells.length === 0) {
        return null;
      }
    }
    
    const { cells: baseNorm } = normalizeCoordinates(history[0]);
    let isStillLife = true;
    for (let i = 1; i <= Math.min(30, history.length - 1); i++) {
      const { cells: norm } = normalizeCoordinates(history[i]);
      if (!coordinateSetEquals(baseNorm, norm)) {
        isStillLife = false;
        break;
      }
    }
    
    if (isStillLife) {
      return {
        hash,
        type: STRUCTURE_TYPES.STILL_LIFE,
        period: 1,
        cells: normalizedCells,
        cellCount: normalizedCells.length,
        width: normalizeCoordinates(component.cells).width,
        height: normalizeCoordinates(component.cells).height,
        colonyName: colony?.name || '未知',
        colonyColor: colony?.color || '#888888',
        evolutionFrames: history.slice(0, 3)
      };
    }
    
    for (let period = 2; period <= 60; period++) {
      let isOscillator = true;
      let isSpaceship = true;
      const translations = [];
      
      for (let start = 0; start < history.length - period * 2; start += period) {
        const cellsA = history[start];
        const cellsB = history[start + period];
        
        const normA = normalizeCoordinates(cellsA);
        const normB = normalizeCoordinates(cellsB);
        
        if (!coordinateSetEquals(normA.cells, normB.cells)) {
          isOscillator = false;
          isSpaceship = false;
          break;
        }
        
        const centroidA = getCentroid(cellsA);
        const centroidB = getCentroid(cellsB);
        translations.push({
          dx: centroidB.x - centroidA.x,
          dy: centroidB.y - centroidA.y
        });
        
        if (Math.abs(translations[translations.length - 1].dx) > 0.01 || 
            Math.abs(translations[translations.length - 1].dy) > 0.01) {
          isOscillator = false;
        }
      }
      
      if (translations.length >= 2) {
        if (isOscillator) {
          return {
            hash,
            type: STRUCTURE_TYPES.OSCILLATOR,
            period,
            cells: normalizedCells,
            cellCount: normalizedCells.length,
            width: normalizeCoordinates(component.cells).width,
            height: normalizeCoordinates(component.cells).height,
            colonyName: colony?.name || '未知',
            colonyColor: colony?.color || '#888888',
            evolutionFrames: history.slice(0, period * 3)
          };
        }
        
        if (isSpaceship) {
          const consistent = translations.every(t => 
            Math.abs(t.dx - translations[0].dx) < 0.5 && 
            Math.abs(t.dy - translations[0].dy) < 0.5
          );
          
          if (consistent && (Math.abs(translations[0].dx) > 0.1 || Math.abs(translations[0].dy) > 0.1)) {
            return {
              hash,
              type: STRUCTURE_TYPES.SPACESHIP,
              period,
              cells: normalizedCells,
              cellCount: normalizedCells.length,
              width: normalizeCoordinates(component.cells).width,
              height: normalizeCoordinates(component.cells).height,
              colonyName: colony?.name || '未知',
              colonyColor: colony?.color || '#888888',
              velocity: {
                dx: translations[0].dx / period,
                dy: translations[0].dy / period
              },
              direction: this.getDirection(translations[0].dx, translations[0].dy),
              evolutionFrames: history.slice(0, period * 3)
            };
          }
        }
      }
    }
    
    return null;
  }
  
  getStats() {
    return {
      trackingCount: this.trackingCandidates.size,
      idleQueueLength: this.idleTaskQueue.length,
      enabled: this.enabled
    };
  }
}
