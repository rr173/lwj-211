import { eventBus } from './EventBus.js';
import { CellStore } from './CellStore.js';
import { ResourceField } from './ResourceField.js';
import { TerrainLayer } from '../terrain/TerrainLayer.js';
import { Topology, TOPOLOGY_TYPES } from './Topology.js';

export class Snapshot {
  constructor(generation, cellStore, colonyManager, resourceField = null, terrainLayer = null) {
    this.generation = generation;
    this.timestamp = Date.now();
    this.topology = Topology.getType();
    this.cells = cellStore.toJSON();
    this.colonyStates = new Map();
    for (const colony of colonyManager.getAll()) {
      this.colonyStates.set(colony.id, {
        paused: colony.paused,
        currentCount: colony.currentCount,
        prevCount: colony.prevCount,
        growthRateHistory: [...colony.growthRateHistory],
        mutationHistory: [...colony.mutationHistory],
        lastMutationCheck: colony.lastMutationCheck
      });
    }
    this.resources = resourceField ? resourceField.toJSON() : null;
    this.terrain = terrainLayer ? terrainLayer.toJSON() : null;
  }

  restoreTo(cellStore, colonyManager, resourceField = null, terrainLayer = null) {
    Topology.setType(this.topology);
    cellStore.clear();
    const cellsData = (this.cells && this.cells.cells) ? this.cells.cells : (this.cells || []);
    for (const cell of cellsData) {
      if (this.topology === TOPOLOGY_TYPES.TRIANGULAR) {
        cellStore.set(cell.row, cell.col, cell.dir, cell.c);
      } else if (this.topology === TOPOLOGY_TYPES.HEXAGONAL) {
        cellStore.set(cell.q, cell.r, cell.c);
      } else {
        cellStore.set(cell.x, cell.y, cell.c);
      }
    }
    for (const colony of colonyManager.getAll()) {
      const state = this.colonyStates.get(colony.id);
      if (state) {
        colony.paused = state.paused;
        colony.currentCount = state.currentCount;
        colony.prevCount = state.prevCount;
        colony.growthRateHistory = [...(state.growthRateHistory || [])];
        colony.mutationHistory = [...(state.mutationHistory || [])];
        colony.lastMutationCheck = state.lastMutationCheck || 0;
      }
    }
    if (resourceField && this.resources) {
      const restored = ResourceField.fromJSON(this.resources);
      resourceField.copyFrom(restored);
    }
    if (terrainLayer && this.terrain) {
      const restored = TerrainLayer.fromJSON(this.terrain);
      terrainLayer.copyFrom(restored);
    } else if (terrainLayer && this.terrain === null) {
      terrainLayer.clear();
    }
  }
}

export class Branch {
  constructor(name, id, startGeneration, parentBranchId = null) {
    this.id = id;
    this.name = name;
    this.startGeneration = startGeneration;
    this.currentGeneration = startGeneration;
    this.parentBranchId = parentBranchId;
    this.snapshots = [];
    this.maxSnapshots = 200;
    this.createdAt = Date.now();
  }

  addSnapshot(snapshot) {
    this.snapshots.push(snapshot);
    while (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }
    this.currentGeneration = snapshot.generation;
  }

  findSnapshotAtOrBefore(generation) {
    let best = null;
    for (const snap of this.snapshots) {
      if (snap.generation <= generation) {
        best = snap;
      } else {
        break;
      }
    }
    return best;
  }

  findExactSnapshot(generation) {
    return this.snapshots.find(s => s.generation === generation) || null;
  }

  getSnapshotGenerations() {
    return this.snapshots.map(s => s.generation);
  }

  getEarliestGeneration() {
    return this.snapshots.length > 0 ? this.snapshots[0].generation : this.startGeneration;
  }

  getLatestGeneration() {
    return this.currentGeneration;
  }

  trimSnapshotsAfter(generation) {
    this.snapshots = this.snapshots.filter(s => s.generation <= generation);
    this.currentGeneration = generation;
  }
}

export class HistoryManager {
  constructor(cellStore, colonyManager, engine, resourceField = null, terrainLayer = null) {
    this.cellStore = cellStore;
    this.colonyManager = colonyManager;
    this.engine = engine;
    this.resourceField = resourceField;
    this.terrainLayer = terrainLayer;

    this.branches = new Map();
    this.currentBranchId = null;
    this.branchCounter = 0;

    this.autoSnapshotInterval = 10;
    this.maxBranches = 5;

    this.compareMode = false;
    this.compareBranchIds = [];
    this.compareViewStates = {};

    this.isBrowsingHistory = false;
    this.browsingGeneration = null;

    this.catchUpMode = false;

    this._initMainBranch();
  }

  _initMainBranch() {
    const mainBranch = new Branch('主线', 'branch_main', 0, null);
    this.branches.set(mainBranch.id, mainBranch);
    this.currentBranchId = mainBranch.id;
  }

  getCurrentBranch() {
    return this.branches.get(this.currentBranchId) || null;
  }

  getBranch(id) {
    return this.branches.get(id) || null;
  }

  getAllBranches() {
    return [...this.branches.values()];
  }

  switchBranch(branchId) {
    if (!this.branches.has(branchId)) return false;
    if (branchId === this.currentBranchId && !this.isBrowsingHistory) return true;

    this.engine.stop();
    this.currentBranchId = branchId;
    this.isBrowsingHistory = false;
    this.browsingGeneration = null;

    const branch = this.branches.get(branchId);
    const latestSnap = branch.snapshots.length > 0 ? branch.snapshots[branch.snapshots.length - 1] : null;

    if (latestSnap) {
      latestSnap.restoreTo(this.cellStore, this.colonyManager, this.resourceField, this.terrainLayer);
      this.engine.generation = latestSnap.generation;
    } else {
      this.cellStore.clear();
      if (this.resourceField) this.resourceField.clear();
      if (this.terrainLayer) this.terrainLayer.clear();
      this.engine.generation = branch.startGeneration;
    }

    if (branch.currentGeneration > this.engine.generation) {
      const stepsNeeded = branch.currentGeneration - this.engine.generation;
      this.catchUpMode = true;
      const origRunning = this.engine.running;
      this.engine.stop();
      for (let i = 0; i < stepsNeeded; i++) {
        const genBefore = this.engine.generation;
        this.engine.step();
        if (this.engine.generation === genBefore) break;
      }
      this.catchUpMode = false;
      if (origRunning) this.engine.start();
    }

    eventBus.emit('branch:switched', branch);
    eventBus.emit('state:updated');
    eventBus.emit('generation:changed', this.engine.generation);
    eventBus.emit('timeline:changed', this._getTimelineData());
    return true;
  }

  createBranchFromSnapshot(branchName, snapshotGeneration, sourceBranchId = null) {
    if (this.branches.size >= this.maxBranches) {
      eventBus.emit('branches:limitReached', this.maxBranches);
      return null;
    }

    const sourceId = sourceBranchId || this.currentBranchId;
    const sourceBranch = this.branches.get(sourceId);
    if (!sourceBranch) return null;

    const snapshot = sourceBranch.findExactSnapshot(snapshotGeneration) || sourceBranch.findSnapshotAtOrBefore(snapshotGeneration);
    if (!snapshot) return null;

    this.branchCounter++;
    const newId = `branch_${Date.now()}_${this.branchCounter}`;
    const name = branchName || this._generateBranchName();
    const newBranch = new Branch(name, newId, snapshot.generation, sourceId);

    const clonedSnapshot = new Snapshot(snapshot.generation, this.cellStore, this.colonyManager, this.resourceField, this.terrainLayer);
    clonedSnapshot.topology = snapshot.topology;
    clonedSnapshot.cells = JSON.parse(JSON.stringify(snapshot.cells));
    clonedSnapshot.colonyStates = new Map(snapshot.colonyStates);
    clonedSnapshot.resources = snapshot.resources ? JSON.parse(JSON.stringify(snapshot.resources)) : null;
    clonedSnapshot.terrain = snapshot.terrain ? JSON.parse(JSON.stringify(snapshot.terrain)) : null;
    newBranch.addSnapshot(clonedSnapshot);

    this.branches.set(newId, newBranch);

    eventBus.emit('branch:created', newBranch);
    eventBus.emit('branches:changed', this.getAllBranches());

    return newBranch;
  }

  _generateBranchName() {
    let num = 1;
    const existingNames = new Set([...this.branches.values()].map(b => b.name));
    while (existingNames.has(`分支${num}`)) {
      num++;
    }
    return `分支${num}`;
  }

  deleteBranch(branchId) {
    if (branchId === 'branch_main') {
      return false;
    }
    if (!this.branches.has(branchId)) return false;

    this.branches.delete(branchId);

    if (this.currentBranchId === branchId) {
      this.switchBranch('branch_main');
    }

    if (this.compareBranchIds.includes(branchId)) {
      this.exitCompareMode();
    }

    eventBus.emit('branch:deleted', branchId);
    eventBus.emit('branches:changed', this.getAllBranches());
    return true;
  }

  saveSnapshot(force = false) {
    if (this.catchUpMode) return null;
    
    const branch = this.getCurrentBranch();
    if (!branch) return null;

    const gen = this.engine.generation;

    if (!force) {
      if (gen === 0) return null;
      if (gen % this.autoSnapshotInterval !== 0) return null;
    }

    if (branch.findExactSnapshot(gen)) return null;

    const snapshot = new Snapshot(gen, this.cellStore, this.colonyManager, this.resourceField, this.terrainLayer);
    branch.addSnapshot(snapshot);
    branch.currentGeneration = gen;

    eventBus.emit('snapshot:saved', { branchId: branch.id, snapshot });
    eventBus.emit('timeline:changed', this._getTimelineData());

    return snapshot;
  }

  jumpToGeneration(generation) {
    const branch = this.getCurrentBranch();
    if (!branch) return false;

    const snapshot = branch.findSnapshotAtOrBefore(generation);
    if (!snapshot) return false;

    this.engine.stop();
    snapshot.restoreTo(this.cellStore, this.colonyManager, this.resourceField, this.terrainLayer);
    this.engine.generation = snapshot.generation;

    this.isBrowsingHistory = true;
    this.browsingGeneration = snapshot.generation;
    this._jumpSnapshotGen = snapshot.generation;

    eventBus.emit('timeline:jumped', snapshot.generation);
    eventBus.emit('state:updated');
    eventBus.emit('generation:changed', this.engine.generation);
    eventBus.emit('timeline:changed', this._getTimelineData());

    return true;
  }

  onEditAfterHistoryJump() {
    if (!this.isBrowsingHistory) return null;

    const sourceBranch = this.getCurrentBranch();
    const browseGen = this.browsingGeneration;

    this.isBrowsingHistory = false;
    this.browsingGeneration = null;

    const sourceTrimGen = browseGen > 0 ? browseGen - 1 : 0;
    if (browseGen < sourceBranch.getLatestGeneration()) {
      // do nothing, parent branch history preserved
    }

    const newBranch = this.createBranchFromSnapshot(null, browseGen, sourceBranch.id);
    if (!newBranch) return null;

    this.currentBranchId = newBranch.id;

    const currentCells = this.cellStore.toJSON();
    const restoredSnapshot = newBranch.findExactSnapshot(browseGen);
    if (restoredSnapshot) {
      restoredSnapshot.cells = currentCells;
    }

    eventBus.emit('branch:forked', { from: sourceBranch.id, to: newBranch.id, generation: browseGen });
    eventBus.emit('branches:changed', this.getAllBranches());
    eventBus.emit('timeline:changed', this._getTimelineData());

    return newBranch;
  }

  setAutoSnapshotInterval(interval) {
    this.autoSnapshotInterval = Math.max(1, parseInt(interval, 10) || 10);
    eventBus.emit('settings:changed');
  }

  enterCompareMode(branchIdA, branchIdB) {
    if (!this.branches.has(branchIdA) || !this.branches.has(branchIdB)) return false;
    if (branchIdA === branchIdB) return false;

    this.compareMode = true;
    this.compareBranchIds = [branchIdA, branchIdB];
    this.engine.stop();

    eventBus.emit('compare:entered', { branches: this.compareBranchIds });
    return true;
  }

  exitCompareMode() {
    this.compareMode = false;
    this.compareBranchIds = [];
    this.compareViewStates = {};
    eventBus.emit('compare:exited');
  }

  stepCompareBranch(branchIndex) {
    if (!this.compareMode) return;
    const branchId = this.compareBranchIds[branchIndex];
    if (!branchId) return;

    const branch = this.branches.get(branchId);
    if (!branch) return;

    eventBus.emit('compare:step', { branchIndex, branchId });
  }

  _getTimelineData() {
    const branch = this.getCurrentBranch();
    if (!branch) return null;
    return {
      branchId: branch.id,
      branchName: branch.name,
      currentGeneration: this.isBrowsingHistory ? this.browsingGeneration : this.engine.generation,
      maxGeneration: branch.getLatestGeneration(),
      minGeneration: branch.getEarliestGeneration(),
      snapshotGenerations: branch.getSnapshotGenerations(),
      isBrowsing: this.isBrowsingHistory
    };
  }

  getTimelineData() {
    return this._getTimelineData();
  }

  notifyGenerationAdvance() {
    const branch = this.getCurrentBranch();
    if (!branch) return;
    
    if (this.isBrowsingHistory && this._jumpSnapshotGen !== undefined) {
      branch.trimSnapshotsAfter(this._jumpSnapshotGen);
      this._jumpSnapshotGen = undefined;
    }
    
    branch.currentGeneration = this.engine.generation;
    if (this.isBrowsingHistory) {
      this.isBrowsingHistory = false;
      this.browsingGeneration = null;
    }
    eventBus.emit('timeline:changed', this._getTimelineData());
  }

  clearAll() {
    this.branches.clear();
    this.branchCounter = 0;
    this.compareMode = false;
    this.compareBranchIds = [];
    this.compareViewStates = {};
    this.isBrowsingHistory = false;
    this.browsingGeneration = null;
    this._jumpSnapshotGen = undefined;
    this.catchUpMode = false;
    this._initMainBranch();
    eventBus.emit('branches:changed', this.getAllBranches());
    eventBus.emit('timeline:changed', this._getTimelineData());
  }
}
