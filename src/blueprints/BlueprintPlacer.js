import { eventBus } from '../core/EventBus.js';
import { Rule } from '../core/Rule.js';
import { Colony } from '../core/Colony.js';
import { transformCells } from '../patterns/StructureUtils.js';

export class BlueprintPlacer {
  constructor(blueprintManager, cellStore, colonyManager) {
    this.blueprintManager = blueprintManager;
    this.cellStore = cellStore;
    this.colonyManager = colonyManager;
    
    this.isPlacing = false;
    this.currentBlueprintId = null;
    this.rotation = 0;
    this.flipped = false;
    this.mouseX = 0;
    this.mouseY = 0;
  }

  startPlacing(blueprintId) {
    const bp = this.blueprintManager.getBlueprint(blueprintId);
    if (!bp) return false;
    
    this.isPlacing = true;
    this.currentBlueprintId = blueprintId;
    this.rotation = 0;
    this.flipped = false;
    
    eventBus.emit('blueprint:placing', {
      blueprintId,
      blueprint: bp,
      rotation: 0,
      flipped: false,
      cells: this._getTransformedCells()
    });
    
    return true;
  }

  cancelPlacement() {
    if (!this.isPlacing) return;
    
    this.isPlacing = false;
    this.currentBlueprintId = null;
    this.rotation = 0;
    this.flipped = false;
    
    eventBus.emit('blueprint:placementCancelled');
  }

  rotate() {
    if (!this.isPlacing) return;
    
    this.rotation = (this.rotation + 90) % 360;
    this._emitUpdate();
  }

  flip() {
    if (!this.isPlacing) return;
    
    this.flipped = !this.flipped;
    this._emitUpdate();
  }

  setMousePosition(x, y) {
    this.mouseX = x;
    this.mouseY = y;
  }

  placeAt(worldX, worldY) {
    if (!this.isPlacing) return false;
    
    const bp = this.blueprintManager.getBlueprint(this.currentBlueprintId);
    if (!bp) return false;
    
    const cells = this._getTransformedCells();
    const colony = this._getTargetColony(bp);
    
    if (!colony) {
      alert('没有可用的群落来放置蓝图');
      return false;
    }
    
    const gx = Math.floor(worldX);
    const gy = Math.floor(worldY);
    
    for (const [dx, dy] of cells) {
      this.cellStore.set(gx + dx, gy + dy, colony.id);
    }
    
    if (window.__app?.collabManager) {
      window.__app.collabManager.recordPatternPlaced(cells, gx, gy, colony.id);
    }
    
    eventBus.emit('state:updated');
    eventBus.emit('blueprint:placed', {
      blueprintId: this.currentBlueprintId,
      x: gx,
      y: gy,
      colonyId: colony.id
    });
    
    this.isPlacing = false;
    this.currentBlueprintId = null;
    this.rotation = 0;
    this.flipped = false;
    
    return true;
  }

  _getTargetColony(bp) {
    if (bp.boundRule) {
      const ruleData = bp.boundRule;
      const existingColony = this._findColonyByRule(ruleData);
      
      if (existingColony) {
        return existingColony;
      }
      
      const rule = new Rule({
        name: ruleData.name,
        color: ruleData.color,
        birth: new Set(ruleData.birth),
        survival: new Set(ruleData.survival),
        neighborhood: ruleData.neighborhood,
        priority: ruleData.priority,
        consumptionRate: ruleData.consumptionRate,
        productionRate: ruleData.productionRate,
        predationPower: ruleData.predationPower
      });
      
      const colony = new Colony(rule);
      this.colonyManager.addColony(colony);
      return colony;
    }
    
    return this.colonyManager.getSelected();
  }

  _findColonyByRule(ruleData) {
    for (const colony of this.colonyManager.getAll()) {
      const rule = colony.rule;
      if (rule.name === ruleData.name &&
          rule.color === ruleData.color &&
          this._setsEqual(rule.birth, new Set(ruleData.birth)) &&
          this._setsEqual(rule.survival, new Set(ruleData.survival)) &&
          rule.neighborhood === ruleData.neighborhood) {
        return colony;
      }
    }
    return null;
  }

  _setsEqual(a, b) {
    if (a.size !== b.size) return false;
    for (const v of a) {
      if (!b.has(v)) return false;
    }
    return true;
  }

  _getTransformedCells() {
    const bp = this.blueprintManager.getBlueprint(this.currentBlueprintId);
    if (!bp) return [];
    return transformCells(bp.cells, this.rotation, this.flipped);
  }

  _emitUpdate() {
    const bp = this.blueprintManager.getBlueprint(this.currentBlueprintId);
    if (!bp) return;
    
    eventBus.emit('blueprint:placementUpdated', {
      blueprintId: this.currentBlueprintId,
      rotation: this.rotation,
      flipped: this.flipped,
      cells: this._getTransformedCells()
    });
  }

  getPlacementInfo() {
    if (!this.isPlacing) return null;
    
    return {
      blueprintId: this.currentBlueprintId,
      blueprint: this.blueprintManager.getBlueprint(this.currentBlueprintId),
      rotation: this.rotation,
      flipped: this.flipped,
      cells: this._getTransformedCells(),
      mouseX: this.mouseX,
      mouseY: this.mouseY
    };
  }
}
