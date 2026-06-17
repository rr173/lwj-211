export const TERRAIN_TYPES = {
  EMPTY: 'empty',
  WALL: 'wall',
  PORTAL: 'portal',
  SPEED: 'speed',
  ICE: 'ice',
  FERTILE: 'fertile'
};

export const TERRAIN_COLORS = {
  wall: '#3a3a3a',
  portal: '#9c27b0',
  speed: 'rgba(255, 152, 0, 0.4)',
  ice: 'rgba(100, 181, 246, 0.4)',
  fertile: 'rgba(76, 175, 80, 0.4)'
};

export const MAX_PORTAL_PAIRS = 10;

export class TerrainLayer {
  constructor() {
    this.terrainMap = new Map();
    this.portalPairs = new Map();
    this.nextPortalId = 1;
    this.pendingPortalA = null;
  }

  static key(x, y) {
    return `${x},${y}`;
  }

  get(x, y) {
    const key = TerrainLayer.key(x, y);
    return this.terrainMap.get(key) || null;
  }

  getType(x, y) {
    const terrain = this.get(x, y);
    return terrain ? terrain.type : TERRAIN_TYPES.EMPTY;
  }

  isWall(x, y) {
    return this.getType(x, y) === TERRAIN_TYPES.WALL;
  }

  isPortal(x, y) {
    return this.getType(x, y) === TERRAIN_TYPES.PORTAL;
  }

  isSpeedZone(x, y) {
    return this.getType(x, y) === TERRAIN_TYPES.SPEED;
  }

  isIceZone(x, y) {
    return this.getType(x, y) === TERRAIN_TYPES.ICE;
  }

  isFertileZone(x, y) {
    return this.getType(x, y) === TERRAIN_TYPES.FERTILE;
  }

  getPortalPair(x, y) {
    const terrain = this.get(x, y);
    if (!terrain || terrain.type !== TERRAIN_TYPES.PORTAL) return null;
    const pairId = terrain.pairId;
    return this.portalPairs.get(pairId) || null;
  }

  getPortalPartner(x, y) {
    const pair = this.getPortalPair(x, y);
    if (!pair) return null;
    if (pair.a.x === x && pair.a.y === y) return pair.b;
    if (pair.b && pair.b.x === x && pair.b.y === y) return pair.a;
    return null;
  }

  set(x, y, type, extra = {}) {
    const key = TerrainLayer.key(x, y);
    const existing = this.terrainMap.get(key);

    if (existing && existing.type === TERRAIN_TYPES.PORTAL) {
      this._removePortal(x, y);
    }

    if (type === TERRAIN_TYPES.EMPTY || type === null || type === undefined) {
      this.terrainMap.delete(key);
      return;
    }

    const terrain = { x, y, type, ...extra };
    this.terrainMap.set(key, terrain);
  }

  setWall(x, y) {
    this.set(x, y, TERRAIN_TYPES.WALL);
  }

  setSpeed(x, y) {
    this.set(x, y, TERRAIN_TYPES.SPEED);
  }

  setIce(x, y) {
    this.set(x, y, TERRAIN_TYPES.ICE);
  }

  setFertile(x, y) {
    this.set(x, y, TERRAIN_TYPES.FERTILE);
  }

  placePortal(x, y) {
    if (this.portalPairs.size >= MAX_PORTAL_PAIRS && !this.pendingPortalA) {
      return { success: false, error: '已达到最大传送门对数' };
    }

    const existing = this.get(x, y);
    if (existing && existing.type === TERRAIN_TYPES.PORTAL) {
      return { success: false, error: '该位置已有传送门' };
    }

    if (!this.pendingPortalA) {
      const pairId = this._getNextPortalId();
      this.set(x, y, TERRAIN_TYPES.PORTAL, { pairId, isA: true });
      this.pendingPortalA = { x, y, pairId };
      this.portalPairs.set(pairId, { id: pairId, a: { x, y }, b: null });
      return { success: true, state: 'placedA', pairId };
    } else {
      const pairId = this.pendingPortalA.pairId;
      this.set(x, y, TERRAIN_TYPES.PORTAL, { pairId, isA: false });
      const pair = this.portalPairs.get(pairId);
      if (pair) {
        pair.b = { x, y };
      }
      this.pendingPortalA = null;
      return { success: true, state: 'placedB', pairId };
    }
  }

  cancelPendingPortal() {
    if (this.pendingPortalA) {
      const { x, y, pairId } = this.pendingPortalA;
      this._removePortal(x, y);
      this.pendingPortalA = null;
      return true;
    }
    return false;
  }

  _removePortal(x, y) {
    const key = TerrainLayer.key(x, y);
    const terrain = this.terrainMap.get(key);
    if (!terrain || terrain.type !== TERRAIN_TYPES.PORTAL) return;

    const pairId = terrain.pairId;
    const pair = this.portalPairs.get(pairId);

    if (pair) {
      if (pair.a && pair.a.x === x && pair.a.y === y) {
        if (pair.b) {
          pair.a = pair.b;
          pair.b = null;
          const bKey = TerrainLayer.key(pair.a.x, pair.a.y);
          const bTerrain = this.terrainMap.get(bKey);
          if (bTerrain) {
            bTerrain.isA = true;
          }
          this.pendingPortalA = { x: pair.a.x, y: pair.a.y, pairId };
        } else {
          this.portalPairs.delete(pairId);
          this.pendingPortalA = null;
        }
      } else if (pair.b && pair.b.x === x && pair.b.y === y) {
        pair.b = null;
        this.pendingPortalA = { x: pair.a.x, y: pair.a.y, pairId };
      }
    }

    this.terrainMap.delete(key);
  }

  remove(x, y) {
    const terrain = this.get(x, y);
    if (terrain && terrain.type === TERRAIN_TYPES.PORTAL) {
      this._removePortal(x, y);
    } else {
      const key = TerrainLayer.key(x, y);
      this.terrainMap.delete(key);
    }
  }

  clear() {
    this.terrainMap.clear();
    this.portalPairs.clear();
    this.nextPortalId = 1;
    this.pendingPortalA = null;
  }

  _getNextPortalId() {
    for (let i = 1; i <= MAX_PORTAL_PAIRS; i++) {
      if (!this.portalPairs.has(i)) {
        return i;
      }
    }
    return this.nextPortalId++;
  }

  getAllTerrain() {
    const result = [];
    for (const terrain of this.terrainMap.values()) {
      result.push(terrain);
    }
    return result;
  }

  getTerrainInRect(minX, minY, maxX, maxY) {
    const result = [];
    for (const terrain of this.terrainMap.values()) {
      if (terrain.x >= minX && terrain.x <= maxX &&
          terrain.y >= minY && terrain.y <= maxY) {
        result.push(terrain);
      }
    }
    return result;
  }

  getAllPortalPairs() {
    return [...this.portalPairs.values()];
  }

  getPortalPairCount() {
    return this.portalPairs.size;
  }

  clone() {
    const clone = new TerrainLayer();
    clone.terrainMap = new Map();
    for (const [key, value] of this.terrainMap.entries()) {
      clone.terrainMap.set(key, { ...value });
    }
    clone.portalPairs = new Map();
    for (const [id, pair] of this.portalPairs.entries()) {
      clone.portalPairs.set(id, {
        id: pair.id,
        a: pair.a ? { ...pair.a } : null,
        b: pair.b ? { ...pair.b } : null
      });
    }
    clone.nextPortalId = this.nextPortalId;
    clone.pendingPortalA = this.pendingPortalA ? { ...this.pendingPortalA } : null;
    return clone;
  }

  copyFrom(other) {
    this.terrainMap = new Map();
    for (const [key, value] of other.terrainMap.entries()) {
      this.terrainMap.set(key, { ...value });
    }
    this.portalPairs = new Map();
    for (const [id, pair] of other.portalPairs.entries()) {
      this.portalPairs.set(id, {
        id: pair.id,
        a: pair.a ? { ...pair.a } : null,
        b: pair.b ? { ...pair.b } : null
      });
    }
    this.nextPortalId = other.nextPortalId;
    this.pendingPortalA = other.pendingPortalA ? { ...other.pendingPortalA } : null;
  }

  toJSON() {
    const terrain = [];
    for (const t of this.terrainMap.values()) {
      const entry = { x: t.x, y: t.y, t: t.type };
      if (t.type === TERRAIN_TYPES.PORTAL) {
        entry.p = t.pairId;
        entry.a = t.isA;
      }
      terrain.push(entry);
    }

    const pairs = [];
    for (const pair of this.portalPairs.values()) {
      pairs.push({
        id: pair.id,
        a: pair.a ? { x: pair.a.x, y: pair.a.y } : null,
        b: pair.b ? { x: pair.b.x, y: pair.b.y } : null
      });
    }

    return {
      terrain,
      pairs,
      nextId: this.nextPortalId,
      pending: this.pendingPortalA
    };
  }

  static fromJSON(data) {
    const layer = new TerrainLayer();
    if (!data) return layer;

    if (data.terrain) {
      for (const entry of data.terrain) {
        const key = TerrainLayer.key(entry.x, entry.y);
        const terrain = { x: entry.x, y: entry.y, type: entry.t };
        if (entry.t === TERRAIN_TYPES.PORTAL) {
          terrain.pairId = entry.p;
          terrain.isA = entry.a;
        }
        layer.terrainMap.set(key, terrain);
      }
    }

    if (data.pairs) {
      for (const pair of data.pairs) {
        layer.portalPairs.set(pair.id, {
          id: pair.id,
          a: pair.a ? { ...pair.a } : null,
          b: pair.b ? { ...pair.b } : null
        });
      }
    }

    layer.nextPortalId = data.nextId || 1;
    layer.pendingPortalA = data.pending ? { ...data.pending } : null;

    return layer;
  }
}
