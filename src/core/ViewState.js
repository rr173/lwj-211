import { Topology } from './Topology.js';

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
    return Topology.screenToWorld(screenX, screenY, this.zoom, this.offsetX, this.offsetY);
  }

  worldToScreen(...args) {
    return Topology.worldToScreen(...args, this.zoom, this.offsetX, this.offsetY);
  }

  getVisibleRect() {
    return Topology.getVisibleRect(this.canvasWidth, this.canvasHeight, this.zoom, this.offsetX, this.offsetY);
  }

  getCenterWorld() {
    return Topology.screenToWorld(this.canvasWidth / 2, this.canvasHeight / 2, this.zoom, this.offsetX, this.offsetY);
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

  fitToView() {
    this.zoom = 10;
    this.offsetX = this.canvasWidth / 2;
    this.offsetY = this.canvasHeight / 2;
  }
}
