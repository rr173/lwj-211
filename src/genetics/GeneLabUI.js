import { GeneCardUI } from './GeneCardUI.js';
import { eventBus } from '../core/EventBus.js';

export class GeneLabUI {
  constructor(geneLab, containerId) {
    this.geneLab = geneLab;
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
    this.geneCards = new Map();
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
}
