import { eventBus } from '../core/EventBus.js';
import { Rule } from '../core/Rule.js';
import { Colony } from '../core/Colony.js';
import { EvolutionLab, NEIGHBORHOOD_OPTIONS } from './EvolutionLab.js';
import { FITNESS_PRESETS, getPresetConfig, FitnessEvalEngine } from './FitnessEvalEngine.js';

const FITNESS_OPTIONS = [
  { value: FITNESS_PRESETS.MAX_EXPANSION, label: '最大扩张', description: '从5个细胞的十字种子跑200代后活细胞数最多' },
  { value: FITNESS_PRESETS.MAX_CONTRACTION, label: '最大收缩', description: '从30%密度50x50随机种子跑200代后活细胞数最少且不全灭' },
  { value: FITNESS_PRESETS.MAX_OSCILLATORS, label: '最多振荡体', description: '跑300代后画布上能识别出的振荡体数量最多' },
  { value: FITNESS_PRESETS.FASTEST_EXTINCTION, label: '最快灭亡', description: '从30%密度50x50随机种子跑到全灭所需代数最少' },
  { value: FITNESS_PRESETS.CUSTOM, label: '自定义', description: '输入自定义JS表达式作为适应度函数' }
];

const NEIGHBORHOOD_OPTIONS_LIST = [
  { value: NEIGHBORHOOD_OPTIONS.MOORE_ONLY, label: '仅Moore邻域' },
  { value: NEIGHBORHOOD_OPTIONS.VN_ONLY, label: '仅Von Neumann邻域' },
  { value: NEIGHBORHOOD_OPTIONS.BOTH, label: '两者都搜索' }
];

export class EvolutionLabUI {
  constructor(evolutionLab, containerId, colonyManager, geneLab, arena) {
    this.evolutionLab = evolutionLab;
    this.container = document.getElementById(containerId);
    this.colonyManager = colonyManager;
    this.geneLab = geneLab;
    this.arena = arena;
    this.previewEngine = new FitnessEvalEngine(50, 50);
    this.previewAnimationId = null;
    this.previewGeneration = 0;
    this.bestFitnessHistory = [];
    this.avgFitnessHistory = [];
    this.globalBestHistory = [];

    if (this.container) {
      this.render();
      this.bindEvents();
    }
  }

  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="evolution-lab">
        <div class="panel-header">
          <h3>🧬 进化实验室</h3>
        </div>

        <div class="panel-section">
          <div class="section-title">适应度目标</div>
          <select id="evolution-fitness-select">
            ${FITNESS_OPTIONS.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('')}
          </select>
          <div id="fitness-description" class="hint" style="margin-top:6px;font-size:11px;"></div>
          
          <div id="custom-fitness-container" class="hidden" style="margin-top:8px;">
            <textarea id="custom-fitness-expression" placeholder="例如: finalCount - generations * 0.1&#10;可用变量: finalCount, initialCount, generations, maxCount, minCount"></textarea>
            <div class="hint" style="font-size:10px;color:#888;">表达式结果作为适应度分数，越大越好</div>
          </div>
        </div>

        <div class="panel-section">
          <div class="section-title">遗传算法参数</div>
          
          <div class="slider-row">
            <label>种群大小: <span id="population-size-value">30</span></label>
            <div class="slider-control">
              <input type="range" id="population-size" min="10" max="100" value="30" step="1">
              <input type="number" id="population-size-num" min="10" max="100" value="30" class="num-input">
            </div>
          </div>

          <div class="slider-row">
            <label>最大迭代代数: <span id="max-generations-value">50</span></label>
            <div class="slider-control">
              <input type="range" id="max-generations" min="10" max="200" value="50" step="1">
              <input type="number" id="max-generations-num" min="10" max="200" value="50" class="num-input">
            </div>
          </div>

          <div class="slider-row">
            <label>交叉率: <span id="crossover-rate-value">0.70</span></label>
            <div class="slider-control">
              <input type="range" id="crossover-rate" min="0" max="1" value="0.7" step="0.01">
              <input type="number" id="crossover-rate-num" min="0" max="1" value="0.7" step="0.01" class="num-input">
            </div>
          </div>

          <div class="slider-row">
            <label>突变率: <span id="mutation-rate-value">0.10</span></label>
            <div class="slider-control">
              <input type="range" id="mutation-rate" min="0" max="1" value="0.1" step="0.01">
              <input type="number" id="mutation-rate-num" min="0" max="1" value="0.1" step="0.01" class="num-input">
            </div>
          </div>

          <div class="slider-row">
            <label>精英保留数: <span id="elitism-count-value">3</span></label>
            <div class="slider-control">
              <input type="range" id="elitism-count" min="1" max="10" value="3" step="1">
              <input type="number" id="elitism-count-num" min="1" max="10" value="3" class="num-input">
            </div>
          </div>

          <div class="form-row" style="margin-top:12px;">
            <label>邻域类型</label>
            <select id="neighborhood-option">
              ${NEIGHBORHOOD_OPTIONS_LIST.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="panel-section">
          <button id="start-evolution-btn" class="primary-btn">▶ 开始进化</button>
          <button id="stop-evolution-btn" class="hidden" style="margin-top:8px;width:100%;background:#c73651;">⏹ 停止进化</button>
        </div>

        <div id="evolution-progress" class="panel-section hidden">
          <div class="section-title">进化进度</div>
          <div class="progress-info">
            <span>第 <span id="current-gen">0</span> / <span id="total-gen">50</span> 代</span>
            <span>评估: <span id="eval-progress">0/0</span></span>
          </div>
          <div class="progress-bar">
            <div id="progress-fill" class="progress-fill"></div>
          </div>
        </div>

        <div id="evolution-visualization" class="panel-section hidden">
          <div class="section-title">适应度曲线</div>
          <canvas id="fitness-chart" class="evolution-chart"></canvas>
          
          <div class="chart-legend">
            <div class="legend-item">
              <span class="legend-color" style="background:#e94560;"></span>
              <span>当代最优</span>
            </div>
            <div class="legend-item">
              <span class="legend-color" style="background:#4fc3f7;"></span>
              <span>当代平均</span>
            </div>
            <div class="legend-item">
              <span class="legend-color dashed" style="border-color:#ffb74d;"></span>
              <span>历史最优</span>
            </div>
          </div>

          <div class="section-title" style="margin-top:16px;">种群多样性</div>
          <div class="diversity-bar-container">
            <div id="diversity-bar" class="diversity-bar"></div>
            <span id="diversity-text" class="diversity-text">0%</span>
          </div>
          <div class="hint" style="font-size:10px;text-align:center;">100%表示所有个体都不同，越低表示收敛程度越高</div>
        </div>
      </div>

      <div id="evolution-result-modal" class="modal hidden">
        <div class="modal-content wide-modal">
          <div class="modal-header">
            <span id="result-modal-title">进化结果</span>
            <button id="close-result-modal" class="close-btn">&times;</button>
          </div>
          <div class="modal-body">
            <div class="result-container">
              <div class="result-info">
                <div class="section-title">最优规则</div>
                <div class="result-rule">
                  <div class="result-bs" id="result-bs">B3/S23</div>
                  <div class="result-neighborhood" id="result-neighborhood">Moore邻域</div>
                  <div class="result-fitness">
                    <span>适应度分数:</span>
                    <strong id="result-fitness">0</strong>
                  </div>
                </div>

                <div class="section-title" style="margin-top:16px;">进化统计</div>
                <div class="result-stats">
                  <div class="stat-row">
                    <span>总代数:</span>
                    <span id="result-generations">0</span>
                  </div>
                  <div class="stat-row">
                    <span>历史最高适应度:</span>
                    <span id="result-best-fitness">0</span>
                  </div>
                </div>

                <div class="section-title" style="margin-top:16px;">操作</div>
                <div class="result-actions">
                  <button id="add-to-library-btn" class="primary-btn">📚 加入规则库</button>
                  <button id="add-to-genelab-btn">🧬 加入基因实验室</button>
                  <button id="export-top10-btn">📤 导出前10</button>
                </div>
                <button id="battle-top5-btn" style="margin-top:8px;width:100%;background:#ff9800;">⚔️ 前5名对战</button>
              </div>

              <div class="result-preview">
                <div class="section-title">动画预览 (200代)</div>
                <canvas id="result-preview-canvas" class="preview-canvas"></canvas>
                <div class="preview-controls">
                  <button id="play-preview-btn">▶ 播放</button>
                  <button id="pause-preview-btn" class="hidden">⏸ 暂停</button>
                  <span id="preview-gen-display">第 0 代</span>
                </div>
              </div>
            </div>

            <div id="battle-result-container" class="battle-result hidden">
              <div class="section-title">前5名对战结果</div>
              <div id="battle-result-content"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.cacheElements();
    this.updateFitnessDescription();
  }

  cacheElements() {
    this.els = {
      fitnessSelect: document.getElementById('evolution-fitness-select'),
      fitnessDescription: document.getElementById('fitness-description'),
      customFitnessContainer: document.getElementById('custom-fitness-container'),
      customFitnessExpression: document.getElementById('custom-fitness-expression'),
      
      populationSize: document.getElementById('population-size'),
      populationSizeNum: document.getElementById('population-size-num'),
      populationSizeValue: document.getElementById('population-size-value'),
      
      maxGenerations: document.getElementById('max-generations'),
      maxGenerationsNum: document.getElementById('max-generations-num'),
      maxGenerationsValue: document.getElementById('max-generations-value'),
      
      crossoverRate: document.getElementById('crossover-rate'),
      crossoverRateNum: document.getElementById('crossover-rate-num'),
      crossoverRateValue: document.getElementById('crossover-rate-value'),
      
      mutationRate: document.getElementById('mutation-rate'),
      mutationRateNum: document.getElementById('mutation-rate-num'),
      mutationRateValue: document.getElementById('mutation-rate-value'),
      
      elitismCount: document.getElementById('elitism-count'),
      elitismCountNum: document.getElementById('elitism-count-num'),
      elitismCountValue: document.getElementById('elitism-count-value'),
      
      neighborhoodOption: document.getElementById('neighborhood-option'),
      
      startBtn: document.getElementById('start-evolution-btn'),
      stopBtn: document.getElementById('stop-evolution-btn'),
      
      progressSection: document.getElementById('evolution-progress'),
      currentGen: document.getElementById('current-gen'),
      totalGen: document.getElementById('total-gen'),
      evalProgress: document.getElementById('eval-progress'),
      progressFill: document.getElementById('progress-fill'),
      
      visualizationSection: document.getElementById('evolution-visualization'),
      fitnessChart: document.getElementById('fitness-chart'),
      diversityBar: document.getElementById('diversity-bar'),
      diversityText: document.getElementById('diversity-text'),
      
      resultModal: document.getElementById('evolution-result-modal'),
      closeResultModal: document.getElementById('close-result-modal'),
      resultModalTitle: document.getElementById('result-modal-title'),
      resultBs: document.getElementById('result-bs'),
      resultNeighborhood: document.getElementById('result-neighborhood'),
      resultFitness: document.getElementById('result-fitness'),
      resultGenerations: document.getElementById('result-generations'),
      resultBestFitness: document.getElementById('result-best-fitness'),
      
      addToLibraryBtn: document.getElementById('add-to-library-btn'),
      addToGenelabBtn: document.getElementById('add-to-genelab-btn'),
      exportTop10Btn: document.getElementById('export-top10-btn'),
      battleTop5Btn: document.getElementById('battle-top5-btn'),
      
      resultPreviewCanvas: document.getElementById('result-preview-canvas'),
      playPreviewBtn: document.getElementById('play-preview-btn'),
      pausePreviewBtn: document.getElementById('pause-preview-btn'),
      previewGenDisplay: document.getElementById('preview-gen-display'),
      
      battleResultContainer: document.getElementById('battle-result-container'),
      battleResultContent: document.getElementById('battle-result-content')
    };
  }

  bindEvents() {
    this.els.fitnessSelect.addEventListener('change', () => {
      this.updateFitnessDescription();
    });

    this._bindSliderPair(
      this.els.populationSize,
      this.els.populationSizeNum,
      this.els.populationSizeValue,
      v => v.toString()
    );

    this._bindSliderPair(
      this.els.maxGenerations,
      this.els.maxGenerationsNum,
      this.els.maxGenerationsValue,
      v => v.toString()
    );

    this._bindSliderPair(
      this.els.crossoverRate,
      this.els.crossoverRateNum,
      this.els.crossoverRateValue,
      v => v.toFixed(2)
    );

    this._bindSliderPair(
      this.els.mutationRate,
      this.els.mutationRateNum,
      this.els.mutationRateValue,
      v => v.toFixed(2)
    );

    this._bindSliderPair(
      this.els.elitismCount,
      this.els.elitismCountNum,
      this.els.elitismCountValue,
      v => v.toString()
    );

    this.els.startBtn.addEventListener('click', () => this.startEvolution());
    this.els.stopBtn.addEventListener('click', () => this.stopEvolution());

    this.els.closeResultModal.addEventListener('click', () => this.closeResultModal());
    this.els.resultModal.addEventListener('click', (e) => {
      if (e.target === this.els.resultModal) {
        this.closeResultModal();
      }
    });

    this.els.addToLibraryBtn.addEventListener('click', () => this.addToLibrary());
    this.els.addToGenelabBtn.addEventListener('click', () => this.addToGenelab());
    this.els.exportTop10Btn.addEventListener('click', () => this.exportTop10());
    this.els.battleTop5Btn.addEventListener('click', () => this.startTop5Battle());

    this.els.playPreviewBtn.addEventListener('click', () => this.playPreview());
    this.els.pausePreviewBtn.addEventListener('click', () => this.pausePreview());

    eventBus.on('evolution:generationComplete', (stats) => this.onGenerationComplete(stats));
    eventBus.on('evolution:evaluationProgress', (data) => this.onEvaluationProgress(data));
    eventBus.on('evolution:complete', (result) => this.onEvolutionComplete(result));
    eventBus.on('evolution:error', (error) => this.onEvolutionError(error));
    eventBus.on('evolution:earlyTermination', (info) => {
      this._showToast(`进化提前终止: ${info.reason}`);
    });
  }

  _bindSliderPair(slider, numInput, valueDisplay, formatFn) {
    slider.addEventListener('input', () => {
      const val = parseFloat(slider.value);
      numInput.value = slider.value;
      valueDisplay.textContent = formatFn(val);
    });

    numInput.addEventListener('change', () => {
      const min = parseFloat(slider.min);
      const max = parseFloat(slider.max);
      let val = parseFloat(numInput.value);
      val = Math.max(min, Math.min(max, val));
      numInput.value = val;
      slider.value = val;
      valueDisplay.textContent = formatFn(val);
    });
  }

  updateFitnessDescription() {
    const selected = this.els.fitnessSelect.value;
    const option = FITNESS_OPTIONS.find(o => o.value === selected);
    if (option) {
      this.els.fitnessDescription.textContent = option.description;
    }

    const isCustom = selected === FITNESS_PRESETS.CUSTOM;
    this.els.customFitnessContainer.classList.toggle('hidden', !isCustom);
  }

  collectParams() {
    return {
      populationSize: parseInt(this.els.populationSize.value, 10),
      maxGenerations: parseInt(this.els.maxGenerations.value, 10),
      crossoverRate: parseFloat(this.els.crossoverRate.value),
      mutationRate: parseFloat(this.els.mutationRate.value),
      elitismCount: parseInt(this.els.elitismCount.value, 10),
      neighborhoodOption: this.els.neighborhoodOption.value
    };
  }

  collectFitnessConfig() {
    return {
      preset: this.els.fitnessSelect.value,
      customExpression: this.els.customFitnessExpression.value.trim()
    };
  }

  async startEvolution() {
    const params = this.collectParams();
    const fitnessConfig = this.collectFitnessConfig();

    if (fitnessConfig.preset === FITNESS_PRESETS.CUSTOM && !fitnessConfig.customExpression) {
      alert('请输入自定义适应度表达式');
      return;
    }

    if (params.elitismCount >= params.populationSize) {
      alert('精英保留数必须小于种群大小');
      return;
    }

    this.evolutionLab.setParams(params);
    this.evolutionLab.setFitnessConfig(fitnessConfig);

    this.bestFitnessHistory = [];
    this.avgFitnessHistory = [];
    this.globalBestHistory = [];

    this.els.startBtn.classList.add('hidden');
    this.els.stopBtn.classList.remove('hidden');
    this.els.progressSection.classList.remove('hidden');
    this.els.visualizationSection.classList.remove('hidden');

    this.els.totalGen.textContent = params.maxGenerations;
    this.els.currentGen.textContent = '0';
    this.els.evalProgress.textContent = `0/${params.populationSize}`;
    this.els.progressFill.style.width = '0%';

    this.renderFitnessChart();
    this.updateDiversityBar(1.0);

    try {
      await this.evolutionLab.startEvolution(
        (stats) => this.onGenerationComplete(stats),
        (gen, evaluated, total, current) => this.onEvaluationProgress({ generation: gen, evaluated, total, current })
      );
    } catch (e) {
      console.error('Evolution error:', e);
    }
  }

  stopEvolution() {
    this.evolutionLab.stop();
    this.els.stopBtn.textContent = '正在停止...';
  }

  onEvaluationProgress(data) {
    this.els.currentGen.textContent = (data.generation + 1).toString();
    this.els.evalProgress.textContent = `${data.evaluated}/${data.total}`;
    
    const totalProgress = (data.generation / this.evolutionLab.params.maxGenerations) + 
                         (data.evaluated / data.total / this.evolutionLab.params.maxGenerations);
    this.els.progressFill.style.width = `${Math.min(100, totalProgress * 100)}%`;
  }

  onGenerationComplete(stats) {
    this.bestFitnessHistory.push(stats.bestFitness);
    this.avgFitnessHistory.push(stats.avgFitness);
    this.globalBestHistory.push(stats.globalBestFitness);

    this.els.currentGen.textContent = (stats.generation + 1).toString();
    this.renderFitnessChart();
    this.updateDiversityBar(stats.diversity);

    const totalProgress = ((stats.generation + 1) / this.evolutionLab.params.maxGenerations) * 100;
    this.els.progressFill.style.width = `${Math.min(100, totalProgress)}%`;
  }

  onEvolutionComplete(result) {
    this.els.startBtn.classList.remove('hidden');
    this.els.stopBtn.classList.add('hidden');
    this.els.stopBtn.textContent = '⏹ 停止进化';

    this.currentResult = result;

    if (result.globalBestChromosome) {
      this.showResultModal(result);
    } else {
      this._showToast('进化未找到有效规则');
    }
  }

  onEvolutionError(error) {
    console.error('Evolution error:', error);
    this._showToast('进化过程出错: ' + error.message);
    this.els.startBtn.classList.remove('hidden');
    this.els.stopBtn.classList.add('hidden');
  }

  renderFitnessChart() {
    const canvas = this.els.fitnessChart;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = 180 * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const w = rect.width;
    const h = 180;
    const padding = { top: 20, right: 10, bottom: 25, left: 40 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, w, h);

    const dataLength = this.bestFitnessHistory.length;
    if (dataLength < 2) {
      ctx.fillStyle = '#666';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('等待更多数据...', w / 2, h / 2);
      return;
    }

    const allValues = [
      ...this.bestFitnessHistory,
      ...this.avgFitnessHistory,
      ...this.globalBestHistory
    ];
    const minVal = Math.min(...allValues, 0);
    const maxVal = Math.max(...allValues, 1);
    const valRange = maxVal - minVal || 1;

    ctx.strokeStyle = 'rgba(80, 100, 140, 0.3)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();

      const val = maxVal - (valRange / 4) * i;
      ctx.fillStyle = '#888';
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(val.toFixed(0), padding.left - 4, y + 3);
    }

    const drawLine = (data, color, lineWidth = 1.5, dashed = false) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      if (dashed) {
        ctx.setLineDash([4, 4]);
      } else {
        ctx.setLineDash([]);
      }
      ctx.beginPath();
      for (let i = 0; i < data.length; i++) {
        const x = padding.left + (i / (dataLength - 1)) * chartW;
        const y = padding.top + chartH - ((data[i] - minVal) / valRange) * chartH;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };

    drawLine(this.globalBestHistory, '#ffb74d', 1.5, true);
    drawLine(this.bestFitnessHistory, '#e94560', 2);
    drawLine(this.avgFitnessHistory, '#4fc3f7', 1.5);

    ctx.fillStyle = '#888';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i < dataLength; i += Math.max(1, Math.floor(dataLength / 5))) {
      const x = padding.left + (i / (dataLength - 1)) * chartW;
      ctx.fillText((i + 1).toString(), x, h - 8);
    }
  }

  updateDiversityBar(diversity) {
    const percentage = Math.round(diversity * 100);
    this.els.diversityBar.style.width = `${percentage}%`;
    this.els.diversityText.textContent = `${percentage}%`;

    if (percentage > 70) {
      this.els.diversityBar.style.background = '#4caf50';
    } else if (percentage > 30) {
      this.els.diversityBar.style.background = '#ff9800';
    } else {
      this.els.diversityBar.style.background = '#e94560';
    }
  }

  showResultModal(result) {
    const best = result.globalBestChromosome;
    const bestRule = best.toRule();

    this.els.resultModalTitle.textContent = `进化完成 - 第 ${result.finalGeneration + 1} 代`;
    this.els.resultBs.textContent = best.toBSString();
    this.els.resultNeighborhood.textContent = best.neighborhood === 'moore' ? 'Moore邻域' : 'Von Neumann邻域';
    this.els.resultFitness.textContent = result.globalBestFitness.toFixed(2);
    this.els.resultGenerations.textContent = (result.finalGeneration + 1).toString();
    this.els.resultBestFitness.textContent = result.globalBestFitness.toFixed(2);

    this.bestRuleForPreview = bestRule;

    this.els.resultModal.classList.remove('hidden');
    this.els.battleResultContainer.classList.add('hidden');

    setTimeout(() => {
      this.renderPreviewFrame(0);
    }, 100);
  }

  closeResultModal() {
    this.els.resultModal.classList.add('hidden');
    this.pausePreview();
  }

  renderPreviewFrame(gen) {
    const canvas = this.els.resultPreviewCanvas;
    if (!canvas || !this.bestRuleForPreview) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const w = rect.width;
    const h = rect.height;
    const cellSize = Math.min(w / 50, h / 50);

    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, w, h);

    const presetConfig = getPresetConfig(this.evolutionLab.fitnessConfig.preset);
    this.previewEngine.setRule(this.bestRuleForPreview);
    this.previewEngine.seedFromType(presetConfig.seedType);
    
    for (let i = 0; i < gen && i < 200; i++) {
      this.previewEngine.step();
      if (this.previewEngine.countCells() === 0) break;
    }

    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < 50; x++) {
        if (this.previewEngine.getCell(x, y) === 1) {
          ctx.fillStyle = this.bestRuleForPreview.color;
          ctx.fillRect(x * cellSize, y * cellSize, cellSize - 0.5, cellSize - 0.5);
        }
      }
    }

    ctx.strokeStyle = 'rgba(80, 100, 140, 0.1)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= 50; x += 10) {
      ctx.beginPath();
      ctx.moveTo(x * cellSize, 0);
      ctx.lineTo(x * cellSize, h);
      ctx.stroke();
    }
    for (let y = 0; y <= 50; y += 10) {
      ctx.beginPath();
      ctx.moveTo(0, y * cellSize);
      ctx.lineTo(w, y * cellSize);
      ctx.stroke();
    }

    this.els.previewGenDisplay.textContent = `第 ${gen} 代`;
  }

  playPreview() {
    this.els.playPreviewBtn.classList.add('hidden');
    this.els.pausePreviewBtn.classList.remove('hidden');
    this.previewGeneration = 0;

    const animate = () => {
      if (this.previewGeneration > 200) {
        this.pausePreview();
        return;
      }
      this.renderPreviewFrame(this.previewGeneration);
      this.previewGeneration++;
      this.previewAnimationId = setTimeout(() => {
        this.previewAnimationId = requestAnimationFrame(animate);
      }, 50);
    };

    animate();
  }

  pausePreview() {
    this.els.playPreviewBtn.classList.remove('hidden');
    this.els.pausePreviewBtn.classList.add('hidden');
    if (this.previewAnimationId) {
      cancelAnimationFrame(this.previewAnimationId);
      clearTimeout(this.previewAnimationId);
      this.previewAnimationId = null;
    }
  }

  addToLibrary() {
    if (!this.currentResult?.globalBestChromosome) return;

    const rule = this.currentResult.globalBestChromosome.toRule();
    rule.name = `进化-${rule.toBSString()}`;
    const colony = new Colony(rule);
    this.colonyManager.addColony(colony);
    this._showToast('已添加到规则库');
  }

  addToGenelab() {
    if (!this.currentResult?.globalBestChromosome) return;

    const rule = this.currentResult.globalBestChromosome.toRule();
    rule.name = `进化-${rule.toBSString()}`;
    const added = this.geneLab.addGene(rule);
    if (added) {
      this._showToast('已添加到基因实验室');
    }
  }

  exportTop10() {
    const topRules = this.evolutionLab.exportTopRules(10);
    const blob = new Blob([JSON.stringify(topRules, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evolution-top10-gen${this.currentResult?.finalGeneration || 0}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this._showToast('已导出前10条规则');
  }

  async startTop5Battle() {
    if (!this.currentResult?.topChromosomes || this.currentResult.topChromosomes.length < 2) {
      alert('至少需要2条规则才能对战');
      return;
    }

    const top5 = this.currentResult.topChromosomes.slice(0, 5);
    
    if (!this.arena) {
      alert('竞技场未初始化');
      return;
    }

    this.els.battleTop5Btn.disabled = true;
    this.els.battleTop5Btn.textContent = '对战进行中...';
    this.els.battleResultContainer.classList.remove('hidden');
    this.els.battleResultContent.innerHTML = '<div class="hint">正在初始化对战...</div>';

    try {
      this.arena.clearContestants();
      
      const addedRules = [];
      for (let i = 0; i < top5.length; i++) {
        const chr = top5[i];
        const rule = chr.toRule();
        rule.name = `#${i + 1} ${chr.toBSString()} (${chr.fitness.toFixed(1)})`;
        rule.color = this._getBattleColor(i);
        addedRules.push(rule);
        this.arena.addContestant(rule, i);
      }

      const battleResult = await new Promise((resolve) => {
        const battleEndHandler = (data) => {
          eventBus.off('arena:battleEnded', battleEndHandler);
          resolve(data);
        };
        eventBus.on('arena:battleEnded', battleEndHandler);

        const started = this.arena.startBattle();
        if (!started) {
          eventBus.off('arena:battleEnded', battleEndHandler);
          resolve(null);
        }
      });

      if (battleResult) {
        this.renderBattleResult(battleResult, addedRules);
      } else {
        this.els.battleResultContent.innerHTML = '<div class="hint">对战启动失败</div>';
      }
    } catch (e) {
      console.error('Battle error:', e);
      this.els.battleResultContent.innerHTML = `<div class="hint" style="color:#e94560;">对战出错: ${e.message}</div>`;
    }

    this.els.battleTop5Btn.disabled = false;
    this.els.battleTop5Btn.textContent = '⚔️ 前5名对战';
  }

  renderBattleResult(battleResult, rules) {
    const { state, result } = battleResult;
    const sortedContestants = [...state.contestants || rules].sort((a, b) => {
      const countA = state.cellCounts?.get(a.colonyId) || 0;
      const countB = state.cellCounts?.get(b.colonyId) || 0;
      return countB - countA;
    });

    let html = `
      <div class="battle-stats">
        <div class="stat-row">
          <span>对战代数:</span>
          <span>${state.generation || 0}</span>
        </div>
        <div class="stat-row">
          <span>结果:</span>
          <span>${result?.reason || '未完成'}</span>
        </div>
      </div>
      <div class="battle-ranking">
        <div class="section-title" style="margin-top:12px;">排名</div>
    `;

    sortedContestants.forEach((c, idx) => {
      const count = state.cellCounts?.get(c.colonyId) || 0;
      const rule = rules.find(r => r.name === c.name) || c;
      html += `
        <div class="battle-rank-item">
          <span class="rank-number">${idx + 1}</span>
          <span class="rank-color" style="background:${rule.color || c.color};"></span>
          <span class="rank-name">${c.name}</span>
          <span class="rank-count">${count} 细胞</span>
        </div>
      `;
    });

    html += '</div>';

    const winner = sortedContestants[0];
    const gaWinner = rules[0];
    
    if (winner && gaWinner) {
      const isSame = winner.name.includes(gaWinner.toBSString().split(' ')[0]);
      html += `
        <div class="battle-verdict ${isSame ? 'success' : 'warning'}" style="margin-top:16px;padding:12px;border-radius:4px;text-align:center;">
          ${isSame 
            ? '✅ 遗传算法找到的最优规则在对战中也是最强！' 
            : '⚠️ 遗传算法最优规则在对战中排名第' + (sortedContestants.findIndex(c => c.name.includes(gaWinner.toBSString().split(' ')[0])) + 1) + '，对战表现与适应度目标存在差异'}
        </div>
      `;
    }

    this.els.battleResultContent.innerHTML = html;
  }

  _getBattleColor(index) {
    const colors = ['#e94560', '#4fc3f7', '#81c784', '#ffb74d', '#ba68c8'];
    return colors[index % colors.length];
  }

  _showToast(message) {
    const uiManager = window.__app?.uiManager;
    if (uiManager?.showToast) {
      uiManager.showToast(message);
    } else {
      alert(message);
    }
  }
}
