import { eventBus } from '../core/EventBus.js';
import { Rule } from '../core/Rule.js';
import { transformCells, normalizeCoordinates, evolveStructure } from '../patterns/StructureUtils.js';

const THUMBNAIL_SIZE = 80;

export class BlueprintUI {
  constructor(blueprintManager, blueprintPlacer, containerId, colonyManager, cellStore, viewState) {
    this.blueprintManager = blueprintManager;
    this.blueprintPlacer = blueprintPlacer;
    this.container = document.getElementById(containerId);
    this.colonyManager = colonyManager;
    this.cellStore = cellStore;
    this.viewState = viewState;
    
    this.searchQuery = '';
    this.sortBy = 'createdAt';
    this.selectedBlueprintId = null;
    this.contextMenu = null;
    
    this.init();
    this.bindEvents();
    this.render();
  }

  init() {
    if (!this.container) return;
    
    this.container.innerHTML = `
      <div class="blueprint-panel">
        <div class="panel-header">
          <h3>📐 蓝图库</h3>
          <div class="header-actions">
            <button class="small-btn" id="bp-export-all-btn" title="导出全部">📤 导出</button>
            <button class="small-btn" id="bp-import-btn" title="导入">📥 导入</button>
            <input type="file" id="bp-import-file" accept=".json" style="display:none">
          </div>
        </div>
        
        <div class="panel-section">
          <div class="bp-toolbar">
            <input type="text" id="bp-search-input" placeholder="🔍 搜索名称或标签..." class="bp-search">
            <select id="bp-sort-select" class="bp-sort">
              <option value="createdAt">按创建时间</option>
              <option value="name">按名称</option>
              <option value="cellCount">按细胞数</option>
            </select>
          </div>
        </div>
        
        <div class="panel-section bp-grid-section">
          <div id="bp-grid" class="bp-grid"></div>
          <div id="bp-empty" class="bp-empty hidden">
            <div class="empty-icon">📐</div>
            <div class="empty-text">暂无蓝图</div>
            <div class="empty-hint">按住 Shift + 鼠标拖拽框选画布区域保存蓝图</div>
          </div>
        </div>
        
        <div class="panel-section">
          <button class="primary-btn full-width" id="bp-combinator-btn">
            🧩 打开组合器
          </button>
        </div>
      </div>
    `;
    
    this.gridEl = this.container.querySelector('#bp-grid');
    this.emptyEl = this.container.querySelector('#bp-empty');
    this.searchInput = this.container.querySelector('#bp-search-input');
    this.sortSelect = this.container.querySelector('#bp-sort-select');
  }

  bindEvents() {
    if (!this.container) return;
    
    this.searchInput.addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      this.render();
    });
    
    this.sortSelect.addEventListener('change', (e) => {
      this.sortBy = e.target.value;
      this.render();
    });
    
    this.container.querySelector('#bp-export-all-btn').addEventListener('click', () => {
      this.exportAll();
    });
    
    this.container.querySelector('#bp-import-btn').addEventListener('click', () => {
      this.container.querySelector('#bp-import-file').click();
    });
    
    this.container.querySelector('#bp-import-file').addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.importFromFile(e.target.files[0]);
      }
      e.target.value = '';
    });
    
    this.container.querySelector('#bp-combinator-btn').addEventListener('click', () => {
      this.openCombinator();
    });
    
    eventBus.on('blueprints:updated', () => {
      this.render();
    });
    
    document.addEventListener('click', () => {
      this.hideContextMenu();
    });
    
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        this.hideContextMenu();
      }
    });
  }

  render() {
    if (!this.container) return;
    
    const blueprints = this.blueprintManager.getAll({
      search: this.searchQuery,
      sortBy: this.sortBy
    });
    
    if (blueprints.length === 0) {
      this.gridEl.classList.add('hidden');
      this.emptyEl.classList.remove('hidden');
      return;
    }
    
    this.gridEl.classList.remove('hidden');
    this.emptyEl.classList.add('hidden');
    
    this.gridEl.innerHTML = blueprints.map(bp => this._renderCard(bp)).join('');
    
    this.gridEl.querySelectorAll('.bp-card').forEach(card => {
      const id = card.dataset.id;
      
      card.querySelector('.bp-place-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        this.placeBlueprint(id);
      });
      
      card.querySelector('.bp-preview-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        this.openPreview(id);
      });
      
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showContextMenu(e, id);
      });
    });
  }

  _renderCard(bp) {
    const thumbnail = this._createThumbnail(bp);
    const tagsHtml = bp.tags.slice(0, 3).map(t => 
      `<span class="bp-tag">${this._escapeHtml(t)}</span>`
    ).join('');
    
    const moreTags = bp.tags.length > 3 ? `<span class="bp-tag-more">+${bp.tags.length - 3}</span>` : '';
    
    const hasBoundRule = bp.boundRule ? '🔗' : '';
    const ruleColor = bp.boundRule ? bp.boundRule.color : '#888';
    
    return `
      <div class="bp-card" data-id="${bp.id}">
        <div class="bp-thumbnail">
          <img src="${thumbnail}" alt="${this._escapeHtml(bp.name)}">
          ${hasBoundRule ? `<span class="bp-bound-rule-badge" style="background:${ruleColor}" title="已绑定规则">🔗</span>` : ''}
        </div>
        <div class="bp-info">
          <div class="bp-name" title="${this._escapeHtml(bp.name)}">${this._escapeHtml(bp.name)}</div>
          <div class="bp-meta">
            <span>🧬 ${bp.cellCount} 细胞</span>
            <span>📏 ${bp.width}×${bp.height}</span>
          </div>
          <div class="bp-tags">
            ${tagsHtml}
            ${moreTags}
          </div>
        </div>
        <div class="bp-actions">
          <button class="bp-btn bp-place-btn" title="放置蓝图">📍 放置</button>
          <button class="bp-btn bp-preview-btn" title="预览演化">▶️ 预览</button>
        </div>
      </div>
    `;
  }

  _createThumbnail(bp) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = THUMBNAIL_SIZE;
    canvas.height = THUMBNAIL_SIZE;
    
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, THUMBNAIL_SIZE, THUMBNAIL_SIZE);
    
    if (!bp.cells || bp.cells.length === 0) {
      return canvas.toDataURL();
    }
    
    const maxDim = Math.max(bp.width, bp.height);
    const cellSize = Math.max(2, Math.floor((THUMBNAIL_SIZE - 8) / maxDim));
    const drawWidth = bp.width * cellSize;
    const drawHeight = bp.height * cellSize;
    const offsetX = (THUMBNAIL_SIZE - drawWidth) / 2;
    const offsetY = (THUMBNAIL_SIZE - drawHeight) / 2;
    
    const color = bp.boundRule ? bp.boundRule.color : '#4fc3f7';
    ctx.fillStyle = color;
    
    for (const [x, y] of bp.cells) {
      ctx.fillRect(
        Math.floor(offsetX + x * cellSize),
        Math.floor(offsetY + y * cellSize),
        Math.max(1, cellSize - 1),
        Math.max(1, cellSize - 1)
      );
    }
    
    return canvas.toDataURL();
  }

  placeBlueprint(id) {
    this.blueprintPlacer.startPlacing(id);
    
    if (window.__app && window.__app.uiManager) {
      window.__app.uiManager.showToast('点击画布放置蓝图，R键旋转，F键翻转，ESC取消');
    }
  }

  showContextMenu(e, blueprintId) {
    this.hideContextMenu();
    this.selectedBlueprintId = blueprintId;
    
    const bp = this.blueprintManager.getBlueprint(blueprintId);
    if (!bp) return;
    
    const menu = document.createElement('div');
    menu.className = 'bp-context-menu';
    menu.innerHTML = `
      <div class="ctx-item" data-action="rename">✏️ 重命名</div>
      <div class="ctx-item" data-action="edit-tags">🏷️ 编辑标签</div>
      <div class="ctx-item" data-action="duplicate">📋 复制</div>
      <div class="ctx-item" data-action="export">📤 导出JSON</div>
      <div class="ctx-divider"></div>
      <div class="ctx-item danger" data-action="delete">🗑️ 删除</div>
    `;
    
    document.body.appendChild(menu);
    
    const rect = e.target.getBoundingClientRect ? e.target.getBoundingClientRect() : { left: e.clientX, top: e.clientY };
    const menuX = Math.min(e.clientX, window.innerWidth - 180);
    const menuY = Math.min(e.clientY, window.innerHeight - menu.offsetHeight);
    
    menu.style.left = menuX + 'px';
    menu.style.top = menuY + 'px';
    
    menu.querySelectorAll('.ctx-item').forEach(item => {
      item.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const action = item.dataset.action;
        this._handleContextAction(action, blueprintId);
        this.hideContextMenu();
      });
    });
    
    this.contextMenu = menu;
  }

  hideContextMenu() {
    if (this.contextMenu) {
      this.contextMenu.remove();
      this.contextMenu = null;
    }
    this.selectedBlueprintId = null;
  }

  _handleContextAction(action, blueprintId) {
    const bp = this.blueprintManager.getBlueprint(blueprintId);
    if (!bp) return;
    
    switch (action) {
      case 'rename':
        this._renameBlueprint(blueprintId);
        break;
      case 'edit-tags':
        this._editTags(blueprintId);
        break;
      case 'duplicate':
        this.blueprintManager.duplicateBlueprint(blueprintId);
        if (window.__app?.uiManager) {
          window.__app.uiManager.showToast('蓝图已复制');
        }
        break;
      case 'export':
        this._exportSingle(blueprintId);
        break;
      case 'delete':
        if (confirm(`确定删除蓝图 "${bp.name}" 吗？`)) {
          this.blueprintManager.deleteBlueprint(blueprintId);
          if (window.__app?.uiManager) {
            window.__app.uiManager.showToast('蓝图已删除');
          }
        }
        break;
    }
  }

  _renameBlueprint(id) {
    const bp = this.blueprintManager.getBlueprint(id);
    if (!bp) return;
    
    const newName = prompt('输入新名称:', bp.name);
    if (newName !== null && newName.trim()) {
      this.blueprintManager.updateBlueprint(id, { name: newName.trim() });
    }
  }

  _editTags(id) {
    const bp = this.blueprintManager.getBlueprint(id);
    if (!bp) return;
    
    const tagsStr = prompt('编辑标签（逗号分隔）:', bp.tags.join(', '));
    if (tagsStr !== null) {
      const tags = tagsStr.split(',').map(t => t.trim()).filter(t => t);
      this.blueprintManager.updateBlueprint(id, { tags });
    }
  }

  _exportSingle(id) {
    const json = this.blueprintManager.exportBlueprint(id);
    const bp = this.blueprintManager.getBlueprint(id);
    if (!json || !bp) return;
    
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `blueprint-${bp.name.replace(/\s+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  exportAll() {
    const json = this.blueprintManager.exportAll();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `blueprints-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    if (window.__app?.uiManager) {
      window.__app.uiManager.showToast('蓝图库已导出');
    }
  }

  importFromFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = this.blueprintManager.importFromJSON(e.target.result);
      if (result.success) {
        if (window.__app?.uiManager) {
          window.__app.uiManager.showToast(`成功导入 ${result.mergedCount} 个蓝图`);
        }
      } else {
        alert('导入失败: ' + result.error);
      }
    };
    reader.readAsText(file);
  }

  openPreview(blueprintId) {
    const bp = this.blueprintManager.getBlueprint(blueprintId);
    if (!bp) return;
    
    const modal = document.createElement('div');
    modal.className = 'modal bp-preview-modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <span>🔬 蓝图演化预览 - ${this._escapeHtml(bp.name)}</span>
          <button class="close-btn">&times;</button>
        </div>
        <div class="modal-body">
          <div class="bp-preview-canvas-wrapper">
            <canvas id="bp-preview-canvas" width="200" height="200"></canvas>
            <div class="bp-preview-gen">第 <span id="bp-preview-gen-num">0</span> 代</div>
          </div>
          <div class="bp-preview-stats">
            <div class="stat-item">
              <span class="stat-label">最终存活</span>
              <span class="stat-value" id="bp-stat-final">-</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">是否周期</span>
              <span class="stat-value" id="bp-stat-cycle">-</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">峰值细胞</span>
              <span class="stat-value" id="bp-stat-peak">-</span>
            </div>
          </div>
          <div class="bp-preview-controls">
            <button class="small-btn" id="bp-preview-play">▶️ 播放</button>
            <button class="small-btn" id="bp-preview-reset">🔄 重置</button>
            <button class="small-btn" id="bp-preview-fast">⏩ 快进到200代</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    const closeModal = () => {
      if (previewInterval) {
        clearInterval(previewInterval);
        previewInterval = null;
      }
      modal.remove();
    };
    
    modal.querySelector('.close-btn').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
    
    const canvas = modal.querySelector('#bp-preview-canvas');
    const ctx = canvas.getContext('2d');
    const gridSize = 100;
    const cellSize = 2;
    
    let cells = [...bp.cells];
    let generation = 0;
    let isPlaying = false;
    let previewInterval = null;
    let peakCount = cells.length;
    let seenStates = new Set();
    let hasCycle = false;
    
    const rule = bp.boundRule ? {
      birth: new Set(bp.boundRule.birth),
      survival: new Set(bp.boundRule.survival)
    } : {
      birth: new Set([3]),
      survival: new Set([2, 3])
    };
    
    const centerX = Math.floor(gridSize / 2) - Math.floor(bp.width / 2);
    const centerY = Math.floor(gridSize / 2) - Math.floor(bp.height / 2);
    
    let currentCells = cells.map(([x, y]) => [x + centerX, y + centerY]);
    
    const render = () => {
      ctx.fillStyle = '#0a0a14';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      const color = bp.boundRule ? bp.boundRule.color : '#4fc3f7';
      ctx.fillStyle = color;
      
      for (const [x, y] of currentCells) {
        if (x >= 0 && x < gridSize && y >= 0 && y < gridSize) {
          ctx.fillRect(x * cellSize, y * cellSize, cellSize - 1, cellSize - 1);
        }
      }
      
      modal.querySelector('#bp-preview-gen-num').textContent = generation;
    };
    
    const step = () => {
      const evolved = evolveStructure(currentCells, rule);
      currentCells = evolved.filter(([x, y]) => x >= 0 && x < gridSize && y >= 0 && y < gridSize);
      generation++;
      
      if (currentCells.length > peakCount) {
        peakCount = currentCells.length;
        modal.querySelector('#bp-stat-peak').textContent = peakCount;
      }
      
      const stateKey = currentCells.map(c => c.join(',')).sort().join('|');
      if (seenStates.has(stateKey)) {
        hasCycle = true;
        modal.querySelector('#bp-stat-cycle').textContent = '是';
        modal.querySelector('#bp-stat-cycle').style.color = '#4caf50';
      }
      seenStates.add(stateKey);
      
      if (currentCells.length === 0) {
        stopPlay();
      }
      
      render();
    };
    
    const startPlay = () => {
      if (isPlaying) return;
      isPlaying = true;
      modal.querySelector('#bp-preview-play').textContent = '⏸️ 暂停';
      
      previewInterval = setInterval(step, 50);
    };
    
    const stopPlay = () => {
      isPlaying = false;
      if (previewInterval) {
        clearInterval(previewInterval);
        previewInterval = null;
      }
      modal.querySelector('#bp-preview-play').textContent = '▶️ 播放';
    };
    
    const reset = () => {
      stopPlay();
      currentCells = cells.map(([x, y]) => [x + centerX, y + centerY]);
      generation = 0;
      peakCount = currentCells.length;
      seenStates = new Set();
      hasCycle = false;
      modal.querySelector('#bp-stat-final').textContent = '-';
      modal.querySelector('#bp-stat-cycle').textContent = '-';
      modal.querySelector('#bp-stat-cycle').style.color = '';
      modal.querySelector('#bp-stat-peak').textContent = peakCount;
      render();
    };
    
    const fastForward = () => {
      stopPlay();
      for (let i = 0; i < 200; i++) {
        const evolved = evolveStructure(currentCells, rule);
        currentCells = evolved.filter(([x, y]) => x >= 0 && x < gridSize && y >= 0 && y < gridSize);
        generation++;
        
        if (currentCells.length > peakCount) {
          peakCount = currentCells.length;
        }
        
        const stateKey = currentCells.map(c => c.join(',')).sort().join('|');
        if (seenStates.has(stateKey)) {
          hasCycle = true;
        }
        seenStates.add(stateKey);
        
        if (currentCells.length === 0) break;
      }
      
      modal.querySelector('#bp-stat-final').textContent = currentCells.length;
      modal.querySelector('#bp-stat-peak').textContent = peakCount;
      modal.querySelector('#bp-stat-cycle').textContent = hasCycle ? '是' : '否';
      modal.querySelector('#bp-stat-cycle').style.color = hasCycle ? '#4caf50' : '#ff9800';
      render();
    };
    
    modal.querySelector('#bp-preview-play').addEventListener('click', () => {
      if (isPlaying) {
        stopPlay();
      } else {
        startPlay();
      }
    });
    
    modal.querySelector('#bp-preview-reset').addEventListener('click', reset);
    modal.querySelector('#bp-preview-fast').addEventListener('click', fastForward);
    
    reset();
  }

  openCombinator() {
    const modal = document.createElement('div');
    modal.className = 'modal bp-combinator-modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <span>🧩 蓝图组合器</span>
          <button class="close-btn">&times;</button>
        </div>
        <div class="modal-body bp-combinator-body">
          <div class="bp-combinator-left">
            <div class="section-title">可用蓝图</div>
            <div class="bp-combinator-list" id="bp-combinator-list"></div>
            <div class="bp-combinator-hint">拖拽蓝图到右侧画布</div>
          </div>
          <div class="bp-combinator-right">
            <div class="section-title">组合画布 (200×200)</div>
            <div class="bp-combinator-canvas-wrapper">
              <canvas id="bp-combinator-canvas" width="200" height="200"></canvas>
              <div class="bp-combinator-count">
                已放置 <span id="bp-comb-instance-count">0</span>/8
              </div>
            </div>
            <div class="bp-combinator-controls">
              <div class="hint">方向键微调位置，Delete删除选中，最多8个实例</div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <div class="bp-combinator-name-row">
            <label>复合蓝图名称:</label>
            <input type="text" id="bp-composite-name" placeholder="输入名称" value="复合蓝图">
          </div>
          <button class="cancel-btn">取消</button>
          <button class="primary-btn" id="bp-combine-save-btn">保存复合蓝图</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    const closeModal = () => {
      document.removeEventListener('keydown', onKeyDown);
      modal.remove();
    };
    
    modal.querySelector('.close-btn').addEventListener('click', closeModal);
    modal.querySelector('.cancel-btn').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
    
    const canvas = modal.querySelector('#bp-combinator-canvas');
    const ctx = canvas.getContext('2d');
    const gridSize = 200;
    const cellSize = 1;
    
    const instances = [];
    let selectedInstanceId = null;
    let dragInstance = null;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    
    const blueprints = this.blueprintManager.getAll();
    const listEl = modal.querySelector('#bp-combinator-list');
    
    listEl.innerHTML = blueprints.map(bp => `
      <div class="bp-comb-item" draggable="true" data-id="${bp.id}">
        <div class="bp-comb-thumb" style="background-image:url(${this._createThumbnail(bp)})"></div>
        <div class="bp-comb-name">${this._escapeHtml(bp.name)}</div>
        <div class="bp-comb-count">${bp.cellCount}细胞</div>
      </div>
    `).join('');
    
    listEl.querySelectorAll('.bp-comb-item').forEach(item => {
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', item.dataset.id);
        e.dataTransfer.effectAllowed = 'copy';
      });
    });
    
    const renderCombinator = () => {
      ctx.fillStyle = '#0a0a14';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= gridSize; i += 20) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, gridSize);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(gridSize, i);
        ctx.stroke();
      }
      
      instances.forEach((inst, idx) => {
        const bp = this.blueprintManager.getBlueprint(inst.blueprintId);
        if (!bp) return;
        
        const transformed = transformCells(bp.cells, inst.rotation, inst.flipped);
        const color = bp.boundRule ? bp.boundRule.color : '#4fc3f7';
        
        ctx.fillStyle = selectedInstanceId === idx ? color : color + '80';
        
        for (const [dx, dy] of transformed) {
          const x = inst.offsetX + dx;
          const y = inst.offsetY + dy;
          if (x >= 0 && x < gridSize && y >= 0 && y < gridSize) {
            ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
          }
        }
        
        if (selectedInstanceId === idx) {
          const { width, height } = this._getTransformedSize(bp, inst.rotation, inst.flipped);
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.strokeRect(
            inst.offsetX * cellSize - 1,
            inst.offsetY * cellSize - 1,
            width * cellSize + 2,
            height * cellSize + 2
          );
          ctx.setLineDash([]);
        }
      });
      
      modal.querySelector('#bp-comb-instance-count').textContent = instances.length;
    };
    
    canvas.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    
    canvas.addEventListener('drop', (e) => {
      e.preventDefault();
      
      if (instances.length >= 8) {
        if (window.__app?.uiManager) {
          window.__app.uiManager.showToast('最多放置8个蓝图实例');
        }
        return;
      }
      
      const blueprintId = e.dataTransfer.getData('text/plain');
      if (!blueprintId) return;
      
      const bp = this.blueprintManager.getBlueprint(blueprintId);
      if (!bp) return;
      
      const rect = canvas.getBoundingClientRect();
      const x = Math.floor((e.clientX - rect.left) / cellSize);
      const y = Math.floor((e.clientY - rect.top) / cellSize);
      
      instances.push({
        id: Date.now() + Math.random(),
        blueprintId,
        offsetX: x - Math.floor(bp.width / 2),
        offsetY: y - Math.floor(bp.height / 2),
        rotation: 0,
        flipped: false
      });
      
      selectedInstanceId = instances.length - 1;
      renderCombinator();
    });
    
    canvas.addEventListener('mousedown', (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = Math.floor((e.clientX - rect.left) / cellSize);
      const y = Math.floor((e.clientY - rect.top) / cellSize);
      
      for (let i = instances.length - 1; i >= 0; i--) {
        const inst = instances[i];
        const bp = this.blueprintManager.getBlueprint(inst.blueprintId);
        if (!bp) continue;
        
        const { width, height } = this._getTransformedSize(bp, inst.rotation, inst.flipped);
        const transformed = transformCells(bp.cells, inst.rotation, inst.flipped);
        
        for (const [dx, dy] of transformed) {
          if (inst.offsetX + dx === x && inst.offsetY + dy === y) {
            selectedInstanceId = i;
            dragInstance = i;
            dragOffsetX = x - inst.offsetX;
            dragOffsetY = y - inst.offsetY;
            renderCombinator();
            return;
          }
        }
      }
      
      selectedInstanceId = null;
      renderCombinator();
    });
    
    canvas.addEventListener('mousemove', (e) => {
      if (dragInstance === null) return;
      
      const rect = canvas.getBoundingClientRect();
      const x = Math.floor((e.clientX - rect.left) / cellSize);
      const y = Math.floor((e.clientY - rect.top) / cellSize);
      
      instances[dragInstance].offsetX = x - dragOffsetX;
      instances[dragInstance].offsetY = y - dragOffsetY;
      renderCombinator();
    });
    
    window.addEventListener('mouseup', () => {
      dragInstance = null;
    });
    
    const onKeyDown = (e) => {
      if (selectedInstanceId === null) return;
      
      const inst = instances[selectedInstanceId];
      if (!inst) return;
      
      if (e.code === 'ArrowLeft') {
        e.preventDefault();
        inst.offsetX--;
        renderCombinator();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        inst.offsetX++;
        renderCombinator();
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        inst.offsetY--;
        renderCombinator();
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        inst.offsetY++;
        renderCombinator();
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        inst.rotation = (inst.rotation + 90) % 360;
        renderCombinator();
      } else if (e.code === 'KeyF') {
        e.preventDefault();
        inst.flipped = !inst.flipped;
        renderCombinator();
      } else if (e.code === 'Delete' || e.code === 'Backspace') {
        e.preventDefault();
        instances.splice(selectedInstanceId, 1);
        selectedInstanceId = null;
        renderCombinator();
      }
    };
    
    document.addEventListener('keydown', onKeyDown);
    
    modal.querySelector('#bp-combine-save-btn').addEventListener('click', () => {
      const name = modal.querySelector('#bp-composite-name').value.trim() || '复合蓝图';
      
      if (instances.length === 0) {
        alert('请至少放置一个蓝图');
        return;
      }
      
      const newBp = this.blueprintManager.createCompositeBlueprint(instances, name);
      
      if (newBp) {
        if (window.__app?.uiManager) {
          window.__app.uiManager.showToast(`复合蓝图 "${name}" 已保存`);
        }
        closeModal();
      }
    });
    
    renderCombinator();
  }

  _getTransformedSize(bp, rotation, flipped) {
    const { width, height } = bp;
    if (rotation === 90 || rotation === 270) {
      return { width: height, height: width };
    }
    return { width, height };
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
