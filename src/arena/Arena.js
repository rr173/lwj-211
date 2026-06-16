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
    
    console.log('开始对战，参赛者数量:', this.contestants.length);
    
    this.contestants.forEach(contestant => {
      const pos = this.getCornerPosition(contestant.corner);
      console.log(`初始化种群 ${contestant.name} (colonyId=${contestant.colonyId}) 位置: (${pos.x}, ${pos.y})`);
      this.engine.initializePopulation(
        contestant.colonyId,
        pos.x,
        pos.y,
        40,
        0.3
      );
    });
    
    console.log('初始种群初始化完成，细胞统计:', Object.fromEntries(this.engine.cellCounts));
    
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
    console.log('playNextTournamentMatch called');
    
    if (!this.tournamentBracket || this.tournamentBracket.length === 0) {
      console.log('tournamentBracket 不存在或为空，结束锦标赛');
      this.endTournament();
      return;
    }
    
    const currentRound = this.tournamentBracket[this.tournamentBracket.length - 1];
    const matchIndex = currentRound.results.length;
    
    console.log(`当前轮次: ${currentRound.round}, matchIndex: ${matchIndex}, 总比赛数: ${currentRound.matches.length}`);
    
    if (matchIndex >= currentRound.matches.length) {
      console.log('当前轮次所有比赛已完成，进入下一轮');
      this.advanceTournamentRound();
      return;
    }
    
    const match = currentRound.matches[matchIndex];
    console.log(`准备开始比赛: ${match.map(id => {
      const g = this.tournamentGeneLab?.getGene(id);
      return g?.name || id;
    }).join(' vs ')}`);
    
    this.clearContestants();
    
    let addedCount = 0;
    match.forEach((geneId, index) => {
      const gene = this.tournamentGeneLab?.getGene(geneId);
      if (gene) {
        const colonyId = index;
        this.addContestant(gene, colonyId);
        addedCount++;
        console.log(`添加参赛者: ${gene.name}, colonyId=${colonyId}`);
      } else {
        console.error(`无法找到基因: ${geneId}`);
      }
    });
    
    console.log(`成功添加 ${addedCount} 个参赛者，需要至少2个`);
    
    if (addedCount < 2) {
      console.error('参赛者不足，记录平局并继续下一场');
      currentRound.results.push({
        match: currentRound.matches[matchIndex],
        winner: null,
        record: null
      });
      
      setTimeout(() => {
        console.log('参赛者不足，2秒后跳过这场比赛');
        this.playNextTournamentMatch();
      }, 1000);
      return;
    }
    
    eventBus.emit('arena:tournamentMatchStarting', {
      round: currentRound.round,
      matchIndex,
      match
    });
    
    setTimeout(() => {
      console.log('1秒后开始比赛');
      const started = this.startBattle();
      if (!started) {
        console.error('startBattle 返回 false，尝试继续下一场');
        currentRound.results.push({
          match: currentRound.matches[matchIndex],
          winner: null,
          record: null
        });
        setTimeout(() => this.playNextTournamentMatch(), 1000);
      }
    }, 1000);
  }

  handleTournamentResult(winner, record) {
    console.log('handleTournamentResult called, winner:', winner?.name, 'tournamentBracket exists:', !!this.tournamentBracket);
    
    if (!this.tournamentBracket || this.tournamentBracket.length === 0) {
      console.log('tournamentBracket is null or empty, ending tournament');
      this.endTournament();
      return;
    }
    
    const currentRound = this.tournamentBracket[this.tournamentBracket.length - 1];
    const matchIndex = currentRound.results.length;
    
    console.log(`当前轮次: ${currentRound.round}, 已完成比赛数: ${matchIndex}, 总比赛数: ${currentRound.matches.length}`);
    
    if (matchIndex >= currentRound.matches.length) {
      console.log('当前轮次所有比赛已完成，进入下一轮');
      this.advanceTournamentRound();
      return;
    }
    
    const match = currentRound.matches[matchIndex];
    console.log(`完成比赛: ${match.map(id => {
      const g = this.tournamentGeneLab?.getGene(id);
      return g?.name || id;
    }).join(' vs ')}, 胜者: ${winner?.name || '无'}`);
    
    currentRound.results.push({
      match,
      winner: winner ? winner.geneId : null,
      record
    });
    
    this.tournamentResults.push(record);
    
    eventBus.emit('arena:tournamentMatchEnded', {
      round: currentRound.round,
      winner,
      record
    });
    
    console.log('准备2秒后开始下一场比赛...');
    
    setTimeout(() => {
      console.log('定时器触发，调用 playNextTournamentMatch');
      this.playNextTournamentMatch();
    }, 2000);
  }

  advanceTournamentRound() {
    console.log('advanceTournamentRound called');
    
    const currentRound = this.tournamentBracket[this.tournamentBracket.length - 1];
    const winners = currentRound.results
      .filter(r => r.winner !== null)
      .map(r => r.winner);
    
    console.log(`当前轮次: ${currentRound.round}, 晋级者数量: ${winners.length}`);
    winners.forEach(id => {
      const g = this.tournamentGeneLab?.getGene(id);
      console.log(`  - ${g?.name || id}`);
    });
    
    if (winners.length === 0) {
      console.log('没有晋级者，结束锦标赛');
      this.endTournament(null);
      return;
    }
    
    if (winners.length === 1) {
      console.log(`只有1个晋级者，${this.tournamentGeneLab?.getGene(winners[0])?.name || winners[0]} 成为冠军`);
      this.endTournament(winners[0]);
      return;
    }
    
    const nextMatches = [];
    for (let i = 0; i < winners.length; i += 2) {
      if (i + 1 < winners.length) {
        nextMatches.push([winners[i], winners[i + 1]]);
      } else {
        console.log(`奇数个晋级者，${this.tournamentGeneLab?.getGene(winners[i])?.name || winners[i]} 轮空`);
        nextMatches.push([winners[i]]);
      }
    }
    
    const nextRoundName = currentRound.round === '半决赛' ? '决赛' : 
                         currentRound.round === '决赛' ? '总决赛' :
                         `第${this.tournamentBracket.length + 1}轮`;
    
    console.log(`下一轮: ${nextRoundName}, 比赛数: ${nextMatches.length}`);
    nextMatches.forEach((match, idx) => {
      console.log(`  比赛${idx + 1}: ${match.map(id => {
        const g = this.tournamentGeneLab?.getGene(id);
        return g?.name || id;
      }).join(' vs ')}`);
    });
    
    this.tournamentBracket.push({
      round: nextRoundName,
      matches: nextMatches,
      results: []
    });
    
    eventBus.emit('arena:tournamentRoundAdvanced', this.tournamentBracket);
    
    console.log('1.5秒后开始下一轮比赛');
    setTimeout(() => {
      console.log('定时器触发，调用 playNextTournamentMatch');
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
