import { eventBus } from '../core/EventBus.js';
import { Rule, PRESET_RULES } from '../core/Rule.js';
import { Colony } from '../core/Colony.js';
import { ResourceField } from '../core/ResourceField.js';
import { parseRLE } from '../engine/PatternManager.js';

export class UIManager {
  constructor(colonyManager, engine, patternManager, cellStore, viewState, historyManager = null, resourceField = null) {
    this.colonyManager = colonyManager;
    this.engine = engine;
    this.patternManager = patternManager;
    this.cellStore = cellStore;
    this.viewState = viewState;
    this.historyManager = historyManager;
    this.resourceField = resourceField;

    this.timelineDragging = false;
    this.selectedForCompare = new Set();

    this.initPresetColonies();
    this.bindUIEvents();
    this.bindEventBus();
    this.updateAll();

    if (this.historyManager) {
      this.updateBranchList();
      this.updateTimeline();
    }
  }

  setHistoryManager(hm) {
    this.historyManager = hm;
    this.updateBranchList();
    this.updateTimeline();
  }

  initPresetColonies() {
    for (const createRule of PRESET_RULES) {
      const rule = createRule();
      const colony = new Colony(rule);
      this.colonyManager.addColony(colony);
    }
  }

  bindUIEvents() {
    document.getElementById('add-rule-btn').addEventListener('click', () => this.addRuleFromForm());
    
    document.getElementById('quick-rule-btn').addEventListener('click', () => {
      const input = document.getElementById('quick-rule-input');
      this.addQuickRule(input.value);
      input.value = '';
    });

    document.getElementById('quick-rule-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.addQuickRule(e.target.value);
        e.target.value = '';
      }
    });

    document.getElementById('collision-strategy').addEventListener('change', (e) => {
      this.engine.setCollisionStrategy(e.target.value);
    });

    document.querySelectorAll('.pattern-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const patternName = btn.dataset.pattern;
        document.querySelectorAll('.pattern-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.patternManager.selectPattern(patternName);
        const pattern = this.patternManager.getPattern(patternName);
        document.getElementById('selected-pattern-info').textContent = 
          `已选择: ${pattern?.name || patternName}，点击画布放置（ESC取消）`;
      });
    });

    document.getElementById('step-btn').addEventListener('click', () => this.engine.step());
    document.getElementById('toggle-run-btn').addEventListener('click', () => this.engine.toggleRunning());
    document.getElementById('reset-btn').addEventListener('click', () => {
      if (confirm('确定要清空所有细胞吗？')) {
        this.engine.reset();
      }
    });

    document.getElementById('speed-slider').addEventListener('input', (e) => {
      const speed = parseInt(e.target.value, 10);
      this.engine.setSpeed(speed);
      document.getElementById('speed-value').textContent = speed === 100 ? '尽可能快' : `${speed}代/秒`;
    });

    document.getElementById('import-rle-btn').addEventListener('click', () => {
      const rleText = document.getElementById('rle-input').value;
      this.importRLE(rleText);
    });

    document.getElementById('export-json-btn').addEventListener('click', () => this.exportJSON());
    document.getElementById('import-json-btn').addEventListener('click', () => {
      document.getElementById('import-json-file').click();
    });
    document.getElementById('import-json-file').addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.importJSON(e.target.files[0]);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        if (this.historyManager && this.historyManager.compareMode) return;
        this.engine.step();
      } else if (e.code === 'Enter') {
        e.preventDefault();
        if (this.historyManager && this.historyManager.compareMode) return;
        this.engine.toggleRunning();
      } else if (e.code === 'Escape') {
        if (this.historyManager && this.historyManager.compareMode) {
          this.historyManager.exitCompareMode();
          this.exitCompareModeUI();
        } else {
          this.patternManager.cancelPlacement();
          document.querySelectorAll('.pattern-btn').forEach(b => b.classList.remove('active'));
          document.getElementById('selected-pattern-info').textContent = '';
        }
      } else if (e.code === 'KeyS') {
        e.preventDefault();
        if (this.historyManager) {
          this.historyManager.saveSnapshot(true);
          this.showToast('快照已保存');
        }
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        this.toggleResourceHeatmap();
      }
    });

    const toggleHeatmapBtn = document.getElementById('toggle-heatmap-btn');
    if (toggleHeatmapBtn) {
      toggleHeatmapBtn.addEventListener('click', () => this.toggleResourceHeatmap());
    }

    const closeMutationModal = document.getElementById('close-mutation-modal');
    if (closeMutationModal) {
      closeMutationModal.addEventListener('click', () => this.hideMutationHistoryModal());
    }

    const mutationModal = document.getElementById('mutation-history-modal');
    if (mutationModal) {
      mutationModal.addEventListener('click', (e) => {
        if (e.target === mutationModal) {
          this.hideMutationHistoryModal();
        }
      });
    }

    eventBus.on('mouse:hover', (world) => {
      this.renderer?.setHoverCell?.(world.x, world.y);
    });

    if (this.historyManager) {
      this._bindTimelineEvents();
      this._bindBranchListEvents();
      this._bindSnapshotSettings();
      this._bindCompareEvents();
    }
  }

  _bindTimelineEvents() {
    const track = document.getElementById('timeline-track');
    const slider = document.getElementById('timeline-slider');
    if (!track) return;

    const handleJump = (clientX) => {
      if (!this.historyManager) return;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const data = this.historyManager.getTimelineData();
      if (!data) return;
      const { minGeneration, maxGeneration } = data;
      const range = Math.max(1, maxGeneration - minGeneration);
      const targetGen = Math.round(minGeneration + ratio * range);
      const alignedGen = this._findNearestSnapshotGen(targetGen);
      if (alignedGen !== null) {
        this.historyManager.jumpToGeneration(alignedGen);
      }
    };

    track.addEventListener('mousedown', (e) => {
      if (e.target === slider) return;
      this.timelineDragging = true;
      handleJump(e.clientX);
    });

    slider.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.timelineDragging = true;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.timelineDragging) return;
      handleJump(e.clientX);
    });

    window.addEventListener('mouseup', () => {
      this.timelineDragging = false;
    });
  }

  _findNearestSnapshotGen(targetGen) {
    if (!this.historyManager) return null;
    const branch = this.historyManager.getCurrentBranch();
    if (!branch || branch.snapshots.length === 0) return null;
    const gens = branch.getSnapshotGenerations();
    let nearest = gens[0];
    let minDiff = Math.abs(targetGen - nearest);
    for (const g of gens) {
      const diff = Math.abs(targetGen - g);
      if (diff < minDiff) {
        minDiff = diff;
        nearest = g;
      }
    }
    return nearest;
  }

  _bindBranchListEvents() {
    const container = document.getElementById('branch-list');
    if (!container) return;

    container.addEventListener('click', (e) => {
      if (!this.historyManager) return;
      const deleteBtn = e.target.closest('.branch-delete-btn');
      const checkbox = e.target.closest('.branch-compare-checkbox input');
      const item = e.target.closest('.branch-item');
      if (!item) return;

      if (deleteBtn) {
        e.stopPropagation();
        const branchId = item.dataset.id;
        if (branchId === 'branch_main') {
          alert('主线分支不能删除');
          return;
        }
        if (confirm(`确定删除分支 "${this.historyManager.getBranch(branchId)?.name}" 吗？`)) {
          this.selectedForCompare.delete(branchId);
          this.historyManager.deleteBranch(branchId);
          this.updateBranchList();
          this.updateCompareInfo();
        }
        return;
      }

      if (checkbox) {
        e.stopPropagation();
        const branchId = item.dataset.id;
        if (checkbox.checked) {
          if (this.selectedForCompare.size >= 2) {
            checkbox.checked = false;
            this.showToast('最多选择2个分支进行对比');
            return;
          }
          this.selectedForCompare.add(branchId);
        } else {
          this.selectedForCompare.delete(branchId);
        }
        item.classList.toggle('selected-for-compare', checkbox.checked);
        this.updateCompareInfo();
        return;
      }

      const branchId = item.dataset.id;
      this.historyManager.switchBranch(branchId);
      this.updateBranchList();
    });
  }

  _bindSnapshotSettings() {
    const intervalInput = document.getElementById('snapshot-interval');
    const saveBtn = document.getElementById('save-snapshot-btn');
    if (intervalInput) {
      intervalInput.addEventListener('change', (e) => {
        const val = parseInt(e.target.value, 10);
        if (val >= 1 && val <= 100) {
          this.historyManager?.setAutoSnapshotInterval(val);
        }
      });
    }
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        this.historyManager?.saveSnapshot(true);
        this.showToast('快照已保存');
      });
    }
  }

  _bindCompareEvents() {
    const startBtn = document.getElementById('start-compare-btn');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        if (this.selectedForCompare.size !== 2) return;
        const ids = [...this.selectedForCompare];
        this.historyManager?.enterCompareMode(ids[0], ids[1]);
      });
    }

    const stepBtnA = document.getElementById('step-compare-a');
    const stepBtnB = document.getElementById('step-compare-b');
    if (stepBtnA) {
      stepBtnA.addEventListener('click', () => this._stepCompare(0));
    }
    if (stepBtnB) {
      stepBtnB.addEventListener('click', () => this._stepCompare(1));
    }

    eventBus.on('compare:entered', (data) => this.enterCompareModeUI(data));
    eventBus.on('compare:exited', () => this.exitCompareModeUI());
  }

  _stepCompare(index) {
    if (!this.historyManager) return;
    const branchId = this.historyManager.compareBranchIds[index];
    if (!branchId) return;
    const branch = this.historyManager.getBranch(branchId);
    if (!branch) return;

    const origBranchId = this.historyManager.currentBranchId;

    this.engine.stop();
    this.historyManager.currentBranchId = branchId;

    const latestSnap = branch.snapshots.length > 0
      ? branch.snapshots[branch.snapshots.length - 1]
      : null;

    if (latestSnap) {
      latestSnap.restoreTo(this.cellStore, this.colonyManager);
      this.engine.generation = latestSnap.generation;
    } else {
      this.cellStore.clear();
      this.engine.generation = branch.startGeneration;
    }

    if (branch.currentGeneration > this.engine.generation) {
      const stepsToCatchUp = branch.currentGeneration - this.engine.generation;
      this.historyManager.catchUpMode = true;
      for (let i = 0; i < stepsToCatchUp; i++) {
        const genBefore = this.engine.generation;
        this.engine.step();
        if (this.engine.generation === genBefore) break;
      }
      this.historyManager.catchUpMode = false;
    }

    const genBeforeStep = this.engine.generation;
    this.engine.step();
    const genAfterStep = this.engine.generation;

    branch.currentGeneration = this.engine.generation;

    this.historyManager.saveSnapshot(false);

    this.historyManager.currentBranchId = origBranchId;
    const origBranch = this.historyManager.getBranch(origBranchId);
    if (origBranch) {
      const origLatestSnap = origBranch.snapshots.length > 0
        ? origBranch.snapshots[origBranch.snapshots.length - 1]
        : null;
      if (origLatestSnap) {
        origLatestSnap.restoreTo(this.cellStore, this.colonyManager);
        this.engine.generation = origLatestSnap.generation;
      } else {
        this.cellStore.clear();
        this.engine.generation = origBranch.startGeneration;
      }
      if (origBranch.currentGeneration > this.engine.generation) {
        const stepsToCatchUp = origBranch.currentGeneration - this.engine.generation;
        this.historyManager.catchUpMode = true;
        for (let i = 0; i < stepsToCatchUp; i++) {
          const genBefore = this.engine.generation;
          this.engine.step();
          if (this.engine.generation === genBefore) break;
        }
        this.historyManager.catchUpMode = false;
      }
      origBranch.currentGeneration = this.engine.generation;
    }

    if (this.renderer && this.renderer.renderCompareFrame) {
      this.renderer.renderCompareFrame(index, branch);
    }

    eventBus.emit('timeline:changed', this.historyManager.getTimelineData());
  }

  enterCompareModeUI(data) {
    document.getElementById('canvases-wrapper')?.classList.add('compare-mode');
    const canvasB = document.getElementById('grid-canvas-b');
    canvasB?.classList.remove('hidden');
    document.getElementById('compare-label-a')?.classList.remove('hidden');
    document.getElementById('compare-label-b')?.classList.remove('hidden');
    document.getElementById('compare-controls-a')?.classList.remove('hidden');
    document.getElementById('compare-controls-b')?.classList.remove('hidden');

    const branchA = this.historyManager?.getBranch(data.branches[0]);
    const branchB = this.historyManager?.getBranch(data.branches[1]);
    if (branchA) document.getElementById('compare-label-a').textContent = branchA.name;
    if (branchB) document.getElementById('compare-label-b').textContent = branchB.name;

    document.getElementById('timeline-container')?.classList.add('hidden');
    document.getElementById('controls')?.classList.add('hidden');
    document.getElementById('status-bar')?.classList.add('hidden');

    this.showToast('进入对比模式，按 ESC 退出');

    if (this.renderer && this.renderer.enterCompareMode) {
      this.renderer.enterCompareMode(data.branches);
    }
  }

  exitCompareModeUI() {
    document.getElementById('canvases-wrapper')?.classList.remove('compare-mode');
    document.getElementById('grid-canvas-b')?.classList.add('hidden');
    document.getElementById('compare-label-a')?.classList.add('hidden');
    document.getElementById('compare-label-b')?.classList.add('hidden');
    document.getElementById('compare-controls-a')?.classList.add('hidden');
    document.getElementById('compare-controls-b')?.classList.add('hidden');
    document.getElementById('timeline-container')?.classList.remove('hidden');
    document.getElementById('controls')?.classList.remove('hidden');
    document.getElementById('status-bar')?.classList.remove('hidden');

    this.selectedForCompare.clear();
    this.updateBranchList();
    this.updateCompareInfo();

    if (this.renderer && this.renderer.exitCompareMode) {
      this.renderer.exitCompareMode();
    }

    eventBus.emit('state:updated');
    eventBus.emit('view:changed');
  }

  setRenderer(renderer) {
    this.renderer = renderer;
  }

  bindEventBus() {
    eventBus.on('colony:added', () => this.updateColonyList());
    eventBus.on('colony:removed', () => this.updateColonyList());
    eventBus.on('colony:updated', () => this.updateColonyList());
    eventBus.on('colony:selected', () => this.updateColonyList());
    eventBus.on('state:updated', () => {
      this.updateStatusBar();
      this.updateStatsPanel();
      this.updateColonyList();
    });
    eventBus.on('generation:changed', () => this.updateStatusBar());
    eventBus.on('view:changed', () => this.updateStatusBar());
    eventBus.on('status:update', () => this.updateStatusBar());
    eventBus.on('engine:runningChanged', (running) => {
      const btn = document.getElementById('toggle-run-btn');
      btn.textContent = running ? '暂停 (回车)' : '运行 (回车)';
      btn.classList.toggle('active', running);
    });
    eventBus.on('history:updated', (history) => this.updateChart(history));
    eventBus.on('colony:mutated', (data) => this.showMutationAlert(data));

    if (this.historyManager) {
      eventBus.on('timeline:changed', () => this.updateTimeline());
      eventBus.on('branch:switched', () => this.updateBranchList());
      eventBus.on('branch:created', () => this.updateBranchList());
      eventBus.on('branch:deleted', () => this.updateBranchList());
      eventBus.on('branches:changed', () => this.updateBranchList());
      eventBus.on('branch:forked', (info) => {
        this.showToast(`已创建新分支: ${this.historyManager.getBranch(info.to)?.name}`);
        this.updateBranchList();
      });
      eventBus.on('branches:limitReached', (limit) => {
        alert(`分支数量已达上限（${limit}个），请先删除旧分支`);
      });
      eventBus.on('snapshot:saved', () => {
        this.updateTimeline();
      });
    }
  }

  addRuleFromForm() {
    const name = document.getElementById('rule-name').value.trim();
    const color = document.getElementById('rule-color').value;
    const bs = document.getElementById('rule-bs').value.trim();
    const neighborhood = document.getElementById('rule-neighborhood').value;
    const priority = parseInt(document.getElementById('rule-priority').value, 10) || 0;
    const consumptionRate = parseInt(document.getElementById('rule-consumption').value, 10) || 1;
    const productionRate = parseInt(document.getElementById('rule-production').value, 10) || 0;
    const predationPower = parseInt(document.getElementById('rule-predation').value, 10) || 0;

    if (!bs) {
      alert('请输入B/S记法');
      return;
    }

    const { birth, survival } = Rule.parseBS(bs);
    const rule = new Rule({
      name: name || bs,
      color,
      birth,
      survival,
      neighborhood,
      priority,
      consumptionRate: Math.max(0, Math.min(10, consumptionRate)),
      productionRate: Math.max(0, Math.min(10, productionRate)),
      predationPower: Math.max(0, Math.min(10, predationPower))
    });
    const colony = new Colony(rule);
    this.colonyManager.addColony(colony);
    
    document.getElementById('rule-name').value = '';
    document.getElementById('rule-bs').value = '';
    document.getElementById('rule-consumption').value = '1';
    document.getElementById('rule-production').value = '0';
    document.getElementById('rule-predation').value = '0';
  }

  addQuickRule(str) {
    if (!str.trim()) return;
    const rule = Rule.fromString(str);
    rule.color = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    const colony = new Colony(rule);
    this.colonyManager.addColony(colony);
  }

  importRLE(rleText) {
    if (!rleText.trim()) {
      alert('请粘贴RLE格式的图案');
      return;
    }
    try {
      const result = parseRLE(rleText);
      if (result.cells.length === 0) {
        alert('未解析到任何细胞');
        return;
      }
      const center = this.viewState.getCenterWorld();
      const offsetX = center.x - Math.floor(result.width / 2);
      const offsetY = center.y - Math.floor(result.height / 2);
      this.patternManager.placeCells(result.cells, offsetX, offsetY);
      document.getElementById('rle-input').value = '';
      alert(`成功导入 ${result.cells.length} 个细胞`);
    } catch (e) {
      alert('RLE解析失败: ' + e.message);
    }
  }

  exportJSON() {
    const data = {
      version: 1,
      engine: this.engine.toJSON(),
      colonies: this.colonyManager.toJSON(),
      cells: this.cellStore.toJSON(),
      resources: this.resourceField ? this.resourceField.toJSON() : null
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cellular-automata-gen${this.engine.generation}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  importJSON(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        this.engine.stop();
        this.colonyManager.clear();
        this.cellStore.clear();
        if (this.resourceField) {
          this.resourceField.clear();
        }
        
        this.engine.loadFromJSON(data.engine || {});
        
        for (const colonyData of data.colonies || []) {
          const colony = Colony.fromJSON(colonyData);
          this.colonyManager.addColony(colony);
        }
        
        for (const cell of data.cells || []) {
          this.cellStore.set(cell.x, cell.y, cell.c);
        }
        
        if (this.resourceField && data.resources) {
          const restored = ResourceField.fromJSON(data.resources);
          this.resourceField.copyFrom(restored);
        }
        
        document.getElementById('collision-strategy').value = this.engine.collisionStrategy;
        document.getElementById('speed-slider').value = this.engine.speed;
        document.getElementById('speed-value').textContent = 
          this.engine.speed === 100 ? '尽可能快' : `${this.engine.speed}代/秒`;
        
        this.updateAll();
        eventBus.emit('state:updated');
        eventBus.emit('generation:changed', this.engine.generation);
        alert('导入成功');
      } catch (err) {
        alert('导入失败: ' + err.message);
        console.error(err);
      }
    };
    reader.readAsText(file);
  }

  updateColonyList() {
    const container = document.getElementById('colony-list');
    const colonies = this.colonyManager.getAll();

    if (colonies.length === 0) {
      container.innerHTML = '<div class="empty-hint">暂无群落</div>';
      return;
    }

    container.innerHTML = colonies.map(colony => {
      const selected = this.colonyManager.selectedColonyId === colony.id;
      const bs = colony.rule.toBSString();
      const nh = colony.rule.neighborhood === 'vonneumann' ? 'VN' : 'Moore';
      const cons = colony.rule.consumptionRate;
      const prod = colony.rule.productionRate;
      const pred = colony.rule.predationPower;
      const hasMutations = colony.mutationHistory && colony.mutationHistory.length > 0;
      return `
        <div class="colony-item ${selected ? 'selected' : ''} ${colony.paused ? 'paused' : ''}" 
             data-id="${colony.id}" style="border-left-color: ${colony.color}">
          <div class="colony-header">
            <div class="colony-name" title="${hasMutations ? '点击查看突变历史' : ''}">
              <span class="colony-color" style="background: ${colony.color}"></span>
              <span class="colony-name-text">${this.escapeHtml(colony.name)}</span>
              ${hasMutations ? '<span class="mutation-badge" title="有突变历史">⚡</span>' : ''}
            </div>
            <div class="colony-actions">
              <button class="pause-btn" data-id="${colony.id}">${colony.paused ? '▶' : '⏸'}</button>
              <button class="delete-btn" data-id="${colony.id}">✕</button>
            </div>
          </div>
          <div class="colony-meta">
            ${bs} | ${nh} | 优先级: ${colony.rule.priority}
          </div>
          <div class="colony-eco-meta">
            消耗: ${cons} | 产出: ${prod} | 掠食: ${pred} | 细胞: ${this.cellStore.countByColony(colony.id)}
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.colony-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('pause-btn') || e.target.classList.contains('delete-btn')) return;
        if (e.target.closest('.colony-name-text') || e.target.closest('.mutation-badge')) {
          const colonyId = el.dataset.id;
          this.showMutationHistory(colonyId);
          return;
        }
        this.colonyManager.selectColony(el.dataset.id);
      });
    });

    container.querySelectorAll('.pause-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const colony = this.colonyManager.getColony(btn.dataset.id);
        if (colony) colony.togglePause();
      });
    });

    container.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('确定删除此群落？该群落的细胞也会被清除。')) {
          const id = btn.dataset.id;
          const cellsToDelete = this.cellStore.getCellsByColony(id);
          for (const cell of cellsToDelete) {
            this.cellStore.delete(cell.x, cell.y);
          }
          this.colonyManager.removeColony(id);
          eventBus.emit('state:updated');
        }
      });
    });
  }

  updateStatusBar() {
    document.getElementById('zoom-info').textContent = `缩放: ${this.viewState.zoom.toFixed(1)}x`;
    const center = this.viewState.getCenterWorld();
    document.getElementById('center-info').textContent = `中心: (${center.x}, ${center.y})`;
    document.getElementById('cell-count').textContent = `活细胞: ${this.cellStore.size()}`;
    document.getElementById('generation-info').textContent = `代数: ${this.engine.generation}`;
  }

  updateStatsPanel() {
    this.updateEcoSummary();
    this.updateFoodChain();
    
    const container = document.getElementById('stats-list');
    const colonies = this.colonyManager.getAll();

    if (colonies.length === 0) {
      container.innerHTML = '<div class="empty-hint">暂无群落</div>';
      return;
    }

    container.innerHTML = colonies.map(colony => {
      const count = this.cellStore.countByColony(colony.id);
      const growth = colony.getGrowthRate();
      const avgGrowth = colony.getAverageGrowthRate(100);
      let growthClass = 'zero';
      let growthText = '0.00%';
      if (growth > 0.01) {
        growthClass = 'positive';
        growthText = `+${growth.toFixed(2)}%`;
      } else if (growth < -0.01) {
        growthClass = 'negative';
        growthText = `${growth.toFixed(2)}%`;
      }
      const avgGrowthClass = avgGrowth < -5 ? 'warning' : 'normal';
      return `
        <div class="stat-item" style="border-left-color: ${colony.color}">
          <div class="stat-row">
            <div class="stat-name">
              <span class="stat-color" style="background: ${colony.color}"></span>
              <span>${this.escapeHtml(colony.name)}</span>
              ${colony.paused ? '<span style="color:#888;font-size:10px">[暂停]</span>' : ''}
            </div>
            <span class="stat-count">${count}</span>
          </div>
          <div class="stat-row">
            <span style="color:#888;font-size:10px">增长率</span>
            <span class="stat-growth ${growthClass}">${growthText}</span>
          </div>
          <div class="stat-row">
            <span style="color:#888;font-size:10px">平均(100代)</span>
            <span class="stat-growth ${avgGrowthClass}">${avgGrowth.toFixed(2)}%</span>
          </div>
        </div>
      `;
    }).join('');
  }

  updateEcoSummary() {
    const totalEl = document.getElementById('eco-total-resources');
    const rateEl = document.getElementById('eco-resource-rate');
    
    if (this.resourceField) {
      const total = this.resourceField.getTotalResources();
      totalEl.textContent = total.toLocaleString();
      
      const netChange = this.engine.resourceNetChange || 0;
      let rateText = `${netChange >= 0 ? '+' : ''}${netChange}/代`;
      if (netChange > 0) {
        rateEl.className = 'eco-value positive';
      } else if (netChange < 0) {
        rateEl.className = 'eco-value negative';
      } else {
        rateEl.className = 'eco-value';
      }
      rateEl.textContent = rateText;
    } else {
      totalEl.textContent = 'N/A';
      rateEl.textContent = 'N/A';
    }
  }

  updateFoodChain() {
    const container = document.getElementById('food-chain');
    const colonies = this.colonyManager.getAll();
    
    if (colonies.length < 2) {
      container.innerHTML = '<div class="empty-hint" style="padding:8px">至少需要2个群落才能显示食物链</div>';
      return;
    }

    const predators = colonies.filter(c => c.rule.predationPower > 0);
    if (predators.length === 0) {
      container.innerHTML = '<div class="empty-hint" style="padding:8px">当前没有掠食者群落</div>';
      return;
    }

    const relations = [];
    for (const predator of colonies) {
      if (predator.rule.predationPower === 0) continue;
      for (const prey of colonies) {
        if (predator.id === prey.id) continue;
        if (predator.rule.predationPower > prey.rule.predationPower) {
          relations.push({
            predator,
            prey,
            powerDiff: predator.rule.predationPower - prey.rule.predationPower
          });
        }
      }
    }

    if (relations.length === 0) {
      container.innerHTML = '<div class="empty-hint" style="padding:8px">暂无掠食关系</div>';
      return;
    }

    container.innerHTML = relations.map(r => `
      <div class="food-chain-item">
        <span class="predator" style="color: ${r.predator.color}">${this.escapeHtml(r.predator.name)}</span>
        <span class="predation-arrow">${'▶'.repeat(Math.min(3, r.powerDiff))}</span>
        <span class="prey" style="color: ${r.prey.color}">${this.escapeHtml(r.prey.name)}</span>
      </div>
    `).join('');
  }

  toggleResourceHeatmap() {
    if (!this.resourceField) return;
    const enabled = this.resourceField.toggleHeatmap();
    const btn = document.getElementById('toggle-heatmap-btn');
    if (btn) {
      btn.textContent = enabled ? '关闭 (R)' : '开启 (R)';
      btn.classList.toggle('active', enabled);
    }
    this.showToast(enabled ? '资源热力图已开启' : '资源热力图已关闭');
    this.renderer?.render?.();
  }

  showMutationAlert(data) {
    const popup = document.getElementById('mutation-popup');
    if (!popup) return;

    popup.innerHTML = `
      <div class="mutation-alert">
        <span class="mutation-icon">⚡</span>
        <span class="mutation-text">
          <strong>${this.escapeHtml(data.colonyName)}</strong> 发生突变:
          <code>${data.oldBS}</code> → <code>${data.newBS}</code>
        </span>
        <span class="mutation-gen">第 ${data.generation} 代</span>
      </div>
    `;
    popup.classList.remove('hidden');
    popup.classList.add('blinking');

    setTimeout(() => {
      popup.classList.remove('blinking');
      setTimeout(() => {
        popup.classList.add('hidden');
      }, 3000);
    }, 2000);
  }

  showMutationHistory(colonyId) {
    const colony = this.colonyManager.getColony(colonyId);
    if (!colony) return;

    const modal = document.getElementById('mutation-history-modal');
    const title = document.getElementById('mutation-history-title');
    const list = document.getElementById('mutation-history-list');
    
    if (!modal || !title || !list) return;

    title.textContent = `${colony.name} - 突变历史`;

    if (!colony.mutationHistory || colony.mutationHistory.length === 0) {
      list.innerHTML = '<div class="empty-hint" style="padding:20px">该群落暂无突变记录</div>';
    } else {
      list.innerHTML = colony.mutationHistory.map((m, i) => `
        <div class="mutation-history-item">
          <div class="mutation-history-gen">第 ${m.generation} 代</div>
          <div class="mutation-history-rule">
            <code>${m.oldBS}</code>
            <span class="mutation-arrow">→</span>
            <code>${m.newBS}</code>
          </div>
          <div class="mutation-history-time">${new Date(m.timestamp).toLocaleString()}</div>
        </div>
      `).reverse().join('');
    }

    modal.classList.remove('hidden');
  }

  hideMutationHistoryModal() {
    const modal = document.getElementById('mutation-history-modal');
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  updateChart(history) {
    const canvas = document.getElementById('chart-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = 200 * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const w = rect.width;
    const h = 200;
    const padding = 8;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, w, h);

    if (history.length < 2) {
      ctx.fillStyle = '#666';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('等待更多数据...', w / 2, h / 2);
      return;
    }

    const colonies = this.colonyManager.getAll();
    if (colonies.length === 0) return;

    let maxCount = 1;
    let maxResources = 1;
    let hasResources = false;
    
    for (const point of history) {
      for (const count of Object.values(point.snapshot)) {
        maxCount = Math.max(maxCount, count);
      }
      if (point.totalResources !== undefined) {
        maxResources = Math.max(maxResources, point.totalResources);
        hasResources = true;
      }
    }

    const chartW = w - padding * 2;
    const chartH = h - padding * 2;

    ctx.strokeStyle = 'rgba(80, 100, 140, 0.3)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(w - padding, y);
      ctx.stroke();
    }

    for (const colony of colonies) {
      ctx.strokeStyle = colony.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      let started = false;
      for (let i = 0; i < history.length; i++) {
        const point = history[i];
        const count = point.snapshot[colony.id] || 0;
        const x = padding + (i / (history.length - 1)) * chartW;
        const y = padding + chartH - (count / maxCount) * chartH;

        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }

    if (hasResources && this.resourceField) {
      ctx.strokeStyle = '#888888';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();

      let started = false;
      for (let i = 0; i < history.length; i++) {
        const point = history[i];
        if (point.totalResources !== undefined) {
          const x = padding + (i / (history.length - 1)) * chartW;
          const y = padding + chartH - (point.totalResources / maxResources) * chartH;

          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#888888';
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';
      ctx.fillText('资源', w - padding, padding + 8);
    }

    ctx.fillStyle = '#888';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(maxCount.toString(), 2, padding + 8);
    ctx.fillText('0', 2, h - padding);
  }

  updateBranchList() {
    if (!this.historyManager) return;
    const container = document.getElementById('branch-list');
    if (!container) return;

    const branches = this.historyManager.getAllBranches();
    const currentBranch = this.historyManager.getCurrentBranch();

    const compareSection = document.getElementById('branch-compare-section');
    if (compareSection) {
      compareSection.style.display = branches.length >= 2 ? 'block' : 'none';
    }

    if (branches.length === 0) {
      container.innerHTML = '<div class="empty-hint">暂无分支</div>';
      return;
    }

    container.innerHTML = branches.map(branch => {
      const active = currentBranch && currentBranch.id === branch.id;
      const isMain = branch.id === 'branch_main';
      const selected = this.selectedForCompare.has(branch.id);
      const snapshotCount = branch.snapshots.length;
      return `
        <div class="branch-item ${isMain ? 'main' : ''} ${active ? 'active' : ''} ${selected ? 'selected-for-compare' : ''}" 
             data-id="${branch.id}">
          <div class="branch-header">
            <div class="branch-name">
              <span class="branch-badge">${isMain ? '主线' : '分支'}</span>
              <span>${this.escapeHtml(branch.name)}</span>
            </div>
            <div class="branch-actions">
              ${!isMain ? `<button class="branch-delete-btn" data-id="${branch.id}" title="删除分支">✕</button>` : ''}
            </div>
          </div>
          <div class="branch-meta">
            起始代: ${branch.startGeneration} | 当前: ${branch.getLatestGeneration()} | 快照: ${snapshotCount}
          </div>
          <div class="branch-compare-checkbox">
            <label style="display:flex;align-items:center;gap:4px;cursor:pointer;width:100%;">
              <input type="checkbox" ${selected ? 'checked' : ''} ${isMain && branches.length < 3 ? '' : ''}>
              <span>加入对比</span>
            </label>
          </div>
        </div>
      `;
    }).join('');
  }

  updateCompareInfo() {
    const info = document.getElementById('branch-compare-info');
    const btn = document.getElementById('start-compare-btn');
    if (info) {
      info.textContent = `已选择 ${this.selectedForCompare.size}/2 个分支`;
    }
    if (btn) {
      btn.disabled = this.selectedForCompare.size !== 2;
    }
  }

  updateTimeline() {
    if (!this.historyManager) return;
    const data = this.historyManager.getTimelineData();
    if (!data) return;

    const { branchName, currentGeneration, maxGeneration, minGeneration, snapshotGenerations, isBrowsing } = data;

    document.getElementById('timeline-branch-name').textContent = branchName;
    document.getElementById('timeline-range').textContent = `代 ${minGeneration} - ${maxGeneration}`;
    document.getElementById('timeline-current').textContent = `当前: ${currentGeneration}${isBrowsing ? ' (历史)' : ''}`;

    const track = document.getElementById('timeline-track');
    if (!track) return;
    const trackWidth = track.clientWidth || track.offsetWidth || 1;
    const range = Math.max(1, maxGeneration - minGeneration);
    const genToX = (gen) => ((gen - minGeneration) / range) * 100;

    const ticksContainer = document.getElementById('timeline-ticks');
    const snapshotsContainer = document.getElementById('timeline-snapshots');
    const indicator = document.getElementById('timeline-indicator');
    const slider = document.getElementById('timeline-slider');

    const interval = Math.max(1, this.historyManager.autoSnapshotInterval);
    let html = '';
    const majorStep = interval * 5;
    const startTick = Math.ceil(minGeneration / majorStep) * majorStep;
    for (let gen = startTick; gen <= maxGeneration; gen += majorStep) {
      const x = genToX(gen);
      if (x < 0 || x > 100) continue;
      html += `<div class="timeline-tick major" style="left:${x}%"><div class="timeline-tick-label">${gen}</div></div>`;
    }
    const minorStart = Math.ceil(minGeneration / interval) * interval;
    for (let gen = minorStart; gen <= maxGeneration; gen += interval) {
      if (gen % majorStep === 0) continue;
      const x = genToX(gen);
      if (x < 0 || x > 100) continue;
      html += `<div class="timeline-tick" style="left:${x}%"></div>`;
    }
    ticksContainer.innerHTML = html;

    let snapsHtml = '';
    for (const gen of snapshotGenerations) {
      const x = genToX(gen);
      if (x < 0 || x > 100) continue;
      snapsHtml += `<div class="timeline-snapshot-dot" style="left:${x}%" title="第 ${gen} 代"></div>`;
    }
    snapshotsContainer.innerHTML = snapsHtml;

    const indicatorX = genToX(Math.max(minGeneration, Math.min(maxGeneration, currentGeneration)));
    indicator.style.left = `${indicatorX}%`;
    indicator.style.background = isBrowsing ? '#ffb74d' : '#e94560';

    slider.style.left = `${indicatorX}%`;
    slider.style.display = snapshotGenerations.length > 0 ? 'block' : 'none';
  }

  showToast(message) {
    let toast = document.getElementById('app-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'app-toast';
      toast.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(233, 69, 96, 0.95);
        color: #fff;
        padding: 10px 20px;
        border-radius: 6px;
        font-size: 13px;
        z-index: 10000;
        opacity: 0;
        transition: opacity 0.3s;
        pointer-events: none;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      `;
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = '1';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.style.opacity = '0';
    }, 1800);
  }

  updateAll() {
    this.updateColonyList();
    this.updateStatusBar();
    this.updateStatsPanel();
    if (this.historyManager) {
      this.updateBranchList();
      this.updateTimeline();
      this.updateCompareInfo();
    }
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
