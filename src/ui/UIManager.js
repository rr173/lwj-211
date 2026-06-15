import { eventBus } from '../core/EventBus.js';
import { Rule, PRESET_RULES } from '../core/Rule.js';
import { Colony } from '../core/Colony.js';
import { parseRLE } from '../engine/PatternManager.js';

export class UIManager {
  constructor(colonyManager, engine, patternManager, cellStore, viewState) {
    this.colonyManager = colonyManager;
    this.engine = engine;
    this.patternManager = patternManager;
    this.cellStore = cellStore;
    this.viewState = viewState;
    
    this.initPresetColonies();
    this.bindUIEvents();
    this.bindEventBus();
    this.updateAll();
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
        this.engine.step();
      } else if (e.code === 'Enter') {
        e.preventDefault();
        this.engine.toggleRunning();
      } else if (e.code === 'Escape') {
        this.patternManager.cancelPlacement();
        document.querySelectorAll('.pattern-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('selected-pattern-info').textContent = '';
      }
    });

    eventBus.on('mouse:hover', (world) => {
      this.renderer?.setHoverCell?.(world.x, world.y);
    });
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
  }

  addRuleFromForm() {
    const name = document.getElementById('rule-name').value.trim();
    const color = document.getElementById('rule-color').value;
    const bs = document.getElementById('rule-bs').value.trim();
    const neighborhood = document.getElementById('rule-neighborhood').value;
    const priority = parseInt(document.getElementById('rule-priority').value, 10) || 0;

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
      priority
    });
    const colony = new Colony(rule);
    this.colonyManager.addColony(colony);
    
    document.getElementById('rule-name').value = '';
    document.getElementById('rule-bs').value = '';
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
      cells: this.cellStore.toJSON()
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
        
        this.engine.loadFromJSON(data.engine || {});
        
        for (const colonyData of data.colonies || []) {
          const colony = Colony.fromJSON(colonyData);
          this.colonyManager.addColony(colony);
        }
        
        for (const cell of data.cells || []) {
          this.cellStore.set(cell.x, cell.y, cell.c);
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
      return `
        <div class="colony-item ${selected ? 'selected' : ''} ${colony.paused ? 'paused' : ''}" 
             data-id="${colony.id}" style="border-left-color: ${colony.color}">
          <div class="colony-header">
            <div class="colony-name">
              <span class="colony-color" style="background: ${colony.color}"></span>
              <span>${this.escapeHtml(colony.name)}</span>
            </div>
            <div class="colony-actions">
              <button class="pause-btn" data-id="${colony.id}">${colony.paused ? '▶' : '⏸'}</button>
              <button class="delete-btn" data-id="${colony.id}">✕</button>
            </div>
          </div>
          <div class="colony-meta">
            ${bs} | ${nh} | 优先级: ${colony.rule.priority} | 细胞: ${this.cellStore.countByColony(colony.id)}
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.colony-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('pause-btn') || e.target.classList.contains('delete-btn')) return;
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
    const container = document.getElementById('stats-list');
    const colonies = this.colonyManager.getAll();

    if (colonies.length === 0) {
      container.innerHTML = '<div class="empty-hint">暂无群落</div>';
      return;
    }

    container.innerHTML = colonies.map(colony => {
      const count = this.cellStore.countByColony(colony.id);
      const growth = colony.getGrowthRate();
      let growthClass = 'zero';
      let growthText = '0.00%';
      if (growth > 0.01) {
        growthClass = 'positive';
        growthText = `+${growth.toFixed(2)}%`;
      } else if (growth < -0.01) {
        growthClass = 'negative';
        growthText = `${growth.toFixed(2)}%`;
      }
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
        </div>
      `;
    }).join('');
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
    for (const point of history) {
      for (const count of Object.values(point.snapshot)) {
        maxCount = Math.max(maxCount, count);
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

    ctx.fillStyle = '#888';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(maxCount.toString(), 2, padding + 8);
    ctx.fillText('0', 2, h - padding);
  }

  updateAll() {
    this.updateColonyList();
    this.updateStatusBar();
    this.updateStatsPanel();
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
