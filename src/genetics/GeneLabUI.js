import { GeneCardUI } from './GeneCardUI.js';
import { eventBus } from '../core/EventBus.js';
import { findConnectedComponents, normalizeCoordinates, hashStructure, structureToRLE, STRUCTURE_TYPES, getCentroid, coordinateSetEquals } from '../patterns/StructureUtils.js';

const MOORE_OFFSETS = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0],           [1, 0],
  [-1, 1],  [0, 1],  [1, 1]
];

function evolveMiniGrid(cells, rule, gridSize) {
  const cellSet = new Set(cells.map(c => `${c.x},${c.y}`));
  const neighborMap = new Map();
  
  for (const cell of cells) {
    for (const [dx, dy] of MOORE_OFFSETS) {
      const nx = cell.x + dx, ny = cell.y + dy;
      if (nx < 0 || nx >= gridSize || ny < 0 || ny >= gridSize) continue;
      const key = `${nx},${ny}`;
      neighborMap.set(key, (neighborMap.get(key) || 0) + 1);
    }
  }
  
  const newCells = [];
  
  for (const [key, count] of neighborMap.entries()) {
    const [x, y] = key.split(',').map(Number);
    const alive = cellSet.has(key);
    
    if (alive && rule.survival.has(count)) {
      newCells.push({ x, y });
    } else if (!alive && rule.birth.has(count)) {
      newCells.push({ x, y });
    }
  }
  
  return newCells;
}

export class GeneLabUI {
  constructor(geneLab, containerId, patternLibrary = null, patternRecognizer = null) {
    this.geneLab = geneLab;
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
    this.geneCards = new Map();
    this.patternLibrary = patternLibrary;
    this.patternRecognizer = patternRecognizer;
    this.isRunningDiscovery = false;
    this.init();
  }

  init() {
    if (!this.container) return;
    
    this.bindEventBus();
    this.render();
  }

  bindEventBus() {
    eventBus.on('genelab:geneAdded', (gene) => {
      this.addGeneCard(gene);
      this.updateGeneCount();
    });
    
    eventBus.on('genelab:geneRemoved', (geneId) => {
      this.removeGeneCard(geneId);
      this.updateGeneCount();
    });
    
    eventBus.on('genelab:geneUpdated', (gene) => {
      this.updateGeneCard(gene);
    });
    
    eventBus.on('genelab:updated', () => {
      this.updateSelectionState();
    });
    
    eventBus.on('genelab:selectionChanged', (selectedIds) => {
      this.updateSelectionState();
      this.updateCrossbreedButton();
    });
    
    eventBus.on('genelab:reordered', () => {
      this.renderAllCards();
    });
    
    eventBus.on('genelab:cleared', () => {
      this.clearAllCards();
      this.updateGeneCount();
    });
    
    eventBus.on('genelab:error', (message) => {
      this.showError(message);
    });
    
    eventBus.on('genelab:discover', (rule) => {
      this.runDiscovery(rule);
    });
  }

  render() {
    if (!this.container) return;
    
    this.container.innerHTML = `
      <div class="gene-lab-toolbar">
        <div class="gene-lab-title">
          <span class="gene-lab-icon">🧬</span>
          <span>基因实验室</span>
        </div>
        <div class="gene-lab-actions">
          <span class="gene-count">${this.geneLab.genes.length}/${this.geneLab.maxGenes}</span>
          <button id="gene-random-btn" class="gene-tool-btn" title="随机生成">🎲 随机</button>
          <button id="gene-crossbreed-btn" class="gene-tool-btn" disabled title="杂交(选择2张)">🧬 杂交</button>
          <button id="gene-clear-btn" class="gene-tool-btn danger" title="清空">🗑 清空</button>
        </div>
      </div>
      <div class="gene-lab-hint">
        点击圆点切换开关 | 点击卡片选择 | 拖拽排序 | 拖入竞技场参赛
      </div>
      <div id="gene-cards-container" class="gene-cards-container"></div>
    `;
    
    this.cardsContainer = this.container.querySelector('#gene-cards-container');
    
    this.container.querySelector('#gene-random-btn').addEventListener('click', () => {
      this.geneLab.createRandomGene();
    });
    
    this.container.querySelector('#gene-crossbreed-btn').addEventListener('click', () => {
      const selected = this.geneLab.getSelectedGenes();
      if (selected.length === 2) {
        this.geneLab.crossbreed(selected[0].id, selected[1].id);
      }
    });
    
    this.container.querySelector('#gene-clear-btn').addEventListener('click', () => {
      if (confirm('确定清空所有基因卡片吗？')) {
        this.geneLab.clearAll();
      }
    });
    
    this.renderAllCards();
    this.updateSelectionState();
    this.updateCrossbreedButton();
    this.updateGeneCount();
  }

  renderAllCards() {
    if (!this.cardsContainer) return;
    
    this.clearAllCards();
    
    this.geneLab.genes.forEach((gene, index) => {
      this.addGeneCard(gene, index);
    });
  }

  addGeneCard(gene, index = undefined) {
    if (!this.cardsContainer) return;
    
    const cardIndex = index !== undefined ? index : this.geneLab.genes.findIndex(g => g.id === gene.id);
    const cardUI = new GeneCardUI(gene, this.geneLab, cardIndex);
    const element = cardUI.render();
    
    element.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('application/x-gene', gene.id);
    });
    
    this.cardsContainer.appendChild(element);
    this.geneCards.set(gene.id, cardUI);
  }

  removeGeneCard(geneId) {
    const cardUI = this.geneCards.get(geneId);
    if (cardUI) {
      if (cardUI.element && cardUI.element.parentNode) {
        cardUI.element.parentNode.removeChild(cardUI.element);
      }
      cardUI.destroy();
      this.geneCards.delete(geneId);
    }
  }

  updateGeneCard(gene) {
    const cardUI = this.geneCards.get(gene.id);
    if (cardUI) {
      cardUI.updateRule(gene);
    }
  }

  clearAllCards() {
    this.geneCards.forEach(card => card.destroy());
    this.geneCards.clear();
    if (this.cardsContainer) {
      this.cardsContainer.innerHTML = '';
    }
  }

  updateSelectionState() {
    this.geneCards.forEach((card, geneId) => {
      const isSelected = this.geneLab.selectedGeneIds.has(geneId);
      card.updateSelection(isSelected);
    });
  }

  updateCrossbreedButton() {
    const btn = this.container.querySelector('#gene-crossbreed-btn');
    if (btn) {
      const selectedCount = this.geneLab.selectedGeneIds.size;
      btn.disabled = selectedCount !== 2;
      btn.title = selectedCount === 2 ? '杂交选中的2张基因' : `杂交(已选${selectedCount}/2)`;
    }
  }

  updateGeneCount() {
    const countEl = this.container.querySelector('.gene-count');
    if (countEl) {
      countEl.textContent = `${this.geneLab.genes.length}/${this.geneLab.maxGenes}`;
    }
  }

  async runDiscovery(rule) {
    if (this.isRunningDiscovery) {
      this.showError('正在进行另一次试跑，请稍候...');
      return;
    }
    
    if (!this.patternLibrary) {
      this.showError('图鉴系统未初始化');
      return;
    }
    
    this.isRunningDiscovery = true;
    const gridSize = 50;
    const maxGenerations = 500;
    const density = 0.3;
    const scanInterval = 10;
    const discoveredStructures = new Map();
    const analyzedHashes = new Set();
    let foundCount = 0;
    
    this.showToast(`开始试跑 "${rule.name}"，50×50 网格，500代...`);
    
    let cells = [];
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        if (Math.random() < density) {
          cells.push({ x, y, colonyId: 0 });
        }
      }
    }
    
    for (let gen = 0; gen < maxGenerations; gen++) {
      cells = evolveMiniGrid(cells, rule, gridSize).map(c => ({ ...c, colonyId: 0 }));
      
      if (cells.length === 0) break;
      
      if (gen % scanInterval === 0 && gen > 30 && this.patternRecognizer) {
        const components = findConnectedComponents(cells);
        
        for (const component of components) {
          if (component.size < 3 || component.size > 100) continue;
          
          const { cells: normalizedCells } = normalizeCoordinates(component.cells);
          const hash = hashStructure(normalizedCells);
          
          if (this.patternLibrary.hasHash(hash) || 
              discoveredStructures.has(hash) || 
              analyzedHashes.has(hash)) {
            continue;
          }
          
          analyzedHashes.add(hash);
          
          try {
            const result = await this.patternRecognizer.analyzeComponent(component, rule, 200);
            if (result) {
              result.discoveredGen = gen;
              result.width = result.width || normalizeCoordinates(component.cells).width;
              result.height = result.height || normalizeCoordinates(component.cells).height;
              discoveredStructures.set(hash, result);
            }
          } catch (e) {
            console.error('分析结构失败:', e);
          }
        }
      }
      
      if (gen % 100 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    
    for (const [hash, result] of discoveredStructures) {
      const entry = {
        id: 'struct_genelab_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        hash,
        type: result.type,
        period: result.period || 1,
        cellCount: result.cells.length,
        width: result.width,
        height: result.height,
        cells: result.cells,
        colonyName: rule.name,
        colonyColor: rule.color,
        discoveredGeneration: result.discoveredGen,
        discoveredAt: Date.now(),
        source: 'genelab',
        velocity: result.velocity,
        direction: result.direction,
        rle: structureToRLE(result.cells),
        evolutionFrames: result.evolutionFrames
      };
      
      if (this.patternLibrary.addEntry(entry, { skipEvent: false })) {
        foundCount++;
      }
    }
    
    this.isRunningDiscovery = false;
    
    if (foundCount > 0) {
      this.showToast(`试跑完成！发现 ${foundCount} 个新结构`);
    } else {
      this.showToast('试跑完成，未发现新结构');
    }
  }
  
  classifyStructure(tracker, currentGen) {
    const history = tracker.history;
    if (history.length < 30) return null;
    
    const { cells: baseNorm } = normalizeCoordinates(history[0]);
    
    let isStillLife = true;
    for (let i = 1; i <= Math.min(30, history.length - 1); i++) {
      const { cells: norm } = normalizeCoordinates(history[i]);
      if (!coordinateSetEquals(baseNorm, norm)) {
        isStillLife = false;
        break;
      }
    }
    
    if (isStillLife) {
      return {
        type: STRUCTURE_TYPES.STILL_LIFE,
        period: 1,
        cells: baseNorm,
        width: tracker.width,
        height: tracker.height,
        discoveredGen: tracker.startGen,
        evolutionFrames: history.slice(0, 3)
      };
    }
    
    for (let period = 2; period <= Math.min(60, history.length - 1); period++) {
      let isOscillator = true;
      let isSpaceship = true;
      const translations = [];
      
      for (let start = 0; start < history.length - period * 2; start += period) {
        const cellsA = history[start];
        const cellsB = history[start + period];
        
        const normA = normalizeCoordinates(cellsA);
        const normB = normalizeCoordinates(cellsB);
        
        if (!coordinateSetEquals(normA.cells, normB.cells)) {
          isOscillator = false;
          isSpaceship = false;
          break;
        }
        
        const centroidA = getCentroid(cellsA);
        const centroidB = getCentroid(cellsB);
        translations.push({
          dx: centroidB.x - centroidA.x,
          dy: centroidB.y - centroidA.y
        });
        
        if (Math.abs(translations[translations.length - 1].dx) > 0.01 || 
            Math.abs(translations[translations.length - 1].dy) > 0.01) {
          isOscillator = false;
        }
      }
      
      if (translations.length >= 2) {
        if (isOscillator) {
          return {
            type: STRUCTURE_TYPES.OSCILLATOR,
            period,
            cells: baseNorm,
            width: tracker.width,
            height: tracker.height,
            discoveredGen: tracker.startGen,
            evolutionFrames: history.slice(0, period * 3)
          };
        }
        
        if (isSpaceship) {
          const consistent = translations.every(t => 
            Math.abs(t.dx - translations[0].dx) < 0.5 && 
            Math.abs(t.dy - translations[0].dy) < 0.5
          );
          
          if (consistent && (Math.abs(translations[0].dx) > 0.1 || Math.abs(translations[0].dy) > 0.1)) {
            const velocity = {
              dx: translations[0].dx / period,
              dy: translations[0].dy / period
            };
            const direction = this.getDirection(translations[0].dx, translations[0].dy);
            
            return {
              type: STRUCTURE_TYPES.SPACESHIP,
              period,
              cells: baseNorm,
              width: tracker.width,
              height: tracker.height,
              discoveredGen: tracker.startGen,
              velocity,
              direction,
              evolutionFrames: history.slice(0, period * 3)
            };
          }
        }
      }
    }
    
    return null;
  }
  
  getDirection(dx, dy) {
    if (Math.abs(dx) < 0.1 && dy < -0.1) return '上';
    if (Math.abs(dx) < 0.1 && dy > 0.1) return '下';
    if (dx > 0.1 && Math.abs(dy) < 0.1) return '右';
    if (dx < -0.1 && Math.abs(dy) < 0.1) return '左';
    if (dx > 0.1 && dy < -0.1) return '右上';
    if (dx < -0.1 && dy < -0.1) return '左上';
    if (dx > 0.1 && dy > 0.1) return '右下';
    if (dx < -0.1 && dy > 0.1) return '左下';
    return '未知';
  }
  
  showError(message) {
    const toast = document.createElement('div');
    toast.className = 'gene-toast error';
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
  
  showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'gene-toast';
    toast.textContent = message;
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
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      opacity: 0;
      transition: opacity 0.3s;
    `;
    document.body.appendChild(toast);
    
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
    });
    
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, 2500);
  }
}
