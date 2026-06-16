import { ArenaEngine } from './ArenaEngine.js';
import { referee } from './Referee.js';
import { eventBus } from '../core/EventBus.js';
import { CellStore } from '../core/CellStore.js';

export class Arena {
  constructor(width = 200, height = 200) {
    this.width = width;
    this.height = height;
    this.engine = new ArenaEngine(width, height);
    this.referee = referee;
    this.contestants = [];
    this.isRunning = false;
    this.currentMatch = null;
    this.tournamentMode = false;
    this.tournamentBracket = null;
    this.tournamentResults = [];
    this.dpr = window.devicePixelRatio || 1;
  }

  addContestant(gene, colonyId) {
    if (this.contestants.length >= 4) {
      eventBus.emit('arena:error', '最多只能有4个参赛者');
      return false;
    }
    
    if (this.contestants.find(c => c.geneId === gene.id)) {
      eventBus.emit('arena:error', '该基因已经在竞技场中');
      return false;
    }
    
    const contestant = {
      colonyId,
      geneId: gene.id,
      gene: gene,
      name: gene.name,
      color: gene.color,
      corner: this.contestants.length
    };
    
    this.contestants.push(contestant);
    this.engine.addContestant(colonyId, gene, gene.color, gene.name);
    
    eventBus.emit('arena:contestantAdded', contestant);
    eventBus.emit('arena:updated', this.contestants);
    
    return true;
  }

  removeContestant(colonyId) {
    const index = this.contestants.findIndex(c => c.colonyId === colonyId);
    if (index !== -1) {
      this.contestants.splice(index, 1);
      this.engine.removeContestant(colonyId);
      
      this.contestants.forEach((c, i) => {
        c.corner = i;
      });
      
      eventBus.emit('arena:contestantRemoved', colonyId);
      eventBus.emit('arena:updated', this.contestants);
    }
  }

  clearContestants() {
    this.contestants = [];
    this.engine.clearContestants();
    eventBus.emit('arena:contestantsCleared');
    eventBus.emit('arena:updated', this.contestants);
  }

  getCornerPosition(cornerIndex) {
    const offset = 40;
    const positions = [
      { x: offset, y: offset },
      { x: this.width - offset - 1, y: offset },
      { x: offset, y: this.height - offset - 1 },
      { x: this.width - offset - 1, y: this.height - offset - 1 }
    ];
    return positions[cornerIndex % positions.length];
  }

  startBattle() {
    if (this.isRunning) {
      eventBus.emit('arena:error', '对战已经在进行中');
      return false;
    }
    
    if (this.contestants.length < 2) {
      eventBus.emit('arena:error', '至少需要2个参赛者');
      return false;
    }
    
    this.engine.reset();
    
    this.contestants.forEach(contestant => {
      const pos = this.getCornerPosition(contestant.corner);
      this.engine.initializePopulation(
        contestant.colonyId,
        pos.x,
        pos.y,
        40,
        0.3
      );
    });
    
    this.isRunning = true;
    this.currentMatch = {
      startTime: Date.now(),
      contestants: [...this.contestants]
    };
    
    eventBus.emit('arena:battleStarted', this.contestants);
    
    this.engine.start((result, state) => {
      eventBus.emit('arena:stateUpdated', state);
      
      if (result.terminated) {
        this.onBattleEnd(result, state);
      }
    });
    
    return true;
  }

  onBattleEnd(result, state) {
    this.isRunning = false;
    
    const winner = result.winner ? this.contestants.find(c => c.colonyId === result.winner) : null;
    
    const matchData = {
      contestants: this.contestants.map(c => ({
        geneId: c.geneId,
        name: c.name,
        color: c.color,
        colonyId: c.colonyId
      })),
      winner: winner ? winner.colonyId : null,
      winnerName: winner ? winner.name : null,
      generations: state.generation,
      result: result.reason,
      cellCounts: Object.fromEntries(state.cellCounts),
      eliminationTimeline: state.eliminationTimeline,
      isTournament: this.tournamentMode
    };
    
    const record = this.referee.recordMatch(matchData);
    
    const panelData = this.referee.generateResultPanel({
      result,
      state,
      contestants: this.contestants.map(c => ({
        colonyId: c.colonyId,
        name: c.name,
        color: c.color
      }))
    });
    
    this.currentMatch = null;
    
    if (this.tournamentMode) {
      this.handleTournamentResult(winner, record);
    } else {
      eventBus.emit('arena:battleEnded', {
        result,
        state,
        panelData,
        record
      });
    }
  }

  startTournament(geneIds, geneLab) {
    if (geneIds.length < 4) {
      eventBus.emit('arena:error', '锦标赛需要至少4个参赛者');
      return false;
    }
    
    const shuffled = [...geneIds].sort(() => Math.random() - 0.5);
    
    this.tournamentMode = true;
    this.tournamentResults = [];
    this.tournamentBracket = [];
    
    const matches = [];
    for (let i = 0; i < shuffled.length; i += 2) {
      if (i + 1 < shuffled.length) {
        matches.push([shuffled[i], shuffled[i + 1]]);
      }
    }
    
    this.tournamentBracket.push({
      round: '半决赛',
      matches,
      results: []
    });
    
    this.tournamentGeneLab = geneLab;
    eventBus.emit('arena:tournamentStarted', this.tournamentBracket);
    
    this.playNextTournamentMatch();
    
    return true;
  }

  playNextTournamentMatch() {
    if (!this.tournamentBracket || this.tournamentBracket.length === 0) {
      this.endTournament();
      return;
    }
    
    const currentRound = this.tournamentBracket[this.tournamentBracket.length - 1];
    const matchIndex = currentRound.results.length;
    
    if (matchIndex >= currentRound.matches.length) {
      this.advanceTournamentRound();
      return;
    }
    
    const match = currentRound.matches[matchIndex];
    
    this.clearContestants();
    
    match.forEach((geneId, index) => {
      const gene = this.tournamentGeneLab.getGene(geneId);
      if (gene) {
        const colonyId = index;
        this.addContestant(gene, colonyId);
      }
    });
    
    eventBus.emit('arena:tournamentMatchStarting', {
      round: currentRound.round,
      matchIndex,
      match
    });
    
    setTimeout(() => {
      this.startBattle();
    }, 1000);
  }

  handleTournamentResult(winner, record) {
    if (!this.tournamentBracket || this.tournamentBracket.length === 0) {
      this.endTournament();
      return;
    }
    
    const currentRound = this.tournamentBracket[this.tournamentBracket.length - 1];
    
    currentRound.results.push({
      match: currentRound.matches[currentRound.results.length],
      winner: winner ? winner.geneId : null,
      record
    });
    
    this.tournamentResults.push(record);
    
    eventBus.emit('arena:tournamentMatchEnded', {
      round: currentRound.round,
      winner,
      record
    });
    
    setTimeout(() => {
      this.playNextTournamentMatch();
    }, 2000);
  }

  advanceTournamentRound() {
    const currentRound = this.tournamentBracket[this.tournamentBracket.length - 1];
    const winners = currentRound.results
      .filter(r => r.winner !== null)
      .map(r => r.winner);
    
    if (winners.length <= 1) {
      this.endTournament(winners[0]);
      return;
    }
    
    const nextMatches = [];
    for (let i = 0; i < winners.length; i += 2) {
      if (i + 1 < winners.length) {
        nextMatches.push([winners[i], winners[i + 1]]);
      } else {
        nextMatches.push([winners[i]]);
      }
    }
    
    const nextRoundName = currentRound.round === '半决赛' ? '决赛' : 
                         currentRound.round === '决赛' ? '总决赛' :
                         `第${this.tournamentBracket.length + 1}轮`;
    
    this.tournamentBracket.push({
      round: nextRoundName,
      matches: nextMatches,
      results: []
    });
    
    eventBus.emit('arena:tournamentRoundAdvanced', this.tournamentBracket);
    
    setTimeout(() => {
      this.playNextTournamentMatch();
    }, 1500);
  }

  endTournament(championId = null) {
    const champion = championId ? this.tournamentGeneLab.getGene(championId) : null;
    
    this.tournamentMode = false;
    
    eventBus.emit('arena:tournamentEnded', {
      champion,
      bracket: this.tournamentBracket,
      results: this.tournamentResults
    });
    
    this.tournamentBracket = null;
    this.tournamentResults = [];
    this.tournamentGeneLab = null;
    
    this.clearContestants();
  }

  stopBattle() {
    this.engine.stop();
    this.isRunning = false;
    this.tournamentMode = false;
    eventBus.emit('arena:battleStopped');
  }

  reset() {
    this.stopBattle();
    this.clearContestants();
    this.engine.reset();
    eventBus.emit('arena:reset');
  }

  getState() {
    return {
      contestants: [...this.contestants],
      isRunning: this.isRunning,
      tournamentMode: this.tournamentMode,
      engineState: this.engine.getState()
    };
  }

  renderToCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    
    const w = rect.width;
    const h = rect.height;
    const cellSize = Math.min(w / this.width, h / this.height);
    
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, w, h);
    
    ctx.strokeStyle = 'rgba(233, 69, 96, 0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, w, h);
    
    const engine = this.engine;
    
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const idx = y * this.width + x;
        if (engine.grid[idx] === 1) {
          const colonyId = engine.colonyGrid[idx];
          const contestant = this.contestants.find(c => c.colonyId === colonyId);
          const color = contestant ? contestant.color : '#888';
          
          const sx = x * cellSize;
          const sy = y * cellSize;
          
          ctx.fillStyle = color;
          ctx.fillRect(sx, sy, cellSize, cellSize);
        }
      }
    }
    
    ctx.strokeStyle = 'rgba(80, 100, 140, 0.1)';
    ctx.lineWidth = 1;
    const gridStep = 20;
    for (let x = 0; x <= this.width; x += gridStep) {
      const sx = x * cellSize;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, h);
      ctx.stroke();
    }
    for (let y = 0; y <= this.height; y += gridStep) {
      const sy = y * cellSize;
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(w, sy);
      ctx.stroke();
    }
    
    this.contestants.forEach(contestant => {
      const pos = this.getCornerPosition(contestant.corner);
      const sx = pos.x * cellSize;
      const sy = pos.y * cellSize;
      
      ctx.strokeStyle = contestant.color + '80';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(sx - 20 * cellSize, sy - 20 * cellSize, 40 * cellSize, 40 * cellSize);
      ctx.setLineDash([]);
    });
  }
}
