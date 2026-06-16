import { miniPreviewEngine } from './MiniPreviewEngine.js';
import { eventBus } from '../core/EventBus.js';

export class GeneCardUI {
  constructor(rule, geneLab, index) {
    this.rule = rule;
    this.geneLab = geneLab;
    this.index = index;
    this.element = null;
    this.previewCanvas = null;
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
  }

  render() {
    const el = document.createElement('div');
    el.className = 'gene-card';
    el.dataset.geneId = this.rule.id;
    el.dataset.index = this.index;
    el.draggable = true;
    
    const isSelected = this.geneLab.selectedGeneIds.has(this.rule.id);
    
    el.innerHTML = `
      <div class="gene-card-header">
        <div class="gene-card-title">
          <span class="gene-color" style="background: ${this.rule.color}"></span>
          <span class="gene-name">${this.escapeHtml(this.rule.name)}</span>
        </div>
        <span class="gene-bs">${this.rule.toBSString()}</span>
        <div class="gene-card-actions">
          <button class="gene-duplicate-btn" title="复制">⧉</button>
          <button class="gene-delete-btn" title="删除">✕</button>
        </div>
      </div>
      <div class="gene-card-body">
        <div class="gene-conditions">
          <div class="condition-row">
            <div class="condition-label">
              <span class="condition-dot birth-dot"></span>
              <span>Birth</span>
            </div>
            <div class="condition-matrix birth-matrix" data-type="birth">
              ${this.renderDotMatrix(this.rule.birth, 'birth')}
            </div>
          </div>
          <div class="condition-row">
            <div class="condition-label">
              <span class="condition-dot survival-dot"></span>
              <span>Survival</span>
            </div>
            <div class="condition-matrix survival-matrix" data-type="survival">
              ${this.renderDotMatrix(this.rule.survival, 'survival')}
            </div>
          </div>
          <div class="neighborhood-row">
            <div class="condition-label">
              <span class="neighborhood-icon">${this.rule.neighborhood === 'moore' ? '⬡' : '✦'}</span>
              <span>${this.rule.neighborhood === 'moore' ? 'Moore (8)' : 'VN (4)'}</span>
            </div>
            <button class="neighborhood-toggle-btn">切换</button>
          </div>
        </div>
        <div class="gene-preview">
          <canvas class="gene-preview-canvas" width="60" height="60"></canvas>
        </div>
      </div>
    `;
    
    if (isSelected) {
      el.classList.add('selected');
    }
    
    this.element = el;
    this.bindEvents();
    this.schedulePreview();
    
    return el;
  }

  renderDotMatrix(set, type) {
    let html = '';
    for (let i = 0; i <= 8; i++) {
      const active = set.has(i);
      html += `
        <div class="dot ${active ? 'active' : ''} ${type}-dot-item" 
             data-value="${i}" 
             title="${type === 'birth' ? '出生' : '存活'}: ${i}">
          ${i}
        </div>
      `;
    }
    return html;
  }

  bindEvents() {
    this.previewCanvas = this.element.querySelector('.gene-preview-canvas');
    
    this.element.querySelectorAll('.dot').forEach(dot => {
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        const value = parseInt(dot.dataset.value);
        const type = dot.closest('.condition-matrix').dataset.type;
        if (type === 'birth') {
          this.geneLab.toggleBirthCondition(this.rule.id, value);
        } else {
          this.geneLab.toggleSurvivalCondition(this.rule.id, value);
        }
        dot.classList.toggle('active');
        this.updateBSLabel();
        this.schedulePreview();
      });
    });
    
    this.element.querySelector('.neighborhood-toggle-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.geneLab.toggleNeighborhood(this.rule.id);
    });
    
    this.element.querySelector('.gene-duplicate-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.geneLab.duplicateGene(this.rule.id);
    });
    
    this.element.querySelector('.gene-delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`确定删除基因 "${this.rule.name}" 吗？`)) {
        this.geneLab.removeGene(this.rule.id);
      }
    });
    
    this.element.addEventListener('click', () => {
      if (!this.isDragging) {
        this.geneLab.selectGene(this.rule.id);
      }
    });
    
    this.element.addEventListener('dragstart', (e) => {
      this.isDragging = true;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.element.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', this.rule.id);
    });
    
    this.element.addEventListener('dragend', () => {
      this.isDragging = false;
      this.element.classList.remove('dragging');
    });
    
    this.element.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    
    this.element.addEventListener('drop', (e) => {
      e.preventDefault();
      const draggedGeneId = e.dataTransfer.getData('text/plain');
      if (draggedGeneId !== this.rule.id) {
        const fromIndex = this.geneLab.genes.findIndex(g => g.id === draggedGeneId);
        const toIndex = this.geneLab.genes.findIndex(g => g.id === this.rule.id);
        if (fromIndex !== -1 && toIndex !== -1) {
          this.geneLab.reorderGenes(fromIndex, toIndex);
        }
      }
    });
  }

  updateBSLabel() {
    const bsLabel = this.element.querySelector('.gene-bs');
    if (bsLabel) {
      bsLabel.textContent = this.rule.toBSString();
    }
  }

  schedulePreview() {
    if (!this.previewCanvas) return;
    miniPreviewEngine.schedulePreview(
      this.rule.id,
      this.rule,
      this.previewCanvas,
      (behavior, history) => {
        eventBus.emit('genelab:previewReady', {
          geneId: this.rule.id,
          behavior,
          history
        });
      }
    );
  }

  updateSelection(isSelected) {
    this.element.classList.toggle('selected', isSelected);
  }

  updateRule(rule) {
    this.rule = rule;
    if (this.element) {
      this.element.querySelector('.gene-color').style.background = rule.color;
      this.element.querySelector('.gene-name').textContent = this.escapeHtml(rule.name);
      this.updateBSLabel();
      
      const birthMatrix = this.element.querySelector('.birth-matrix');
      if (birthMatrix) {
        birthMatrix.innerHTML = this.renderDotMatrix(rule.birth, 'birth');
      }
      
      const survivalMatrix = this.element.querySelector('.survival-matrix');
      if (survivalMatrix) {
        survivalMatrix.innerHTML = this.renderDotMatrix(rule.survival, 'survival');
      }
      
      const nhIcon = this.element.querySelector('.neighborhood-icon');
      if (nhIcon) {
        nhIcon.textContent = rule.neighborhood === 'moore' ? '⬡' : '✦';
      }
      const nhLabel = this.element.querySelectorAll('.condition-label span:last-child')[2];
      if (nhLabel) {
        nhLabel.textContent = rule.neighborhood === 'moore' ? 'Moore (8)' : 'VN (4)';
      }
      
      this.bindEvents();
      this.schedulePreview();
    }
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  destroy() {
    miniPreviewEngine.cancelPreview(this.rule.id);
    this.element = null;
    this.previewCanvas = null;
  }
}
