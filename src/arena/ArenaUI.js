import { referee } from './Referee.js';
import { eventBus } from '../core/EventBus.js';

export class ArenaUI {
  constructor(arena, geneLab, containerId) {
    this.arena = arena;
    this.geneLab = geneLab;
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
    this.canvas = null;
    this.ctx = null;
    this.renderAnimationId = null;
    this.colonyIdCounter = 0;

    this.replayState = null;

    this.init();
  }

  init() {
    if (!this.container) return;
    
    this.bindEventBus();
    this.render();
  }

  bindEventBus() {
    eventBus.on('arena:contestantAdded', () => {
      this.updateContestantSlots();
      this.updateControlButtons();
    });
    
    eventBus.on('arena:contestantRemoved', () => {
      this.updateContestantSlots();
      this.updateControlButtons();
    });
    
    eventBus.on('arena:contestantsCleared', () => {
      this.updateContestantSlots();
      this.updateControlButtons();
    });
    
    eventBus.on('arena:updated', () => {
      this.updateContestantSlots();
      this.updateControlButtons();
    });
    
    eventBus.on('arena:battleStarted', () => {
      this.updateControlButtons();
      this.startRenderLoop();
    });
    
    eventBus.on('arena:battleEnded', (data) => {
      this.updateControlButtons();
      this.stopRenderLoop();
      this.showResultPanel(data);
      this.refreshHistory();
    });
    
    eventBus.on('arena:battleStopped', () => {
      this.updateControlButtons();
      this.stopRenderLoop();
    });
    
    eventBus.on('arena:stateUpdated', (state) => {
      this.updateStats(state);
    });
    
    eventBus.on('arena:error', (message) => {
      this.showError(message);
    });
    
    eventBus.on('arena:reset', () => {
      this.updateControlButtons();
      this.updateStats(null);
      this.renderArena();
    });
    
    eventBus.on('referee:matchRecorded', () => {
      this.refreshHistory();
    });
    
    eventBus.on('arena:tournamentStarted', () => {
      this.showTournamentBracket();
    });
    
    eventBus.on('arena:tournamentMatchStarting', (data) => {
      this.updateTournamentStatus(data);
    });
    
    eventBus.on('arena:tournamentMatchEnded', (data) => {
      this.updateTournamentResults(data);
    });
    
    eventBus.on('arena:tournamentEnded', (data) => {
      this.showTournamentResult(data);
    });
  }

  render() {
    if (!this.container) return;
    
    this.container.innerHTML = `
      <div class="arena-header">
        <div class="arena-title">
          <span class="arena-icon">⚔️</span>
          <span>竞技场</span>
        </div>
        <div class="arena-tabs">
          <button class="arena-tab active" data-tab="battle">对战</button>
          <button class="arena-tab" data-tab="history">战绩</button>
          <button class="arena-tab" data-tab="tournament">锦标赛</button>
        </div>
      </div>
      
      <div class="arena-content">
        <div class="arena-tab-content active" data-tab="battle">
          <div class="arena-canvas-container">
            <canvas id="arena-canvas" width="300" height="300"></canvas>
            <div class="arena-overlay" id="arena-overlay">
              <span class="arena-overlay-text">拖入基因卡片开始对战</span>
            </div>
          </div>
          
          <div class="arena-stats" id="arena-stats">
            <div class="arena-stat-item">
              <span class="arena-stat-label">代数</span>
              <span class="arena-stat-value" id="arena-gen">0</span>
            </div>
            <div class="arena-stat-item">
              <span class="arena-stat-label">总细胞</span>
              <span class="arena-stat-value" id="arena-total">0</span>
            </div>
          </div>
          
          <div class="arena-contestants" id="arena-contestants">
            <div class="arena-contestant-slot" data-slot="0">
              <div class="slot-corner">左上</div>
              <div class="slot-content">
                <span class="slot-hint">拖入基因</span>
              </div>
            </div>
            <div class="arena-contestant-slot" data-slot="1">
              <div class="slot-corner">右上</div>
              <div class="slot-content">
                <span class="slot-hint">拖入基因</span>
              </div>
            </div>
            <div class="arena-contestant-slot" data-slot="2">
              <div class="slot-corner">左下</div>
              <div class="slot-content">
                <span class="slot-hint">拖入基因</span>
              </div>
            </div>
            <div class="arena-contestant-slot" data-slot="3">
              <div class="slot-corner">右下</div>
              <div class="slot-content">
                <span class="slot-hint">拖入基因</span>
              </div>
            </div>
          </div>
          
          <div class="arena-terrain-section">
            <div class="section-title">地形模板</div>
            <div class="arena-terrain-buttons">
              <button class="terrain-template-btn active" data-template="blank">空白</button>
              <button class="terrain-template-btn" data-template="fourWalls">四面墙</button>
              <button class="terrain-template-btn" data-template="centerWall">中心墙</button>
              <button class="terrain-template-btn" data-template="maze">迷宫</button>
            </div>
          </div>
          
          <div class="arena-controls">
            <button id="arena-start-btn" class="arena-control-btn primary" disabled>开始对战</button>
            <button id="arena-stop-btn" class="arena-control-btn danger" disabled>停止</button>
            <button id="arena-clear-btn" class="arena-control-btn">清空</button>
          </div>
        </div>
        
        <div class="arena-tab-content" data-tab="history">
          <div class="arena-history-header">
            <span>最近20场对战记录</span>
            <button id="arena-clear-history-btn" class="small-btn">清空记录</button>
          </div>
          <div class="arena-history-container" id="arena-history-container"></div>
        </div>
        
        <div class="arena-tab-content" data-tab="tournament">
          <div class="arena-tournament-section">
            <div class="section-title">锦标赛模式</div>
            <div class="tournament-hint">选择4个以上基因，系统自动配对进行淘汰赛</div>
            <button id="arena-start-tournament-btn" class="arena-control-btn primary" disabled>开始锦标赛</button>
            <div class="tournament-selected" id="tournament-selected">
              <span class="tournament-selected-label">已选择 0 个基因</span>
            </div>
            <div class="tournament-gene-list" id="tournament-gene-list"></div>
            <div class="tournament-bracket" id="tournament-bracket"></div>
          </div>
        </div>
      </div>
      
      <div id="arena-result-modal" class="modal hidden">
        <div class="modal-content arena-result-content replay-modal">
          <div class="modal-header">
            <span id="arena-result-title">对战结果</span>
            <button id="arena-close-result-btn" class="close-btn">&times;</button>
          </div>
          <div class="modal-body">
            <div class="replay-summary" id="replay-summary"></div>

            <div class="replay-main-layout">
              <div class="replay-canvas-section">
                <div class="replay-canvas-container">
                  <canvas id="replay-canvas" width="300" height="300"></canvas>
                </div>
                <div class="replay-territory-control">
                  <label class="toggle-switch">
                    <input type="checkbox" id="replay-territory-toggle">
                    <span class="toggle-slider"></span>
                    <span class="toggle-label">领地</span>
                  </label>
                  <span class="replay-current-gen" id="replay-current-gen">第 0 代</span>
                </div>
                <div class="replay-timeline-container">
                  <div class="replay-event-markers" id="replay-event-markers"></div>
                  <div class="replay-timeline-track">
                    <input type="range" id="replay-timeline-slider" min="0" max="0" value="0">
                  </div>
                </div>
                <div class="replay-controls">
                  <button id="replay-play-btn" class="replay-control-btn">▶ 播放</button>
                  <div class="replay-speed-group">
                    <button class="replay-speed-btn active" data-speed="1">1x</button>
                    <button class="replay-speed-btn" data-speed="2">2x</button>
                    <button class="replay-speed-btn" data-speed="5">5x</button>
                    <button class="replay-speed-btn" data-speed="10">10x</button>
                  </div>
                </div>
              </div>

              <div class="replay-charts-section">
                <div class="replay-chart-block">
                  <div class="chart-label">细胞数趋势</div>
                  <canvas id="replay-line-chart" class="replay-chart-canvas"></canvas>
                </div>
                <div class="replay-chart-block">
                  <div class="chart-label">占比变化</div>
                  <canvas id="replay-area-chart" class="replay-chart-canvas"></canvas>
                </div>
                <div class="replay-chart-block">
                  <div class="chart-label">最近10代增长率</div>
                  <canvas id="replay-growth-chart" class="replay-chart-canvas"></canvas>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    this.canvas = this.container.querySelector('#arena-canvas');
    this.ctx = this.canvas.getContext('2d');
    
    this.bindEvents();
    this.updateControlButtons();
    this.updateContestantSlots();
    this.refreshHistory();
    this.refreshTournamentGeneList();
    this.renderArena();
  }

  bindEvents() {
    this.container.querySelectorAll('.arena-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        this.switchTab(tabName);
      });
    });
    
    this.container.querySelector('#arena-start-btn').addEventListener('click', () => {
      this.arena.startBattle();
    });
    
    this.container.querySelector('#arena-stop-btn').addEventListener('click', () => {
      this.arena.stopBattle();
    });
    
    this.container.querySelector('#arena-clear-btn').addEventListener('click', () => {
      this.arena.reset();
    });
    
    this.container.querySelectorAll('.terrain-template-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const template = btn.dataset.template;
        this.arena.setTerrainTemplate(template);
        this.container.querySelectorAll('.terrain-template-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.template === template);
        });
        this.renderArena();
      });
    });
    
    this.container.querySelector('#arena-close-result-btn').addEventListener('click', () => {
      this.hideResultPanel();
    });
    
    this.container.querySelector('#arena-clear-history-btn').addEventListener('click', () => {
      if (confirm('确定清空所有对战记录吗？')) {
        referee.clearHistory();
        this.refreshHistory();
      }
    });
    
    this.container.querySelector('#arena-start-tournament-btn').addEventListener('click', () => {
      const selectedGenes = this.tournamentSelectedGenes || [];
      if (selectedGenes.length >= 4) {
        this.arena.startTournament(selectedGenes, this.geneLab);
      }
    });
    
    const slots = this.container.querySelectorAll('.arena-contestant-slot');
    slots.forEach(slot => {
      slot.addEventListener('dragover', (e) => {
        e.preventDefault();
        slot.classList.add('drag-over');
      });
      
      slot.addEventListener('dragleave', () => {
        slot.classList.remove('drag-over');
      });
      
      slot.addEventListener('drop', (e) => {
        e.preventDefault();
        slot.classList.remove('drag-over');
        
        const geneId = e.dataTransfer.getData('application/x-gene') || e.dataTransfer.getData('text/plain');
        if (geneId) {
          const gene = this.geneLab.getGene(geneId);
          if (gene) {
            const colonyId = this.colonyIdCounter++;
            this.arena.addContestant(gene, colonyId);
          }
        }
      });
    });
    
    this.container.addEventListener('dragover', (e) => {
      e.preventDefault();
    });
    
    this.container.addEventListener('drop', (e) => {
      e.preventDefault();
    });
    
    const resultModal = this.container.querySelector('#arena-result-modal');
    resultModal.addEventListener('click', (e) => {
      if (e.target === resultModal) {
        this.hideResultPanel();
      }
    });
  }

  _bindReplayEvents() {
    const slider = this.container.querySelector('#replay-timeline-slider');
    const playBtn = this.container.querySelector('#replay-play-btn');
    const territoryToggle = this.container.querySelector('#replay-territory-toggle');
    const speedBtns = this.container.querySelectorAll('.replay-speed-btn');

    if (slider) {
      slider.addEventListener('input', (e) => {
        const gen = parseInt(e.target.value);
        this._jumpToGen(gen);
      });
    }

    if (playBtn) {
      playBtn.addEventListener('click', () => {
        this._togglePlayback();
      });
    }

    if (territoryToggle) {
      territoryToggle.addEventListener('change', (e) => {
        if (this.replayState) {
          this.replayState.territoryMode = e.target.checked;
          this._refreshReplayCanvas();
        }
      });
    }

    speedBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        speedBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.replayState.speed = parseInt(btn.dataset.speed);
      });
    });
  }

  _togglePlayback() {
    if (!this.replayState) return;

    this.replayState.isPlaying = !this.replayState.isPlaying;
    const playBtn = this.container.querySelector('#replay-play-btn');

    if (this.replayState.isPlaying) {
      playBtn.textContent = '⏸ 暂停';
      this._startPlayback();
    } else {
      playBtn.textContent = '▶ 播放';
      this._stopPlayback();
    }
  }

  _startPlayback() {
    if (!this.replayState || !this.replayState.isPlaying) return;

    const state = this.replayState;
    const maxGen = state.replayManager.getTotalGenerations() - 1;

    const tick = () => {
      if (!state.isPlaying) return;

      state.currentGen += state.speed;
      if (state.currentGen > maxGen) {
        state.currentGen = maxGen;
        state.isPlaying = false;
        const playBtn = this.container.querySelector('#replay-play-btn');
        if (playBtn) playBtn.textContent = '▶ 播放';
      }

      this._jumpToGen(Math.floor(state.currentGen));

      if (state.isPlaying) {
        state.playbackTimer = setTimeout(tick, 200 / state.speed);
      }
    };

    if (state.currentGen >= maxGen) {
      state.currentGen = 0;
    }
    tick();
  }

  _stopPlayback() {
    if (this.replayState && this.replayState.playbackTimer) {
      clearTimeout(this.replayState.playbackTimer);
      this.replayState.playbackTimer = null;
    }
  }

  _jumpToGen(gen) {
    if (!this.replayState) return;

    const maxGen = this.replayState.replayManager.getTotalGenerations() - 1;
    gen = Math.max(0, Math.min(maxGen, gen));
    this.replayState.currentGen = gen;

    const slider = this.container.querySelector('#replay-timeline-slider');
    if (slider && parseInt(slider.value) !== gen) {
      slider.value = gen;
    }

    const genLabel = this.container.querySelector('#replay-current-gen');
    if (genLabel) {
      genLabel.textContent = `第 ${gen} 代`;
    }

    this._refreshReplayCanvas();
    this._refreshCharts();
  }

  _refreshReplayCanvas() {
    if (!this.replayState) return;

    const canvas = this.container.querySelector('#replay-canvas');
    if (!canvas) return;

    const { replayManager, contestants, wallGrid, currentGen, territoryMode } = this.replayState;
    const frame = replayManager.getFrame(currentGen);

    this.arena.renderReplayFrame(canvas, frame, contestants, wallGrid, { territoryMode });
  }

  _renderLineChart(canvas, chartData, currentGen) {
    const { lineData, totalGens } = chartData;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    let w = rect.width;
    let h = rect.height;
    if (w <= 0 || h <= 0) { w = 280; h = 120; }

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, w, h);

    const padL = 36, padR = 10, padT = 8, padB = 20;
    const chartW = w - padL - padR;
    const chartH = h - padT - padB;

    let maxCount = 0;
    for (const counts of lineData) {
      for (const c of counts.values()) {
        if (c > maxCount) maxCount = c;
      }
    }
    if (maxCount === 0) maxCount = 1;

    ctx.strokeStyle = 'rgba(80, 100, 140, 0.15)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padT + chartH * (i / 4);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + chartW, y);
      ctx.stroke();
    }

    ctx.fillStyle = '#666';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) {
      const val = Math.round(maxCount * (1 - i / 4));
      const y = padT + chartH * (i / 4);
      ctx.fillText(val.toString(), padL - 4, y);
    }

    const contestantMap = new Map();
    for (const c of this.replayState.contestants) {
      contestantMap.set(c.colonyId, c);
    }

    const sampleRate = Math.max(1, Math.floor(totalGens / 200));

    for (const [cid, contestant] of contestantMap) {
      ctx.strokeStyle = contestant.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let started = false;

      for (let g = 0; g < totalGens; g += sampleRate) {
        const counts = lineData[g];
        const count = counts ? (counts.get(cid) || 0) : 0;
        const x = padL + chartW * (g / Math.max(1, totalGens - 1));
        const y = padT + chartH * (1 - count / maxCount);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }

      const lastG = totalGens - 1;
      const lastCounts = lineData[lastG];
      const lastCount = lastCounts ? (lastCounts.get(cid) || 0) : 0;
      const lx = padL + chartW;
      const ly = padT + chartH * (1 - lastCount / maxCount);
      ctx.lineTo(lx, ly);
      ctx.stroke();
    }

    const markerX = padL + chartW * (currentGen / Math.max(1, totalGens - 1));
    ctx.strokeStyle = 'rgba(233, 69, 96, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(markerX, padT);
    ctx.lineTo(markerX, padT + chartH);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  _renderAreaChart(canvas, chartData, currentGen) {
    const { areaData, totalGens } = chartData;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    let w = rect.width;
    let h = rect.height;
    if (w <= 0 || h <= 0) { w = 280; h = 120; }

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, w, h);

    const padL = 36, padR = 10, padT = 8, padB = 20;
    const chartW = w - padL - padR;
    const chartH = h - padT - padB;

    ctx.strokeStyle = 'rgba(80, 100, 140, 0.15)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padT + chartH * (i / 4);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + chartW, y);
      ctx.stroke();
    }

    ctx.fillStyle = '#666';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) {
      const val = Math.round((1 - i / 4) * 100);
      const y = padT + chartH * (i / 4);
      ctx.fillText(val + '%', padL - 4, y);
    }

    const contestantMap = new Map();
    for (const c of this.replayState.contestants) {
      contestantMap.set(c.colonyId, c);
    }

    const sampleRate = Math.max(1, Math.floor(totalGens / 200));
    const cids = [...contestantMap.keys()];

    for (let ci = 0; ci < cids.length; ci++) {
      const cid = cids[ci];
      const contestant = contestantMap.get(cid);
      ctx.fillStyle = contestant.color;
      ctx.beginPath();

      const pointsBottom = [];
      const pointsTop = [];

      for (let g = 0; g < totalGens; g += sampleRate) {
        const ratios = areaData[g];
        let bottomRatio = 0;
        for (let bi = 0; bi < ci; bi++) {
          bottomRatio += ratios ? (ratios.get(cids[bi]) || 0) : 0;
        }
        const thisRatio = ratios ? (ratios.get(cid) || 0) : 0;
        const topRatio = bottomRatio + thisRatio;
        const x = padL + chartW * (g / Math.max(1, totalGens - 1));
        pointsBottom.push({ x, y: padT + chartH * (1 - bottomRatio) });
        pointsTop.push({ x, y: padT + chartH * (1 - topRatio) });
      }

      const lastG = totalGens - 1;
      const lastRatios = areaData[lastG];
      let lBottom = 0;
      for (let bi = 0; bi < ci; bi++) {
        lBottom += lastRatios ? (lastRatios.get(cids[bi]) || 0) : 0;
      }
      const lTop = lBottom + (lastRatios ? (lastRatios.get(cid) || 0) : 0);
      pointsBottom.push({ x: padL + chartW, y: padT + chartH * (1 - lBottom) });
      pointsTop.push({ x: padL + chartW, y: padT + chartH * (1 - lTop) });

      if (pointsTop.length > 0) {
        ctx.moveTo(pointsTop[0].x, pointsTop[0].y);
        for (let i = 1; i < pointsTop.length; i++) {
          ctx.lineTo(pointsTop[i].x, pointsTop[i].y);
        }
        for (let i = pointsBottom.length - 1; i >= 0; i--) {
          ctx.lineTo(pointsBottom[i].x, pointsBottom[i].y);
        }
        ctx.closePath();
        ctx.fill();
      }
    }

    const markerX = padL + chartW * (currentGen / Math.max(1, totalGens - 1));
    ctx.strokeStyle = 'rgba(233, 69, 96, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(markerX, padT);
    ctx.lineTo(markerX, padT + chartH);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  _renderGrowthChart(canvas, currentGen) {
    const { replayManager, contestants } = this.replayState;
    const growthRates = replayManager.getGrowthRates(currentGen);

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    let w = rect.width;
    let h = rect.height;
    if (w <= 0 || h <= 0) { w = 280; h = 120; }

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, w, h);

    const padL = 36, padR = 10, padT = 8, padB = 24;
    const chartW = w - padL - padR;
    const chartH = h - padT - padB;
    const midY = padT + chartH / 2;

    ctx.strokeStyle = 'rgba(80, 100, 140, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, midY);
    ctx.lineTo(padL + chartW, midY);
    ctx.stroke();

    let maxAbs = 0;
    for (const rate of growthRates.values()) {
      maxAbs = Math.max(maxAbs, Math.abs(rate));
    }
    maxAbs = Math.max(maxAbs, 1);
    const scale = (chartH / 2) / maxAbs;

    ctx.fillStyle = '#666';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const topVal = '+' + Math.round(maxAbs) + '%';
    const botVal = '-' + Math.round(maxAbs) + '%';
    ctx.fillText(topVal, padL - 4, padT + 4);
    ctx.fillText('0%', padL - 4, midY);
    ctx.fillText(botVal, padL - 4, padT + chartH - 4);

    const barCount = contestants.length;
    const barGap = 8;
    const totalGap = barGap * (barCount + 1);
    const barW = (chartW - totalGap) / barCount;

    contestants.forEach((c, i) => {
      const rate = growthRates.get(c.colonyId) || 0;
      const barH = Math.abs(rate) * scale;
      const x = padL + barGap + i * (barW + barGap);
      const isPositive = rate >= 0;
      const y = isPositive ? midY - barH : midY;

      ctx.fillStyle = c.color;
      ctx.fillRect(x, y, barW, Math.max(1, barH));

      ctx.fillStyle = '#aaa';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const displayRate = (rate >= 0 ? '+' : '') + rate.toFixed(0) + '%';
      ctx.fillText(displayRate, x + barW / 2, padT + chartH + 2);

      ctx.fillStyle = c.color;
      const dotY = padT + chartH + 14;
      ctx.beginPath();
      ctx.arc(x + barW / 2, dotY, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  _refreshCharts() {
    if (!this.replayState) return;

    const lineCanvas = this.container.querySelector('#replay-line-chart');
    const areaCanvas = this.container.querySelector('#replay-area-chart');
    const growthCanvas = this.container.querySelector('#replay-growth-chart');

    const chartData = this.replayState.chartData;
    const currentGen = this.replayState.currentGen;

    if (lineCanvas) this._renderLineChart(lineCanvas, chartData, currentGen);
    if (areaCanvas) this._renderAreaChart(areaCanvas, chartData, currentGen);
    if (growthCanvas) this._renderGrowthChart(growthCanvas, currentGen);
  }

  _renderSummary(summary) {
    const summaryEl = this.container.querySelector('#replay-summary');
    if (!summaryEl) return;

    const { totalGenerations, champion, eliminationOrder, mostBalancedGen, dominationEvents } = summary;

    const elimHtml = eliminationOrder.length > 0
      ? eliminationOrder.map(e => `
          <span class="summary-elim-item" data-gen="${e.generation}">
            <span class="summary-dot" style="background:${e.color}"></span>
            ${this.escapeHtml(e.name)}<span class="summary-sub">@${e.generation}代</span>
          </span>
        `).join(' → ')
      : '<span class="summary-none">无</span>';

    const champHtml = champion
      ? `<span class="summary-champion-name" style="color:${champion.color}">🏆 ${this.escapeHtml(champion.name)}</span>`
      : '<span class="summary-none">无冠军</span>';

    const balancedHtml = mostBalancedGen > 0
      ? `<span class="summary-balanced-item" data-gen="${mostBalancedGen}">⚖️ 第${mostBalancedGen}代</span>`
      : '<span class="summary-none">-</span>';

    summaryEl.innerHTML = `
      <div class="summary-row">
        <div class="summary-block">
          <span class="summary-label">总代数</span>
          <span class="summary-value">${totalGenerations}</span>
        </div>
        <div class="summary-block">
          <span class="summary-label">冠军</span>
          <span class="summary-value">${champHtml}</span>
        </div>
      </div>
      <div class="summary-row">
        <div class="summary-block wide">
          <span class="summary-label">淘汰顺序</span>
          <div class="summary-value">${elimHtml}</div>
        </div>
      </div>
      <div class="summary-row">
        <div class="summary-block">
          <span class="summary-label">最激烈一代</span>
          <div class="summary-value">${balancedHtml}</div>
        </div>
        <div class="summary-block">
          <span class="summary-label">首次过半</span>
          <div class="summary-value">
            ${dominationEvents.length > 0 ? dominationEvents.map(e => `
              <span class="summary-dom-item" data-gen="${e.generation}">
                <span class="summary-dot" style="background:${e.color}"></span>
                ${this.escapeHtml(e.name)}<span class="summary-sub">@${e.generation}代</span>
              </span>
            `).join(' ') : '<span class="summary-none">-</span>'}
          </div>
        </div>
      </div>
    `;

    summaryEl.querySelectorAll('[data-gen]').forEach(el => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => {
        const gen = parseInt(el.dataset.gen);
        if (!isNaN(gen)) {
          this._jumpToGen(gen);
        }
      });
    });
  }

  _renderEventMarkers(summary, maxGen) {
    const container = this.container.querySelector('#replay-event-markers');
    if (!container || maxGen <= 0) return;

    const events = [];

    for (const e of summary.eliminationOrder) {
      events.push({ gen: e.generation, type: 'elim' });
    }
    for (const e of summary.dominationEvents) {
      events.push({ gen: e.generation, type: 'dom' });
    }

    container.innerHTML = events.map(e => {
      const left = (e.gen / maxGen) * 100;
      const color = e.type === 'elim' ? '#e94560' : '#ffd700';
      const title = e.type === 'elim' ? '淘汰事件' : '首次过半';
      return `<div class="event-marker event-${e.type}" title="${title}" style="left:${left}%;background:${color}"></div>`;
    }).join('');
  }

  switchTab(tabName) {
    this.container.querySelectorAll('.arena-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    
    this.container.querySelectorAll('.arena-tab-content').forEach(content => {
      content.classList.toggle('active', content.dataset.tab === tabName);
    });
    
    if (tabName === 'history') {
      this.refreshHistory();
    } else if (tabName === 'tournament') {
      this.refreshTournamentGeneList();
    }
  }

  updateContestantSlots() {
    const slots = this.container.querySelectorAll('.arena-contestant-slot');
    const contestants = this.arena.contestants;
    
    slots.forEach(slot => {
      const slotIndex = parseInt(slot.dataset.slot);
      const contestant = contestants.find(c => c.corner === slotIndex);
      
      if (contestant) {
        slot.innerHTML = `
          <div class="slot-corner">${['左上', '右上', '左下', '右下'][slotIndex]}</div>
          <div class="slot-content filled">
            <span class="gene-color" style="background: ${contestant.color}"></span>
            <span class="gene-name">${this.escapeHtml(contestant.name)}</span>
            <button class="slot-remove-btn" data-colony="${contestant.colonyId}">✕</button>
          </div>
        `;
        
        slot.querySelector('.slot-remove-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          const colonyId = parseInt(e.target.dataset.colony);
          this.arena.removeContestant(colonyId);
        });
      } else {
        slot.innerHTML = `
          <div class="slot-corner">${['左上', '右上', '左下', '右下'][slotIndex]}</div>
          <div class="slot-content">
            <span class="slot-hint">拖入基因</span>
          </div>
        `;
      }
    });
    
    const overlay = this.container.querySelector('#arena-overlay');
    if (overlay) {
      if (contestants.length === 0) {
        overlay.classList.remove('hidden');
      } else {
        overlay.classList.add('hidden');
      }
    }
  }

  updateControlButtons() {
    const startBtn = this.container.querySelector('#arena-start-btn');
    const stopBtn = this.container.querySelector('#arena-stop-btn');
    const clearBtn = this.container.querySelector('#arena-clear-btn');
    const tournamentBtn = this.container.querySelector('#arena-start-tournament-btn');
    
    const contestants = this.arena.contestants;
    const isRunning = this.arena.isRunning;
    
    if (startBtn) {
      startBtn.disabled = contestants.length < 2 || isRunning;
    }
    if (stopBtn) {
      stopBtn.disabled = !isRunning;
    }
    if (clearBtn) {
      clearBtn.disabled = isRunning;
    }
    
    if (tournamentBtn) {
      const selectedCount = (this.tournamentSelectedGenes || []).length;
      tournamentBtn.disabled = selectedCount < 4 || isRunning;
    }
  }

  updateStats(state) {
    const genEl = this.container.querySelector('#arena-gen');
    const totalEl = this.container.querySelector('#arena-total');
    
    if (state) {
      if (genEl) genEl.textContent = state.generation;
      if (totalEl) totalEl.textContent = state.totalAlive;
    } else {
      if (genEl) genEl.textContent = '0';
      if (totalEl) totalEl.textContent = '0';
    }
  }

  startRenderLoop() {
    if (this.renderAnimationId) return;
    
    const render = () => {
      this.renderArena();
      this.renderAnimationId = requestAnimationFrame(render);
    };
    render();
  }

  stopRenderLoop() {
    if (this.renderAnimationId) {
      cancelAnimationFrame(this.renderAnimationId);
      this.renderAnimationId = null;
    }
    this.renderArena();
  }

  renderArena() {
    if (!this.canvas || !this.ctx) return;
    this.arena.renderToCanvas(this.canvas);
  }

  showResultPanel(data) {
    this._stopPlayback();
    this.replayState = null;

    const modal = this.container.querySelector('#arena-result-modal');
    const { panelData, replayData } = data;
    
    this.container.querySelector('#arena-result-title').textContent = panelData.title;
    modal.classList.remove('hidden');

    if (replayData && replayData.replayManager) {
      const { replayManager, contestants, wallGrid } = replayData;
      const maxGen = Math.max(0, replayManager.getTotalGenerations() - 1);
      const summary = replayManager.getSummary();
      const chartData = replayManager.getChartData();

      this.replayState = {
        replayManager,
        contestants,
        wallGrid,
        currentGen: 0,
        isPlaying: false,
        speed: 1,
        territoryMode: false,
        chartData,
        playbackTimer: null
      };

      const slider = this.container.querySelector('#replay-timeline-slider');
      if (slider) {
        slider.min = 0;
        slider.max = maxGen;
        slider.value = 0;
      }

      this._bindReplayEvents();
      this._renderSummary(summary);
      this._renderEventMarkers(summary, maxGen);

      setTimeout(() => {
        this._jumpToGen(0);
      }, 50);
    } else {
      setTimeout(() => {
        const pieCanvas = this.container.querySelector('#result-pie-chart');
        if (pieCanvas) referee.renderPieChart(pieCanvas, panelData.pieChartData);
      }, 50);
    }
  }

  hideResultPanel() {
    this._stopPlayback();
    this.replayState = null;
    const modal = this.container.querySelector('#arena-result-modal');
    modal.classList.add('hidden');
  }

  refreshHistory() {
    const container = this.container.querySelector('#arena-history-container');
    if (container) {
      referee.renderHistoryTable(container);
    }
  }

  refreshTournamentGeneList() {
    const container = this.container.querySelector('#tournament-gene-list');
    if (!container) return;
    
    const genes = this.geneLab.getAllGenes();
    const selected = this.tournamentSelectedGenes || [];
    
    if (genes.length === 0) {
      container.innerHTML = '<div class="empty-hint">暂无基因卡片，请先在基因实验室创建</div>';
      return;
    }
    
    container.innerHTML = genes.map(gene => {
      const isSelected = selected.includes(gene.id);
      return `
        <div class="tournament-gene-item ${isSelected ? 'selected' : ''}" data-gene-id="${gene.id}">
          <span class="gene-color" style="background: ${gene.color}"></span>
          <span class="gene-name">${this.escapeHtml(gene.name)}</span>
          <span class="gene-bs">${gene.toBSString()}</span>
        </div>
      `;
    }).join('');
    
    container.querySelectorAll('.tournament-gene-item').forEach(item => {
      item.addEventListener('click', () => {
        const geneId = item.dataset.geneId;
        this.toggleTournamentGene(geneId);
      });
    });
    
    this.updateTournamentSelectedLabel();
  }

  toggleTournamentGene(geneId) {
    if (!this.tournamentSelectedGenes) {
      this.tournamentSelectedGenes = [];
    }
    
    const index = this.tournamentSelectedGenes.indexOf(geneId);
    if (index === -1) {
      this.tournamentSelectedGenes.push(geneId);
    } else {
      this.tournamentSelectedGenes.splice(index, 1);
    }
    
    this.refreshTournamentGeneList();
    this.updateControlButtons();
  }

  updateTournamentSelectedLabel() {
    const label = this.container.querySelector('.tournament-selected-label');
    if (label) {
      const count = (this.tournamentSelectedGenes || []).length;
      label.textContent = `已选择 ${count} 个基因${count >= 4 ? ' ✓' : ` (还需${4 - count}个)`}`;
    }
  }

  showTournamentBracket() {
    const bracketEl = this.container.querySelector('#tournament-bracket');
    if (!bracketEl || !this.arena.tournamentBracket) return;
    
    let html = '<div class="tournament-bracket-display">';
    
    for (const round of this.arena.tournamentBracket) {
      html += `
        <div class="tournament-round">
          <div class="tournament-round-title">${round.round}</div>
          <div class="tournament-matches">
            ${round.matches.map((match, idx) => {
              const result = round.results[idx];
              let matchHtml = '<div class="tournament-match">';
              
              for (let i = 0; i < match.length; i++) {
                const geneId = match[i];
                const gene = this.geneLab.getGene(geneId);
                const isWinner = result && result.winner === geneId;
                const isLoser = result && result.winner && result.winner !== geneId;
                
                matchHtml += `
                  <div class="tournament-contestant ${isWinner ? 'winner' : ''} ${isLoser ? 'loser' : ''}">
                    <span class="gene-color" style="background: ${gene?.color || '#888'}"></span>
                    <span>${gene?.name || '未知'}</span>
                    ${isWinner ? '<span class="winner-badge">✓</span>' : ''}
                  </div>
                `;
              }
              
              matchHtml += '</div>';
              return matchHtml;
            }).join('')}
          </div>
        </div>
      `;
    }
    
    html += '</div>';
    bracketEl.innerHTML = html;
  }

  updateTournamentStatus(data) {
    const statusEl = this.container.querySelector('.tournament-selected-label');
    if (statusEl) {
      statusEl.textContent = `${data.round} - 第${data.matchIndex + 1}场进行中...`;
    }
  }

  updateTournamentResults(data) {
    this.showTournamentBracket();
  }

  showTournamentResult(data) {
    const bracketEl = this.container.querySelector('#tournament-bracket');
    if (!bracketEl) return;
    
    let html = '<div class="tournament-final-result">';
    if (data.champion) {
      html += `
        <div class="tournament-champion">
          <div class="crown-icon">👑</div>
          <div class="champion-info">
            <span class="gene-color" style="background: ${data.champion.color}; width: 20px; height: 20px; border-radius: 50%;"></span>
            <span class="champion-name">${this.escapeHtml(data.champion.name)}</span>
          </div>
          <div class="champion-title">锦标赛冠军！</div>
        </div>
      `;
    } else {
      html += '<div class="tournament-no-champion">无冠军产生</div>';
    }
    html += '</div>';
    
    bracketEl.innerHTML = html + bracketEl.innerHTML;
    
    const btn = this.container.querySelector('#arena-start-tournament-btn');
    if (btn) btn.disabled = false;
  }

  showError(message) {
    const toast = document.createElement('div');
    toast.className = 'arena-toast error';
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(244, 67, 54, 0.95);
      color: #fff;
      padding: 10px 20px;
      border-radius: 6px;
      font-size: 13px;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, 2000);
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  destroy() {
    this._stopPlayback();
    this.stopRenderLoop();
  }
}
