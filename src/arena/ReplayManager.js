export class ReplayManager {
  constructor(width = 200, height = 200) {
    this.width = width;
    this.height = height;
    this.blockSize = 10;
    this.cols = Math.ceil(width / this.blockSize);
    this.rows = Math.ceil(height / this.blockSize);
    this.reset();
  }

  reset() {
    this.frames = [];
    this.cellCountHistory = new Map();
    this.keyEvents = [];
    this.dominationEvents = [];
    this.eliminationEvents = [];
    this.mostBalancedGen = 0;
    this.mostBalancedScore = Infinity;
    this.recording = false;
  }

  startRecording(contestants) {
    this.reset();
    this.contestants = new Map();
    for (const [cid, info] of contestants) {
      this.contestants.set(cid, {
        id: cid,
        name: info.name,
        color: info.color,
        eliminated: false,
        eliminationGen: null,
        dominated: false,
        dominationGen: null
      });
      this.cellCountHistory.set(cid, []);
    }
    this.recording = true;
  }

  recordFrame(generation, grid, colonyGrid, cellCounts) {
    if (!this.recording) return;

    const cellsByColony = new Map();
    for (const cid of this.contestants.keys()) {
      cellsByColony.set(cid, []);
    }

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const idx = y * this.width + x;
        if (grid[idx] === 1) {
          const cid = colonyGrid[idx];
          if (cellsByColony.has(cid)) {
            cellsByColony.get(cid).push(x | (y << 16));
          }
        }
      }
    }

    const frame = {
      generation,
      cells: new Map()
    };
    for (const [cid, coords] of cellsByColony) {
      frame.cells.set(cid, new Uint32Array(coords));
    }
    this.frames.push(frame);

    for (const [cid, count] of cellCounts) {
      const history = this.cellCountHistory.get(cid) || [];
      history.push(count);
      this.cellCountHistory.set(cid, history);
    }

    this._checkKeyEvents(generation, cellCounts);
  }

  _checkKeyEvents(generation, cellCounts) {
    const totalAlive = Array.from(cellCounts.values()).reduce((s, c) => s + c, 0);
    if (totalAlive === 0) return;

    const counts = [];
    for (const [cid, count] of cellCounts) {
      const info = this.contestants.get(cid);
      if (!info) continue;

      counts.push(count);

      if (count === 0 && !info.eliminated && generation > 0) {
        info.eliminated = true;
        info.eliminationGen = generation;
        const event = {
          type: 'elimination',
          generation,
          colonyId: cid,
          name: info.name,
          color: info.color
        };
        this.eliminationEvents.push(event);
        this.keyEvents.push(event);
      }

      const ratio = count / totalAlive;
      if (ratio > 0.5 && !info.dominated && generation > 0) {
        info.dominated = true;
        info.dominationGen = generation;
        const event = {
          type: 'domination',
          generation,
          colonyId: cid,
          name: info.name,
          color: info.color
        };
        this.dominationEvents.push(event);
        this.keyEvents.push(event);
      }
    }

    if (counts.length >= 2 && generation > 0) {
      const sorted = [...counts].sort((a, b) => b - a);
      const max = sorted[0] || 0;
      const min = sorted[sorted.length - 1] || 0;
      const balance = max - min;
      if (balance < this.mostBalancedScore) {
        this.mostBalancedScore = balance;
        this.mostBalancedGen = generation;
      }
    }
  }

  stopRecording() {
    this.recording = false;
  }

  getTotalGenerations() {
    return this.frames.length;
  }

  getFrame(index) {
    if (index < 0 || index >= this.frames.length) return null;
    return this.frames[index];
  }

  getCellCountsAt(gen) {
    const result = new Map();
    for (const [cid, history] of this.cellCountHistory) {
      result.set(cid, history[gen] || 0);
    }
    return result;
  }

  getCellRatioAt(gen) {
    const counts = this.getCellCountsAt(gen);
    const total = Array.from(counts.values()).reduce((s, c) => s + c, 0);
    const result = new Map();
    for (const [cid, count] of counts) {
      result.set(cid, total > 0 ? count / total : 0);
    }
    return result;
  }

  computeTerritoryBlocks(frame) {
    if (!frame) return null;

    const blockStats = [];
    for (let by = 0; by < this.rows; by++) {
      for (let bx = 0; bx < this.cols; bx++) {
        blockStats.push(new Map());
      }
    }

    for (const [cid, coords] of frame.cells) {
      for (let i = 0; i < coords.length; i++) {
        const packed = coords[i];
        const x = packed & 0xFFFF;
        const y = (packed >> 16) & 0xFFFF;
        const bx = Math.floor(x / this.blockSize);
        const by = Math.floor(y / this.blockSize);
        const blockIdx = by * this.cols + bx;
        const stats = blockStats[blockIdx];
        stats.set(cid, (stats.get(cid) || 0) + 1);
      }
    }

    const blocks = [];
    const blockArea = this.blockSize * this.blockSize;
    for (let i = 0; i < blockStats.length; i++) {
      const stats = blockStats[i];
      let maxCid = -1;
      let maxCount = 0;
      let totalCount = 0;
      for (const [cid, count] of stats) {
        totalCount += count;
        if (count > maxCount) {
          maxCount = count;
          maxCid = cid;
        }
      }
      blocks.push({
        bx: i % this.cols,
        by: Math.floor(i / this.cols),
        dominantCid: maxCount > 0 ? maxCid : -1,
        dominantRatio: totalCount > 0 ? maxCount / blockArea : 0
      });
    }

    return blocks;
  }

  getGrowthRates(gen) {
    const result = new Map();
    const windowSize = 10;
    const startGen = Math.max(0, gen - windowSize);
    const endGen = gen;

    for (const [cid, history] of this.cellCountHistory) {
      const startCount = history[startGen] || 0;
      const endCount = history[endGen] || 0;
      if (startCount === 0) {
        result.set(cid, endCount > 0 ? 100 : 0);
      } else {
        const growth = ((endCount - startCount) / startCount) * 100;
        result.set(cid, growth);
      }
    }
    return result;
  }

  getSummary() {
    const totalGens = this.frames.length - 1;

    let winner = null;
    let winnerCount = 0;
    for (const [cid, history] of this.cellCountHistory) {
      const finalCount = history[history.length - 1] || 0;
      if (finalCount > winnerCount) {
        winnerCount = finalCount;
        winner = this.contestants.get(cid);
      }
    }

    const eliminationOrder = [...this.eliminationEvents]
      .sort((a, b) => a.generation - b.generation)
      .map(e => ({
        colonyId: e.colonyId,
        name: e.name,
        color: e.color,
        generation: e.generation
      }));

    const totalAliveLast = totalGens >= 0 ?
      Array.from(this.cellCountHistory.values()).reduce((s, h) => s + (h[totalGens] || 0), 0) : 0;

    return {
      totalGenerations: Math.max(0, totalGens),
      champion: winner ? {
        id: winner.id,
        name: winner.name,
        color: winner.color
      } : null,
      championCount: winnerCount,
      championRatio: totalAliveLast > 0 ? winnerCount / totalAliveLast : 0,
      eliminationOrder,
      mostBalancedGen: this.mostBalancedGen,
      dominationEvents: [...this.dominationEvents].sort((a, b) => a.generation - b.generation),
      keyEvents: [...this.keyEvents].sort((a, b) => a.generation - b.generation)
    };
  }

  getChartData() {
    const totalGens = this.frames.length;
    const lineData = [];
    const areaData = [];

    for (let g = 0; g < totalGens; g++) {
      const counts = new Map();
      let total = 0;
      for (const [cid, history] of this.cellCountHistory) {
        const c = history[g] || 0;
        counts.set(cid, c);
        total += c;
      }
      lineData.push(counts);

      const ratios = new Map();
      for (const [cid, c] of counts) {
        ratios.set(cid, total > 0 ? c / total : 0);
      }
      areaData.push(ratios);
    }

    return { lineData, areaData, totalGens };
  }
}
