import { eventBus } from '../core/EventBus.js';

export const PRESET_PATTERNS = {
  glider: {
    name: '滑翔机',
    cells: [
      [0, 0, 1],
      [1, 1, 1],
      [2, 2, 0],
      [0, 2],
      [1, 2],
      [2, 2]
    ].map(([x, y]) => [x, y])
  },
  gliderGun: {
    name: 'Gosper滑翔机枪',
    cells: (() => {
      const pattern = `
........O...........
........O.O.........
......OO.OO........
.....OO...O..OO..OO
..OO..O.....O.OO.OO
..OO..O.O...O.....O
..OO..O.....O.OO.OO
.....OO...O..OO..OO
......OO.OO........
........O.O.........
........O...........
`;
      return parseAsciiPattern(pattern);
    })()
  },
  pulsar: {
    name: '脉冲星',
    cells: (() => {
      const pattern = `
..OOO...OOO..
O...O.O.O...O
O...O.O.O...O
O...O.O.O...O
..OOO...OOO..
..............
..OOO...OOO..
O...O.O.O...O
O...O.O.O...O
O...O.O.O...O
..OOO...OOO..
`;
      return parseAsciiPattern(pattern);
    })()
  },
  spaceship: {
    name: '轻型太空船',
    cells: (() => {
      const pattern = `
O..O.
.....
O....
O...O
OOOO.
`;
      return parseAsciiPattern(pattern);
    })()
  }
};

function parseAsciiPattern(pattern) {
  const cells = [];
  const lines = pattern.split('\n').filter(line => line.length > 0);
  for (let y = 0; y < lines.length; y++) {
    for (let x = 0; x < lines[y].length; x++) {
      if (lines[y][x] === 'O' || lines[y][x] === '*') {
        cells.push([x, y]);
      }
    }
  }
  return cells;
}

export class PatternManager {
  constructor(cellStore, colonyManager) {
    this.cellStore = cellStore;
    this.colonyManager = colonyManager;
    this.currentPattern = null;
  }

  getPattern(name) {
    return PRESET_PATTERNS[name] || null;
  }

  selectPattern(name) {
    const pattern = this.getPattern(name);
    if (pattern) {
      this.currentPattern = name;
      eventBus.emit('pattern:placing', {
        name,
        pattern: pattern.name,
        cells: pattern.cells
      });
    }
  }

  placePattern(name, startX, startY) {
    const pattern = this.getPattern(name);
    const colony = this.colonyManager.getSelected();
    if (!pattern || !colony) return;

    for (const [dx, dy] of pattern.cells) {
      this.cellStore.set(startX + dx, startY + dy, colony.id);
    }
    this.currentPattern = null;
    eventBus.emit('state:updated');
  }

  cancelPlacement() {
    this.currentPattern = null;
    eventBus.emit('pattern:cancel');
  }

  placeCells(cells, startX, startY) {
    const colony = this.colonyManager.getSelected();
    if (!colony) return;

    for (const [dx, dy] of cells) {
      this.cellStore.set(startX + dx, startY + dy, colony.id);
    }
    eventBus.emit('state:updated');
  }
}

export function parseRLE(rleString) {
  const lines = rleString.split('\n');
  let headerLine = '';
  let patternLines = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('x') || trimmed.startsWith('X')) {
      headerLine = trimmed;
    } else {
      patternLines.push(trimmed);
    }
  }

  const widthMatch = headerLine.match(/x\s*=\s*(\d+)/i);
  const heightMatch = headerLine.match(/y\s*=\s*(\d+)/i);
  const ruleMatch = headerLine.match(/rule\s*=\s*([^\s,]+)/i);

  const pattern = patternLines.join('');
  const cells = [];
  let x = 0, y = 0;
  let runCount = '';

  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    
    if (ch >= '0' && ch <= '9') {
      runCount += ch;
    } else if (ch === 'b' || ch === '.') {
      const count = runCount === '' ? 1 : parseInt(runCount, 10);
      x += count;
      runCount = '';
    } else if (ch === 'o' || ch === '*') {
      const count = runCount === '' ? 1 : parseInt(runCount, 10);
      for (let j = 0; j < count; j++) {
        cells.push([x + j, y]);
      }
      x += count;
      runCount = '';
    } else if (ch === '$') {
      const count = runCount === '' ? 1 : parseInt(runCount, 10);
      y += count;
      x = 0;
      runCount = '';
    } else if (ch === '!') {
      break;
    }
  }

  return {
    width: widthMatch ? parseInt(widthMatch[1], 10) : 0,
    height: heightMatch ? parseInt(heightMatch[1], 10) : 0,
    rule: ruleMatch ? ruleMatch[1] : null,
    cells
  };
}

export function encodeRLE(cells, ruleString = 'B3/S23') {
  if (cells.length === 0) return '';

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  const cellSet = new Set();

  for (const [x, y] of cells) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    cellSet.add(`${x},${y}`);
  }

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;

  let result = `x = ${width}, y = ${height}, rule = ${ruleString}\n`;
  let line = '';
  let runChar = '';
  let runLength = 0;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const alive = cellSet.has(`${x},${y}`);
      const currentChar = alive ? 'o' : 'b';
      
      if (currentChar === runChar) {
        runLength++;
      } else {
        if (runLength > 0) {
          if (runLength > 1) line += runLength;
          line += runChar;
        }
        runChar = currentChar;
        runLength = 1;
      }
    }

    if (runChar === 'b') {
      while (line.endsWith('b')) {
        line = line.slice(0, -1);
        line = line.replace(/\d+$/, (match) => {
          const n = parseInt(match, 10) - 1;
          return n > 1 ? n : '';
        });
      }
    }

    if (runLength > 0 && runChar !== 'b') {
      if (runLength > 1) line += runLength;
      line += runChar;
    }

    line += '$';
    runChar = '';
    runLength = 0;

    if (line.length > 70) {
      result += line + '\n';
      line = '';
    }
  }

  result += line.slice(0, -1) + '!';
  return result;
}
