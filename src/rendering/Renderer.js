import { eventBus } from '../core/EventBus.js';

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
      this.render();
    };
    window.addEventListener('resize', resize);
    resize();
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

  clear() {
    this.ctx.fillStyle = '#0a0a14';
    this.ctx.fillRect(0, 0, this.viewState.canvasWidth, this.viewState.canvasHeight);
  }

  drawGrid() {
    if (!this.viewState.showGrid()) return;

    const { minX, minY, maxX, maxY } = this.viewState.getVisibleRect();
    const zoom = this.viewState.zoom;

    this.ctx.strokeStyle = 'rgba(40, 60, 100, 0.4)';
    this.ctx.lineWidth = 1 / this.dpr;

    this.ctx.beginPath();
    for (let x = minX; x <= maxX; x++) {
      const screenX = x * zoom + this.viewState.offsetX;
      this.ctx.moveTo(screenX, 0);
      this.ctx.lineTo(screenX, this.viewState.canvasHeight);
    }
    for (let y = minY; y <= maxY; y++) {
      const screenY = y * zoom + this.viewState.offsetY;
      this.ctx.moveTo(0, screenY);
      this.ctx.lineTo(this.viewState.canvasWidth, screenY);
    }
    this.ctx.stroke();

    if (zoom >= 16) {
      this.ctx.strokeStyle = 'rgba(80, 120, 200, 0.25)';
      this.ctx.lineWidth = 1 / this.dpr;
      this.ctx.beginPath();
      for (let x = Math.ceil(minX / 10) * 10; x <= maxX; x += 10) {
        const screenX = x * zoom + this.viewState.offsetX;
        this.ctx.moveTo(screenX, 0);
        this.ctx.lineTo(screenX, this.viewState.canvasHeight);
      }
      for (let y = Math.ceil(minY / 10) * 10; y <= maxY; y += 10) {
        const screenY = y * zoom + this.viewState.offsetY;
        this.ctx.moveTo(0, screenY);
        this.ctx.lineTo(this.viewState.canvasWidth, screenY);
      }
      this.ctx.stroke();
    }
  }

  drawCells() {
    const { minX, minY, maxX, maxY } = this.viewState.getVisibleRect();
    const zoom = this.viewState.zoom;
    const offsetX = this.viewState.offsetX;
    const offsetY = this.viewState.offsetY;

    const cells = this.cellStore.getCellsInRect(minX, minY, maxX, maxY);
    
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

      this.ctx.fillStyle = colony.color;
      this.ctx.beginPath();

      for (const cell of colonyCells) {
        const sx = cell.x * zoom + offsetX;
        const sy = cell.y * zoom + offsetY;
        if (zoom < 2) {
          this.ctx.fillRect(sx, sy, Math.max(1, zoom), Math.max(1, zoom));
        } else {
          this.ctx.fillRect(sx + 0.5, sy + 0.5, zoom - 1, zoom - 1);
        }
      }
    }
  }

  drawHoverCell() {
    if (!this.hoverCell || this.placingCells) return;
    
    const colony = this.colonyManager.getSelected();
    if (!colony) return;

    const { x, y } = this.hoverCell;
    const zoom = this.viewState.zoom;
    const sx = x * zoom + this.viewState.offsetX;
    const sy = y * zoom + this.viewState.offsetY;

    this.ctx.fillStyle = colony.color + '60';
    if (zoom < 2) {
      this.ctx.fillRect(sx, sy, Math.max(1, zoom), Math.max(1, zoom));
    } else {
      this.ctx.fillRect(sx + 0.5, sy + 0.5, zoom - 1, zoom - 1);
    }

    this.ctx.strokeStyle = colony.color;
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(sx + 1, sy + 1, zoom - 2, zoom - 2);
  }

  drawPlacingPattern() {
    if (!this.placingCells || !this.hoverCell) return;
    
    const colony = this.colonyManager.getSelected();
    if (!colony) return;

    const zoom = this.viewState.zoom;
    const offsetX = this.viewState.offsetX;
    const offsetY = this.viewState.offsetY;
    const baseX = this.hoverCell.x;
    const baseY = this.hoverCell.y;

    this.ctx.fillStyle = colony.color + '80';
    for (const [dx, dy] of this.placingCells) {
      const x = baseX + dx;
      const y = baseY + dy;
      const sx = x * zoom + offsetX;
      const sy = y * zoom + offsetY;
      if (zoom < 2) {
        this.ctx.fillRect(sx, sy, Math.max(1, zoom), Math.max(1, zoom));
      } else {
        this.ctx.fillRect(sx + 0.5, sy + 0.5, zoom - 1, zoom - 1);
      }
    }
  }

  render() {
    this.clear();
    this.drawGrid();
    this.drawCells();
    this.drawHoverCell();
    this.drawPlacingPattern();
    eventBus.emit('render:done');
  }
}
