import { eventBus } from '../core/EventBus.js';
import { CellStore } from '../core/CellStore.js';

export class Renderer {
  constructor(canvas, cellStore, viewState, colonyManager, resourceField = null, terrainLayer = null) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cellStore = cellStore;
    this.viewState = viewState;
    this.colonyManager = colonyManager;
    this.resourceField = resourceField;
    this.terrainLayer = terrainLayer;
    this.dpr = window.devicePixelRatio || 1;
    this.placingPattern = null;
    this.placingCells = null;
    this.hoverCell = null;
    this.musicScheduler = null;

    this.remoteCursors = [];

    this.compareMode = false;
    this.canvasB = null;
    this.ctxB = null;
    this.compareBranches = [];
    this.compareCellStores = [null, null];
    this.compareGenerations = [0, 0];

    this.setupCanvas();
    this.bindEvents();
    this._bindCollabEvents();
    this._startAnimationLoop();
  }

  _bindCollabEvents() {
    eventBus.on('collab:cursorsUpdated', (cursors) => {
      this.remoteCursors = cursors || [];
      this.render();
    });
  }

  setMusicScheduler(scheduler) {
    this.musicScheduler = scheduler;
  }

  _startAnimationLoop() {
    const animate = () => {
      if (this.musicScheduler && this.musicScheduler.isPlaying) {
        this.render();
      }
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
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
      this._renderToCanvas(ctx, store, rect.width, rect.height, this.resourceField);
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
        let cellSize = zoom;
        let cellOffset = 0;

        if (this.musicScheduler && this.musicScheduler.isPlaying) {
          const pulseScale = this.musicScheduler.getPulseScale(cell.x, cell.y, colonyId);
          if (pulseScale > 1) {
            const sizeDiff = zoom * (pulseScale - 1);
            cellSize = zoom + sizeDiff;
            cellOffset = -sizeDiff / 2;
          }
        }

        if (zoom < 2) {
          ctx.fillRect(sx, sy, Math.max(1, cellSize), Math.max(1, cellSize));
        } else {
          ctx.fillRect(sx + 0.5 + cellOffset, sy + 0.5 + cellOffset, cellSize - 1, cellSize - 1);
        }
      }
    }
  }

  drawMusicScanColumn(ctx, viewState = this.viewState) {
    if (!this.musicScheduler || !this.musicScheduler.isPlaying) return;

    const stepInfo = this.musicScheduler.getCurrentStep();
    const step = typeof stepInfo === 'object' ? stepInfo.step : stepInfo;
    const { minX, minY, maxX, maxY } = viewState.getVisibleRect();
    const visibleWidth = maxX - minX;
    const colWidth = visibleWidth / 16;
    const zoom = viewState.zoom;
    const offsetX = viewState.offsetX;
    const offsetY = viewState.offsetY;

    const colWorldX = minX + step * colWidth;
    const colScreenX = colWorldX * zoom + offsetX;
    const colScreenWidth = colWidth * zoom;

    ctx.fillStyle = 'rgba(233, 69, 96, 0.15)';
    ctx.fillRect(colScreenX, 0, colScreenWidth, viewState.canvasHeight);

    ctx.strokeStyle = 'rgba(233, 69, 96, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(colScreenX, 0);
    ctx.lineTo(colScreenX, viewState.canvasHeight);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(colScreenX + colScreenWidth, 0);
    ctx.lineTo(colScreenX + colScreenWidth, viewState.canvasHeight);
    ctx.stroke();
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

  drawRemoteCursors(ctx, viewState = this.viewState) {
    if (!this.remoteCursors || this.remoteCursors.length === 0) return;

    const zoom = viewState.zoom;
    const offsetX = viewState.offsetX;
    const offsetY = viewState.offsetY;
    const cursorSize = Math.max(8, zoom * 0.8);

    for (const cursor of this.remoteCursors) {
      const { x, y, color, peerId } = cursor;
      if (x === null || x === undefined) continue;

      const sx = x * zoom + offsetX + zoom / 2;
      const sy = y * zoom + offsetY + zoom / 2;
      const label = (peerId || '').slice(0, 4);

      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.8;

      ctx.beginPath();
      ctx.moveTo(sx - cursorSize, sy);
      ctx.lineTo(sx - 3, sy);
      ctx.moveTo(sx + 3, sy);
      ctx.lineTo(sx + cursorSize, sy);
      ctx.moveTo(sx, sy - cursorSize);
      ctx.lineTo(sx, sy - 3);
      ctx.moveTo(sx, sy + 3);
      ctx.lineTo(sx, sy + cursorSize);
      ctx.stroke();

      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.arc(sx, sy, 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.9;
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      const labelX = sx + 5;
      const labelY = sy - 5;
      const labelPad = 2;
      const labelWidth = ctx.measureText(label).width + labelPad * 2;
      const labelHeight = 12;

      ctx.fillStyle = color;
      ctx.globalAlpha = 0.2;
      ctx.fillRect(labelX - labelPad, labelY - labelHeight, labelWidth, labelHeight);
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.fillText(label, labelX, labelY);

      ctx.restore();
    }
  }

  drawTerrain(ctx, customTerrain = null, viewState = this.viewState) {
    const terrain = customTerrain || this.terrainLayer;
    if (!terrain) return;

    const { minX, minY, maxX, maxY } = viewState.getVisibleRect();
    const zoom = viewState.zoom;
    const offsetX = viewState.offsetX;
    const offsetY = viewState.offsetY;

    const terrainList = terrain.getTerrainInRect(minX - 1, minY - 1, maxX + 1, maxY + 1);
    
    for (const t of terrainList) {
      const sx = t.x * zoom + offsetX;
      const sy = t.y * zoom + offsetY;
      
      if (t.type === 'wall') {
        ctx.fillStyle = '#3a3a3a';
        if (zoom < 2) {
          ctx.fillRect(sx, sy, Math.max(1, zoom), Math.max(1, zoom));
        } else {
          ctx.fillRect(sx + 0.5, sy + 0.5, zoom - 1, zoom - 1);
        }
      } else if (t.type === 'portal') {
        ctx.fillStyle = '#9c27b0';
        if (zoom < 2) {
          ctx.fillRect(sx, sy, Math.max(1, zoom), Math.max(1, zoom));
        } else {
          ctx.fillRect(sx + 0.5, sy + 0.5, zoom - 1, zoom - 1);
        }
        if (zoom >= 8) {
          ctx.fillStyle = '#fff';
          ctx.font = `${Math.floor(zoom * 0.6)}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(t.pairId.toString(), sx + zoom / 2, sy + zoom / 2);
        }
      } else if (t.type === 'speed') {
        ctx.fillStyle = 'rgba(255, 152, 0, 0.4)';
        if (zoom < 2) {
          ctx.fillRect(sx, sy, Math.max(1, zoom), Math.max(1, zoom));
        } else {
          ctx.fillRect(sx, sy, zoom, zoom);
        }
      } else if (t.type === 'ice') {
        ctx.fillStyle = 'rgba(100, 181, 246, 0.4)';
        if (zoom < 2) {
          ctx.fillRect(sx, sy, Math.max(1, zoom), Math.max(1, zoom));
        } else {
          ctx.fillRect(sx, sy, zoom, zoom);
        }
      } else if (t.type === 'fertile') {
        ctx.fillStyle = 'rgba(76, 175, 80, 0.4)';
        if (zoom < 2) {
          ctx.fillRect(sx, sy, Math.max(1, zoom), Math.max(1, zoom));
        } else {
          ctx.fillRect(sx, sy, zoom, zoom);
        }
      }
    }
  }

  drawResourceHeatmap(ctx, customField = null, viewState = this.viewState) {
    const field = customField || this.resourceField;
    if (!field || !field.showHeatmap) return;

    const { minX, minY, maxX, maxY } = viewState.getVisibleRect();
    const zoom = viewState.zoom;
    const offsetX = viewState.offsetX;
    const offsetY = viewState.offsetY;

    const entries = field.getNonZeroEntries();
    for (const entry of entries) {
      if (entry.x < minX - 1 || entry.x > maxX + 1 || entry.y < minY - 1 || entry.y > maxY + 1) continue;
      
      const sx = entry.x * zoom + offsetX;
      const sy = entry.y * zoom + offsetY;
      ctx.fillStyle = field.getHeatmapColor(entry.value);
      
      if (zoom < 2) {
        ctx.fillRect(sx, sy, Math.max(1, zoom), Math.max(1, zoom));
      } else {
        ctx.fillRect(sx, sy, zoom, zoom);
      }
    }
  }

  _renderToCanvas(ctx, customStore, width, height, customResourceField = null) {
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
    this.drawTerrain(ctx, this.terrainLayer, vs);
    this.drawCells(ctx, customStore, vs);
    this.drawResourceHeatmap(ctx, customResourceField, vs);
  }

  render() {
    if (this.compareMode && this.canvasB && this.ctxB) {
      this._refreshCompareStores();

      const rectA = this.canvas.getBoundingClientRect();
      this.canvas.width = rectA.width * this.dpr;
      this.canvas.height = rectA.height * this.dpr;
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this._renderToCanvas(this.ctx, this.compareCellStores[0] || this.cellStore, rectA.width, rectA.height, this.resourceField);

      const rectB = this.canvasB.getBoundingClientRect();
      this.canvasB.width = rectB.width * this.dpr;
      this.canvasB.height = rectB.height * this.dpr;
      this.ctxB.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this._renderToCanvas(this.ctxB, this.compareCellStores[1] || this.cellStore, rectB.width, rectB.height, this.resourceField);

      eventBus.emit('render:done');
      return;
    }

    this.clear();
    this.drawGrid(this.ctx);
    this.drawTerrain(this.ctx);
    this.drawCells(this.ctx);
    this.drawResourceHeatmap(this.ctx);
    this.drawHoverCell(this.ctx);
    this.drawPlacingPattern(this.ctx);
    this.drawRemoteCursors(this.ctx);
    this.drawMusicScanColumn(this.ctx);
    eventBus.emit('render:done');
  }
}
