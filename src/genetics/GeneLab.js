import { Rule } from '../core/Rule.js';
import { eventBus } from '../core/EventBus.js';

export class GeneLab {
  constructor() {
    this.genes = [];
    this.selectedGeneIds = new Set();
    this.maxGenes = 20;
    this.geneNameCounter = 0;
    this.loadFromStorage();
  }

  generateName() {
    this.geneNameCounter++;
    return `基因-${this.geneNameCounter}`;
  }

  generateColor() {
    const colors = [
      '#e94560', '#4fc3f7', '#81c784', '#ffb74d',
      '#ba68c8', '#f06292', '#4dd0e1', '#aed581',
      '#ffd54f', '#ff8a65', '#9575cd', '#4db6ac'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  createRandomGene() {
    if (this.genes.length >= this.maxGenes) {
      eventBus.emit('genelab:error', `最多只能有${this.maxGenes}张基因卡片`);
      return null;
    }

    const birthCount = 1 + Math.floor(Math.random() * 3);
    const survivalCount = 2 + Math.floor(Math.random() * 3);
    
    const birth = new Set();
    while (birth.size < birthCount) {
      birth.add(Math.floor(Math.random() * 9));
    }
    
    const survival = new Set();
    while (survival.size < survivalCount) {
      survival.add(Math.floor(Math.random() * 9));
    }
    
    const neighborhood = Math.random() < 0.5 ? 'moore' : 'vonneumann';
    
    const rule = new Rule({
      id: 'gene_' + Math.random().toString(36).substr(2, 9),
      name: this.generateName(),
      color: this.generateColor(),
      birth,
      survival,
      neighborhood
    });
    
    this.genes.push(rule);
    this.saveToStorage();
    eventBus.emit('genelab:geneAdded', rule);
    eventBus.emit('genelab:updated', this.genes);
    return rule;
  }

  addGene(rule) {
    if (this.genes.length >= this.maxGenes) {
      eventBus.emit('genelab:error', `最多只能有${this.maxGenes}张基因卡片`);
      return null;
    }
    if (!rule.id) {
      rule.id = 'gene_' + Math.random().toString(36).substr(2, 9);
    }
    this.genes.push(rule);
    this.saveToStorage();
    eventBus.emit('genelab:geneAdded', rule);
    eventBus.emit('genelab:updated', this.genes);
    return rule;
  }

  removeGene(geneId) {
    const index = this.genes.findIndex(g => g.id === geneId);
    if (index !== -1) {
      this.genes.splice(index, 1);
      this.selectedGeneIds.delete(geneId);
      this.saveToStorage();
      eventBus.emit('genelab:geneRemoved', geneId);
      eventBus.emit('genelab:updated', this.genes);
    }
  }

  updateGene(geneId, updates) {
    const gene = this.getGene(geneId);
    if (!gene) return null;
    
    if (updates.birth !== undefined) gene.birth = updates.birth;
    if (updates.survival !== undefined) gene.survival = updates.survival;
    if (updates.neighborhood !== undefined) gene.neighborhood = updates.neighborhood;
    if (updates.name !== undefined) gene.name = updates.name;
    if (updates.color !== undefined) gene.color = updates.color;
    
    this.saveToStorage();
    eventBus.emit('genelab:geneUpdated', gene);
    eventBus.emit('genelab:updated', this.genes);
    return gene;
  }

  toggleBirthCondition(geneId, n) {
    const gene = this.getGene(geneId);
    if (!gene) return null;
    
    const newBirth = new Set(gene.birth);
    if (newBirth.has(n)) {
      newBirth.delete(n);
    } else {
      newBirth.add(n);
    }
    
    return this.updateGene(geneId, { birth: newBirth });
  }

  toggleSurvivalCondition(geneId, n) {
    const gene = this.getGene(geneId);
    if (!gene) return null;
    
    const newSurvival = new Set(gene.survival);
    if (newSurvival.has(n)) {
      newSurvival.delete(n);
    } else {
      newSurvival.add(n);
    }
    
    return this.updateGene(geneId, { survival: newSurvival });
  }

  toggleNeighborhood(geneId) {
    const gene = this.getGene(geneId);
    if (!gene) return null;
    
    const newNeighborhood = gene.neighborhood === 'moore' ? 'vonneumann' : 'moore';
    return this.updateGene(geneId, { neighborhood: newNeighborhood });
  }

  getGene(geneId) {
    return this.genes.find(g => g.id === geneId) || null;
  }

  getAllGenes() {
    return [...this.genes];
  }

  selectGene(geneId) {
    if (this.selectedGeneIds.has(geneId)) {
      this.selectedGeneIds.delete(geneId);
    } else {
      this.selectedGeneIds.add(geneId);
    }
    eventBus.emit('genelab:selectionChanged', [...this.selectedGeneIds]);
  }

  clearSelection() {
    this.selectedGeneIds.clear();
    eventBus.emit('genelab:selectionChanged', []);
  }

  getSelectedGenes() {
    return this.genes.filter(g => this.selectedGeneIds.has(g.id));
  }

  crossbreed(geneId1, geneId2) {
    if (this.genes.length >= this.maxGenes) {
      eventBus.emit('genelab:error', `最多只能有${this.maxGenes}张基因卡片`);
      return null;
    }

    const gene1 = this.getGene(geneId1);
    const gene2 = this.getGene(geneId2);
    
    if (!gene1 || !gene2) {
      eventBus.emit('genelab:error', '请选择两张有效的基因卡片');
      return null;
    }

    const birth1 = [...gene1.birth];
    const birth2 = [...gene2.birth];
    const survival1 = [...gene1.survival];
    const survival2 = [...gene2.survival];

    const newBirth = new Set();
    const takeFromBirth1 = Math.ceil(birth1.length / 2);
    const takeFromBirth2 = Math.ceil(birth2.length / 2);
    
    const shuffledBirth1 = [...birth1].sort(() => Math.random() - 0.5);
    const shuffledBirth2 = [...birth2].sort(() => Math.random() - 0.5);
    
    for (let i = 0; i < takeFromBirth1 && i < shuffledBirth1.length; i++) {
      newBirth.add(shuffledBirth1[i]);
    }
    for (let i = 0; i < takeFromBirth2 && i < shuffledBirth2.length; i++) {
      newBirth.add(shuffledBirth2[i]);
    }

    const newSurvival = new Set();
    const takeFromSurvival1 = Math.ceil(survival1.length / 2);
    const takeFromSurvival2 = Math.ceil(survival2.length / 2);
    
    const shuffledSurvival1 = [...survival1].sort(() => Math.random() - 0.5);
    const shuffledSurvival2 = [...survival2].sort(() => Math.random() - 0.5);
    
    for (let i = 0; i < takeFromSurvival1 && i < shuffledSurvival1.length; i++) {
      newSurvival.add(shuffledSurvival1[i]);
    }
    for (let i = 0; i < takeFromSurvival2 && i < shuffledSurvival2.length; i++) {
      newSurvival.add(shuffledSurvival2[i]);
    }

    const neighborhood = Math.random() < 0.5 ? gene1.neighborhood : gene2.neighborhood;
    const color = Math.random() < 0.5 ? gene1.color : gene2.color;

    const childRule = new Rule({
      id: 'gene_' + Math.random().toString(36).substr(2, 9),
      name: `${gene1.name}×${gene2.name}`,
      color,
      birth: newBirth,
      survival: newSurvival,
      neighborhood
    });

    this.genes.push(childRule);
    this.saveToStorage();
    eventBus.emit('genelab:geneAdded', childRule);
    eventBus.emit('genelab:updated', this.genes);
    return childRule;
  }

  reorderGenes(fromIndex, toIndex) {
    if (fromIndex < 0 || fromIndex >= this.genes.length) return;
    if (toIndex < 0 || toIndex >= this.genes.length) return;
    
    const [removed] = this.genes.splice(fromIndex, 1);
    this.genes.splice(toIndex, 0, removed);
    
    this.saveToStorage();
    eventBus.emit('genelab:reordered', this.genes);
    eventBus.emit('genelab:updated', this.genes);
  }

  duplicateGene(geneId) {
    if (this.genes.length >= this.maxGenes) {
      eventBus.emit('genelab:error', `最多只能有${this.maxGenes}张基因卡片`);
      return null;
    }

    const gene = this.getGene(geneId);
    if (!gene) return null;

    const copy = new Rule({
      id: 'gene_' + Math.random().toString(36).substr(2, 9),
      name: gene.name + ' (副本)',
      color: gene.color,
      birth: new Set(gene.birth),
      survival: new Set(gene.survival),
      neighborhood: gene.neighborhood
    });

    this.genes.push(copy);
    this.saveToStorage();
    eventBus.emit('genelab:geneAdded', copy);
    eventBus.emit('genelab:updated', this.genes);
    return copy;
  }

  clearAll() {
    this.genes = [];
    this.selectedGeneIds.clear();
    this.saveToStorage();
    eventBus.emit('genelab:cleared');
    eventBus.emit('genelab:updated', this.genes);
  }

  saveToStorage() {
    try {
      const data = {
        genes: this.genes.map(g => g.toJSON()),
        counter: this.geneNameCounter
      };
      localStorage.setItem('genelab_data', JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to save gene lab data:', e);
    }
  }

  loadFromStorage() {
    try {
      const stored = localStorage.getItem('genelab_data');
      if (stored) {
        const data = JSON.parse(stored);
        this.genes = (data.genes || []).map(g => Rule.fromJSON(g));
        this.geneNameCounter = data.counter || 0;
      }
      
      if (this.genes.length === 0) {
        this.createRandomGene();
        this.createRandomGene();
        this.createRandomGene();
      }
    } catch (e) {
      console.warn('Failed to load gene lab data:', e);
      this.genes = [];
    }
  }
}
