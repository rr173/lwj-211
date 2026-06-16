import { AnalysisEngine } from './AnalysisEngine.js';
import { ChartRenderer } from './ChartRenderer.js';
import { eventBus } from '../core/EventBus.js';

export class AnalyzerUI {
  constructor(colonyManager, geneLab, containerId) {
    this.colonyManager = colonyManager;
    this.geneLab = geneLab;
    this.container = document.getElementById(containerId);
    this.analysisEngine = null;
    this.currentRule = null;
    this.analysisResult = null;
    this.isAnalyzing = false;
    this.chartRenderers = {};

    this.init();
  }

  init() {
    this.render();
    this.bindEvents();
    this.bindEventBus();
  }

  render() {
    this.container.innerHTML = `
      <div class="analyzer-container">
        <div class="analyzer-header">
          <div class="analyzer-title">
            <span class="analyzer-icon">📊</span>
            <span>规则分析仪</span>
          </div>
          <div class="analyzer-selected">
            <span class="analyzer-selected-label">当前选择:</span>
            <span id="analyzer-selected-name" class="analyzer-selected-name">未选择</span>
          </div>
        </div>
        
        <div class="analyzer-controls">
          <button id="analyzer-btn" class="analyzer-btn primary" disabled>
            <span class="btn-icon">🔬</span>
            <span class="btn-text">开始分析</span>
          </button>
          <button id="analyzer-cancel-btn" class="analyzer-btn" style="display:none;">
            取消
          </button>
        </div>

        <div id="analyzer-loading" class="analyzer-loading hidden">
          <div class="loading-spinner"></div>
          <div class="loading-text">正在分析中...</div>
          <div class="loading-progress">
            <div class="progress-bar" id="analyzer-progress"></div>
          </div>
        </div>

        <div id="analyzer-results" class="analyzer-results hidden">
          <div class="analysis-section">
            <div class="section-header">
              <span class="section-icon">📈</span>
              <span class="section-title">密度-存活率曲线</span>
            </div>
            <div class="analysis-content">
              <canvas id="density-chart-canvas" class="analysis-canvas"></canvas>
              <div class="analysis-stats">
                <div class="stat-item">
                  <span class="stat-label">峰值密度</span>
                  <span class="stat-value" id="density-peak-density">-</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">峰值存活率</span>
                  <span class="stat-value" id="density-peak-survival">-</span>
                </div>
              </div>
            </div>
          </div>

          <div class="analysis-section">
            <div class="section-header">
              <span class="section-icon">🔄</span>
              <span class="section-title">周期检测</span>
            </div>
            <div class="analysis-content">
              <canvas id="cycle-chart-canvas" class="analysis-canvas small-canvas"></canvas>
              <div class="analysis-stats">
                <div class="stat-item">
                  <span class="stat-label">是否进入周期</span>
                  <span class="stat-value" id="cycle-has-cycle">-</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">进入周期代</span>
                  <span class="stat-value" id="cycle-start-gen">-</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">周期长度</span>
                  <span class="stat-value" id="cycle-length">-</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">最终状态</span>
                  <span class="stat-value" id="cycle-final-state">-</span>
                </div>
              </div>
            </div>
          </div>

          <div class="analysis-section">
            <div class="section-header">
              <span class="section-icon">🌱</span>
              <span class="section-title">增长曲线分析</span>
            </div>
            <div class="analysis-content">
              <canvas id="growth-chart-canvas" class="analysis-canvas"></canvas>
              <canvas id="growth-phase-canvas" class="phase-canvas"></canvas>
              <div class="analysis-stats">
                <div class="stat-item">
                  <span class="stat-label">最大细胞数</span>
                  <span class="stat-value" id="growth-max-count">-</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">增长倍数</span>
                  <span class="stat-value" id="growth-ratio">-</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">最终细胞数</span>
                  <span class="stat-value" id="growth-final-count">-</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">增长类型</span>
                  <span class="stat-value" id="growth-type">-</span>
                </div>
              </div>
            </div>
          </div>

          <div class="analysis-section">
            <div class="section-header">
              <span class="section-icon">🔥</span>
              <span class="section-title">邻域影响热力图</span>
            </div>
            <div class="analysis-content heatmap-content">
              <div class="heatmap-wrapper">
                <canvas id="neighborhood-canvas" class="neighborhood-canvas"></canvas>
              </div>
              <div class="heatmap-legend">
                <div class="legend-item">
                  <span class="legend-color" style="background: #4caf50"></span>
                  <span>中心存活</span>
                </div>
                <div class="legend-item">
                  <span class="legend-color" style="background: #f44336"></span>
                  <span>中心死亡</span>
                </div>
                <div class="legend-item">
                  <span class="legend-color" style="background: #ffb74d"></span>
                  <span>中心细胞</span>
                </div>
              </div>
            </div>
          </div>

          <div class="analysis-section">
            <div class="section-header">
              <span class="section-icon">⭐</span>
              <span class="section-title">综合评分</span>
            </div>
            <div class="analysis-content">
              <canvas id="radar-chart-canvas" class="radar-canvas"></canvas>
              <div class="score-list">
                <div class="score-item">
                  <span class="score-label">稳定性</span>
                  <div class="score-bar">
                    <div class="score-fill" id="score-stability-bar" style="width: 0%"></div>
                  </div>
                  <span class="score-value" id="score-stability">0</span>
                </div>
                <div class="score-item">
                  <span class="score-label">活跃度</span>
                  <div class="score-bar">
                    <div class="score-fill" id="score-activity-bar" style="width: 0%"></div>
                  </div>
                  <span class="score-value" id="score-activity">0</span>
                </div>
                <div class="score-item">
                  <span class="score-label">扩张力</span>
                  <div class="score-bar">
                    <div class="score-fill" id="score-expansion-bar" style="width: 0%"></div>
                  </div>
                  <span class="score-value" id="score-expansion">0</span>
                </div>
                <div class="score-item">
                  <span class="score-label">鲁棒性</span>
                  <div class="score-bar">
                    <div class="score-fill" id="score-robustness-bar" style="width: 0%"></div>
                  </div>
                  <span class="score-value" id="score-robustness">0</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div id="analyzer-empty" class="analyzer-empty">
          <div class="empty-icon">📊</div>
          <div class="empty-text">选择一个群落或基因<br>点击"开始分析"查看规则特性</div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    const analyzeBtn = document.getElementById('analyzer-btn');
    if (analyzeBtn) {
      analyzeBtn.addEventListener('click', () => this.startAnalysis());
    }
  }

  bindEventBus() {
    eventBus.on('colony:selected', (colony) => {
      if (colony && colony.rule) {
        this.setRule(colony.rule, colony.name, colony.color);
      }
    });

    eventBus.on('genelab:selectionChanged', (selectedIds) => {
      if (selectedIds && selectedIds.length > 0) {
        const gene = this.geneLab.getGene(selectedIds[0]);
        if (gene) {
          this.setRule(gene, gene.name, gene.color);
        }
      }
    });
  }

  setRule(rule, name, color) {
    this.currentRule = rule;
    this.currentRuleName = name;
    this.currentRuleColor = color || '#4fc3f7';

    const selectedNameEl = document.getElementById('analyzer-selected-name');
    if (selectedNameEl) {
      selectedNameEl.textContent = name || '未命名规则';
      selectedNameEl.style.color = this.currentRuleColor;
    }

    const analyzeBtn = document.getElementById('analyzer-btn');
    if (analyzeBtn) {
      analyzeBtn.disabled = false;
    }
  }

  startAnalysis() {
    if (!this.currentRule || this.isAnalyzing) return;

    this.isAnalyzing = true;
    this.analysisEngine = new AnalysisEngine(this.currentRule);

    const loadingEl = document.getElementById('analyzer-loading');
    const resultsEl = document.getElementById('analyzer-results');
    const emptyEl = document.getElementById('analyzer-empty');
    const analyzeBtn = document.getElementById('analyzer-btn');

    if (loadingEl) loadingEl.classList.remove('hidden');
    if (resultsEl) resultsEl.classList.add('hidden');
    if (emptyEl) emptyEl.classList.add('hidden');
    if (analyzeBtn) {
      analyzeBtn.disabled = true;
      const btnText = analyzeBtn.querySelector('.btn-text');
      if (btnText) btnText.textContent = '分析中...';
    }

    setTimeout(() => {
      this.runAnalysisAsync();
    }, 50);
  }

  async runAnalysisAsync() {
    try {
      const progressEl = document.getElementById('analyzer-progress');
      let progress = 0;

      const updateProgress = (increment) => {
        progress += increment;
        if (progressEl) {
          progressEl.style.width = Math.min(100, progress) + '%';
        }
      };

      await new Promise(resolve => setTimeout(resolve, 10));
      updateProgress(15);

      const densityResult = this.analysisEngine.analyzeDensitySurvival();
      updateProgress(20);

      await new Promise(resolve => setTimeout(resolve, 10));
      const cycleResult = this.analysisEngine.detectCycle();
      updateProgress(20);

      await new Promise(resolve => setTimeout(resolve, 10));
      const growthResult = this.analysisEngine.analyzeGrowth();
      updateProgress(20);

      await new Promise(resolve => setTimeout(resolve, 10));
      const neighborhoodResult = this.analysisEngine.analyzeNeighborhoodInfluence();
      updateProgress(15);

      const scores = this.analysisEngine.calculateScores(
        densityResult, cycleResult, growthResult, neighborhoodResult
      );
      updateProgress(10);

      this.analysisResult = {
        density: densityResult,
        cycle: cycleResult,
        growth: growthResult,
        neighborhood: neighborhoodResult,
        scores
      };

      this.renderResults();
    } catch (error) {
      console.error('Analysis error:', error);
      alert('分析过程中出现错误: ' + error.message);
    } finally {
      this.isAnalyzing = false;
      const loadingEl = document.getElementById('analyzer-loading');
      const analyzeBtn = document.getElementById('analyzer-btn');
      
      if (loadingEl) loadingEl.classList.add('hidden');
      if (analyzeBtn) {
        analyzeBtn.disabled = false;
        const btnText = analyzeBtn.querySelector('.btn-text');
        if (btnText) btnText.textContent = '重新分析';
      }
    }
  }

  renderResults() {
    const resultsEl = document.getElementById('analyzer-results');
    const emptyEl = document.getElementById('analyzer-empty');
    
    if (resultsEl) resultsEl.classList.remove('hidden');
    if (emptyEl) emptyEl.classList.add('hidden');

    this.renderDensityChart();
    this.renderCycleChart();
    this.renderGrowthChart();
    this.renderNeighborhoodHeatmap();
    this.renderRadarChart();
  }

  renderDensityChart() {
    const canvas = document.getElementById('density-chart-canvas');
    if (!canvas || !this.analysisResult) return;

    const rect = canvas.getBoundingClientRect();
    const width = rect.width || 260;
    const height = 160;

    if (!this.chartRenderers.density) {
      this.chartRenderers.density = new ChartRenderer(canvas);
    }
    
    const renderer = this.chartRenderers.density;
    renderer.resize(width, height);
    renderer.clear();

    const densityData = this.analysisResult.density.data.map(d => ({
      x: d.density,
      y: d.survivalRate
    }));

    const xLabels = densityData.map(d => d.density + '%');

    renderer.drawLineChart(densityData, {
      color: this.currentRuleColor || '#e94560',
      fill: true,
      fillColor: this.currentRuleColor 
        ? this.hexToRgba(this.currentRuleColor, 0.15)
        : 'rgba(233, 69, 96, 0.15)',
      showDots: true,
      xLabels,
      yMin: 0,
      yMax: Math.max(1, ...densityData.map(d => d.y)),
      yTicks: 4,
      xTicks: 5
    });

    const peakDensity = this.analysisResult.density.peakDensity;
    const peakSurvival = this.analysisResult.density.peakSurvival;
    
    document.getElementById('density-peak-density').textContent = peakDensity + '%';
    document.getElementById('density-peak-survival').textContent = 
      (peakSurvival * 100).toFixed(1) + '%';
  }

  renderCycleChart() {
    const canvas = document.getElementById('cycle-chart-canvas');
    if (!canvas || !this.analysisResult) return;

    const rect = canvas.getBoundingClientRect();
    const width = rect.width || 260;
    const height = 50;

    if (!this.chartRenderers.cycle) {
      this.chartRenderers.cycle = new ChartRenderer(canvas);
    }
    
    const renderer = this.chartRenderers.cycle;
    renderer.resize(width, height);
    renderer.clear();

    renderer.drawTimeline(this.analysisResult.cycle, {
      color: this.currentRuleColor || '#4fc3f7',
      height: 40
    });

    const cycle = this.analysisResult.cycle;
    
    document.getElementById('cycle-has-cycle').textContent = 
      cycle.hasCycle ? '是' : '否';
    document.getElementById('cycle-has-cycle').style.color = 
      cycle.hasCycle ? '#4caf50' : '#ffb74d';
    
    document.getElementById('cycle-start-gen').textContent = 
      cycle.cycleStart !== -1 ? `第${cycle.cycleStart}代` : '未检测到';
    
    document.getElementById('cycle-length').textContent = 
      cycle.cycleLength !== -1 ? `${cycle.cycleLength}代` : '-';
    
    let finalState = '未知';
    let finalColor = '#888';
    if (cycle.diedOut) {
      finalState = '全灭';
      finalColor = '#f44336';
    } else if (cycle.stable) {
      finalState = '稳定';
      finalColor = '#2196f3';
    } else if (cycle.hasCycle) {
      finalState = '周期性震荡';
      finalColor = '#ffb74d';
    } else {
      finalState = '持续变化';
      finalColor = '#4caf50';
    }
    document.getElementById('cycle-final-state').textContent = finalState;
    document.getElementById('cycle-final-state').style.color = finalColor;
  }

  renderGrowthChart() {
    const canvas = document.getElementById('growth-chart-canvas');
    const phaseCanvas = document.getElementById('growth-phase-canvas');
    if (!canvas || !this.analysisResult) return;

    const growth = this.analysisResult.growth;
    const data = growth.counts.map((count, i) => ({ x: i, y: count }));

    const rect = canvas.getBoundingClientRect();
    const width = rect.width || 260;
    const height = 140;

    if (!this.chartRenderers.growth) {
      this.chartRenderers.growth = new ChartRenderer(canvas);
    }
    
    const renderer = this.chartRenderers.growth;
    renderer.resize(width, height);
    renderer.clear();

    renderer.drawLineChart(data, {
      color: this.currentRuleColor || '#4caf50',
      fill: true,
      fillColor: this.currentRuleColor 
        ? this.hexToRgba(this.currentRuleColor, 0.15)
        : 'rgba(76, 175, 80, 0.15)',
      yMin: 0,
      yTicks: 4,
      xTicks: 5
    });

    if (phaseCanvas && growth.phases) {
      const phaseRect = phaseCanvas.getBoundingClientRect();
      const phaseWidth = phaseRect.width || 260;
      const phaseHeight = 40;

      if (!this.chartRenderers.phase) {
        this.chartRenderers.phase = new ChartRenderer(phaseCanvas);
      }
      
      const phaseRenderer = this.chartRenderers.phase;
      phaseRenderer.resize(phaseWidth, phaseHeight);
      phaseRenderer.clear();

      phaseRenderer.drawPhaseBands(growth.phases, {
        x: 0,
        y: 4,
        width: phaseWidth,
        height: 16,
        totalGens: data.length
      });
    }

    document.getElementById('growth-max-count').textContent = 
      growth.maxCount.toLocaleString();
    document.getElementById('growth-ratio').textContent = 
      growth.growthRatio.toFixed(1) + 'x';
    document.getElementById('growth-final-count').textContent = 
      growth.finalCount.toLocaleString();

    let growthType = '稳定型';
    let growthColor = '#2196f3';
    if (growth.diedOut) {
      growthType = '灭亡型';
      growthColor = '#f44336';
    } else if (growth.explosive) {
      growthType = '爆发型';
      growthColor = '#ff9800';
    } else if (growth.growthRatio > 5) {
      growthType = '增长型';
      growthColor = '#4caf50';
    }
    document.getElementById('growth-type').textContent = growthType;
    document.getElementById('growth-type').style.color = growthColor;
  }

  renderNeighborhoodHeatmap() {
    const canvas = document.getElementById('neighborhood-canvas');
    if (!canvas || !this.analysisResult) return;

    const neighborhood = this.analysisResult.neighborhood;
    const matrix = neighborhood.matrix;
    const size = matrix.length;
    const cellSize = 22;
    const totalSize = size * cellSize;

    if (!this.chartRenderers.neighborhood) {
      this.chartRenderers.neighborhood = new ChartRenderer(canvas);
    }
    
    const renderer = this.chartRenderers.neighborhood;
    renderer.resize(totalSize, totalSize);
    renderer.clear();

    const displayMatrix = [];
    for (let y = 0; y < size; y++) {
      const row = [];
      for (let x = 0; x < size; x++) {
        const cell = { ...matrix[y][x] };
        
        if (cell.type === 'neighbor') {
          const radius = Math.floor(size / 2);
          const dx = x - radius;
          const dy = y - radius;
          
          const testGrid = this.analysisEngine.createGrid(size, size);
          testGrid[radius][radius] = 1;
          testGrid[dy + radius][dx + radius] = 1;
          this.analysisEngine.step(testGrid);
          cell.survives = testGrid[radius][radius] === 1;
          cell.neighborCount = 1;
        } else if (cell.type === 'center') {
          cell.neighborCount = 0;
        }
        
        row.push(cell);
      }
      displayMatrix.push(row);
    }

    renderer.drawHeatmap(displayMatrix, {
      x: 0,
      y: 0,
      cellSize,
      survivalColor: '#4caf50',
      deathColor: '#f44336',
      centerColor: '#ffb74d',
      outsideColor: '#0a0a14'
    });
  }

  renderRadarChart() {
    const canvas = document.getElementById('radar-chart-canvas');
    if (!canvas || !this.analysisResult) return;

    const scores = this.analysisResult.scores;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || 200;
    const height = 200;

    if (!this.chartRenderers.radar) {
      this.chartRenderers.radar = new ChartRenderer(canvas);
    }
    
    const renderer = this.chartRenderers.radar;
    renderer.resize(width, height);
    renderer.clear();

    renderer.drawRadarChart(scores, {
      color: this.currentRuleColor || '#e94560',
      fillColor: this.currentRuleColor 
        ? this.hexToRgba(this.currentRuleColor, 0.2)
        : 'rgba(233, 69, 96, 0.2)',
      labels: ['稳定性', '活跃度', '扩张力', '鲁棒性']
    });

    const scoreItems = [
      { key: 'stability', id: 'stability' },
      { key: 'activity', id: 'activity' },
      { key: 'expansion', id: 'expansion' },
      { key: 'robustness', id: 'robustness' }
    ];

    for (const item of scoreItems) {
      const score = scores[item.key] || 0;
      const valueEl = document.getElementById(`score-${item.id}`);
      const barEl = document.getElementById(`score-${item.id}-bar`);
      
      if (valueEl) valueEl.textContent = score;
      if (barEl) {
        barEl.style.width = score + '%';
        let barColor = '#f44336';
        if (score >= 70) barColor = '#4caf50';
        else if (score >= 40) barColor = '#ffb74d';
        barEl.style.background = barColor;
      }
    }
  }

  hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  refresh() {
    if (this.analysisResult) {
      this.renderResults();
    }
  }
}
