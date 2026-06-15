export class ViewState {
  constructor() {
    this.zoom = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.canvasWidth = 0;
    this.canvasHeight = 0;
    this.minZoom = 1;
    this.maxZoom = 64;
  }

  screenToWorld(screenX, screenY) {
    return {
      x: Math.floor((screenX - this.offsetX) / this.zoom),
      y: Math.floor((screenY - this.offsetY) / this.zoom)
    };
  }

  worldToScreen(worldX, worldY) {
    return {
      x: worldX * this.zoom + this.offsetX,
      y: worldY * this.zoom + this.offsetY
    };
  }

  getVisibleRect() {
    const topLeft = this.screenToWorld(0, 0);
    const bottomRight = this.screenToWorld(this.canvasWidth, this.canvasHeight);
    return {
      minX: topLeft.x - 1,
      minY: topLeft.y - 1,
      maxX: bottomRight.x + 1,
      maxY: bottomRight.y + 1
    };
  }

  getCenterWorld() {
    return this.screenToWorld(this.canvasWidth / 2, this.canvasHeight / 2);
  }

  setZoom(newZoom, screenX = null, screenY = null) {
    const clampedZoom = Math.max(this.minZoom, Math.min(this.maxZoom, newZoom));
    
    if (screenX !== null && screenY !== null) {
      const worldBefore = this.screenToWorld(screenX, screenY);
      this.zoom = clampedZoom;
      const worldAfter = this.screenToWorld(screenX, screenY);
      this.offsetX += (worldAfter.x - worldBefore.x) * this.zoom;
      this.offsetY += (worldAfter.y - worldBefore.y) * this.zoom;
    } else {
      this.zoom = clampedZoom;
    }
  }

  pan(dx, dy) {
    this.offsetX += dx;
    this.offsetY += dy;
  }

  showGrid() {
    return this.zoom >= 4;
  }

  resize(width, height) {
    this.canvasWidth = width;
    this.canvasHeight = height;
  }
}
