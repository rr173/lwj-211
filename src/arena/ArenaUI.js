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
        <div class="modal-content arena-result-content">
          <div class="modal-header">
            <span id="arena-result-title">对战结果</span>
            <button id="arena-close-result-btn" class="close-btn">&times;</button>
          </div>
          <div class="modal-body">
            <div class="result-champion">
              <div class="result-crown">🏆</div>
              <div class="result-champion-name" id="result-champion-name">-</div>
            </div>
            <div class="result-info">
              <div class="result-info-item">
                <span>持续代数:</span>
                <span id="result-generations">0</span>
              </div>
              <div class="result-info-item">
                <span>最终细胞数:</span>
                <span id="result-total">0</span>
              </div>
            </div>
            <div class="result-charts">
              <div class="result-chart-section">
                <div class="chart-title">细胞占比</div>
                <canvas id="result-pie-chart" width="200" height="200"></canvas>
              </div>
              <div class="result-timeline-section">
                <div class="chart-title">淘汰时间线</div>
                <div id="result-timeline" class="result-timeline"></div>
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
    const modal = this.container.querySelector('#arena-result-modal');
    const { panelData } = data;
    
    this.container.querySelector('#arena-result-title').textContent = panelData.title;
    
    const championName = this.container.querySelector('#result-champion-name');
    championName.textContent = panelData.championName;
    championName.style.color = panelData.championColor;
    
    this.container.querySelector('#result-generations').textContent = panelData.generations;
    this.container.querySelector('#result-total').textContent = panelData.totalAlive;
    
    modal.classList.remove('hidden');
    
    setTimeout(() => {
      const pieCanvas = this.container.querySelector('#result-pie-chart');
      referee.renderPieChart(pieCanvas, panelData.pieChartData);
      
      const timelineEl = this.container.querySelector('#result-timeline');
      referee.renderTimeline(timelineEl, panelData.eliminationTimeline, 
        data.panelData.pieChartData.map(d => ({
          colonyId: d.name,
          name: d.name,
          color: d.color
        }))
      );
    }, 50);
  }

  hideResultPanel() {
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
    this.stopRenderLoop();
  }
}
