import { LEVELS } from './levels.js';
import { ChallengeEngine } from './ChallengeEngine.js';
import { ChallengeJudge } from './ChallengeJudge.js';
import { ChallengeProgress } from './ChallengeProgress.js';

export class ChallengeUI {
  constructor(containerId) {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
    this.currentLevel = null;
    this.engine = null;
    this.isChallengeMode = false;
    this.isDrawing = false;
    this.drawMode = 'paint';

    this.challengeCanvas = null;
    this.challengeCtx = null;
    this.cellSize = 10;
    this.offsetX = 0;
    this.offsetY = 0;

    this.overlayEl = null;
    this.resultModal = null;

    this._savedMainState = null;

    this.init();
  }

  init() {
    if (!this.container) return;
    this.renderLevelList();
  }

  renderLevelList() {
    const progress = ChallengeProgress.load();

    const html = `
      <div class="panel-header">
        <h3>🏆 挑战关卡</h3>
      </div>
      <div class="panel-section">
        <div class="challenge-info">
          <p style="margin:0 0 8px 0;font-size:12px;color:#aaa;">
            在限定条件下完成目标，用最少的细胞获得高分！
          </p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <span class="challenge-stat">已通关: <strong>${this._countCompleted(progress)}/${LEVELS.length}</strong></span>
          </div>
        </div>
      </div>
      <div class="panel-section">
        <div class="section-title">关卡列表</div>
        <div class="level-list">
          ${LEVELS.map((level, idx) => {
            const lp = progress[level.id] || {};
            const completed = lp.completed || false;
            const bestScore = lp.bestScore || 0;
            return `
              <div class="level-card ${completed ? 'completed' : ''}" data-level-id="${level.id}">
                <div class="level-header">
                  <span class="level-number">第${idx + 1}关</span>
                  <span class="level-difficulty">${this._renderDifficulty(level.difficulty)}</span>
                </div>
                <div class="level-name">${level.name} ${completed ? '<span class="checkmark">✓</span>' : ''}</div>
                <div class="level-desc">${level.description}</div>
                <div class="level-meta">
                  <span>规则: ${level.rule}</span>
                  <span>尺寸: ${level.width}×${level.height}</span>
                </div>
                <div class="level-meta">
                  <span>最大细胞: ${level.maxCells}</span>
                  <span>步数: ${level.maxSteps}</span>
                </div>
                ${completed ? `<div class="level-best">最佳评分: <strong>${bestScore}</strong> 分</div>` : ''}
                <button class="start-level-btn primary-btn" data-level-id="${level.id}">
                  ${completed ? '再次挑战' : '开始挑战'}
                </button>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    this.container.innerHTML = html;
    this._bindLevelListEvents();
  }

  _countCompleted(progress) {
    let count = 0;
    for (const level of LEVELS) {
      if (progress[level.id]?.completed) count++;
    }
    return count;
  }

  _renderDifficulty(level) {
    let stars = '';
    for (let i = 0; i < 5; i++) {
      stars += i < level ? '★' : '☆';
    }
    return stars;
  }

  _bindLevelListEvents() {
    this.container.querySelectorAll('.start-level-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const levelId = btn.dataset.levelId;
        this.startChallenge(levelId);
      });
    });
  }

  startChallenge(levelId) {
    const level = LEVELS.find(l => l.id === levelId);
    if (!level) return;

    this.currentLevel = level;
    this.engine = new ChallengeEngine(level);
    this.isChallengeMode = true;

    this._saveMainState();
    this._showChallengeOverlay();
    this._setupChallengeCanvas();
    this._renderChallenge();
  }

  _saveMainState() {
    if (!window.__app) return;
    const app = window.__app;
    this._savedMainState = {
      engineRunning: app.engine?.running || false,
      viewStateZoom: app.viewState?.zoom || 1,
      viewStateCenter: app.viewState?.getCenterWorld ? { ...app.viewState.getCenterWorld() } : { x: 0, y: 0 }
    };
    if (app.engine?.stop) app.engine.stop();
  }

  _restoreMainState() {
    if (!window.__app || !this._savedMainState) return;
    const app = window.__app;
    if (this._savedMainState.engineRunning && app.engine?.start) {
      app.engine.start();
    }
    if (app.viewState) {
      if (this._savedMainState.viewStateZoom) {
        app.viewState.zoom = this._savedMainState.viewStateZoom;
      }
      if (this._savedMainState.viewStateCenter && app.viewState.setCenterWorld) {
        app.viewState.setCenterWorld(
          this._savedMainState.viewStateCenter.x,
          this._savedMainState.viewStateCenter.y
        );
      }
    }
    if (app.renderer?.render) app.renderer.render();
    this._savedMainState = null;
  }

  _showChallengeOverlay() {
    const canvasContainer = document.getElementById('canvas-container');
    if (!canvasContainer) return;

    this.overlayEl = document.createElement('div');
    this.overlayEl.id = 'challenge-overlay';
    this.overlayEl.className = 'challenge-overlay';

    this.overlayEl.innerHTML = `
      <div class="challenge-header">
        <div class="challenge-level-info">
          <span class="challenge-level-name">${this.currentLevel.name}</span>
          <span class="challenge-level-rule">规则: ${this.currentLevel.rule}</span>
        </div>
        <button class="exit-challenge-btn" id="exit-challenge-btn">退出挑战</button>
      </div>
      <div class="challenge-canvas-wrapper">
        <canvas id="challenge-canvas"></canvas>
      </div>
      <div class="challenge-status-bar">
        <span id="challenge-placed">已放置: 0/${this.currentLevel.maxCells} 个细胞</span>
        <span id="challenge-remaining">剩余可放: ${this.currentLevel.maxCells} 个</span>
        <span id="challenge-generation">第 0/${this.currentLevel.maxSteps} 代</span>
      </div>
      <div class="challenge-controls">
        <button id="challenge-clear-btn" class="secondary-btn">清空</button>
        <button id="challenge-start-btn" class="primary-btn">开始演化</button>
      </div>
      <div class="challenge-goals">
        <div class="section-title">目标条件</div>
        ${this.currentLevel.goals.map(g => `
          <div class="goal-item" data-goal-type="${g.type}">
            <span class="goal-status">◯</span>
            <span class="goal-label">${g.label}</span>
          </div>
        `).join('')}
      </div>
    `;

    canvasContainer.appendChild(this.overlayEl);

    document.getElementById('exit-challenge-btn').addEventListener('click', () => {
      this.exitChallenge();
    });

    document.getElementById('challenge-clear-btn').addEventListener('click', () => {
      this._clearCells();
    });

    document.getElementById('challenge-start-btn').addEventListener('click', () => {
      this._startEvolution();
    });

    this.challengeCanvas = document.getElementById('challenge-canvas');
    this.challengeCtx = this.challengeCanvas.getContext('2d');

    this._bindCanvasEvents();
    this._fitCanvas();
  }

  _setupChallengeCanvas() {
    if (!this.challengeCanvas) return;

    const wrapper = this.overlayEl.querySelector('.challenge-canvas-wrapper');
    if (!wrapper) return;

    const wrapperRect = wrapper.getBoundingClientRect();
    const maxWidth = wrapperRect.width - 20;
    const maxHeight = wrapperRect.height - 20;

    const cellSizeW = Math.floor(maxWidth / this.currentLevel.width);
    const cellSizeH = Math.floor(maxHeight / this.currentLevel.height);
    this.cellSize = Math.max(4, Math.min(20, Math.min(cellSizeW, cellSizeH)));

    const canvasWidth = this.currentLevel.width * this.cellSize;
    const canvasHeight = this.currentLevel.height * this.cellSize;

    this.challengeCanvas.width = canvasWidth;
    this.challengeCanvas.height = canvasHeight;
    this.challengeCanvas.style.width = canvasWidth + 'px';
    this.challengeCanvas.style.height = canvasHeight + 'px';

    this.offsetX = (maxWidth - canvasWidth) / 2;
    this.offsetY = (maxHeight - canvasHeight) / 2;
  }

  _fitCanvas() {
    this._setupChallengeCanvas();
    this._renderChallenge();
  }

  _bindCanvasEvents() {
    const canvas = this.challengeCanvas;
    if (!canvas) return;

    canvas.addEventListener('mousedown', (e) => this._onCanvasMouseDown(e));
    canvas.addEventListener('mousemove', (e) => this._onCanvasMouseMove(e));
    canvas.addEventListener('mouseup', () => this._onCanvasMouseUp());
    canvas.addEventListener('mouseleave', () => this._onCanvasMouseUp());
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _getCellFromEvent(e) {
    if (!this.challengeCanvas) return null;
    const rect = this.challengeCanvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / this.cellSize);
    const y = Math.floor((e.clientY - rect.top) / this.cellSize);
    return { x, y };
  }

  _onCanvasMouseDown(e) {
    if (this.engine?.running) return;

    const pos = this._getCellFromEvent(e);
    if (!pos) return;

    this.isDrawing = true;
    this.drawMode = e.button === 2 ? 'erase' : 'paint';
    this._handleCellClick(pos.x, pos.y, this.drawMode);
  }

  _onCanvasMouseMove(e) {
    if (!this.isDrawing || this.engine?.running) return;

    const pos = this._getCellFromEvent(e);
    if (!pos) return;

    this._handleCellClick(pos.x, pos.y, this.drawMode);
  }

  _onCanvasMouseUp() {
    this.isDrawing = false;
  }

  _handleCellClick(x, y, mode) {
    if (!this.engine) return;

    if (mode === 'paint') {
      const currentCount = this.engine.countCells();
      if (currentCount >= this.currentLevel.maxCells) {
        if (!this.engine.getCell(x, y)) return;
      }
      this.engine.setCell(x, y, true);
    } else {
      this.engine.setCell(x, y, false);
    }

    this._updatePlacementStatus();
    this._renderChallenge();
  }

  _clearCells() {
    if (!this.engine || this.engine.running) return;
    this.engine.clearCells();
    this._updatePlacementStatus();
    this._renderChallenge();
  }

  _updatePlacementStatus() {
    if (!this.engine) return;
    const count = this.engine.countCells();
    const max = this.currentLevel.maxCells;
    const remaining = max - count;

    const placedEl = document.getElementById('challenge-placed');
    const remainingEl = document.getElementById('challenge-remaining');
    if (placedEl) placedEl.textContent = `已放置: ${count}/${max} 个细胞`;
    if (remainingEl) remainingEl.textContent = `剩余可放: ${remaining} 个`;
  }

  _updateGenerationDisplay() {
    if (!this.engine) return;
    const genEl = document.getElementById('challenge-generation');
    if (genEl) {
      genEl.textContent = `第 ${this.engine.generation}/${this.currentLevel.maxSteps} 代`;
    }
  }

  _startEvolution() {
    if (!this.engine || this.engine.running) return;

    const initialCells = this.engine.countCells();
    if (initialCells === 0) {
      alert('请先放置至少一个细胞！');
      return;
    }

    this.engine.setInitialCells(initialCells);
    this.engine.setSpeed(30);

    document.getElementById('challenge-start-btn').disabled = true;
    document.getElementById('challenge-clear-btn').disabled = true;

    this.engine.start(
      () => {
        this._updateGenerationDisplay();
        this._renderChallenge();
      },
      () => {
        this._onEvolutionComplete();
      }
    );
  }

  _onEvolutionComplete() {
    document.getElementById('challenge-start-btn').disabled = false;
    document.getElementById('challenge-clear-btn').disabled = false;

    const result = ChallengeJudge.evaluate(this.currentLevel, this.engine);
    ChallengeProgress.updateLevelProgress(this.currentLevel.id, result);

    this._showResultModal(result);
    this._updateGoalStatus(result);
  }

  _updateGoalStatus(result) {
    const goalItems = this.overlayEl.querySelectorAll('.goal-item');
    goalItems.forEach((item, idx) => {
      const statusEl = item.querySelector('.goal-status');
      if (result.goals[idx]) {
        statusEl.textContent = result.goals[idx].passed ? '✓' : '✗';
        statusEl.className = 'goal-status ' + (result.goals[idx].passed ? 'passed' : 'failed');
      }
    });
  }

  _showResultModal(result) {
    if (this.resultModal) {
      this.resultModal.remove();
    }

    this.resultModal = document.createElement('div');
    this.resultModal.className = 'challenge-result-modal';

    const stats = result.stats;

    this.resultModal.innerHTML = `
      <div class="result-modal-content">
        <div class="result-header ${result.passed ? 'passed' : 'failed'}">
          <span class="result-icon">${result.passed ? '🏆' : '😔'}</span>
          <span class="result-title">${result.passed ? '挑战成功！' : '挑战失败'}</span>
        </div>
        ${result.passed ? `
          <div class="result-score">
            <div class="score-label">评分</div>
            <div class="score-value">${result.score}<span class="score-unit">分</span></div>
            <div class="score-hint">使用了 ${stats.initialCells} 个初始细胞</div>
          </div>
        ` : `
          <div class="result-failed-reasons">
            <div class="section-title">未满足的条件</div>
            ${result.goals.filter(g => !g.passed).map(g => `
              <div class="failed-reason">
                <span class="failed-icon">✗</span>
                <span>${g.label}</span>
                <span class="failed-detail">${g.detail}</span>
              </div>
            `).join('')}
          </div>
        `}
        <div class="result-stats">
          <div class="section-title">演化统计</div>
          <div class="stats-grid">
            <div class="stat-item">
              <span class="stat-label">峰值细胞数</span>
              <span class="stat-value">${stats.peakCells} (第${stats.peakGeneration}代)</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">最终细胞数</span>
              <span class="stat-value">${stats.finalCells}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">演化代数</span>
              <span class="stat-value">${stats.finalGeneration}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">周期状态</span>
              <span class="stat-value">${stats.isPeriodic ? (stats.periodLength === 0 ? '稳定态' : `周期${stats.periodLength}代`) : '未进入周期'}</span>
            </div>
          </div>
        </div>
        <div class="result-actions">
          <button class="secondary-btn" id="result-retry-btn">再试一次</button>
          <button class="primary-btn" id="result-exit-btn">退出挑战</button>
        </div>
      </div>
    `;

    this.overlayEl.appendChild(this.resultModal);

    document.getElementById('result-retry-btn').addEventListener('click', () => {
      this._retryChallenge();
    });

    document.getElementById('result-exit-btn').addEventListener('click', () => {
      this.exitChallenge();
    });
  }

  _retryChallenge() {
    if (this.resultModal) {
      this.resultModal.remove();
      this.resultModal = null;
    }
    this.engine.clearCells();
    this._updatePlacementStatus();
    this._updateGenerationDisplay();
    this._resetGoalStatus();
    this._renderChallenge();
  }

  _resetGoalStatus() {
    const goalItems = this.overlayEl.querySelectorAll('.goal-item');
    goalItems.forEach(item => {
      const statusEl = item.querySelector('.goal-status');
      statusEl.textContent = '◯';
      statusEl.className = 'goal-status';
    });
  }

  exitChallenge() {
    if (this.engine) {
      this.engine.stop();
    }

    if (this.resultModal) {
      this.resultModal.remove();
      this.resultModal = null;
    }

    if (this.overlayEl) {
      this.overlayEl.remove();
      this.overlayEl = null;
    }

    this.isChallengeMode = false;
    this.currentLevel = null;
    this.engine = null;
    this.challengeCanvas = null;
    this.challengeCtx = null;

    this._restoreMainState();
    this.renderLevelList();
  }

  _renderChallenge() {
    if (!this.challengeCtx || !this.engine) return;

    const ctx = this.challengeCtx;
    const w = this.currentLevel.width;
    const h = this.currentLevel.height;
    const cs = this.cellSize;

    ctx.fillStyle = '#0f0f1a';
    ctx.fillRect(0, 0, w * cs, h * cs);

    if (this.currentLevel.forbidden && this.currentLevel.forbidden.length > 0) {
      ctx.fillStyle = 'rgba(255, 80, 80, 0.25)';
      for (const rect of this.currentLevel.forbidden) {
        ctx.fillRect(
          rect.x1 * cs,
          rect.y1 * cs,
          (rect.x2 - rect.x1 + 1) * cs,
          (rect.y2 - rect.y1 + 1) * cs
        );
      }
    }

    if (this.currentLevel.placementZone) {
      const z = this.currentLevel.placementZone;
      ctx.strokeStyle = 'rgba(100, 255, 100, 0.5)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(
        z.x1 * cs + 1,
        z.y1 * cs + 1,
        (z.x2 - z.x1 + 1) * cs - 2,
        (z.y2 - z.y1 + 1) * cs - 2
      );
      ctx.setLineDash([]);
    }

    ctx.fillStyle = '#4fc3f7';
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (this.engine.getCell(x, y) === 1) {
          ctx.fillRect(x * cs + 1, y * cs + 1, cs - 2, cs - 2);
        }
      }
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x++) {
      ctx.beginPath();
      ctx.moveTo(x * cs, 0);
      ctx.lineTo(x * cs, h * cs);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * cs);
      ctx.lineTo(w * cs, y * cs);
      ctx.stroke();
    }

    ctx.strokeStyle = '#4fc3f7';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, w * cs, h * cs);
  }
}
