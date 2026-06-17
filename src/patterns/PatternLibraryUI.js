import { eventBus } from '../core/EventBus.js';
import { STRUCTURE_TYPES, TYPE_LABELS, createStructurePreviewCanvas, normalizeCoordinates, transformCells } from './StructureUtils.js';
import { SOURCE_LABELS } from './PatternLibrary.js';

export class PatternLibraryUI {
  constructor(patternLibrary, patternManager, containerId) {
    this.patternLibrary = patternLibrary;
    this.patternManager = patternManager;
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
    
    this.currentFilter = null;
    this.searchQuery = '';
    this.selectedEntry = null;
    this.animationFrameId = null;
    this.animationPlaying = false;
    this.animationFrame = 0;
    
    this.bindEventBus();
    this.render();
  }
  
  bindEventBus() {
    eventBus.on('library:updated', () => this.updateCardList());
    eventBus.on('library:entryAdded', (entry) => {
      this.showToast(`发现新结构: ${TYPE_LABELS[entry.type]} (${entry.cellCount}细胞)`);
      this.updateCardList();
    });
  }
  
  render() {
    if (!this.container) return;
    
    this.container.innerHTML = `
      <div class="library-header">
        <div class="library-title">
          <span class="library-icon">📚</span>
          <span>活结构图鉴</span>
        </div>
        <div class="library-stats" id="library-stats"></div>
      </div>
      
      <div class="library-toolbar">
        <input type="text" id="library-search" class="library-search" 
               placeholder="搜索: 5-10(细胞数) / p2(周期) / 群落名">
      </div>
      
      <div class="library-filters">
        <button class="library-filter-btn active" data-filter="all">全部</button>
        <button class="library-filter-btn" data-filter="still_life">静物</button>
        <button class="library-filter-btn" data-filter="oscillator">振荡体</button>
        <button class="library-filter-btn" data-filter="spaceship">飞船</button>
      </div>
      
      <div class="library-actions">
        <button id="library-export-btn" class="library-action-btn" title="导出图鉴">📤 导出</button>
        <button id="library-import-btn" class="library-action-btn" title="导入图鉴">📥 导入</button>
        <input type="file" id="library-import-file" accept=".json" style="display:none">
        <button id="library-clear-btn" class="library-action-btn danger" title="清空图鉴">🗑 清空</button>
      </div>
      
      <div class="library-cards-container" id="library-cards"></div>
      
      <div id="library-detail-modal" class="modal hidden">
        <div class="modal-content library-detail-modal">
          <div class="modal-header">
            <span id="detail-title">结构详情</span>
            <button class="close-btn" id="detail-close-btn">&times;</button>
          </div>
          <div class="modal-body" id="detail-body">
          </div>
        </div>
      </div>
    `;
    
    this.searchInput = this.container.querySelector('#library-search');
    this.cardsContainer = this.container.querySelector('#library-cards');
    this.statsContainer = this.container.querySelector('#library-stats');
    this.detailModal = this.container.querySelector('#library-detail-modal');
    this.detailBody = this.container.querySelector('#detail-body');
    this.detailTitle = this.container.querySelector('#detail-title');
    
    this.bindEvents();
    this.updateStats();
    this.updateCardList();
  }
  
  bindEvents() {
    this.searchInput.addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      this.updateCardList();
    });
    
    this.container.querySelectorAll('.library-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.container.querySelectorAll('.library-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const filter = btn.dataset.filter;
        this.currentFilter = filter === 'all' ? null : filter;
        this.updateCardList();
      });
    });
    
    this.container.querySelector('#library-export-btn').addEventListener('click', () => {
      this.exportLibrary();
    });
    
    this.container.querySelector('#library-import-btn').addEventListener('click', () => {
      this.container.querySelector('#library-import-file').click();
    });
    
    this.container.querySelector('#library-import-file').addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.importLibrary(e.target.files[0]);
      }
    });
    
    this.container.querySelector('#library-clear-btn').addEventListener('click', () => {
      if (confirm('确定要清空所有图鉴记录吗？')) {
        this.patternLibrary.clear();
      }
    });
    
    this.container.querySelector('#detail-close-btn').addEventListener('click', () => {
      this.closeDetailModal();
    });
    
    this.detailModal.addEventListener('click', (e) => {
      if (e.target === this.detailModal) {
        this.closeDetailModal();
      }
    });
  }
  
  updateStats() {
    const counts = this.patternLibrary.getCounts();
    this.statsContainer.innerHTML = `
      <span class="stat-badge total" title="总数">${counts.total}</span>
      <span class="stat-badge still" title="静物">${counts[STRUCTURE_TYPES.STILL_LIFE]}</span>
      <span class="stat-badge oscillator" title="振荡体">${counts[STRUCTURE_TYPES.OSCILLATOR]}</span>
      <span class="stat-badge spaceship" title="飞船">${counts[STRUCTURE_TYPES.SPACESHIP]}</span>
    `;
  }
  
  updateCardList() {
    const filter = {};
    if (this.currentFilter) {
      filter.type = this.currentFilter;
    }
    if (this.searchQuery) {
      filter.search = this.searchQuery;
    }
    filter.limit = 100;
    
    const entries = this.patternLibrary.getEntries(filter);
    this.updateStats();
    
    if (entries.length === 0) {
      this.cardsContainer.innerHTML = `
        <div class="library-empty">
          <div class="empty-icon">🔍</div>
          <div class="empty-text">暂无发现的结构</div>
          <div class="empty-hint">运行演化后系统会自动扫描发现活结构</div>
        </div>
      `;
      return;
    }
    
    this.cardsContainer.innerHTML = entries.map(entry => this.renderCard(entry)).join('');
    
    this.cardsContainer.querySelectorAll('.library-card').forEach(card => {
      const entryId = card.dataset.entryId;
      const entry = this.patternLibrary.getEntry(entryId);
      
      card.addEventListener('click', (e) => {
        if (e.target.closest('.place-btn') || e.target.closest('.card-preview')) return;
        this.showDetailModal(entry);
      });
      
      card.querySelector('.place-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.placeStructure(entry);
      });
      
      const preview = card.querySelector('.card-preview');
      if (preview && entry) {
        const canvas = createStructurePreviewCanvas(entry.cells, 60, entry.colonyColor);
        canvas.className = 'preview-canvas';
        preview.innerHTML = '';
        preview.appendChild(canvas);
      }
    });
  }
  
  renderCard(entry) {
    const typeLabel = TYPE_LABELS[entry.type];
    const typeClass = entry.type;
    const sourceLabel = SOURCE_LABELS[entry.source] || entry.source;
    
    let periodText = '';
    if (entry.type !== STRUCTURE_TYPES.STILL_LIFE && entry.period > 1) {
      periodText = `<span class="card-period">p${entry.period}</span>`;
    }
    
    let velocityText = '';
    if (entry.type === STRUCTURE_TYPES.SPACESHIP && entry.velocity) {
      velocityText = `<span class="card-velocity">${entry.direction} (${entry.velocity.dx.toFixed(1)}, ${entry.velocity.dy.toFixed(1)})</span>`;
    }
    
    return `
      <div class="library-card ${typeClass}" data-entry-id="${entry.id}">
        <div class="card-preview" draggable="true"></div>
        <div class="card-info">
          <div class="card-header">
            <span class="card-type ${typeClass}">${typeLabel}</span>
            ${periodText}
          </div>
          ${velocityText ? `<div class="card-velocity-row">${velocityText}</div>` : ''}
          <div class="card-meta">
            <span class="card-cells">${entry.cellCount}细胞</span>
            <span class="card-size">${entry.width}×${entry.height}</span>
          </div>
          <div class="card-meta">
            <span class="card-colony" style="color: ${entry.colonyColor}">${this.escapeHtml(entry.colonyName)}</span>
          </div>
          <div class="card-footer">
            <span class="card-gen">第${entry.discoveredGeneration}代</span>
            <span class="card-source">${sourceLabel}</span>
          </div>
          <button class="place-btn" title="放置到画布">放置</button>
        </div>
      </div>
    `;
  }
  
  showDetailModal(entry) {
    this.selectedEntry = entry;
    this.stopAnimation();
    
    const typeLabel = TYPE_LABELS[entry.type];
    const sourceLabel = SOURCE_LABELS[entry.source] || entry.source;
    
    let extraInfo = '';
    if (entry.type === STRUCTURE_TYPES.OSCILLATOR) {
      extraInfo = `<div class="detail-row"><span class="detail-label">周期</span><span class="detail-value">${entry.period}</span></div>`;
    } else if (entry.type === STRUCTURE_TYPES.SPACESHIP) {
      extraInfo = `
        <div class="detail-row"><span class="detail-label">周期</span><span class="detail-value">${entry.period}</span></div>
        <div class="detail-row"><span class="detail-label">方向</span><span class="detail-value">${entry.direction}</span></div>
        <div class="detail-row"><span class="detail-label">速度</span><span class="detail-value">(${entry.velocity?.dx.toFixed(2)}, ${entry.velocity?.dy.toFixed(2)})/代</span></div>
      `;
    }
    
    this.detailTitle.textContent = `${typeLabel} - ${entry.cellCount}细胞`;
    
    this.detailBody.innerHTML = `
      <div class="detail-preview-container">
        <canvas id="detail-preview-canvas"></canvas>
        <div class="detail-animation-controls">
          <button id="detail-play-btn" class="animation-btn">▶ 播放</button>
          <span id="detail-frame-info" class="frame-info">帧 0/${entry.period || 1}</span>
        </div>
      </div>
      
      <div class="detail-info">
        <div class="detail-row"><span class="detail-label">类型</span><span class="detail-value">${typeLabel}</span></div>
        <div class="detail-row"><span class="detail-label">细胞数</span><span class="detail-value">${entry.cellCount}</span></div>
        <div class="detail-row"><span class="detail-label">尺寸</span><span class="detail-value">${entry.width} × ${entry.height}</span></div>
        ${extraInfo}
        <div class="detail-row"><span class="detail-label">所属群落</span><span class="detail-value" style="color: ${entry.colonyColor}">${this.escapeHtml(entry.colonyName)}</span></div>
        <div class="detail-row"><span class="detail-label">发现代数</span><span class="detail-value">第${entry.discoveredGeneration}代</span></div>
        <div class="detail-row"><span class="detail-label">来源</span><span class="detail-value">${sourceLabel}</span></div>
      </div>
      
      <div class="detail-rle-section">
        <div class="detail-label">RLE 编码</div>
        <textarea id="detail-rle" class="rle-textarea" readonly>${this.escapeHtml(entry.rle || '')}</textarea>
        <button id="detail-copy-rle" class="copy-btn">📋 复制 RLE</button>
      </div>
      
      <div class="detail-actions">
        <button id="detail-place-btn" class="primary-btn">放置到画布</button>
        <button id="detail-delete-btn" class="danger-btn">删除记录</button>
      </div>
    `;
    
    this.detailModal.classList.remove('hidden');
    
    const previewCanvas = this.detailBody.querySelector('#detail-preview-canvas');
    this.renderDetailPreview(previewCanvas, entry, 0);
    
    this.detailBody.querySelector('#detail-play-btn').addEventListener('click', () => {
      this.toggleAnimation();
    });
    
    this.detailBody.querySelector('#detail-copy-rle').addEventListener('click', () => {
      const rle = this.detailBody.querySelector('#detail-rle').value;
      navigator.clipboard.writeText(rle).then(() => {
        this.showToast('RLE已复制到剪贴板');
      });
    });
    
    this.detailBody.querySelector('#detail-place-btn').addEventListener('click', () => {
      this.placeStructure(entry);
      this.closeDetailModal();
    });
    
    this.detailBody.querySelector('#detail-delete-btn').addEventListener('click', () => {
      if (confirm('确定要删除这条图鉴记录吗？')) {
        this.patternLibrary.removeEntry(entry.id);
        this.closeDetailModal();
      }
    });
  }
  
  renderDetailPreview(canvas, entry, frameIndex) {
    const ctx = canvas.getContext('2d');
    const maxSize = 200;
    const cellSize = Math.max(4, Math.floor(maxSize / Math.max(entry.width, entry.height)));
    
    canvas.width = entry.width * cellSize;
    canvas.height = entry.height * cellSize;
    
    let cells = entry.cells;
    if (entry.evolutionFrames && entry.evolutionFrames.length > 0) {
      const frame = frameIndex % entry.evolutionFrames.length;
      const { cells: frameNorm } = normalizeCoordinates(entry.evolutionFrames[frame]);
      cells = frameNorm;
    }
    
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = entry.colonyColor;
    for (const [x, y] of cells) {
      ctx.fillRect(x * cellSize, y * cellSize, cellSize - 1, cellSize - 1);
    }
  }
  
  toggleAnimation() {
    if (this.animationPlaying) {
      this.stopAnimation();
    } else {
      this.startAnimation();
    }
  }
  
  startAnimation() {
    if (!this.selectedEntry) return;
    
    this.animationPlaying = true;
    this.animationFrame = 0;
    const btn = this.detailBody.querySelector('#detail-play-btn');
    const frameInfo = this.detailBody.querySelector('#detail-frame-info');
    const canvas = this.detailBody.querySelector('#detail-preview-canvas');
    
    btn.textContent = '⏸ 暂停';
    
    const totalFrames = this.selectedEntry.period || 1;
    
    const animate = () => {
      if (!this.animationPlaying) return;
      
      this.renderDetailPreview(canvas, this.selectedEntry, this.animationFrame);
      frameInfo.textContent = `帧 ${this.animationFrame + 1}/${totalFrames}`;
      
      this.animationFrame = (this.animationFrame + 1) % totalFrames;
      this.animationFrameId = setTimeout(animate, 200);
    };
    
    animate();
  }
  
  stopAnimation() {
    this.animationPlaying = false;
    if (this.animationFrameId) {
      clearTimeout(this.animationFrameId);
      this.animationFrameId = null;
    }
    const btn = this.detailBody?.querySelector('#detail-play-btn');
    if (btn) {
      btn.textContent = '▶ 播放';
    }
  }
  
  closeDetailModal() {
    this.stopAnimation();
    this.detailModal.classList.add('hidden');
    this.selectedEntry = null;
  }
  
  placeStructure(entry) {
    if (!entry || !entry.cells) return;
    
    this.patternManager.selectLibraryPattern(entry);
    this.showToast(`选择了${TYPE_LABELS[entry.type]}，点击画布放置（R旋转，F翻转，ESC取消）`);
  }
  
  exportLibrary() {
    const json = this.patternLibrary.exportAsJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pattern-library-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast('图鉴已导出');
  }
  
  importLibrary(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = this.patternLibrary.importFromJSON(e.target.result);
      if (result.success) {
        this.showToast(`成功导入 ${result.mergedCount} 个新结构`);
      } else {
        alert('导入失败: ' + result.error);
      }
    };
    reader.readAsText(file);
  }
  
  showToast(message) {
    let toast = document.getElementById('library-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'library-toast';
      toast.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(76, 175, 80, 0.95);
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
    }, 2000);
  }
  
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
