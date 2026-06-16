const MOORE_OFFSETS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const VN_OFFSETS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export class AnalysisEngine {
  constructor(rule) {
    this.rule = rule;
  }

  setRule(rule) {
    this.rule = rule;
  }

  createGrid(width, height) {
    const grid = new Array(height);
    for (let y = 0; y < height; y++) {
      grid[y] = new Uint8Array(width);
    }
    return grid;
  }

  copyGrid(grid) {
    const height = grid.length;
    const width = grid[0].length;
    const newGrid = new Array(height);
    for (let y = 0; y < height; y++) {
      newGrid[y] = new Uint8Array(grid[y]);
    }
    return newGrid;
  }

  countCells(grid) {
    let count = 0;
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        if (grid[y][x]) count++;
      }
    }
    return count;
  }

  randomSeed(grid, density) {
    const height = grid.length;
    const width = grid[0].length;
    const total = width * height;
    const targetCount = Math.floor(total * density);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        grid[y][x] = 0;
      }
    }
    
    let placed = 0;
    while (placed < targetCount) {
      const x = Math.floor(Math.random() * width);
      const y = Math.floor(Math.random() * height);
      if (!grid[y][x]) {
        grid[y][x] = 1;
        placed++;
      }
    }
  }

  step(grid) {
    const height = grid.length;
    const width = grid[0].length;
    const newGrid = this.createGrid(width, height);
    const offsets = this.rule.neighborhood === 'vonneumann' ? VN_OFFSETS : MOORE_OFFSETS;
    const birth = this.rule.birth;
    const survival = this.rule.survival;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let neighbors = 0;
        for (const [dx, dy] of offsets) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            if (grid[ny][nx]) neighbors++;
          }
        }
        
        if (grid[y][x]) {
          if (survival.has(neighbors)) {
            newGrid[y][x] = 1;
          }
        } else {
          if (birth.has(neighbors)) {
            newGrid[y][x] = 1;
          }
        }
      }
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        grid[y][x] = newGrid[y][x];
      }
    }
  }

  hashGrid(grid) {
    let hash = 0;
    const height = grid.length;
    const width = grid[0].length;
    for (let y = 0; y < height; y++) {
      let rowHash = 0;
      for (let x = 0; x < width; x++) {
        rowHash = (rowHash << 1) | grid[y][x];
      }
      hash = ((hash << 5) - hash + rowHash) | 0;
    }
    return hash;
  }

  analyzeDensitySurvival(gridSize = 50, generations = 200, trials = 3) {
    const densities = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
    const results = [];

    for (const density of densities) {
      let totalSurvivalRate = 0;
      let validTrials = 0;

      for (let t = 0; t < trials; t++) {
        const grid = this.createGrid(gridSize, gridSize);
        this.randomSeed(grid, density);
        const initialCount = this.countCells(grid);
        
        if (initialCount === 0) continue;

        for (let g = 0; g < generations; g++) {
          this.step(grid);
        }

        const finalCount = this.countCells(grid);
        const survivalRate = finalCount / initialCount;
        totalSurvivalRate += survivalRate;
        validTrials++;
      }

      const avgSurvivalRate = validTrials > 0 ? totalSurvivalRate / validTrials : 0;
      results.push({
        density: density * 100,
        survivalRate: avgSurvivalRate
      });
    }

    let peakDensity = 0;
    let peakSurvival = -1;
    for (const r of results) {
      if (r.survivalRate > peakSurvival) {
        peakSurvival = r.survivalRate;
        peakDensity = r.density;
      }
    }

    return {
      data: results,
      peakDensity,
      peakSurvival
    };
  }

  detectCycle(gridSize = 30, maxGenerations = 500, density = 0.3) {
    const grid = this.createGrid(gridSize, gridSize);
    this.randomSeed(grid, density);
    
    const seenHashes = new Map();
    const counts = [];
    
    let cycleStart = -1;
    let cycleLength = -1;
    let finalAlive = 0;
    let diedAt = -1;

    for (let g = 0; g < maxGenerations; g++) {
      const hash = this.hashGrid(grid);
      const count = this.countCells(grid);
      counts.push(count);

      if (count === 0) {
        diedAt = g;
        finalAlive = 0;
        break;
      }

      if (seenHashes.has(hash)) {
        cycleStart = seenHashes.get(hash);
        cycleLength = g - cycleStart;
        finalAlive = count;
        break;
      }

      seenHashes.set(hash, g);
      this.step(grid);
    }

    if (cycleStart === -1 && diedAt === -1) {
      finalAlive = counts[counts.length - 1];
    }

    return {
      cycleStart,
      cycleLength,
      finalAlive,
      diedAt,
      counts,
      maxGenerations,
      hasCycle: cycleStart !== -1,
      diedOut: diedAt !== -1,
      stable: cycleStart !== -1 && cycleLength === 1
    };
  }

  analyzeGrowth(maxGenerations = 500) {
    const gridSize = 100;
    const grid = this.createGrid(gridSize, gridSize);
    
    const cx = Math.floor(gridSize / 2);
    const cy = Math.floor(gridSize / 2);
    const crossPattern = [
      [0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]
    ];
    for (const [dx, dy] of crossPattern) {
      grid[cy + dy][cx + dx] = 1;
    }

    const counts = [];
    let maxCount = 0;
    let maxGen = 0;
    let escaped = false;

    for (let g = 0; g < maxGenerations; g++) {
      const count = this.countCells(grid);
      counts.push(count);

      if (count > maxCount) {
        maxCount = count;
        maxGen = g;
      }

      if (count === 0) break;

      let touchesEdge = false;
      for (let x = 0; x < gridSize; x++) {
        if (grid[0][x] || grid[gridSize - 1][x]) { touchesEdge = true; break; }
      }
      if (!touchesEdge) {
        for (let y = 0; y < gridSize; y++) {
          if (grid[y][0] || grid[y][gridSize - 1]) { touchesEdge = true; break; }
        }
      }
      if (touchesEdge) {
        escaped = true;
      }

      this.step(grid);
    }

    const finalCount = counts[counts.length - 1];
    const initialCount = 5;
    const growthRatio = maxCount / initialCount;
    const diedOut = finalCount === 0;
    
    let explosive = false;
    if (escaped || growthRatio > 20) {
      explosive = true;
    }

    const phases = this._detectPhases(counts);

    return {
      counts,
      maxCount,
      maxGen,
      finalCount,
      initialCount,
      growthRatio,
      diedOut,
      explosive,
      escaped,
      phases
    };
  }

  _detectPhases(counts) {
    if (counts.length < 10) return [];

    const phases = [];
    const windowSize = 20;
    const threshold = 0.05;

    let i = 0;
    while (i < counts.length) {
      const windowEnd = Math.min(i + windowSize, counts.length);
      const windowCounts = counts.slice(i, windowEnd);
      const avg = windowCounts.reduce((a, b) => a + b, 0) / windowCounts.length;
      const first = windowCounts[0];
      const last = windowCounts[windowCounts.length - 1];
      const change = first > 0 ? (last - first) / first : 0;

      let phase = 'stable';
      if (change > threshold) phase = 'growth';
      else if (change < -threshold) phase = 'decline';
      else {
        let variance = 0;
        for (const c of windowCounts) {
          variance += Math.abs(c - avg);
        }
        variance /= windowCounts.length;
        if (avg > 0 && variance / avg > 0.15) phase = 'oscillation';
      }

      phases.push({
        startGen: i,
        endGen: windowEnd - 1,
        phase,
        avgCount: avg
      });

      i = windowEnd;
    }

    return phases;
  }

  analyzeNeighborhoodInfluence() {
    const isVN = this.rule.neighborhood === 'vonneumann';
    const size = isVN ? 5 : 9;
    const radius = Math.floor(size / 2);
    const grid = this.createGrid(size, size);
    
    const result = {
      size,
      isVN,
      matrix: [],
      survivalMap: new Map()
    };

    const offsets = isVN ? VN_OFFSETS : MOORE_OFFSETS;
    const numNeighbors = offsets.length;

    for (let i = 0; i < Math.pow(2, numNeighbors); i++) {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          grid[y][x] = 0;
        }
      }

      grid[radius][radius] = 1;

      let neighborCount = 0;
      for (let n = 0; n < numNeighbors; n++) {
        if (i & (1 << n)) {
          const [dx, dy] = offsets[n];
          grid[radius + dy][radius + dx] = 1;
          neighborCount++;
        }
      }

      const testGrid = this.copyGrid(grid);
      this.step(testGrid);
      const centerSurvives = testGrid[radius][radius] === 1;
      result.survivalMap.set(neighborCount, centerSurvives);
    }

    const matrix = [];
    for (let y = 0; y < size; y++) {
      const row = [];
      for (let x = 0; x < size; x++) {
        if (x === radius && y === radius) {
          row.push({ type: 'center', value: null });
        } else {
          const dx = x - radius;
          const dy = y - radius;
          const isNeighbor = offsets.some(([ox, oy]) => ox === dx && oy === dy);
          row.push({ 
            type: isNeighbor ? 'neighbor' : 'outside',
            value: null 
          });
        }
      }
      matrix.push(row);
    }
    result.matrix = matrix;

    return result;
  }

  calculateScores(densityResult, cycleResult, growthResult, neighborhoodResult) {
    const scores = {
      stability: 0,
      activity: 0,
      expansion: 0,
      robustness: 0
    };

    if (cycleResult.hasCycle) {
      const cycleLenScore = Math.max(0, 100 - cycleResult.cycleLength * 5);
      const startScore = Math.max(0, 100 - cycleResult.cycleStart * 0.5);
      scores.stability = (cycleLenScore * 0.7 + startScore * 0.3);
    } else if (cycleResult.diedOut) {
      scores.stability = cycleResult.diedAt > 100 ? 30 : 10;
    } else {
      scores.stability = 50;
    }

    if (cycleResult.diedOut) {
      scores.activity = Math.max(0, cycleResult.diedAt / 5);
    } else if (cycleResult.hasCycle) {
      const cycleActivity = cycleResult.cycleLength > 1 ? 60 : 20;
      scores.activity = Math.min(100, cycleActivity + (100 - cycleResult.cycleStart) * 0.2);
    } else {
      scores.activity = 80;
    }

    if (growthResult.diedOut) {
      scores.expansion = 0;
    } else if (growthResult.explosive) {
      scores.expansion = 100;
    } else {
      const ratioScore = Math.min(100, growthResult.growthRatio * 10);
      scores.expansion = ratioScore;
    }

    const densityData = densityResult.data;
    let survivingDensities = 0;
    let avgSurvival = 0;
    for (const d of densityData) {
      if (d.survivalRate > 0.01) {
        survivingDensities++;
      }
      avgSurvival += d.survivalRate;
    }
    avgSurvival /= densityData.length;

    const densityRangeScore = (survivingDensities / densityData.length) * 100;
    const avgSurvivalScore = avgSurvival * 100;
    scores.robustness = densityRangeScore * 0.6 + avgSurvivalScore * 0.4;

    scores.stability = Math.round(Math.min(100, Math.max(0, scores.stability)));
    scores.activity = Math.round(Math.min(100, Math.max(0, scores.activity)));
    scores.expansion = Math.round(Math.min(100, Math.max(0, scores.expansion)));
    scores.robustness = Math.round(Math.min(100, Math.max(0, scores.robustness)));

    return scores;
  }

  runFullAnalysis() {
    const densityResult = this.analyzeDensitySurvival();
    const cycleResult = this.detectCycle();
    const growthResult = this.analyzeGrowth();
    const neighborhoodResult = this.analyzeNeighborhoodInfluence();
    const scores = this.calculateScores(densityResult, cycleResult, growthResult, neighborhoodResult);

    return {
      density: densityResult,
      cycle: cycleResult,
      growth: growthResult,
      neighborhood: neighborhoodResult,
      scores
    };
  }
}
