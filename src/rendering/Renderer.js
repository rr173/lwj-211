import { eventBus } from '../core/EventBus.js';
import { CellStore } from '../core/CellStore.js';

export class Renderer {
  constructor(canvas, cellStore, viewState, colonyManager) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cellStore = cellStore;
    this.viewState = viewState;
    this.colonyManager = colonyManager;
    this.dpr = window.devicePixelRatio || 1;
    this.placingPattern = null;
    this.placingCells = null;
    this.hoverCell = null;

    this.compareMode = false;
    this.canvasB = null;
    this.ctxB = null;
    this.compareBranches = [];
    this.compareCellStores = [null, null];
    this.compareGenerations = [0, 0];

    this.setupCanvas();
    this.bindEvents();
  }

  setupCanvas() {
    const resize = () => {
      const rect = this.canvas.getBoundingClientRect();
      this.viewState.resize(rect.width, rect.height);
      this.canvas.width = rect.width * this.dpr;
      this.canvas.height = rect.height * this.dpr;
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      if (this.canvasB) {
        const rectB = this.canvasB.getBoundingClientRect();
        this.canvasB.width = rectB.width * this.dpr;
        this.canvasB.height = rectB.height * this.dpr;
        this.ctxB.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      }

      this.render();
    };
    window.addEventListener('resize', resize);
    setTimeout(resize, 0);
  }

  enterCompareMode(branchIds) {
    this.compareMode = true;
    this.compareBranches = branchIds;

    this.canvasB = document.getElementById('grid-canvas-b');
    if (this.canvasB) {
      this.ctxB = this.canvasB.getContext('2d');
    }

    this._refreshCompareStores();
    this.render();
  }

  exitCompareMode() {
    this.compareMode = false;
    this.compareBranches = [];
    this.compareCellStores = [null, null];
    this.canvasB = null;
    this.ctxB = null;
  }

  _refreshCompareStores() {
    if (!window.__app || !window.__app.historyManager) return;
    const hm = window.__app.historyManager;

    for (let i = 0; i < 2; i++) {
      const branchId = this.compareBranches[i];
      const branch = hm.getBranch(branchId);
      if (!branch) continue;

      const store = new CellStore();
      const latestSnap = branch.snapshots.length > 0
        ? branch.snapshots[branch.snapshots.length - 1]
        : null;

      if (latestSnap) {
        for (const cell of latestSnap.cells) {
          store.set(cell.x, cell.y, cell.c);
        }
      }
      this.compareCellStores[i] = store;
      this.compareGenerations[i] = latestSnap ? latestSnap.generation : branch.startGeneration;
    }
  }

  renderCompareFrame(index, branch) {
    if (!window.__app || !window.__app.historyManager) return;
    const hm = window.__app.historyManager;

    const store = new CellStore();
    const latestSnap = branch.snapshots.length > 0
      ? branch.snapshots[branch.snapshots.length - 1]
      : null;

    if (latestSnap) {
      for (const cell of latestSnap.cells) {
        store.set(cell.x, cell.y, cell.c);
      }
    }
    this.compareCellStores[index] = store;
    this.compareGenerations[index] = latestSnap ? latestSnap.generation : branch.startGeneration;

    const ctx = index === 0 ? this.ctx : this.ctxB;
    const canvas = index === 0 ? this.canvas : this.canvasB;
    if (canvas && ctx) {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * this.dpr;
      canvas.height = rect.height * this.dpr;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this._renderToCanvas(ctx, store, rect.width, rect.height);
    }
  }

  bindEvents() {
    eventBus.on('state:updated', () => this.render());
    eventBus.on('view:changed', () => this.render());
    eventBus.on('pattern:placing', (data) => {
      this.placingPattern = data.pattern;
      this.placingCells = data.cells;
      this.render();
    });
    eventBus.on('pattern:cancel', () => {
      this.placingPattern = null;
      this.placingCells = null;
      this.render();
    });
  }

  setHoverCell(x, y) {
    this.hoverCell = (x !== null && y !== null) ? { x, y } : null;
    this.render();
  }

  clear(ctx = this.ctx, canvasWidth = this.viewState.canvasWidth, canvasHeight = this.viewState.canvasHeight) {
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }

  drawGrid(ctx, customStore = null, viewState = this.viewState) {
    const store = customStore || this.cellStore;
    if (!viewState.showGrid()) return;

    const { minX, minY, maxX, maxY } = viewState.getVisibleRect();
    const zoom = viewState.zoom;

    ctx.strokeStyle = 'rgba(40, 60, 100, 0.4)';
    ctx.lineWidth = 1 / this.dpr;

    ctx.beginPath();
    for (let x = minX; x <= maxX; x++) {
      const screenX = x * zoom + viewState.offsetX;
      ctx.moveTo(screenX, 0);
      ctx.lineTo(screenX, viewState.canvasHeight);
    }
    for (let y = minY; y <= maxY; y++) {
      const screenY = y * zoom + viewState.offsetY;
      ctx.moveTo(0, screenY);
      ctx.lineTo(viewState.canvasWidth, screenY);
    }
    ctx.stroke();

    if (zoom >= 16) {
      ctx.strokeStyle = 'rgba(80, 120, 200, 0.25)';
      ctx.lineWidth = 1 / this.dpr;
      ctx.beginPath();
      for (let x = Math.ceil(minX / 10) * 10; x <= maxX; x += 10) {
        const screenX = x * zoom + viewState.offsetX;
        ctx.moveTo(screenX, 0);
        ctx.lineTo(screenX, viewState.canvasHeight);
      }
      for (let y = Math.ceil(minY / 10) * 10; y <= maxY; y += 10) {
        const screenY = y * zoom + viewState.offsetY;
        ctx.moveTo(0, screenY);
        ctx.lineTo(viewState.canvasWidth, screenY);
      }
      ctx.stroke();
    }
  }

  drawCells(ctx, customStore = null, viewState = this.viewState) {
    const store = customStore || this.cellStore;
    const { minX, minY, maxX, maxY } = viewState.getVisibleRect();
    const zoom = viewState.zoom;
    const offsetX = viewState.offsetX;
    const offsetY = viewState.offsetY;

    const cells = store.getCellsInRect(minX, minY, maxX, maxY);
    
    const cellsByColony = new Map();
    for (const cell of cells) {
      if (!cellsByColony.has(cell.colonyId)) {
        cellsByColony.set(cell.colonyId, []);
      }
      cellsByColony.get(cell.colonyId).push(cell);
    }

    for (const [colonyId, colonyCells] of cellsByColony) {
      const colony = this.colonyManager.getColony(colonyId);
      if (!colony) continue;

      ctx.fillStyle = colony.color;
      ctx.beginPath();

      for (const cell of colonyCells) {
        const sx = cell.x * zoom + offsetX;
        const sy = cell.y * zoom + offsetY;
        if (zoom < 2) {
          ctx.fillRect(sx, sy, Math.max(1, zoom), Math.max(1, zoom));
        } else {
          ctx.fillRect(sx + 0.5, sy + 0.5, zoom - 1, zoom - 1);
        }
      }
    }
  }

  drawHoverCell(ctx, viewState = this.viewState) {
    if (!this.hoverCell || this.placingCells) return;
    
    const colony = this.colonyManager.getSelected();
    if (!colony) return;

    const { x, y } = this.hoverCell;
    const zoom = viewState.zoom;
    const sx = x * zoom + viewState.offsetX;
    const sy = y * zoom + viewState.offsetY;

    ctx.fillStyle = colony.color + '60';
    if (zoom < 2) {
      ctx.fillRect(sx, sy, Math.max(1, zoom), Math.max(1, zoom));
    } else {
      ctx.fillRect(sx + 0.5, sy + 0.5, zoom - 1, zoom - 1);
    }

    ctx.strokeStyle = colony.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(sx + 1, sy + 1, zoom - 2, zoom - 2);
  }

  drawPlacingPattern(ctx, viewState = this.viewState) {
    if (!this.placingCells || !this.hoverCell) return;
    
    const colony = this.colonyManager.getSelected();
    if (!colony) return;

    const zoom = viewState.zoom;
    const offsetX = viewState.offsetX;
    const offsetY = viewState.offsetY;
    const baseX = this.hoverCell.x;
    const baseY = this.hoverCell.y;

    ctx.fillStyle = colony.color + '80';
    for (const [dx, dy] of this.placingCells) {
      const x = baseX + dx;
      const y = baseY + dy;
      const sx = x * zoom + offsetX;
      const sy = y * zoom + offsetY;
      if (zoom < 2) {
        ctx.fillRect(sx, sy, Math.max(1, zoom), Math.max(1, zoom));
      } else {
        ctx.fillRect(sx + 0.5, sy + 0.5, zoom - 1, zoom - 1);
      }
    }
  }

  _renderToCanvas(ctx, customStore, width, height) {
    const zoom = this.viewState.zoom;
    const offsetX = this.viewState.offsetX;
    const offsetY = this.viewState.offsetY;

    const topLeftX = Math.floor((0 - offsetX) / zoom) - 1;
    const topLeftY = Math.floor((0 - offsetY) / zoom) - 1;
    const bottomRightX = Math.floor((width - offsetX) / zoom) + 1;
    const bottomRightY = Math.floor((height - offsetY) / zoom) + 1;
    const visibleRect = {
      minX: topLeftX,
      minY: topLeftY,
      maxX: bottomRightX,
      maxY: bottomRightY
    };

    const vs = {
      zoom,
      offsetX,
      offsetY,
      canvasWidth: width,
      canvasHeight: height,
      getVisibleRect: () => visibleRect,
      showGrid: () => zoom >= 4
    };

    this.clear(ctx, width, height);
    this.drawGrid(ctx, customStore, vs);
    this.drawCells(ctx, customStore, vs);
  }

  render() {
    if (this.compareMode && this.canvasB && this.ctxB) {
      this._refreshCompareStores();

      const rectA = this.canvas.getBoundingClientRect();
      this.canvas.width = rectA.width * this.dpr;
      this.canvas.height = rectA.height * this.dpr;
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this._renderToCanvas(this.ctx, this.compareCellStores[0] || this.cellStore, rectA.width, rectA.height);

      const rectB = this.canvasB.getBoundingClientRect();
      this.canvasB.width = rectB.width * this.dpr;
      this.canvasB.height = rectB.height * this.dpr;
      this.ctxB.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this._renderToCanvas(this.ctxB, this.compareCellStores[1] || this.cellStore, rectB.width, rectB.height);

      eventBus.emit('render:done');
      return;
    }

    this.clear();
    this.drawGrid(this.ctx);
    this.drawCells(this.ctx);
    this.drawHoverCell(this.ctx);
    this.drawPlacingPattern(this.ctx);
    eventBus.emit('render:done');
  }
}
