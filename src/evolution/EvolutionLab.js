import { Rule } from '../core/Rule.js';
import { eventBus } from '../core/EventBus.js';
import { FitnessEvalEngine, FITNESS_PRESETS, getPresetConfig } from './FitnessEvalEngine.js';

export const NEIGHBORHOOD_OPTIONS = {
  MOORE_ONLY: 'moore_only',
  VN_ONLY: 'vn_only',
  BOTH: 'both'
};

export class Chromosome {
  constructor(birth, survival, neighborhood) {
    this.birth = birth || new Array(9).fill(false);
    this.survival = survival || new Array(9).fill(false);
    this.neighborhood = neighborhood || 'moore';
    this.fitness = -Infinity;
    this.id = 'chr_' + Math.random().toString(36).substr(2, 9);
  }

  static createRandom(neighborhoodOption = NEIGHBORHOOD_OPTIONS.BOTH) {
    const birth = new Array(9).fill(false);
    const survival = new Array(9).fill(false);

    const birthCount = 1 + Math.floor(Math.random() * 4);
    const survivalCount = 1 + Math.floor(Math.random() * 5);

    for (let i = 0; i < birthCount; i++) {
      let idx;
      do {
        idx = Math.floor(Math.random() * 9);
      } while (birth[idx]);
      birth[idx] = true;
    }

    for (let i = 0; i < survivalCount; i++) {
      let idx;
      do {
        idx = Math.floor(Math.random() * 9);
      } while (survival[idx]);
      survival[idx] = true;
    }

    let neighborhood;
    if (neighborhoodOption === NEIGHBORHOOD_OPTIONS.MOORE_ONLY) {
      neighborhood = 'moore';
    } else if (neighborhoodOption === NEIGHBORHOOD_OPTIONS.VN_ONLY) {
      neighborhood = 'vonneumann';
    } else {
      neighborhood = Math.random() < 0.5 ? 'moore' : 'vonneumann';
    }

    return new Chromosome(birth, survival, neighborhood);
  }

  static fromRule(rule) {
    const birth = new Array(9).fill(false);
    const survival = new Array(9).fill(false);

    for (const n of rule.birth) {
      if (n >= 0 && n < 9) birth[n] = true;
    }
    for (const n of rule.survival) {
      if (n >= 0 && n < 9) survival[n] = true;
    }

    return new Chromosome(birth, survival, rule.neighborhood);
  }

  toRule() {
    const birthSet = new Set();
    const survivalSet = new Set();

    for (let i = 0; i < 9; i++) {
      if (this.birth[i]) birthSet.add(i);
      if (this.survival[i]) survivalSet.add(i);
    }

    return new Rule({
      name: this.toBSString(),
      birth: birthSet,
      survival: survivalSet,
      neighborhood: this.neighborhood,
      color: this._generateColor()
    });
  }

  toBSString() {
    let b = '';
    let s = '';
    for (let i = 0; i < 9; i++) {
      if (this.birth[i]) b += i.toString();
      if (this.survival[i]) s += i.toString();
    }
    return `B${b}/S${s}`;
  }

  encodeToString() {
    const b = this.birth.map(v => v ? '1' : '0').join('');
    const s = this.survival.map(v => v ? '1' : '0').join('');
    const n = this.neighborhood === 'moore' ? 'M' : 'V';
    return `${n}${b}${s}`;
  }

  clone() {
    const clone = new Chromosome(
      [...this.birth],
      [...this.survival],
      this.neighborhood
    );
    clone.fitness = this.fitness;
    return clone;
  }

  _generateColor() {
    const colors = [
      '#e94560', '#4fc3f7', '#81c784', '#ffb74d',
      '#ba68c8', '#f06292', '#4dd0e1', '#aed581',
      '#ffd54f', '#ff8a65', '#9575cd', '#4db6ac'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }
}

export class EvolutionLab {
  constructor(patternLibrary = null) {
    this.population = [];
    this.generation = 0;
    this.isRunning = false;
    this.isPaused = false;
    this.shouldStop = false;
    this.patternLibrary = patternLibrary;

    this.params = {
      populationSize: 30,
      maxGenerations: 50,
      crossoverRate: 0.7,
      mutationRate: 0.1,
      elitismCount: 3,
      neighborhoodOption: NEIGHBORHOOD_OPTIONS.BOTH
    };

    this.fitnessConfig = {
      preset: FITNESS_PRESETS.MAX_EXPANSION,
      customExpression: ''
    };

    this.stats = {
      bestFitnessHistory: [],
      avgFitnessHistory: [],
      globalBestFitness: -Infinity,
      globalBestChromosome: null,
      generationsWithoutImprovement: 0,
      currentGenerationStats: null
    };

    this.evalEngine = new FitnessEvalEngine(50, 50);
  }

  setParams(params) {
    Object.assign(this.params, params);
  }

  setFitnessConfig(config) {
    Object.assign(this.fitnessConfig, config);
  }

  initializePopulation() {
    this.population = [];
    for (let i = 0; i < this.params.populationSize; i++) {
      this.population.push(Chromosome.createRandom(this.params.neighborhoodOption));
    }
    this.generation = 0;
    this.stats = {
      bestFitnessHistory: [],
      avgFitnessHistory: [],
      globalBestFitness: -Infinity,
      globalBestChromosome: null,
      generationsWithoutImprovement: 0,
      currentGenerationStats: null
    };
  }

  async evaluatePopulation(onProgress = null) {
    const presetConfig = getPresetConfig(this.fitnessConfig.preset);
    
    for (let i = 0; i < this.population.length; i++) {
      if (this.shouldStop) break;

      const chromosome = this.population[i];
      
      await new Promise(resolve => setTimeout(resolve, 0));
      
      try {
        const rule = chromosome.toRule();
        this.evalEngine.setRule(rule);
        this.evalEngine.seedFromType(presetConfig.seedType);
        this.evalEngine.run(presetConfig.maxGenerations, presetConfig.stopOnExtinction);
        
        chromosome.fitness = this.evalEngine.evaluate(
          this.fitnessConfig.preset,
          this.fitnessConfig.customExpression
        );
      } catch (e) {
        console.error('Evaluation error:', e);
        chromosome.fitness = -Infinity;
      }

      if (onProgress) {
        onProgress(i + 1, this.population.length, chromosome);
      }
    }

    this.population.sort((a, b) => b.fitness - a.fitness);
  }

  tournamentSelect(tournamentSize = 3) {
    const tournament = [];
    const populationSize = this.population.length;
    
    for (let i = 0; i < tournamentSize; i++) {
      const randomIndex = Math.floor(Math.random() * populationSize);
      tournament.push(this.population[randomIndex]);
    }
    
    tournament.sort((a, b) => b.fitness - a.fitness);
    return tournament[0].clone();
  }

  crossover(parent1, parent2) {
    if (Math.random() > this.params.crossoverRate) {
      return parent1.clone();
    }

    const child = new Chromosome();

    const crossPointBirth = 1 + Math.floor(Math.random() * 7);
    const crossPointSurvival = 1 + Math.floor(Math.random() * 7);

    for (let i = 0; i < 9; i++) {
      child.birth[i] = i < crossPointBirth ? parent1.birth[i] : parent2.birth[i];
      child.survival[i] = i < crossPointSurvival ? parent1.survival[i] : parent2.survival[i];
    }

    child.neighborhood = Math.random() < 0.5 ? parent1.neighborhood : parent2.neighborhood;

    if (this.params.neighborhoodOption === NEIGHBORHOOD_OPTIONS.MOORE_ONLY) {
      child.neighborhood = 'moore';
    } else if (this.params.neighborhoodOption === NEIGHBORHOOD_OPTIONS.VN_ONLY) {
      child.neighborhood = 'vonneumann';
    }

    this._validateChromosome(child);

    return child;
  }

  mutate(chromosome) {
    if (Math.random() > this.params.mutationRate) {
      return chromosome;
    }

    const mutationType = Math.floor(Math.random() * 3);

    if (mutationType === 0) {
      const idx = Math.floor(Math.random() * 9);
      chromosome.birth[idx] = !chromosome.birth[idx];
    } else if (mutationType === 1) {
      const idx = Math.floor(Math.random() * 9);
      chromosome.survival[idx] = !chromosome.survival[idx];
    } else {
      if (this.params.neighborhoodOption === NEIGHBORHOOD_OPTIONS.BOTH) {
        chromosome.neighborhood = chromosome.neighborhood === 'moore' ? 'vonneumann' : 'moore';
      }
    }

    this._validateChromosome(chromosome);

    return chromosome;
  }

  _validateChromosome(chromosome) {
    let birthCount = 0;
    let survivalCount = 0;
    for (let i = 0; i < 9; i++) {
      if (chromosome.birth[i]) birthCount++;
      if (chromosome.survival[i]) survivalCount++;
    }

    if (birthCount === 0) {
      chromosome.birth[3] = true;
    }
    if (survivalCount === 0) {
      chromosome.survival[2] = true;
      chromosome.survival[3] = true;
    }
  }

  createNextGeneration() {
    const newPopulation = [];

    for (let i = 0; i < this.params.elitismCount && i < this.population.length; i++) {
      newPopulation.push(this.population[i].clone());
    }

    while (newPopulation.length < this.params.populationSize) {
      const parent1 = this.tournamentSelect();
      const parent2 = this.tournamentSelect();
      
      let child = this.crossover(parent1, parent2);
      child = this.mutate(child);
      
      newPopulation.push(child);
    }

    this.population = newPopulation;
    this.generation++;
  }

  computeGenerationStats() {
    const fitnesses = this.population.map(c => c.fitness);
    const bestFitness = Math.max(...fitnesses);
    const avgFitness = fitnesses.reduce((a, b) => a + b, 0) / fitnesses.length;
    const bestChromosome = this.population[0];

    const uniqueEncodings = new Set(this.population.map(c => c.encodeToString()));
    const diversity = uniqueEncodings.size / this.population.length;

    this.stats.bestFitnessHistory.push(bestFitness);
    this.stats.avgFitnessHistory.push(avgFitness);

    if (bestFitness > this.stats.globalBestFitness) {
      this.stats.globalBestFitness = bestFitness;
      this.stats.globalBestChromosome = bestChromosome.clone();
      this.stats.generationsWithoutImprovement = 0;
    } else {
      this.stats.generationsWithoutImprovement++;
    }

    this.stats.currentGenerationStats = {
      generation: this.generation,
      bestFitness,
      avgFitness,
      globalBestFitness: this.stats.globalBestFitness,
      diversity,
      bestChromosome: bestChromosome.clone(),
      globalBestChromosome: this.stats.globalBestChromosome?.clone() || null
    };

    return this.stats.currentGenerationStats;
  }

  checkEarlyTermination() {
    return this.stats.generationsWithoutImprovement >= 10;
  }

  async startEvolution(onGenerationComplete = null, onEvaluationProgress = null) {
    this.isRunning = true;
    this.shouldStop = false;
    this.initializePopulation();

    eventBus.emit('evolution:started');

    try {
      while (this.generation < this.params.maxGenerations && !this.shouldStop) {
        while (this.isPaused && !this.shouldStop) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (this.shouldStop) break;

        await this.evaluatePopulation((evaluated, total, current) => {
          if (onEvaluationProgress) {
            onEvaluationProgress(this.generation, evaluated, total, current);
          }
        });

        if (this.shouldStop) break;

        const stats = this.computeGenerationStats();

        if (onGenerationComplete) {
          onGenerationComplete(stats);
        }

        if (this.checkEarlyTermination()) {
          eventBus.emit('evolution:earlyTermination', {
            reason: '连续10代无改进',
            generation: this.generation
          });
          break;
        }

        if (this.generation < this.params.maxGenerations - 1) {
          this.createNextGeneration();
        } else {
          break;
        }
      }
    } catch (e) {
      console.error('Evolution error:', e);
      eventBus.emit('evolution:error', e);
    }

    this.isRunning = false;

    const result = {
      success: !this.shouldStop,
      finalGeneration: this.generation,
      globalBestFitness: this.stats.globalBestFitness,
      globalBestChromosome: this.stats.globalBestChromosome,
      topChromosomes: this.population.slice(0, 10).map(c => c.clone()),
      bestFitnessHistory: [...this.stats.bestFitnessHistory],
      avgFitnessHistory: [...this.stats.avgFitnessHistory]
    };

    eventBus.emit('evolution:complete', result);
    return result;
  }

  stop() {
    this.shouldStop = true;
    this.isPaused = false;
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
  }

  getTopChromosomes(count = 10) {
    return this.population.slice(0, count).map(c => c.clone());
  }

  exportTopRules(count = 10) {
    return this.getTopChromosomes(count).map(chr => {
      const rule = chr.toRule();
      return {
        ...rule.toJSON(),
        fitness: chr.fitness,
        bsString: chr.toBSString()
      };
    });
  }

  getDiversity() {
    const uniqueEncodings = new Set(this.population.map(c => c.encodeToString()));
    return uniqueEncodings.size / this.population.length;
  }
}
