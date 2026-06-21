export class Rule {
  constructor(options = {}) {
    this.id = options.id || 'rule_' + Math.random().toString(36).substr(2, 9);
    this.name = options.name || '规则';
    this.color = options.color || '#4fc3f7';
    this.birth = options.birth || new Set([3]);
    this.survival = options.survival || new Set([2, 3]);
    this.neighborhood = options.neighborhood || 'moore';
    this.priority = options.priority || 0;
    this.consumptionRate = options.consumptionRate !== undefined ? Math.max(0, options.consumptionRate) : 0;
    this.productionRate = options.productionRate !== undefined ? Math.max(0, options.productionRate) : 0;
    this.predationPower = options.predationPower !== undefined ? Math.max(0, Math.min(10, options.predationPower)) : 0;
  }

  static parseBS(bsString) {
    const birth = new Set();
    const survival = new Set();
    
    const parts = bsString.split('/');
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.startsWith('B') || trimmed.startsWith('b')) {
        for (const ch of trimmed.slice(1)) {
          if (ch >= '0' && ch <= '8') {
            birth.add(parseInt(ch, 10));
          }
        }
      } else if (trimmed.startsWith('S') || trimmed.startsWith('s')) {
        for (const ch of trimmed.slice(1)) {
          if (ch >= '0' && ch <= '8') {
            survival.add(parseInt(ch, 10));
          }
        }
      }
    }
    return { birth, survival };
  }

  static fromString(str) {
    const parts = str.trim().split(/\s+/);
    const bsPart = parts[0] || 'B3/S23';
    const neighborhood = (parts[1] && parts[1].toLowerCase() === 'vn') ? 'vonneumann' : 'moore';
    const { birth, survival } = Rule.parseBS(bsPart);
    
    return new Rule({
      name: bsPart + (neighborhood === 'vonneumann' ? ' VN' : ''),
      birth,
      survival,
      neighborhood
    });
  }

  toBSString() {
    const b = [...this.birth].sort((a, b) => a - b).join('');
    const s = [...this.survival].sort((a, b) => a - b).join('');
    return `B${b}/S${s}`;
  }

  getNeighbors(x, y) {
    if (this.neighborhood === 'vonneumann') {
      return [
        [x, y - 1],
        [x + 1, y],
        [x, y + 1],
        [x - 1, y]
      ];
    }
    return [
      [x - 1, y - 1], [x, y - 1], [x + 1, y - 1],
      [x - 1, y],                 [x + 1, y],
      [x - 1, y + 1], [x, y + 1], [x + 1, y + 1]
    ];
  }

  shouldBirth(neighborCount) {
    return this.birth.has(neighborCount);
  }

  shouldSurvive(neighborCount) {
    return this.survival.has(neighborCount);
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      color: this.color,
      birth: [...this.birth],
      survival: [...this.survival],
      neighborhood: this.neighborhood,
      priority: this.priority,
      consumptionRate: this.consumptionRate,
      productionRate: this.productionRate,
      predationPower: this.predationPower
    };
  }

  static fromJSON(data) {
    return new Rule({
      id: data.id,
      name: data.name,
      color: data.color,
      birth: new Set(data.birth || [3]),
      survival: new Set(data.survival || [2, 3]),
      neighborhood: data.neighborhood || 'moore',
      priority: data.priority || 0,
      consumptionRate: data.consumptionRate !== undefined ? data.consumptionRate : 0,
      productionRate: data.productionRate !== undefined ? data.productionRate : 0,
      predationPower: data.predationPower !== undefined ? data.predationPower : 0
    });
  }
}

export const PRESET_RULES = [
  () => new Rule({
    name: '经典生命游戏',
    color: '#4fc3f7',
    birth: new Set([3]),
    survival: new Set([2, 3]),
    neighborhood: 'moore',
    priority: 0,
    consumptionRate: 0,
    productionRate: 0,
    predationPower: 0
  }),
  () => new Rule({
    name: '高生命',
    color: '#81c784',
    birth: new Set([3, 6]),
    survival: new Set([2, 3]),
    neighborhood: 'moore',
    priority: 1,
    consumptionRate: 0,
    productionRate: 0,
    predationPower: 0
  }),
  () => new Rule({
    name: 'VN邻域规则',
    color: '#ffb74d',
    birth: new Set([2]),
    survival: new Set([0, 1, 3]),
    neighborhood: 'vonneumann',
    priority: 2,
    consumptionRate: 0,
    productionRate: 0,
    predationPower: 0
  })
];
