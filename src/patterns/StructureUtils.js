import { encodeRLE, parseRLE } from '../engine/PatternManager.js';

export const STRUCTURE_TYPES = {
  STILL_LIFE: 'still_life',
  OSCILLATOR: 'oscillator',
  SPACESHIP: 'spaceship',
  CHAOTIC: 'chaotic'
};

export const TYPE_LABELS = {
  [STRUCTURE_TYPES.STILL_LIFE]: '静物',
  [STRUCTURE_TYPES.OSCILLATOR]: '振荡体',
  [STRUCTURE_TYPES.SPACESHIP]: '飞船',
  [STRUCTURE_TYPES.CHAOTIC]: '混沌'
};

const MOORE_OFFSETS = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0],           [1, 0],
  [-1, 1],  [0, 1],  [1, 1]
];

export function evolveStructure(cells, rule = { birth: new Set([3]), survival: new Set([2, 3]) }) {
  const cellSet = new Set(cells.map(c => `${c[0]},${c[1]}`));
  const neighborMap = new Map();
  
  for (const [x, y] of cells) {
    for (const [dx, dy] of MOORE_OFFSETS) {
      const nx = x + dx, ny = y + dy;
      const key = `${nx},${ny}`;
      neighborMap.set(key, (neighborMap.get(key) || 0) + 1);
    }
  }
  
  const newCells = [];
  
  for (const [key, count] of neighborMap.entries()) {
    const [x, y] = key.split(',').map(Number);
    const alive = cellSet.has(key);
    
    if (alive && rule.survival.has(count)) {
      newCells.push([x, y]);
    } else if (!alive && rule.birth.has(count)) {
      newCells.push([x, y]);
    }
  }
  
  return newCells;
}

export function normalizeCoordinates(cells) {
  if (cells.length === 0) return { cells: [], width: 0, height: 0, minX: 0, minY: 0 };
  
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  
  for (const [x, y] of cells) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  
  const normalized = cells.map(([x, y]) => [x - minX, y - minY]);
  normalized.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  
  return {
    cells: normalized,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    minX,
    minY
  };
}

export function hashStructure(normalizedCells) {
  return normalizedCells.map(c => c.join(',')).join('|');
}

export function rotateCells90(cells, width, height) {
  return cells.map(([x, y]) => [height - 1 - y, x]);
}

export function rotateCells180(cells, width, height) {
  return cells.map(([x, y]) => [width - 1 - x, height - 1 - y]);
}

export function rotateCells270(cells, width, height) {
  return cells.map(([x, y]) => [y, width - 1 - x]);
}

export function flipCellsHorizontal(cells, width) {
  return cells.map(([x, y]) => [width - 1 - x, y]);
}

export function transformCells(cells, rotation = 0, flipped = false) {
  const { cells: norm, width, height } = normalizeCoordinates(cells);
  let result = norm;
  let w = width, h = height;
  
  if (flipped) {
    result = flipCellsHorizontal(result, w);
  }
  
  if (rotation === 90) {
    result = rotateCells90(result, w, h);
    [w, h] = [h, w];
  } else if (rotation === 180) {
    result = rotateCells180(result, w, h);
  } else if (rotation === 270) {
    result = rotateCells270(result, w, h);
    [w, h] = [h, w];
  }
  
  return normalizeCoordinates(result).cells;
}

export function findConnectedComponents(cells, cellToColony = new Map()) {
  const cellSet = new Set(cells.map(c => `${c.x},${c.y}`));
  const visited = new Set();
  const components = [];
  
  for (const cell of cells) {
    const key = `${cell.x},${cell.y}`;
    if (visited.has(key)) continue;
    
    const component = [];
    const queue = [cell];
    visited.add(key);
    
    while (queue.length > 0) {
      const current = queue.shift();
      component.push(current);
      
      for (const [dx, dy] of MOORE_OFFSETS) {
        const nx = current.x + dx;
        const ny = current.y + dy;
        const nkey = `${nx},${ny}`;
        if (cellSet.has(nkey) && !visited.has(nkey)) {
          visited.add(nkey);
          queue.push({ x: nx, y: ny, colonyId: current.colonyId });
        }
      }
    }
    
    if (component.length > 0) {
      const colonyIds = [...new Set(component.map(c => c.colonyId))];
      components.push({
        cells: component.map(c => [c.x, c.y]),
        cellObjects: component,
        colonyIds,
        size: component.length
      });
    }
  }
  
  return components;
}

export function getCentroid(cells) {
  if (cells.length === 0) return { x: 0, y: 0 };
  const sum = cells.reduce((acc, [x, y]) => ({ x: acc.x + x, y: acc.y + y }), { x: 0, y: 0 });
  return { x: sum.x / cells.length, y: sum.y / cells.length };
}

export function coordinateSetEquals(set1, set2) {
  if (set1.length !== set2.length) return false;
  const s1 = new Set(set1.map(c => `${c[0]},${c[1]}`));
  for (const [x, y] of set2) {
    if (!s1.has(`${x},${y}`)) return false;
  }
  return true;
}

export function structureToRLE(cells, ruleString = 'B3/S23') {
  return encodeRLE(cells, ruleString);
}

export function rleToStructure(rle) {
  const result = parseRLE(rle);
  return result.cells;
}

export function drawStructureToCanvas(ctx, cells, cellSize = 4, color = '#4fc3f7', offsetX = 0, offsetY = 0) {
  const { cells: norm, width, height } = normalizeCoordinates(cells);
  
  ctx.fillStyle = '#0a0a14';
  ctx.fillRect(0, 0, width * cellSize, height * cellSize);
  
  ctx.fillStyle = color;
  for (const [x, y] of norm) {
    ctx.fillRect(
      offsetX + x * cellSize,
      offsetY + y * cellSize,
      cellSize - 1,
      cellSize - 1
    );
  }
  
  return { width: width * cellSize, height: height * cellSize };
}

export function createStructurePreviewCanvas(cells, size = 60, color = '#4fc3f7') {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  const { width, height } = normalizeCoordinates(cells);
  const maxDim = Math.max(width, height);
  const cellSize = Math.max(2, Math.floor(size / maxDim));
  
  canvas.width = width * cellSize;
  canvas.height = height * cellSize;
  
  drawStructureToCanvas(ctx, cells, cellSize, color);
  
  return canvas;
}
