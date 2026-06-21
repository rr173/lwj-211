export const TOPOLOGY_TYPES = {
  SQUARE: 'square',
  HEXAGONAL: 'hexagonal',
  TRIANGULAR: 'triangular'
};

export const TOPOLOGY_INFO = {
  [TOPOLOGY_TYPES.SQUARE]: {
    name: '正方形网格',
    maxNeighbors: 8,
    icon: '◻',
    label: '正方'
  },
  [TOPOLOGY_TYPES.HEXAGONAL]: {
    name: '六边形网格',
    maxNeighbors: 6,
    icon: '⬡',
    label: '六边'
  },
  [TOPOLOGY_TYPES.TRIANGULAR]: {
    name: '三角形网格',
    maxNeighbors: 3,
    icon: '△',
    label: '三角'
  }
};

export class Topology {
  static type = TOPOLOGY_TYPES.SQUARE;

  static setType(type) {
    if (!TOPOLOGY_INFO[type]) {
      throw new Error(`未知拓扑类型: ${type}`);
    }
    Topology.type = type;
  }

  static getType() {
    return Topology.type;
  }

  static getMaxNeighbors(type = Topology.type, neighborhood = 'moore') {
    if (type === TOPOLOGY_TYPES.SQUARE) {
      return neighborhood === 'vonneumann' ? 4 : 8;
    }
    return TOPOLOGY_INFO[type].maxNeighbors;
  }

  static key(...args) {
    switch (Topology.type) {
      case TOPOLOGY_TYPES.SQUARE:
        return `${args[0]},${args[1]}`;
      case TOPOLOGY_TYPES.HEXAGONAL:
        return `${args[0]},${args[1]}`;
      case TOPOLOGY_TYPES.TRIANGULAR:
        return `${args[0]},${args[1]},${args[2]}`;
      default:
        return `${args[0]},${args[1]}`;
    }
  }

  static parseKey(key) {
    const parts = key.split(',');
    switch (Topology.type) {
      case TOPOLOGY_TYPES.SQUARE:
      case TOPOLOGY_TYPES.HEXAGONAL:
        return {
          x: parseInt(parts[0], 10),
          y: parseInt(parts[1], 10),
          row: parseInt(parts[1], 10),
          col: parseInt(parts[0], 10)
        };
      case TOPOLOGY_TYPES.TRIANGULAR:
        return {
          row: parseInt(parts[0], 10),
          col: parseInt(parts[1], 10),
          dir: parseInt(parts[2], 10)
        };
      default:
        return { x: parseInt(parts[0], 10), y: parseInt(parts[1], 10) };
    }
  }

  static getNeighbors(...args) {
    switch (Topology.type) {
      case TOPOLOGY_TYPES.SQUARE:
        return Topology._getSquareNeighbors(args[0], args[1], args[2]);
      case TOPOLOGY_TYPES.HEXAGONAL:
        return Topology._getHexNeighbors(args[0], args[1]);
      case TOPOLOGY_TYPES.TRIANGULAR:
        return Topology._getTriNeighbors(args[0], args[1], args[2]);
      default:
        return Topology._getSquareNeighbors(args[0], args[1], 'moore');
    }
  }

  static _getSquareNeighbors(x, y, neighborhood = 'moore') {
    if (neighborhood === 'vonneumann') {
      return [
        [x, y - 1],
        [x + 1, y],
        [x, y + 1],
        [x - 1, y]
      ];
    }
    return [
      [x - 1, y - 1], [x, y - 1], [x + 1, y - 1],
      [x - 1, y],                 [x + 1, y],
      [x - 1, y + 1], [x, y + 1], [x + 1, y + 1]
    ];
  }

  static _getHexNeighbors(q, r) {
    const evenRowOffsets = [
      [+1, 0], [+1, -1], [0, -1],
      [-1, 0], [0, +1], [+1, +1]
    ];
    const oddRowOffsets = [
      [+1, 0], [0, -1], [-1, -1],
      [-1, 0], [-1, +1], [0, +1]
    ];
    const offsets = (r & 1) === 0 ? evenRowOffsets : oddRowOffsets;
    return offsets.map(([dq, dr]) => [q + dq, r + dr]);
  }

  static _getTriNeighbors(row, col, dir) {
    if (dir === 0) {
      return [
        [row, col - 1, 1],
        [row, col + 1, 1],
        [row - 1, col, 1]
      ];
    } else {
      return [
        [row, col - 1, 0],
        [row, col + 1, 0],
        [row + 1, col, 0]
      ];
    }
  }

  static worldToScreen(...args) {
    const [zoom, offsetX, offsetY] = args.slice(-3);
    const coords = args.slice(0, -3);

    switch (Topology.type) {
      case TOPOLOGY_TYPES.SQUARE: {
        const [x, y] = coords;
        return {
          x: x * zoom + offsetX,
          y: y * zoom + offsetY
        };
      }
      case TOPOLOGY_TYPES.HEXAGONAL: {
        const [q, r] = coords;
        const hexW = zoom * 3 / 4;
        const hexH = zoom * Math.sqrt(3) / 2;
        const sx = q * hexW * 2 + (r & 1 ? hexW : 0) + offsetX;
        const sy = r * hexH + offsetY;
        return { x: sx, y: sy };
      }
      case TOPOLOGY_TYPES.TRIANGULAR: {
        const [row, col] = coords;
        const triW = zoom;
        const triH = zoom * Math.sqrt(3) / 2;
        const sx = col * triW / 2 + offsetX;
        const sy = row * triH + offsetY;
        return { x: sx, y: sy };
      }
      default:
        return { x: 0, y: 0 };
    }
  }

  static screenToWorld(screenX, screenY, zoom, offsetX, offsetY) {
    switch (Topology.type) {
      case TOPOLOGY_TYPES.SQUARE:
        return Topology._screenToSquare(screenX, screenY, zoom, offsetX, offsetY);
      case TOPOLOGY_TYPES.HEXAGONAL:
        return Topology._screenToHex(screenX, screenY, zoom, offsetX, offsetY);
      case TOPOLOGY_TYPES.TRIANGULAR:
        return Topology._screenToTri(screenX, screenY, zoom, offsetX, offsetY);
      default:
        return Topology._screenToSquare(screenX, screenY, zoom, offsetX, offsetY);
    }
  }

  static _screenToSquare(screenX, screenY, zoom, offsetX, offsetY) {
    const x = Math.floor((screenX - offsetX) / zoom);
    const y = Math.floor((screenY - offsetY) / zoom);
    return { x, y, row: y, col: x };
  }

  static _screenToHex(screenX, screenY, zoom, offsetX, offsetY) {
    const hexW = zoom * 3 / 4;
    const hexH = zoom * Math.sqrt(3) / 2;
    const adjustedX = screenX - offsetX;
    const adjustedY = screenY - offsetY;

    const approxR = Math.floor(adjustedY / hexH);
    let approxQ = Math.floor((adjustedX - (approxR & 1 ? hexW : 0)) / (hexW * 2));

    const candidates = [
      [approxQ, approxR],
      [approxQ + 1, approxR],
      [approxQ, approxR + 1],
      [approxQ + 1, approxR + 1],
      [approxQ - 1, approxR],
      [approxQ, approxR - 1],
      [approxQ + 1, approxR - 1],
      [approxQ - 1, approxR + 1]
    ];

    let bestQ = approxQ;
    let bestR = approxR;
    let bestDist = Infinity;

    for (const [cq, cr] of candidates) {
      const center = Topology._hexCenter(cq, cr, zoom);
      const dx = adjustedX - center.x;
      const dy = adjustedY - center.y;
      const dist = dx * dx + dy * dy;

      if (dist < bestDist) {
        if (Topology._pointInHex(adjustedX, adjustedY, cq, cr, zoom)) {
          bestDist = dist;
          bestQ = cq;
          bestR = cr;
        }
      }
    }

    return { q: bestQ, r: bestR, x: bestQ, y: bestR, row: bestR, col: bestQ };
  }

  static _hexCenter(q, r, size) {
    const hexW = size * 3 / 4;
    const hexH = size * Math.sqrt(3) / 2;
    return {
      x: q * hexW * 2 + (r & 1 ? hexW : 0),
      y: r * hexH
    };
  }

  static _pointInHex(px, py, q, r, size) {
    const center = Topology._hexCenter(q, r, size);
    const dx = px - center.x;
    const dy = py - center.y;
    const s = size / 2;
    return (
      Math.abs(dx) <= s * 1.5 &&
      Math.abs(dy) <= s * Math.sqrt(3) &&
      Math.abs(dx) * Math.sqrt(3) + Math.abs(dy) <= s * 3
    );
  }

  static _screenToTri(screenX, screenY, zoom, offsetX, offsetY) {
    const triW = zoom;
    const triH = zoom * Math.sqrt(3) / 2;
    const adjustedX = screenX - offsetX;
    const adjustedY = screenY - offsetY;

    const approxRow = Math.floor(adjustedY / triH);
    const approxCol = Math.floor(adjustedX / (triW / 2));

    const candidates = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        for (let dir = 0; dir < 2; dir++) {
          candidates.push([approxRow + dr, approxCol + dc, dir]);
        }
      }
    }

    let bestRow = approxRow;
    let bestCol = approxCol;
    let bestDir = (approxRow + approxCol) % 2 === 0 ? 0 : 1;
    let bestDist = Infinity;

    for (const [row, col, dir] of candidates) {
      const vertices = Topology._triVertices(row, col, dir, zoom);
      if (!vertices) continue;

      const centerX = (vertices[0].x + vertices[1].x + vertices[2].x) / 3;
      const centerY = (vertices[0].y + vertices[1].y + vertices[2].y) / 3;
      const dx = adjustedX - centerX;
      const dy = adjustedY - centerY;
      const dist = dx * dx + dy * dy;

      if (dist < bestDist) {
        if (Topology._pointInTri(adjustedX, adjustedY, vertices)) {
          bestDist = dist;
          bestRow = row;
          bestCol = col;
          bestDir = dir;
        }
      }
    }

    return { row: bestRow, col: bestCol, dir: bestDir, x: bestCol, y: bestRow };
  }

  static _triVertices(row, col, dir, size) {
    const triW = size;
    const triH = size * Math.sqrt(3) / 2;
    const baseX = col * triW / 2;
    const baseY = row * triH;

    const expectedDir = (row + col) % 2;
    if (dir !== expectedDir) {
      return null;
    }

    if (dir === 0) {
      return [
        { x: baseX, y: baseY + triH },
        { x: baseX + triW / 2, y: baseY },
        { x: baseX + triW, y: baseY + triH }
      ];
    } else {
      return [
        { x: baseX + triW / 2, y: baseY },
        { x: baseX + triW, y: baseY + triH },
        { x: baseX + triW * 1.5, y: baseY }
      ];
    }
  }

  static _pointInTri(px, py, vertices) {
    const [v0, v1, v2] = vertices;
    const d1 = Topology._triSign(px, py, v0, v1);
    const d2 = Topology._triSign(px, py, v1, v2);
    const d3 = Topology._triSign(px, py, v2, v0);
    const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
    const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
    return !(hasNeg && hasPos);
  }

  static _triSign(px, py, v1, v2) {
    return (px - v2.x) * (v1.y - v2.y) - (v1.x - v2.x) * (py - v2.y);
  }

  static getVisibleRect(screenWidth, screenHeight, zoom, offsetX, offsetY) {
    switch (Topology.type) {
      case TOPOLOGY_TYPES.SQUARE: {
        const topLeft = Topology.screenToWorld(0, 0, zoom, offsetX, offsetY);
        const bottomRight = Topology.screenToWorld(screenWidth, screenHeight, zoom, offsetX, offsetY);
        return {
          minX: topLeft.x - 1,
          minY: topLeft.y - 1,
          maxX: bottomRight.x + 1,
          maxY: bottomRight.y + 1
        };
      }
      case TOPOLOGY_TYPES.HEXAGONAL: {
        const hexW = zoom * 3 / 4;
        const hexH = zoom * Math.sqrt(3) / 2;
        const minQ = Math.floor((0 - offsetX) / (hexW * 2)) - 2;
        const maxQ = Math.floor((screenWidth - offsetX) / (hexW * 2)) + 2;
        const minR = Math.floor((0 - offsetY) / hexH) - 2;
        const maxR = Math.floor((screenHeight - offsetY) / hexH) + 2;
        return {
          minX: minQ,
          minY: minR,
          maxX: maxQ,
          maxY: maxR
        };
      }
      case TOPOLOGY_TYPES.TRIANGULAR: {
        const triW = zoom;
        const triH = zoom * Math.sqrt(3) / 2;
        const minCol = Math.floor((0 - offsetX) / (triW / 2)) - 4;
        const maxCol = Math.floor((screenWidth - offsetX) / (triW / 2)) + 4;
        const minRow = Math.floor((0 - offsetY) / triH) - 2;
        const maxRow = Math.floor((screenHeight - offsetY) / triH) + 2;
        return {
          minX: minCol,
          minY: minRow,
          maxX: maxCol,
          maxY: maxRow
        };
      }
      default:
        return { minX: -1, minY: -1, maxX: 1, maxY: 1 };
    }
  }

  static getCellBounds(...args) {
    const [zoom] = args.slice(-1);
    const coords = args.slice(0, -1);

    switch (Topology.type) {
      case TOPOLOGY_TYPES.SQUARE: {
        const [x, y] = coords;
        return {
          vertices: [
            { x: x * zoom, y: y * zoom },
            { x: (x + 1) * zoom, y: y * zoom },
            { x: (x + 1) * zoom, y: (y + 1) * zoom },
            { x: x * zoom, y: (y + 1) * zoom }
          ],
          centerX: (x + 0.5) * zoom,
          centerY: (y + 0.5) * zoom
        };
      }
      case TOPOLOGY_TYPES.HEXAGONAL: {
        const [q, r] = coords;
        const center = Topology._hexCenter(q, r, zoom);
        const s = zoom / 2;
        const vertices = [];
        for (let i = 0; i < 6; i++) {
          const angle = Math.PI / 3 * i + Math.PI / 6;
          vertices.push({
            x: center.x + s * Math.cos(angle),
            y: center.y + s * Math.sin(angle)
          });
        }
        return { vertices, centerX: center.x, centerY: center.y };
      }
      case TOPOLOGY_TYPES.TRIANGULAR: {
        const [row, col, dir] = coords;
        const vertices = Topology._triVertices(row, col, dir, zoom) || [
          { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }
        ];
        const cx = (vertices[0].x + vertices[1].x + vertices[2].x) / 3;
        const cy = (vertices[0].y + vertices[1].y + vertices[2].y) / 3;
        return { vertices, centerX: cx, centerY: cy };
      }
      default:
        return { vertices: [], centerX: 0, centerY: 0 };
    }
  }
}
