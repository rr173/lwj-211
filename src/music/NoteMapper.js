import { NOTE_NAMES, rowToMidi, midiToNoteName } from './AudioEngine.js';
import { eventBus } from '../core/EventBus.js';

export const GRID_COLS = 16;
export const GRID_ROWS = 12;

export class NoteMapper {
  constructor(cellStore, viewState, colonyManager) {
    this.cellStore = cellStore;
    this.viewState = viewState;
    this.colonyManager = colonyManager;
    this.currentColumn = 0;
    this.activeCells = new Map();
  }

  setColumn(column) {
    this.currentColumn = column % GRID_COLS;
  }

  nextColumn() {
    this.currentColumn = (this.currentColumn + 1) % GRID_COLS;
    return this.currentColumn;
  }

  getColumnWorldBounds(column) {
    const { minX, minY, maxX, maxY } = this.viewState.getVisibleRect();
    const visibleWidth = maxX - minX;
    const visibleHeight = maxY - minY;
    const colWidth = visibleWidth / GRID_COLS;
    const rowHeight = visibleHeight / GRID_ROWS;

    const colX = Math.floor(minX + column * colWidth);
    const colXEnd = Math.floor(minX + (column + 1) * colWidth);

    return {
      startX: colX,
      endX: colXEnd,
      startY: Math.floor(minY),
      endY: Math.floor(maxY),
      colWidth,
      rowHeight,
      minX,
      minY,
      visibleWidth,
      visibleHeight
    };
  }

  getRowForY(worldY, bounds) {
    const relativeY = worldY - bounds.minY;
    const row = Math.floor(relativeY / bounds.rowHeight);
    return Math.max(0, Math.min(GRID_ROWS - 1, row));
  }

  scanColumn(column) {
    const bounds = this.getColumnWorldBounds(column);
    const colonies = this.colonyManager.getAll();
    const notesByColony = new Map();

    for (const colony of colonies) {
      notesByColony.set(colony.id, new Set());
    }

    const cells = this.cellStore.getCellsInRect(
      bounds.startX, bounds.startY,
      bounds.endX, bounds.endY
    );

    const rowToCellsByColony = {};

    for (const cell of cells) {
      const row = this.getRowForY(cell.y, bounds);
      const colonyId = cell.colonyId;
      
      if (!rowToCellsByColony[row]) {
        rowToCellsByColony[row] = new Map();
      }
      if (!rowToCellsByColony[row].has(colonyId)) {
        rowToCellsByColony[row].set(colonyId, []);
      }
      rowToCellsByColony[row].get(colonyId).push(cell);

      if (notesByColony.has(colonyId)) {
        notesByColony.get(colonyId).add(row);
      }
    }

    const allNotes = [];

    for (const [colonyId, rows of notesByColony) {
      const colony = this.colonyManager.getColony(colonyId);
      if (!colony || rows.size === 0) continue;

      const octaveOffset = colony.musicConfig?.octaveOffset || 0;
      const waveform = colony.musicConfig?.waveform || 'sine';

      const sortedRows = [...rows].sort((a, b) => b - a);
      const limitedRows = sortedRows.slice(0, 6);

      for (const row of limitedRows) {
        const midi = rowToMidi(row, octaveOffset);
        allNotes.push({
          midi,
          row,
          colonyId,
          colony,
          waveform,
          noteName: midiToNoteName(midi)
        });
      }
    }

    allNotes.sort((a, b) => a.midi - b.midi);

    const limitedNotes = allNotes.slice(0, 6);

    return {
      column,
      notes: limitedNotes,
      rowToCellsByColony,
      bounds
    };
  }

  getColumnScreenX(column) {
    const { minX, maxX } = this.viewState.getVisibleRect();
    const visibleWidth = maxX - minX;
    const colWidth = visibleWidth / GRID_COLS;
    const worldX = minX + column * colWidth;
    const screenX = worldX * this.viewState.zoom + this.viewState.offsetX;
    const screenWidth = colWidth * this.viewState.zoom;
    return { screenX, screenWidth };
  }

  getRowScreenY(row) {
    const { minY, maxY } = this.viewState.getVisibleRect();
    const visibleHeight = maxY - minY;
    const rowHeight = visibleHeight / GRID_ROWS;
    const worldY = minY + row * rowHeight;
    const screenY = worldY * this.viewState.zoom + this.viewState.offsetY;
    const screenHeight = rowHeight * this.viewState.zoom;
    return { screenY, screenHeight };
  }
}
