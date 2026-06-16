import { eventBus } from '../core/EventBus.js';

export class InputHandler {
  constructor(canvas, viewState, cellStore, colonyManager, patternManager, historyManager = null) {
    this.canvas = canvas;
    this.viewState = viewState;
    this.cellStore = cellStore;
    this.colonyManager = colonyManager;
    this.patternManager = patternManager;
    this.historyManager = historyManager;

    this.isDragging = false;
    this.isPanning = false;
    this.isDrawing = false;
    this.drawMode = null;
    this.lastPanX = 0;
    this.lastPanY = 0;
    this.placingPattern = null;
    this._forkedOnThisDraw = false;

    this.bindEvents();
  }

  setHistoryManager(hm) {
    this.historyManager = hm;
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

    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      this.isPanning = true;
      this.lastPanX = e.clientX;
      this.lastPanY = e.clientY;
      this.canvas.style.cursor = 'grabbing';
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

    if (e.button === 0 || e.button === 2) {
      this.isDrawing = true;
      this.drawMode = e.button === 0 ? 'draw' : 'erase';
      this._forkedOnThisDraw = false;
      this.applyDrawAction(world.x, world.y);
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

    eventBus.emit('mouse:hover', world);

    if (this.isDrawing) {
      this.applyDrawAction(world.x, world.y);
    }
  }

  onMouseUp(e) {
    if (this.isPanning) {
      this.isPanning = false;
      this.canvas.style.cursor = 'crosshair';
    }
    if (this.isDrawing) {
      this.isDrawing = false;
      this.drawMode = null;
      eventBus.emit('state:updated');
    }
  }

  onMouseLeave(e) {
    eventBus.emit('mouse:hover', { x: null, y: null });
    if (this.isDrawing) {
      this.isDrawing = false;
      this.drawMode = null;
      eventBus.emit('state:updated');
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

  applyDrawAction(x, y) {
    const colony = this.colonyManager.getSelected();
    if (!colony) return;

    this._triggerForkIfNeeded();

    if (this.drawMode === 'draw') {
      this.cellStore.set(x, y, colony.id);
    } else if (this.drawMode === 'erase') {
      this.cellStore.delete(x, y);
    }
    eventBus.emit('state:updated');
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
