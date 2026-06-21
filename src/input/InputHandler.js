import { eventBus } from '../core/EventBus.js';
import { Topology, TOPOLOGY_TYPES } from '../core/Topology.js';

export class InputHandler {
  constructor(canvas, viewState, cellStore, colonyManager, patternManager, historyManager = null, resourceField = null, terrainLayer = null, blueprintManager = null, blueprintPlacer = null) {
    this.canvas = canvas;
    this.viewState = viewState;
    this.cellStore = cellStore;
    this.colonyManager = colonyManager;
    this.patternManager = patternManager;
    this.historyManager = historyManager;
    this.resourceField = resourceField;
    this.terrainLayer = terrainLayer;
    this.blueprintManager = blueprintManager;
    this.blueprintPlacer = blueprintPlacer;

    this.isDragging = false;
    this.isPanning = false;
    this.isDrawing = false;
    this.drawMode = null;
    this.lastPanX = 0;
    this.lastPanY = 0;
    this.placingPattern = null;
    this._forkedOnThisDraw = false;
    this.selectedTerrain = 'none';

    this.isSelectingBlueprint = false;
    this.selectionStartX = 0;
    this.selectionStartY = 0;
    this.selectionEndX = 0;
    this.selectionEndY = 0;

    this.bindEvents();
  }

  setBlueprintManager(bm) {
    this.blueprintManager = bm;
  }

  setBlueprintPlacer(bp) {
    this.blueprintPlacer = bp;
  }

  setHistoryManager(hm) {
    this.historyManager = hm;
  }

  setTerrainLayer(tl) {
    this.terrainLayer = tl;
  }

  bindEvents() {
    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));
    this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    this.canvas.addEventListener('mouseleave', (e) => this.onMouseLeave(e));
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    eventBus.on('pattern:placing', (data) => {
      this.placingPattern = data.name;
    });
    eventBus.on('pattern:cancel', () => {
      this.placingPattern = null;
    });
    eventBus.on('pattern:placed', () => {
      this.placingPattern = null;
    });

    eventBus.on('terrain:selected', (type) => {
      this.selectedTerrain = type;
      if (this.terrainLayer && type !== 'portal') {
        this.terrainLayer.cancelPendingPortal();
      }
    });

    document.addEventListener('keydown', (e) => this.onKeyDown(e));
  }

  onKeyDown(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
      return;
    }

    if (this.blueprintPlacer && this.blueprintPlacer.isPlacing) {
      if (e.code === 'KeyR') {
        e.preventDefault();
        this.blueprintPlacer.rotate();
        eventBus.emit('status:update');
        return;
      } else if (e.code === 'KeyF') {
        e.preventDefault();
        this.blueprintPlacer.flip();
        eventBus.emit('status:update');
        return;
      } else if (e.code === 'Escape') {
        e.preventDefault();
        this.blueprintPlacer.cancelPlacement();
        return;
      }
    }

    if (this.isSelectingBlueprint && e.code === 'Escape') {
      e.preventDefault();
      this.cancelBlueprintSelection();
      return;
    }

    if (!this.patternManager.isPlacing()) return;

    if (e.code === 'KeyR') {
      e.preventDefault();
      const rotation = this.patternManager.rotatePlacement();
      eventBus.emit('status:update');
    } else if (e.code === 'KeyF') {
      e.preventDefault();
      const flipped = this.patternManager.flipPlacement();
      eventBus.emit('status:update');
    }
  }

  getMousePos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  onMouseDown(e) {
    const pos = this.getMousePos(e);
    const world = this.viewState.screenToWorld(pos.x, pos.y);
    const topology = Topology.getType();

    if (e.button === 1) {
      this.isPanning = true;
      this.lastPanX = e.clientX;
      this.lastPanY = e.clientY;
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    if (e.button === 0 && e.shiftKey && this.blueprintManager && topology === TOPOLOGY_TYPES.SQUARE) {
      this.isSelectingBlueprint = true;
      this.selectionStartX = world.x;
      this.selectionStartY = world.y;
      this.selectionEndX = world.x;
      this.selectionEndY = world.y;
      this.canvas.style.cursor = 'crosshair';
      eventBus.emit('blueprint:selectionStarted', {
        startX: this.selectionStartX,
        startY: this.selectionStartY
      });
      eventBus.emit('blueprint:selectionUpdated', this.getSelectionRect());
      return;
    }

    if (this.blueprintPlacer && this.blueprintPlacer.isPlacing && e.button === 0) {
      this._triggerForkIfNeeded();
      this.blueprintPlacer.placeAt(world.x, world.y);
      eventBus.emit('state:updated');
      return;
    }

    if (this.placingPattern && e.button === 0) {
      this._triggerForkIfNeeded();
      this.patternManager.placePattern(this.placingPattern, world.x, world.y);
      eventBus.emit('pattern:cancel');
      this.placingPattern = null;
      eventBus.emit('state:updated');
      return;
    }

    if (this.selectedTerrain !== 'none' && this.terrainLayer && topology === TOPOLOGY_TYPES.SQUARE) {
      this.isDrawing = true;
      this.drawMode = e.button === 0 ? 'draw' : 'erase';
      this._forkedOnThisDraw = false;
      this.applyTerrainAction(world.x, world.y);
      return;
    }

    if (e.button === 0 || e.button === 2) {
      this.isDrawing = true;
      this.drawMode = e.button === 0 ? 'draw' : 'erase';
      this._forkedOnThisDraw = false;
      this.applyDrawActionCoord(world);
    }
  }

  onMouseMove(e) {
    const pos = this.getMousePos(e);
    const world = this.viewState.screenToWorld(pos.x, pos.y);

    if (this.isPanning) {
      const dx = e.clientX - this.lastPanX;
      const dy = e.clientY - this.lastPanY;
      this.viewState.pan(dx, dy);
      this.lastPanX = e.clientX;
      this.lastPanY = e.clientY;
      eventBus.emit('view:changed');
      eventBus.emit('status:update');
      return;
    }

    if (this.isSelectingBlueprint) {
      this.selectionEndX = world.x;
      this.selectionEndY = world.y;
      eventBus.emit('blueprint:selectionUpdated', this.getSelectionRect());
      return;
    }

    if (this.blueprintPlacer && this.blueprintPlacer.isPlacing) {
      this.blueprintPlacer.setMousePosition(world.x, world.y);
      eventBus.emit('mouse:hover', world);
      return;
    }

    eventBus.emit('mouse:hover', world);

    if (this.isDrawing) {
      if (this.selectedTerrain !== 'none' && this.terrainLayer) {
        this.applyTerrainActionCoord(world);
      } else {
        this.applyDrawActionCoord(world);
      }
    }
  }

  onMouseUp(e) {
    if (this.isSelectingBlueprint) {
      this.isSelectingBlueprint = false;
      this.canvas.style.cursor = 'crosshair';
      
      const rect = this.getSelectionRect();
      const cells = this.cellStore.getCellsInRect(rect.minX, rect.minY, rect.maxX, rect.maxY);
      
      if (cells.length === 0) {
        eventBus.emit('blueprint:selectionCancelled');
        return;
      }
      
      eventBus.emit('blueprint:selectionComplete', {
        rect,
        cells,
        cellCount: cells.length
      });
      
      this._showSaveDialog(cells);
      return;
    }
    
    if (this.isPanning) {
      this.isPanning = false;
      this.canvas.style.cursor = 'crosshair';
    }
    if (this.isDrawing) {
      this.isDrawing = false;
      this.drawMode = null;
      eventBus.emit('state:updated');
      eventBus.emit('terrain:changed');
      if (window.__app?.collabManager) {
        window.__app.collabManager.flushBatchImmediate();
      }
    }
  }

  getSelectionRect() {
    const minX = Math.min(this.selectionStartX, this.selectionEndX);
    const maxX = Math.max(this.selectionStartX, this.selectionEndX);
    const minY = Math.min(this.selectionStartY, this.selectionEndY);
    const maxY = Math.max(this.selectionStartY, this.selectionEndY);
    return { minX, maxX, minY, maxY };
  }

  cancelBlueprintSelection() {
    this.isSelectingBlueprint = false;
    this.canvas.style.cursor = 'crosshair';
    eventBus.emit('blueprint:selectionCancelled');
  }

  _showSaveDialog(cells) {
    const colony = this.colonyManager.getSelected();
    
    const modal = document.createElement('div');
    modal.className = 'modal blueprint-save-modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <span>保存蓝图</span>
          <button class="close-btn">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <label>蓝图名称</label>
            <input type="text" id="bp-name-input" placeholder="输入蓝图名称" value="我的蓝图">
          </div>
          <div class="form-row">
            <label>标签（逗号分隔）</label>
            <input type="text" id="bp-tags-input" placeholder="例如: 滑翔机, 振荡器, 自定义">
          </div>
          <div class="form-row">
            <label>描述</label>
            <textarea id="bp-desc-input" placeholder="蓝图描述..." rows="3"></textarea>
          </div>
          <div class="form-row">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
              <input type="checkbox" id="bp-bind-rule" checked>
              <span>绑定当前规则（放置时自动使用该群落规则）</span>
            </label>
          </div>
          <div class="blueprint-preview-info">
            <span>细胞数: <strong>${cells.length}</strong></span>
            ${colony ? `<span>规则: <strong>${colony.rule.toBSString()}</strong></span>` : ''}
          </div>
        </div>
        <div class="modal-footer">
          <button class="cancel-btn">取消</button>
          <button class="primary-btn save-btn">保存</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    const closeModal = () => {
      modal.remove();
      eventBus.emit('blueprint:saveDialogClosed');
    };
    
    modal.querySelector('.close-btn').addEventListener('click', closeModal);
    modal.querySelector('.cancel-btn').addEventListener('click', closeModal);
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
    
    modal.querySelector('.save-btn').addEventListener('click', () => {
      const name = modal.querySelector('#bp-name-input').value.trim() || '未命名蓝图';
      const tagsStr = modal.querySelector('#bp-tags-input').value.trim();
      const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(t => t) : [];
      const description = modal.querySelector('#bp-desc-input').value.trim();
      const bindRule = modal.querySelector('#bp-bind-rule').checked;
      
      const cellCoords = cells.map(c => [c.x, c.y]);
      
      const boundRule = bindRule && colony ? colony.rule : null;
      
      if (this.blueprintManager) {
        const bp = this.blueprintManager.createBlueprint({
          cells: cellCoords,
          name,
          description,
          tags,
          boundRule
        });
        
        if (bp && window.__app && window.__app.uiManager) {
          window.__app.uiManager.showToast(`蓝图 "${name}" 已保存`);
        }
      }
      
      closeModal();
    });
    
    setTimeout(() => {
      modal.querySelector('#bp-name-input').focus();
      modal.querySelector('#bp-name-input').select();
    }, 100);
    
    eventBus.emit('blueprint:saveDialogOpened');
  }

  onMouseLeave(e) {
    eventBus.emit('mouse:hover', { x: null, y: null });
    if (this.isDrawing) {
      this.isDrawing = false;
      this.drawMode = null;
      eventBus.emit('state:updated');
      eventBus.emit('terrain:changed');
      if (window.__app?.collabManager) {
        window.__app.collabManager.flushBatchImmediate();
      }
    }
  }

  onWheel(e) {
    e.preventDefault();
    const pos = this.getMousePos(e);
    const delta = e.deltaY < 0 ? 1.25 : 0.8;
    const newZoom = this.viewState.zoom * delta;
    this.viewState.setZoom(newZoom, pos.x, pos.y);
    eventBus.emit('view:changed');
    eventBus.emit('status:update');
  }

  applyDrawActionCoord(coord) {
    const colony = this.colonyManager.getSelected();
    if (!colony) return;

    this._triggerForkIfNeeded();

    const topology = Topology.getType();

    if (this.drawMode === 'draw') {
      if (topology === TOPOLOGY_TYPES.TRIANGULAR) {
        this.cellStore.set(coord.row, coord.col, coord.dir, colony.id);
        if (window.__app?.collabManager) {
          window.__app.collabManager.recordCellOperation('set', coord.row, coord.col, coord.dir, colony.id);
        }
      } else {
        const cx = coord.x !== undefined ? coord.x : coord.q || 0;
        const cy = coord.y !== undefined ? coord.y : coord.r || 0;
        this.cellStore.set(cx, cy, colony.id);
        if (window.__app?.collabManager) {
          window.__app.collabManager.recordCellOperation('set', cx, cy, colony.id);
        }
      }
    } else if (this.drawMode === 'erase') {
      if (topology === TOPOLOGY_TYPES.TRIANGULAR) {
        this.cellStore.delete(coord.row, coord.col, coord.dir);
        if (window.__app?.collabManager) {
          window.__app.collabManager.recordCellOperation('delete', coord.row, coord.col, coord.dir);
        }
      } else {
        const cx = coord.x !== undefined ? coord.x : coord.q || 0;
        const cy = coord.y !== undefined ? coord.y : coord.r || 0;
        this.cellStore.delete(cx, cy);
        if (window.__app?.collabManager) {
          window.__app.collabManager.recordCellOperation('delete', cx, cy);
        }
      }
    }
    eventBus.emit('state:updated');
  }

  applyDrawAction(x, y) {
    this.applyDrawActionCoord({ x, y });
  }

  applyTerrainActionCoord(coord) {
    this.applyTerrainAction(coord.x, coord.y);
  }

  applyTerrainAction(x, y) {
    if (!this.terrainLayer) return;

    this._triggerForkIfNeeded();

    const gx = Math.floor(x);
    const gy = Math.floor(y);

    if (this.drawMode === 'erase') {
      this.terrainLayer.remove(gx, gy);
      eventBus.emit('state:updated');
      return;
    }

    if (this.drawMode === 'draw') {
      if (this.selectedTerrain === 'portal') {
        const result = this.terrainLayer.placePortal(gx, gy);
        if (result && result.paired) {
          eventBus.emit('terrain:portalPaired', result);
        }
        eventBus.emit('state:updated');
        eventBus.emit('terrain:changed');
      } else {
        const terrainType = this.selectedTerrain;
        if (terrainType === 'wall' || terrainType === 'speed' || terrainType === 'ice' || terrainType === 'fertile') {
          this.terrainLayer.set(gx, gy, terrainType);
          if (terrainType === 'wall') {
            this.cellStore.delete(gx, gy);
          }
          eventBus.emit('state:updated');
        }
      }
    }
  }

  _triggerForkIfNeeded() {
    if (!this.historyManager) return;
    if (this._forkedOnThisDraw) return;
    if (!this.historyManager.isBrowsingHistory) return;

    const newBranch = this.historyManager.onEditAfterHistoryJump();
    if (newBranch) {
      this._forkedOnThisDraw = true;
    }
  }
}
