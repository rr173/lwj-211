import { eventBus } from '../core/EventBus.js';
import { Rule } from '../core/Rule.js';
import { transformCells, normalizeCoordinates } from '../patterns/StructureUtils.js';

const STORAGE_KEY = 'cell-automata-blueprints';

export class BlueprintManager {
  constructor() {
    this.blueprints = new Map();
    this.loadFromStorage();
  }

  createBlueprint(data) {
    const { cells, name, description = '', tags = [], boundRule = null } = data;
    
    const { cells: normCells, width, height } = normalizeCoordinates(cells);
    
    const id = 'bp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    
    const blueprint = {
      id,
      name: name || '未命名蓝图',
      description,
      tags: tags.map(t => t.trim()).filter(t => t),
      cells: normCells,
      width,
      height,
      cellCount: normCells.length,
      boundRule: boundRule ? this._serializeRule(boundRule) : null,
      createdAt: Date.now()
    };
    
    this.blueprints.set(id, blueprint);
    this.saveToStorage();
    eventBus.emit('blueprint:added', blueprint);
    eventBus.emit('blueprints:updated', this.getAll());
    
    return blueprint;
  }

  getBlueprint(id) {
    return this.blueprints.get(id) || null;
  }

  getAll(filter = {}) {
    let results = [...this.blueprints.values()];
    
    if (filter.search) {
      const query = filter.search.toLowerCase().trim();
      results = results.filter(bp => {
        if (bp.name.toLowerCase().includes(query)) return true;
        if (bp.description.toLowerCase().includes(query)) return true;
        if (bp.tags.some(t => t.toLowerCase().includes(query))) return true;
        return false;
      });
    }
    
    if (filter.sortBy === 'name') {
      results.sort((a, b) => a.name.localeCompare(b.name));
    } else if (filter.sortBy === 'cellCount') {
      results.sort((a, b) => b.cellCount - a.cellCount);
    } else {
      results.sort((a, b) => b.createdAt - a.createdAt);
    }
    
    return results;
  }

  updateBlueprint(id, updates) {
    const bp = this.blueprints.get(id);
    if (!bp) return null;
    
    Object.assign(bp, updates);
    bp.cellCount = bp.cells.length;
    
    if (updates.cells) {
      const { cells: norm, width, height } = normalizeCoordinates(updates.cells);
      bp.cells = norm;
      bp.width = width;
      bp.height = height;
      bp.cellCount = norm.length;
    }
    
    this.saveToStorage();
    eventBus.emit('blueprint:updated', bp);
    eventBus.emit('blueprints:updated', this.getAll());
    
    return bp;
  }

  deleteBlueprint(id) {
    if (this.blueprints.has(id)) {
      this.blueprints.delete(id);
      this.saveToStorage();
      eventBus.emit('blueprint:deleted', id);
      eventBus.emit('blueprints:updated', this.getAll());
      return true;
    }
    return false;
  }

  duplicateBlueprint(id) {
    const bp = this.blueprints.get(id);
    if (!bp) return null;
    
    const newBp = {
      ...bp,
      id: 'bp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      name: bp.name + ' (副本)',
      createdAt: Date.now(),
      cells: [...bp.cells],
      tags: [...bp.tags]
    };
    
    this.blueprints.set(newBp.id, newBp);
    this.saveToStorage();
    eventBus.emit('blueprint:added', newBp);
    eventBus.emit('blueprints:updated', this.getAll());
    
    return newBp;
  }

  exportBlueprint(id) {
    const bp = this.blueprints.get(id);
    if (!bp) return null;
    return JSON.stringify(this._toJSON(bp), null, 2);
  }

  exportAll() {
    const data = {
      version: 1,
      exportedAt: Date.now(),
      blueprints: this.getAll().map(bp => this._toJSON(bp))
    };
    return JSON.stringify(data, null, 2);
  }

  importFromJSON(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      const bps = Array.isArray(data) ? data : (data.blueprints || []);
      let mergedCount = 0;
      
      for (const bpData of bps) {
        if (!bpData.cells || !Array.isArray(bpData.cells)) continue;
        
        const existing = this._findByName(bpData.name);
        
        if (existing) {
          this.updateBlueprint(existing.id, {
            description: bpData.description,
            tags: bpData.tags || [],
            cells: bpData.cells,
            boundRule: bpData.boundRule || null
          });
          mergedCount++;
        } else {
          const newBp = {
            id: bpData.id || ('bp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)),
            name: bpData.name || '导入的蓝图',
            description: bpData.description || '',
            tags: bpData.tags || [],
            cells: bpData.cells,
            width: bpData.width,
            height: bpData.height,
            cellCount: bpData.cellCount || bpData.cells.length,
            boundRule: bpData.boundRule || null,
            createdAt: bpData.createdAt || Date.now()
          };
          
          const { cells: norm, width, height } = normalizeCoordinates(newBp.cells);
          newBp.cells = norm;
          newBp.width = width;
          newBp.height = height;
          newBp.cellCount = norm.length;
          
          this.blueprints.set(newBp.id, newBp);
          mergedCount++;
        }
      }
      
      if (mergedCount > 0) {
        this.saveToStorage();
        eventBus.emit('blueprints:updated', this.getAll());
      }
      
      return { success: true, mergedCount };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  createCompositeBlueprint(instances, name) {
    if (instances.length === 0) return null;
    
    const allCells = [];
    
    for (const inst of instances) {
      const bp = this.blueprints.get(inst.blueprintId);
      if (!bp) continue;
      
      const transformed = transformCells(bp.cells, inst.rotation || 0, inst.flipped || false);
      
      for (const [dx, dy] of transformed) {
        allCells.push([inst.offsetX + dx, inst.offsetY + dy]);
      }
    }
    
    return this.createBlueprint({
      cells: allCells,
      name: name || '复合蓝图',
      description: '由多个蓝图组合而成',
      tags: ['复合'],
      boundRule: null
    });
  }

  getTransformedCells(blueprintId, rotation = 0, flipped = false) {
    const bp = this.blueprints.get(blueprintId);
    if (!bp) return null;
    return transformCells(bp.cells, rotation, flipped);
  }

  _serializeRule(rule) {
    if (!rule) return null;
    return {
      name: rule.name,
      color: rule.color,
      birth: [...rule.birth],
      survival: [...rule.survival],
      neighborhood: rule.neighborhood,
      priority: rule.priority,
      consumptionRate: rule.consumptionRate,
      productionRate: rule.productionRate,
      predationPower: rule.predationPower
    };
  }

  _deserializeRule(data) {
    if (!data) return null;
    return new Rule({
      name: data.name,
      color: data.color,
      birth: new Set(data.birth),
      survival: new Set(data.survival),
      neighborhood: data.neighborhood,
      priority: data.priority,
      consumptionRate: data.consumptionRate,
      productionRate: data.productionRate,
      predationPower: data.predationPower
    });
  }

  _findByName(name) {
    for (const bp of this.blueprints.values()) {
      if (bp.name === name) return bp;
    }
    return null;
  }

  _toJSON(bp) {
    return {
      id: bp.id,
      name: bp.name,
      description: bp.description,
      tags: [...bp.tags],
      cells: [...bp.cells],
      width: bp.width,
      height: bp.height,
      cellCount: bp.cellCount,
      boundRule: bp.boundRule ? { ...bp.boundRule } : null,
      createdAt: bp.createdAt
    };
  }

  saveToStorage() {
    try {
      const data = this.getAll().map(bp => this._toJSON(bp));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to save blueprints:', e);
    }
  }

  loadFromStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        for (const bpData of data) {
          const bp = {
            ...bpData,
            tags: [...(bpData.tags || [])],
            cells: [...(bpData.cells || [])]
          };
          this.blueprints.set(bp.id, bp);
        }
      }
    } catch (e) {
      console.warn('Failed to load blueprints:', e);
      this.blueprints.clear();
    }
  }
}
