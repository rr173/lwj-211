import { eventBus } from '../core/EventBus.js';

export class Referee {
  constructor() {
    this.matchHistory = [];
    this.maxHistory = 20;
    this.loadHistory();
  }

  recordMatch(matchData) {
    const record = {
      id: 'match_' + Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      contestants: matchData.contestants || [],
      winner: matchData.winner || null,
      winnerName: matchData.winnerName || null,
      generations: matchData.generations || 0,
      result: matchData.result || 'unknown',
      cellCounts: matchData.cellCounts || {},
      eliminationTimeline: matchData.eliminationTimeline || [],
      isTournament: matchData.isTournament || false,
      tournamentRound: matchData.tournamentRound || null
    };
    
    this.matchHistory.unshift(record);
    
    if (this.matchHistory.length > this.maxHistory) {
      this.matchHistory = this.matchHistory.slice(0, this.maxHistory);
    }
    
    this.saveHistory();
    eventBus.emit('referee:matchRecorded', record);
    
    return record;
  }

  getMatchHistory() {
    return [...this.matchHistory];
  }

  generateResultPanel(matchData) {
    const { result, state, contestants } = matchData;
    const totalAlive = state.totalAlive;
    const cellCounts = state.cellCounts;
    
    const percentages = {};
    for (const [cid, count] of cellCounts.entries()) {
      percentages[cid] = totalAlive > 0 ? (count / totalAlive * 100).toFixed(1) : 0;
    }
    
    const sortedContestants = [...contestants].sort((a, b) => {
      const countA = cellCounts.get(a.colonyId) || 0;
      const countB = cellCounts.get(b.colonyId) || 0;
      return countB - countA;
    });
    
    let title = '对战结果';
    let championName = '无';
    let championColor = '#888';
    
    if (result.reason === 'dominance' && result.winner) {
      const winner = contestants.find(c => c.colonyId === result.winner);
      if (winner) {
        title = '🏆 对战结束 - 有冠军！';
        championName = winner.name;
        championColor = winner.color;
      }
    } else if (result.reason === 'extinction') {
      title = '💀 对战结束 - 全部灭亡';
      championName = '无 (全部灭亡)';
    } else if (result.reason === 'timeout') {
      title = '⏱️ 对战结束 - 平局';
      championName = '平局';
    }
    
    const pieChartData = sortedContestants.map(c => ({
      name: c.name,
      color: c.color,
      value: cellCounts.get(c.colonyId) || 0,
      percentage: percentages[c.colonyId] || 0
    }));
    
    return {
      title,
      championName,
      championColor,
      generations: state.generation,
      totalAlive,
      pieChartData,
      eliminationTimeline: state.eliminationTimeline,
      result: result.reason,
      message: result.message
    };
  }

  renderPieChart(canvas, data) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    let w = rect.width;
    let h = rect.height;
    
    if (w <= 0 || h <= 0) {
      w = 200;
      h = 200;
    }
    
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.max(10, Math.min(w, h) / 2 - 10);
    
    ctx.clearRect(0, 0, w, h);
    
    const total = data.reduce((sum, d) => sum + d.value, 0);
    
    if (total === 0) {
      ctx.fillStyle = '#444';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('无数据', cx, cy);
      return;
    }
    
    let startAngle = -Math.PI / 2;
    
    for (const item of data) {
      if (item.value === 0) continue;
      
      const sliceAngle = (item.value / total) * Math.PI * 2;
      
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle);
      ctx.closePath();
      ctx.fillStyle = item.color;
      ctx.fill();
      
      ctx.strokeStyle = '#1a1a2e';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      if (item.percentage > 5) {
        const midAngle = startAngle + sliceAngle / 2;
        const labelX = cx + Math.cos(midAngle) * (radius * 0.6);
        const labelY = cy + Math.sin(midAngle) * (radius * 0.6);
        
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${item.percentage}%`, labelX, labelY);
      }
      
      startAngle += sliceAngle;
    }
    
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = '#16213e';
    ctx.fill();
    
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(total.toLocaleString(), cx, cy - 2);
    ctx.font = '9px sans-serif';
    ctx.fillStyle = '#888';
    ctx.fillText('总细胞', cx, cy + 12);
  }

  renderTimeline(container, timeline, contestants) {
    if (timeline.length === 0) {
      container.innerHTML = '<div class="timeline-empty">无淘汰记录</div>';
      return;
    }
    
    const sortedTimeline = [...timeline].sort((a, b) => a.generation - b.generation);
    
    container.innerHTML = sortedTimeline.map((event, index) => {
      const contestant = contestants.find(c => c.colonyId === event.colonyId);
      const color = contestant?.color || '#888';
      
      return `
        <div class="timeline-item">
          <div class="timeline-order">${index + 1}</div>
          <div class="timeline-dot" style="background: ${color}"></div>
          <div class="timeline-content">
            <div class="timeline-name" style="color: ${color}">${this.escapeHtml(event.name)}</div>
            <div class="timeline-gen">第 ${event.generation} 代</div>
          </div>
        </div>
      `;
    }).join('');
  }

  renderHistoryTable(container) {
    if (this.matchHistory.length === 0) {
      container.innerHTML = '<div class="empty-hint">暂无对战记录</div>';
      return;
    }
    
    container.innerHTML = `
      <div class="history-table">
        <div class="history-row header">
          <div class="history-cell">时间</div>
          <div class="history-cell">参赛</div>
          <div class="history-cell">冠军</div>
          <div class="history-cell">代数</div>
          <div class="history-cell">结果</div>
        </div>
        ${this.matchHistory.map(match => {
          const date = new Date(match.timestamp);
          const timeStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
          const contestantNames = match.contestants.map(c => `<span style="color:${c.color}">●</span> ${this.escapeHtml(c.name)}`).join(' ');
          const winnerName = match.winnerName ? this.escapeHtml(match.winnerName) : (match.result === 'timeout' ? '平局' : '全灭');
          const resultClass = match.result === 'dominance' ? 'result-win' : 
                             match.result === 'timeout' ? 'result-draw' : 'result-lose';
          
          return `
            <div class="history-row">
              <div class="history-cell">${timeStr}</div>
              <div class="history-cell">${contestantNames}</div>
              <div class="history-cell ${resultClass}">${winnerName}</div>
              <div class="history-cell">${match.generations}</div>
              <div class="history-cell">${this.getResultLabel(match.result)}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  getResultLabel(result) {
    const labels = {
      dominance: '胜利',
      timeout: '平局',
      extinction: '全灭'
    };
    return labels[result] || result;
  }

  runTournament(geneIds, geneLab, callback) {
    if (geneIds.length < 4) {
      return { error: '锦标赛需要至少4个参赛者' };
    }
    
    const shuffled = [...geneIds].sort(() => Math.random() - 0.5);
    const tournamentBracket = [];
    
    const quarterfinals = [];
    for (let i = 0; i < shuffled.length; i += 2) {
      if (i + 1 < shuffled.length) {
        quarterfinals.push([shuffled[i], shuffled[i + 1]]);
      }
    }
    
    tournamentBracket.push({ round: '1/4决赛', matches: quarterfinals });
    
    return {
      bracket: tournamentBracket,
      totalRounds: Math.ceil(Math.log2(shuffled.length))
    };
  }

  clearHistory() {
    this.matchHistory = [];
    this.saveHistory();
    eventBus.emit('referee:historyCleared');
  }

  saveHistory() {
    try {
      localStorage.setItem('arena_match_history', JSON.stringify(this.matchHistory));
    } catch (e) {
      console.warn('Failed to save match history:', e);
    }
  }

  loadHistory() {
    try {
      const stored = localStorage.getItem('arena_match_history');
      if (stored) {
        this.matchHistory = JSON.parse(stored) || [];
      }
    } catch (e) {
      console.warn('Failed to load match history:', e);
      this.matchHistory = [];
    }
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

export const referee = new Referee();
