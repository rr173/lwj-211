import { eventBus } from '../core/EventBus.js';
import { ResourceField } from '../core/ResourceField.js';
import { CellStore } from '../core/CellStore.js';
import { Topology, TOPOLOGY_TYPES } from '../core/Topology.js';

const MOORE = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const VN = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export class EvolutionEngine {
  constructor(cellStore, colonyManager, resourceField = null, terrainLayer = null) {
    this.cellStore = cellStore;
    this.colonyManager = colonyManager;
    this.resourceField = resourceField;
    this.terrainLayer = terrainLayer;
    this.generation = 0;
    this.running = false;
    this.speed = 30;
    this.collisionStrategy = 'priority';
    this.lastStepTime = 0;
    this.animationFrameId = null;
    this.history = [];
    this.maxHistoryLength = 100;
    this.historyManager = null;
    this.totalResourcesHistory = [];
    this.prevTotalResources = 0;
    this.resourceNetChange = 0;
  }

  setHistoryManager(hm) {
    this.historyManager = hm;
  }

  setSpeed(speed) {
    this.speed = speed;
  }

  setCollisionStrategy(strategy) {
    this.collisionStrategy = strategy;
    eventBus.emit('settings:changed');
  }

  toggleRunning() {
    this.running = !this.running;
    if (this.running) this.start();
    else this.stop();
    eventBus.emit('engine:runningChanged', this.running);
    return this.running;
  }

  start() {
    this.running = true;
    this.lastStepTime = performance.now();
    this.loop();
  }

  stop() {
    this.running = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  reset() {
    this.stop();
    this.generation = 0;
    this.history = [];
    this.totalResourcesHistory = [];
    this.prevTotalResources = 0;
    this.resourceNetChange = 0;
    this.cellStore.clear();
    if (this.resourceField) {
      this.resourceField.clear();
    }

    if (this.historyManager) {
      const mainBranch = this.historyManager.branches.get('branch_main');
      if (mainBranch) {
        mainBranch.snapshots = [];
        mainBranch.startGeneration = 0;
        mainBranch.currentGeneration = 0;
      }
      this.historyManager.isBrowsingHistory = false;
      this.historyManager.browsingGeneration = null;
      eventBus.emit('timeline:changed', this.historyManager.getTimelineData());
    }

    eventBus.emit('state:updated');
    eventBus.emit('generation:changed', this.generation);
  }

  loop() {
    if (!this.running) return;
    const now = performance.now();
    const interval = 1000 / this.speed;
    if (now - this.lastStepTime >= interval) {
      try {
        const steps = this.speed >= 60 ? Math.min(Math.floor((now - this.lastStepTime) / interval), 5) : 1;
        for (let i = 0; i < steps; i++) this.step();
        this.lastStepTime = now;
      } catch (e) {
        console.error('Evolution error:', e);
      }
    }
    this.animationFrameId = requestAnimationFrame(() => this.loop());
  }

  step() {
    const cellStore = this.cellStore;
    const terrain = this.terrainLayer;
    const allColonies = this.colonyManager.getAll();
    const activeColonies = [];
    for (let i = 0; i < allColonies.length; i++) {
      if (!allColonies[i].paused) activeColonies.push(allColonies[i]);
      allColonies[i].prevCount = allColonies[i].currentCount;
    }
    if (activeColonies.length === 0) return;

    if (terrain) {
      const allCells = cellStore.getAllCells();
      for (let i = 0; i < allCells.length; i++) {
        if (terrain.isWall(allCells[i].x, allCells[i].y)) {
          cellStore.delete(allCells[i].x, allCells[i].y);
        }
      }
    }

    const allCells = cellStore.getAllCells();
    const cellCount = allCells.length;
    const topology = Topology.getType();

    const cellsCoord = new Array(cellCount);
    const cellsKey = new Array(cellCount);
    const cellsColony = new Array(cellCount);
    for (let i = 0; i < cellCount; i++) {
      const c = allCells[i];
      cellsCoord[i] = c;
      cellsKey[i] = c.key;
      cellsColony[i] = c.colonyId;
    }

    let resourcesBefore = 0;
    if (this.resourceField) {
      resourcesBefore = this.resourceField.getTotalResources();
    }

    const starvedCells = new Set();
    if (this.resourceField) {
      for (let i = 0; i < cellCount; i++) {
        const colony = this.colonyManager.getColony(cellsColony[i]);
        if (!colony || colony.paused) continue;
        const consumptionRate = colony.rule.consumptionRate;
        if (consumptionRate > 0) {
          const cx = cellsCoord[i].x;
          const cy = cellsCoord[i].y;
          if (terrain && terrain.isFertileZone(cx, cy)) {
            continue;
          }
          const remaining = this.resourceField.consume(cx, cy, consumptionRate);
          if (remaining === 0 && this.resourceField.get(cx, cy) === 0) {
            starvedCells.add(cellsKey[i]);
          }
        }
      }
    }

    const producers = activeColonies.filter(c => c.rule.productionRate > 0);
    if (this.resourceField && producers.length > 0) {
      for (let i = 0; i < cellCount; i++) {
        if (starvedCells.has(cellsKey[i])) continue;
        const colony = this.colonyManager.getColony(cellsColony[i]);
        if (!colony || colony.paused) continue;
        const productionRate = colony.rule.productionRate;
        if (productionRate > 0) {
          const coord = cellsCoord[i];
          let neighbors;
          if (topology === TOPOLOGY_TYPES.SQUARE) {
            neighbors = Topology.getNeighbors(coord.x, coord.y, 'vonneumann');
          } else if (topology === TOPOLOGY_TYPES.HEXAGONAL) {
            neighbors = Topology.getNeighbors(coord.q, coord.r);
          } else {
            neighbors = Topology.getNeighbors(coord.row, coord.col, coord.dir);
          }
          for (const ncoord of neighbors) {
            const nx = ncoord[0];
            const ny = ncoord[1];
            if (topology === TOPOLOGY_TYPES.TRIANGULAR) {
              if (!cellStore.has(ncoord[0], ncoord[1], ncoord[2])) {
                this.resourceField.add(ny, nx, productionRate);
              }
            } else {
              if (!cellStore.has(nx, ny)) {
                this.resourceField.add(nx, ny, productionRate);
              }
            }
          }
        }
      }
    }

    if (this.resourceField) {
      this.resourceField.processRecovery(this.generation + 1);
    }

    const predationActive = activeColonies.some(c => c.rule.predationPower > 0);
    const predationVictims = new Set();
    const predationBonusResources = [];

    if (predationActive) {
      for (let i = 0; i < cellCount; i++) {
        if (starvedCells.has(cellsKey[i])) continue;
        const colony = this.colonyManager.getColony(cellsColony[i]);
        if (!colony || colony.paused) continue;
        const predPower = colony.rule.predationPower;
        if (predPower > 0) {
          const coord = cellsCoord[i];
          let neighbors;
          if (topology === TOPOLOGY_TYPES.SQUARE) {
            const nh = colony.rule.neighborhood === 'vonneumann' ? 'vonneumann' : 'moore';
            neighbors = Topology.getNeighbors(coord.x, coord.y, nh);
          } else if (topology === TOPOLOGY_TYPES.HEXAGONAL) {
            neighbors = Topology.getNeighbors(coord.q, coord.r);
          } else {
            neighbors = Topology.getNeighbors(coord.row, coord.col, coord.dir);
          }

          for (const ncoord of neighbors) {
            let neighborCell, nkey, nx, ny;
            if (topology === TOPOLOGY_TYPES.TRIANGULAR) {
              neighborCell = cellStore.get(ncoord[0], ncoord[1], ncoord[2]);
              nkey = CellStore.key(ncoord[0], ncoord[1], ncoord[2]);
              nx = ncoord[1];
              ny = ncoord[0];
            } else {
              neighborCell = cellStore.get(ncoord[0], ncoord[1]);
              nkey = CellStore.key(ncoord[0], ncoord[1]);
              nx = ncoord[0];
              ny = ncoord[1];
            }
            if (terrain && terrain.isWall(nx, ny)) continue;
            if (neighborCell && neighborCell.colonyId !== colony.id) {
              const neighborColony = this.colonyManager.getColony(neighborCell.colonyId);
              if (neighborColony && !neighborColony.paused) {
                const neighborPower = neighborColony.rule.predationPower;
                if (predPower > neighborPower) {
                  if (!predationVictims.has(nkey)) {
                    predationVictims.add(nkey);
                    predationBonusResources.push({ x: nx, y: ny, amount: 10 });
                  }
                }
              }
            }
          }
        }
      }
    }

    if (this.resourceField) {
      for (const bonus of predationBonusResources) {
        this.resourceField.add(bonus.x, bonus.y, bonus.amount);
      }
    }

    const { newMap: firstPassMap, newColonyCounts: firstPassCounts, newCount: firstPassCount } =
      this._computeEvolutionStep(cellsCoord, cellsKey, cellsColony, cellCount, activeColonies, starvedCells, predationVictims, cellStore);

    let finalMap = firstPassMap;
    let finalColonyCounts = firstPassCounts;
    let finalCount = firstPassCount;

    const isOddGen = this.generation % 2 === 0;

    if (terrain && isOddGen && topology === TOPOLOGY_TYPES.SQUARE) {
      const tempCells = [];
      for (const [key, cell] of firstPassMap.entries()) {
        tempCells.push(cell);
      }
      const tCoord = new Array(tempCells.length);
      const tkey = new Array(tempCells.length);
      const tcol = new Array(tempCells.length);
      for (let i = 0; i < tempCells.length; i++) {
        tCoord[i] = tempCells[i];
        tkey[i] = tempCells[i].key;
        tcol[i] = tempCells[i].colonyId;
      }

      const { newMap: speedMap } =
        this._computeEvolutionStep(tCoord, tkey, tcol, tempCells.length, activeColonies, new Set(), new Set(), null, 'speed');

      const mergedMap = new Map(firstPassMap);
      const mergedCounts = new Map(firstPassCounts);

      for (const [key, cell] of speedMap.entries()) {
        const x = cell.x;
        const y = cell.y;
        if (terrain.isSpeedZone(x, y)) {
          const existing = mergedMap.get(key);
          if (existing) {
            mergedCounts.set(existing.colonyId, (mergedCounts.get(existing.colonyId) || 1) - 1);
          }
          mergedMap.set(key, cell);
          mergedCounts.set(cell.colonyId, (mergedCounts.get(cell.colonyId) || 0) + 1);
        }
      }

      let mergedCount = 0;
      for (const v of mergedCounts.values()) mergedCount += v;

      finalMap = mergedMap;
      finalColonyCounts = mergedCounts;
      finalCount = mergedCount;
    }

    if (terrain && topology === TOPOLOGY_TYPES.SQUARE) {
      const iceMap = new Map();
      const iceCounts = new Map();
      for (const [key, cell] of finalMap.entries()) {
        const x = cell.x;
        const y = cell.y;
        if (terrain.isIceZone(x, y)) {
          if (this.generation % 2 !== 0) {
            const oldCell = cellStore.get(x, y);
            if (oldCell) {
              iceMap.set(key, oldCell);
              iceCounts.set(oldCell.colonyId, (iceCounts.get(oldCell.colonyId) || 0) + 1);
            }
          } else {
            iceMap.set(key, cell);
            iceCounts.set(cell.colonyId, (iceCounts.get(cell.colonyId) || 0) + 1);
          }
        } else {
          iceMap.set(key, cell);
          iceCounts.set(cell.colonyId, (iceCounts.get(cell.colonyId) || 0) + 1);
        }
      }

      let iceTotal = 0;
      for (const v of iceCounts.values()) iceTotal += v;

      finalMap = iceMap;
      finalColonyCounts = iceCounts;
      finalCount = iceTotal;
    }

    const pausedIds = {};
    for (let i = 0; i < allColonies.length; i++) {
      if (allColonies[i].paused) pausedIds[allColonies[i].id] = true;
    }

    for (let i = 0; i < cellCount; i++) {
      if (pausedIds[cellsColony[i]]) {
        const key = cellsKey[i];
        if (!finalMap.has(key)) {
          const coord = cellsCoord[i];
          let cell;
          if (topology === TOPOLOGY_TYPES.TRIANGULAR) {
            cell = cellStore.get(coord.row, coord.col, coord.dir);
          } else {
            cell = cellStore.get(coord.x, coord.y);
          }
          if (cell) {
            finalMap.set(key, cell);
            finalCount++;
            finalColonyCounts.set(cellsColony[i], (finalColonyCounts.get(cellsColony[i]) || 0) + 1);
          }
        }
      }
    }

    cellStore.map = finalMap;
    cellStore.count = finalCount;
    cellStore.colonyCounts = finalColonyCounts;
    cellStore._cellsCache = null;
    cellStore._keysCache = null;

    for (let i = 0; i < allColonies.length; i++) {
      allColonies[i].currentCount = cellStore.countByColony(allColonies[i].id);
      if (!allColonies[i].paused) {
        allColonies[i].recordGrowthRate();
      }
    }

    const nextGeneration = this.generation + 1;
    for (const colony of activeColonies) {
      if (colony.shouldCheckMutation(nextGeneration)) {
        const avgGrowth = colony.getAverageGrowthRate(100);
        if (avgGrowth < -5) {
          const mutationResult = colony.applyRandomMutation();
          if (mutationResult) {
            colony.recordMutation(nextGeneration, mutationResult.oldBS, mutationResult.newBS);
          }
        }
      }
    }

    if (this.resourceField) {
      const resourcesAfter = this.resourceField.getTotalResources();
      this.resourceNetChange = resourcesAfter - resourcesBefore;
      this.resourceField.lastNetChange = this.resourceNetChange;
      this.prevTotalResources = resourcesAfter;
      this.totalResourcesHistory.push({ generation: nextGeneration, total: resourcesAfter });
      if (this.totalResourcesHistory.length > this.maxHistoryLength) {
        this.totalResourcesHistory.shift();
      }
    }

    this.generation = nextGeneration;
    this.recordHistory();

    if (this.historyManager) {
      this.historyManager.notifyGenerationAdvance();
      this.historyManager.saveSnapshot(false);
    }

    eventBus.emit('state:updated');
    eventBus.emit('generation:changed', this.generation);
  }

  _computeEvolutionStep(cellsCoord, cellsKey, cellsColony, cellCount, activeColonies, starvedCells, predationVictims, cellStore, mode = 'normal') {
    const terrain = this.terrainLayer;
    const neighborMap = {};
    const topology = Topology.getType();

    for (let ai = 0; ai < activeColonies.length; ai++) {
      const colony = activeColonies[ai];
      const cid = colony.id;

      for (let celli = 0; celli < cellCount; celli++) {
        if (cellsColony[celli] !== cid) continue;
        if (starvedCells.has(cellsKey[celli])) continue;
        if (predationVictims.has(cellsKey[celli])) continue;
        const coord = cellsCoord[celli];

        let neighbors;
        if (topology === TOPOLOGY_TYPES.SQUARE) {
          const nh = colony.rule.neighborhood === 'vonneumann' ? 'vonneumann' : 'moore';
          neighbors = Topology.getNeighbors(coord.x, coord.y, nh);
        } else if (topology === TOPOLOGY_TYPES.HEXAGONAL) {
          neighbors = Topology.getNeighbors(coord.q, coord.r);
        } else {
          neighbors = Topology.getNeighbors(coord.row, coord.col, coord.dir);
        }

        for (const ncoord of neighbors) {
          let nkey, nx, ny;
          if (topology === TOPOLOGY_TYPES.TRIANGULAR) {
            nkey = CellStore.key(ncoord[0], ncoord[1], ncoord[2]);
            nx = ncoord[1];
            ny = ncoord[0];
          } else {
            nkey = CellStore.key(ncoord[0], ncoord[1]);
            nx = ncoord[0];
            ny = ncoord[1];
          }
          if (terrain && terrain.isWall(nx, ny)) continue;
          let counts = neighborMap[nkey];
          if (!counts) {
            counts = {};
            neighborMap[nkey] = counts;
          }
          counts[cid] = (counts[cid] || 0) + 1;
        }
      }
    }

    const candidates = {};

    for (let ai = 0; ai < activeColonies.length; ai++) {
      const colony = activeColonies[ai];
      const rule = colony.rule;
      const cid = colony.id;
      const survival = rule.survival;

      for (let celli = 0; celli < cellCount; celli++) {
        if (cellsColony[celli] !== cid) continue;
        if (starvedCells.has(cellsKey[celli])) continue;
        if (predationVictims.has(cellsKey[celli])) continue;
        const key = cellsKey[celli];
        const coord = cellsCoord[celli];
        const counts = neighborMap[key];
        const n = counts ? (counts[cid] || 0) : 0;
        if (survival.has(n)) {
          if (!candidates[key]) candidates[key] = [];
          candidates[key].push({ coord, cid, colony, n, birth: 0 });
        }
      }
    }

    const existingMap = cellStore ? cellStore.map : null;
    for (const key in neighborMap) {
      if (existingMap && existingMap.has(key)) {
        if (starvedCells.has(key) || predationVictims.has(key)) {
        } else {
          continue;
        }
      }
      const counts = neighborMap[key];
      const parsed = Topology.parseKey(key);

      let tx, ty;
      if (topology === TOPOLOGY_TYPES.TRIANGULAR) {
        tx = parsed.col;
        ty = parsed.row;
      } else {
        tx = parsed.x;
        ty = parsed.y;
      }

      if (terrain && terrain.isWall(tx, ty)) continue;

      let targetKey = key;
      let targetCoord = parsed;

      if (terrain && topology === TOPOLOGY_TYPES.SQUARE && terrain.isPortal(tx, ty)) {
        const partner = terrain.getPortalPartner(tx, ty);
        if (partner && !terrain.isWall(partner.x, partner.y)) {
          targetKey = CellStore.key(partner.x, partner.y);
          targetCoord = { x: partner.x, y: partner.y, row: partner.y, col: partner.x };
        }
      }

      for (let ai = 0; ai < activeColonies.length; ai++) {
        const colony = activeColonies[ai];
        const n = counts[colony.id] || 0;
        if (colony.rule.birth.has(n)) {
          if (!candidates[targetKey]) candidates[targetKey] = [];
          candidates[targetKey].push({ coord: targetCoord, cid: colony.id, colony, n, birth: 1 });
        }
      }
    }

    const newMap = new Map();
    const newColonyCounts = new Map();
    let newCount = 0;

    const strategy = this.collisionStrategy;

    for (const key in candidates) {
      if (newMap.has(key)) continue;
      const list = candidates[key];
      let winner = null;

      if (list.length === 1) {
        winner = list[0];
      } else {
        let hasPredator = false;
        let maxPredPower = -1;
        for (const c of list) {
          if (c.colony.rule.predationPower > maxPredPower) {
            maxPredPower = c.colony.rule.predationPower;
            hasPredator = maxPredPower > 0;
          }
        }

        if (hasPredator && maxPredPower > 0) {
          const predators = list.filter(c => c.colony.rule.predationPower === maxPredPower);
          if (predators.length === 1) {
            winner = predators[0];
          } else {
            winner = predators[0];
            for (let i = 1; i < predators.length; i++) {
              const c = predators[i];
              if (c.n > winner.n ||
                  (c.n === winner.n && c.colony.rule.priority > winner.colony.rule.priority)) {
                winner = c;
              }
            }
          }
        } else {
          if (strategy === 'priority') {
            winner = list[0];
            for (let i = 1; i < list.length; i++) {
              const c = list[i];
              if (c.colony.rule.priority > winner.colony.rule.priority ||
                  (c.colony.rule.priority === winner.colony.rule.priority && c.n > winner.n)) {
                winner = c;
              }
            }
          } else if (strategy === 'competition') {
            winner = list[0];
            for (let i = 1; i < list.length; i++) {
              const c = list[i];
              if (c.n > winner.n ||
                  (c.n === winner.n && c.colony.rule.priority > winner.colony.rule.priority)) {
                winner = c;
              }
            }
          } else if (strategy === 'peace') {
            const existing = existingMap ? existingMap.get(key) : null;
            if (existing && !starvedCells.has(key) && !predationVictims.has(key)) {
              for (let i = 0; i < list.length; i++) {
                const c = list[i];
                if (c.birth === 0 && c.cid === existing.colonyId) {
                  winner = c;
                  break;
                }
              }
            }
            if (!winner) {
              winner = list[0];
              for (let i = 1; i < list.length; i++) {
                const c = list[i];
                if (c.colony.rule.priority > winner.colony.rule.priority) {
                  winner = c;
                }
              }
            }
          }
        }
      }

      if (winner) {
        const wc = winner.coord;
        let cx, cy;
        if (topology === TOPOLOGY_TYPES.TRIANGULAR) {
          cx = wc.col;
          cy = wc.row;
        } else {
          cx = wc.x;
          cy = wc.y;
        }
        if (terrain && terrain.isWall(cx, cy)) continue;

        let cellData;
        if (topology === TOPOLOGY_TYPES.TRIANGULAR) {
          cellData = { row: wc.row, col: wc.col, dir: wc.dir, x: wc.col, y: wc.row, colonyId: winner.cid };
        } else if (topology === TOPOLOGY_TYPES.HEXAGONAL) {
          cellData = { x: wc.x, y: wc.y, q: wc.x, r: wc.y, row: wc.y, col: wc.x, colonyId: winner.cid };
        } else {
          cellData = { x: wc.x, y: wc.y, row: wc.y, col: wc.x, colonyId: winner.cid };
        }
        newMap.set(key, cellData);
        newCount++;
        newColonyCounts.set(winner.cid, (newColonyCounts.get(winner.cid) || 0) + 1);
      }
    }

    return { newMap, newColonyCounts, newCount };
  }

  recordHistory() {
    const allColonies = this.colonyManager.getAll();
    const snapshot = {};
    for (let i = 0; i < allColonies.length; i++) {
      snapshot[allColonies[i].id] = allColonies[i].currentCount;
    }
    const totalResources = this.resourceField ? this.resourceField.getTotalResources() : 0;
    this.history.push({ 
      generation: this.generation, 
      snapshot,
      totalResources 
    });
    if (this.history.length > this.maxHistoryLength) this.history.shift();
    eventBus.emit('history:updated', this.history);
  }

  toJSON() {
    return {
      generation: this.generation,
      collisionStrategy: this.collisionStrategy,
      speed: this.speed,
      resources: this.resourceField ? this.resourceField.toJSON() : null
    };
  }

  loadFromJSON(data) {
    this.generation = data.generation || 0;
    this.collisionStrategy = data.collisionStrategy || 'priority';
    this.speed = data.speed || 30;
    this.history = [];
    this.totalResourcesHistory = [];
    if (this.resourceField && data.resources) {
      const restored = ResourceField.fromJSON(data.resources);
      this.resourceField.copyFrom(restored);
    }
  }
}
