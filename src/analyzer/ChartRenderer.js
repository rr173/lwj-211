export class ChartRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;
  }

  resize(width, height) {
    this.canvas.width = width * this.dpr;
    this.canvas.height = height * this.dpr;
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  clear() {
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;
    this.ctx.clearRect(0, 0, w, h);
  }

  drawBackground(w, h, color = '#1a1a2e') {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, w, h);
  }

  drawGrid(x, y, w, h, xTicks, yTicks, color = 'rgba(80, 100, 140, 0.2)') {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 1;

    for (let i = 0; i <= yTicks; i++) {
      const gy = y + (h / yTicks) * i;
      this.ctx.beginPath();
      this.ctx.moveTo(x, gy);
      this.ctx.lineTo(x + w, gy);
      this.ctx.stroke();
    }

    for (let i = 0; i <= xTicks; i++) {
      const gx = x + (w / xTicks) * i;
      this.ctx.beginPath();
      this.ctx.moveTo(gx, y);
      this.ctx.lineTo(gx, y + h);
      this.ctx.stroke();
    }
  }

  drawLineChart(data, options = {}) {
    const {
      x = 10,
      y = 10,
      width,
      height,
      color = '#e94560',
      lineWidth = 2,
      showDots = false,
      dotRadius = 3,
      fill = false,
      fillColor = 'rgba(233, 69, 96, 0.1)',
      xLabel = '',
      yLabel = '',
      yMin = null,
      yMax = null,
      xLabels = null,
      yTicks = 4,
      xTicks = 5,
      title = '',
      titleColor = '#e0e0e0'
    } = options;

    const w = width || (this.canvas.width / this.dpr - x * 2);
    const h = height || (this.canvas.height / this.dpr - y * 2);
    const chartX = x + 30;
    const chartY = y + (title ? 24 : 5);
    const chartW = w - 40;
    const chartH = h - (title ? 34 : 15);

    if (title) {
      this.ctx.fillStyle = titleColor;
      this.ctx.font = 'bold 12px sans-serif';
      this.ctx.textAlign = 'left';
      this.ctx.fillText(title, x, y + 16);
    }

    if (data.length < 2) {
      this.ctx.fillStyle = '#666';
      this.ctx.font = '11px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('数据不足', chartX + chartW / 2, chartY + chartH / 2);
      return;
    }

    const values = data.map(d => d.y);
    const actualYMin = yMin !== null ? yMin : Math.min(...values);
    const actualYMax = yMax !== null ? yMax : Math.max(...values);
    const yRange = actualYMax - actualYMin || 1;

    this.drawGrid(chartX, chartY, chartW, chartH, xTicks, yTicks);

    if (fill) {
      this.ctx.fillStyle = fillColor;
      this.ctx.beginPath();
      data.forEach((d, i) => {
        const px = chartX + (i / (data.length - 1)) * chartW;
        const py = chartY + chartH - ((d.y - actualYMin) / yRange) * chartH;
        if (i === 0) this.ctx.moveTo(px, chartY + chartH);
        this.ctx.lineTo(px, py);
      });
      this.ctx.lineTo(chartX + chartW, chartY + chartH);
      this.ctx.closePath();
      this.ctx.fill();
    }

    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    this.ctx.beginPath();
    data.forEach((d, i) => {
      const px = chartX + (i / (data.length - 1)) * chartW;
      const py = chartY + chartH - ((d.y - actualYMin) / yRange) * chartH;
      if (i === 0) this.ctx.moveTo(px, py);
      else this.ctx.lineTo(px, py);
    });
    this.ctx.stroke();

    if (showDots) {
      this.ctx.fillStyle = color;
      data.forEach((d, i) => {
        const px = chartX + (i / (data.length - 1)) * chartW;
        const py = chartY + chartH - ((d.y - actualYMin) / yRange) * chartH;
        this.ctx.beginPath();
        this.ctx.arc(px, py, dotRadius, 0, Math.PI * 2);
        this.ctx.fill();
      });
    }

    this.ctx.fillStyle = '#888';
    this.ctx.font = '9px monospace';
    this.ctx.textAlign = 'right';
    for (let i = 0; i <= yTicks; i++) {
      const gy = chartY + (chartH / yTicks) * i;
      const val = actualYMax - (yRange / yTicks) * i;
      this.ctx.fillText(val.toFixed(1), chartX - 4, gy + 3);
    }

    if (xLabels && xLabels.length > 0) {
      this.ctx.textAlign = 'center';
      const step = Math.max(1, Math.floor(xLabels.length / xTicks));
      for (let i = 0; i < xLabels.length; i += step) {
        const px = chartX + (i / (xLabels.length - 1)) * chartW;
        this.ctx.fillText(xLabels[i], px, chartY + chartH + 12);
      }
    }

    if (xLabel) {
      this.ctx.textAlign = 'center';
      this.ctx.fillStyle = '#666';
      this.ctx.font = '10px sans-serif';
      this.ctx.fillText(xLabel, chartX + chartW / 2, chartY + chartH + 22);
    }

    if (yLabel) {
      this.ctx.save();
      this.ctx.translate(8, chartY + chartH / 2);
      this.ctx.rotate(-Math.PI / 2);
      this.ctx.textAlign = 'center';
      this.ctx.fillStyle = '#666';
      this.ctx.font = '10px sans-serif';
      this.ctx.fillText(yLabel, 0, 0);
      this.ctx.restore();
    }
  }

  drawHighlightPoint(x, y, label, color = '#ffb74d') {
    const dpr = this.dpr;
    const px = x * dpr;
    const py = y * dpr;

    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.arc(px, py, 6, 0, Math.PI * 2);
    this.ctx.stroke();

    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(px, py, 3, 0, Math.PI * 2);
    this.ctx.fill();

    if (label) {
      this.ctx.fillStyle = color;
      this.ctx.font = 'bold 10px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(label, px, py - 10);
    }
  }

  drawRadarChart(scores, options = {}) {
    const {
      x = 10,
      y = 10,
      width,
      height,
      labels = ['稳定性', '活跃度', '扩张力', '鲁棒性'],
      color = '#e94560',
      fillColor = 'rgba(233, 69, 96, 0.2)',
      title = '',
      titleColor = '#e0e0e0'
    } = options;

    const w = width || (this.canvas.width / this.dpr - x * 2);
    const h = height || (this.canvas.height / this.dpr - y * 2);
    const centerX = x + w / 2;
    const centerY = y + h / 2 + (title ? 12 : 0);
    const radius = Math.min(w, h) / 2 - 30;

    if (title) {
      this.ctx.fillStyle = titleColor;
      this.ctx.font = 'bold 12px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(title, centerX, y + 16);
    }

    const numAxes = labels.length;
    const angleStep = (Math.PI * 2) / numAxes;
    const startAngle = -Math.PI / 2;

    this.ctx.strokeStyle = 'rgba(80, 100, 140, 0.3)';
    this.ctx.lineWidth = 1;
    for (let ring = 1; ring <= 4; ring++) {
      const r = (radius / 4) * ring;
      this.ctx.beginPath();
      for (let i = 0; i <= numAxes; i++) {
        const angle = startAngle + angleStep * i;
        const px = centerX + Math.cos(angle) * r;
        const py = centerY + Math.sin(angle) * r;
        if (i === 0) this.ctx.moveTo(px, py);
        else this.ctx.lineTo(px, py);
      }
      this.ctx.closePath();
      this.ctx.stroke();
    }

    this.ctx.strokeStyle = 'rgba(80, 100, 140, 0.4)';
    for (let i = 0; i < numAxes; i++) {
      const angle = startAngle + angleStep * i;
      const px = centerX + Math.cos(angle) * radius;
      const py = centerY + Math.sin(angle) * radius;
      this.ctx.beginPath();
      this.ctx.moveTo(centerX, centerY);
      this.ctx.lineTo(px, py);
      this.ctx.stroke();
    }

    const scoreValues = Object.values(scores);
    this.ctx.fillStyle = fillColor;
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    for (let i = 0; i < numAxes; i++) {
      const score = scoreValues[i] || 0;
      const r = (score / 100) * radius;
      const angle = startAngle + angleStep * i;
      const px = centerX + Math.cos(angle) * r;
      const py = centerY + Math.sin(angle) * r;
      if (i === 0) this.ctx.moveTo(px, py);
      else this.ctx.lineTo(px, py);
    }
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();

    for (let i = 0; i < numAxes; i++) {
      const score = scoreValues[i] || 0;
      const r = (score / 100) * radius;
      const angle = startAngle + angleStep * i;
      const px = centerX + Math.cos(angle) * r;
      const py = centerY + Math.sin(angle) * r;
      
      this.ctx.fillStyle = color;
      this.ctx.beginPath();
      this.ctx.arc(px, py, 3, 0, Math.PI * 2);
      this.ctx.fill();

      const labelR = radius + 14;
      const lx = centerX + Math.cos(angle) * labelR;
      const ly = centerY + Math.sin(angle) * labelR;
      
      this.ctx.fillStyle = '#e0e0e0';
      this.ctx.font = '11px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(labels[i], lx, ly);
      
      this.ctx.fillStyle = '#888';
      this.ctx.font = '10px monospace';
      this.ctx.fillText(score.toString(), lx, ly + 14);
    }

    this.ctx.textBaseline = 'alphabetic';
  }

  drawHeatmap(matrix, options = {}) {
    const {
      x = 10,
      y = 10,
      cellSize = 20,
      title = '',
      titleColor = '#e0e0e0',
      survivalColor = '#4caf50',
      deathColor = '#f44336',
      centerColor = '#ffb74d',
      outsideColor = '#0a0a14'
    } = options;

    const size = matrix.length;
    const w = size * cellSize;
    const h = size * cellSize;

    if (title) {
      this.ctx.fillStyle = titleColor;
      this.ctx.font = 'bold 12px sans-serif';
      this.ctx.textAlign = 'left';
      this.ctx.fillText(title, x, y + 16);
      y += 28;
    }

    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const cell = matrix[row][col];
        const px = x + col * cellSize;
        const py = y + row * cellSize;

        if (cell.type === 'center') {
          this.ctx.fillStyle = centerColor;
        } else if (cell.type === 'outside') {
          this.ctx.fillStyle = outsideColor;
        } else {
          this.ctx.fillStyle = cell.survives ? survivalColor : deathColor;
        }

        this.ctx.fillRect(px + 1, py + 1, cellSize - 2, cellSize - 2);

        if (cell.type !== 'outside' && cell.neighborCount !== undefined) {
          this.ctx.fillStyle = cell.type === 'center' ? '#1a1a2e' : '#fff';
          this.ctx.font = 'bold 9px monospace';
          this.ctx.textAlign = 'center';
          this.ctx.textBaseline = 'middle';
          this.ctx.fillText(cell.neighborCount.toString(), px + cellSize / 2, py + cellSize / 2);
        }
      }
    }

    this.ctx.textBaseline = 'alphabetic';
  }

  drawTimeline(data, options = {}) {
    const {
      x = 10,
      y = 10,
      width,
      height = 40,
      color = '#4fc3f7',
      backgroundColor = '#0a0a14',
      showLabels = true,
      title = '',
      titleColor = '#e0e0e0'
    } = options;

    const w = width || (this.canvas.width / this.dpr - x * 2);
    const h = height;

    if (title) {
      this.ctx.fillStyle = titleColor;
      this.ctx.font = 'bold 11px sans-serif';
      this.ctx.textAlign = 'left';
      this.ctx.fillText(title, x, y + 14);
      y += 22;
    }

    this.ctx.fillStyle = backgroundColor;
    this.ctx.fillRect(x, y, w, h);

    if (!data || data.counts === undefined) return;

    const counts = data.counts;
    if (counts.length < 2) return;

    const maxCount = Math.max(...counts) || 1;
    const chartH = h - 4;

    this.ctx.fillStyle = color;
    const barWidth = Math.max(1, w / counts.length);
    for (let i = 0; i < counts.length; i++) {
      const barHeight = (counts[i] / maxCount) * chartH;
      const bx = x + i * barWidth;
      const by = y + h - barHeight - 2;
      this.ctx.fillRect(bx, by, barWidth - 0.5, barHeight);
    }

    if (data.cycleStart !== undefined && data.cycleStart !== -1) {
      const cycleX = x + (data.cycleStart / counts.length) * w;
      this.ctx.strokeStyle = '#ffb74d';
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([3, 3]);
      this.ctx.beginPath();
      this.ctx.moveTo(cycleX, y);
      this.ctx.lineTo(cycleX, y + h);
      this.ctx.stroke();
      this.ctx.setLineDash([]);

      if (showLabels) {
        this.ctx.fillStyle = '#ffb74d';
        this.ctx.font = '9px sans-serif';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`第${data.cycleStart}代进入周期`, cycleX + 4, y + 12);
      }
    }

    if (data.diedAt !== undefined && data.diedAt !== -1) {
      const dieX = x + (data.diedAt / counts.length) * w;
      this.ctx.strokeStyle = '#f44336';
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([3, 3]);
      this.ctx.beginPath();
      this.ctx.moveTo(dieX, y);
      this.ctx.lineTo(dieX, y + h);
      this.ctx.stroke();
      this.ctx.setLineDash([]);

      if (showLabels) {
        this.ctx.fillStyle = '#f44336';
        this.ctx.font = '9px sans-serif';
        this.ctx.textAlign = 'right';
        this.ctx.fillText(`第${data.diedAt}代灭亡`, dieX - 4, y + 12);
      }
    }
  }

  drawPhaseBands(phases, options = {}) {
    const {
      x = 10,
      y = 10,
      width,
      height = 16,
      totalGens
    } = options;

    const w = width || (this.canvas.width / this.dpr - x * 2);
    const h = height;

    if (!phases || phases.length === 0 || !totalGens) return;

    const phaseColors = {
      growth: '#4caf50',
      decline: '#f44336',
      oscillation: '#ffb74d',
      stable: '#2196f3'
    };

    for (const phase of phases) {
      const startX = x + (phase.startGen / totalGens) * w;
      const endX = x + (phase.endGen / totalGens) * w;
      const phaseW = endX - startX;

      this.ctx.fillStyle = phaseColors[phase.phase] || '#888';
      this.ctx.globalAlpha = 0.6;
      this.ctx.fillRect(startX, y, phaseW, h);
      this.ctx.globalAlpha = 1;
    }

    this.ctx.strokeStyle = 'rgba(80, 100, 140, 0.3)';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(x, y, w, h);

    const legendY = y + h + 4;
    const legendItems = [
      { color: '#4caf50', label: '增长' },
      { color: '#ffb74d', label: '震荡' },
      { color: '#f44336', label: '衰退' },
      { color: '#2196f3', label: '稳定' }
    ];

    this.ctx.font = '9px sans-serif';
    this.ctx.textAlign = 'left';
    let legendX = x;
    for (const item of legendItems) {
      this.ctx.fillStyle = item.color;
      this.ctx.fillRect(legendX, legendY, 8, 8);
      this.ctx.fillStyle = '#888';
      this.ctx.fillText(item.label, legendX + 12, legendY + 8);
      legendX += 50;
    }
  }

  drawLegend(items, x, y) {
    this.ctx.font = '10px sans-serif';
    this.ctx.textAlign = 'left';
    
    let curX = x;
    for (const item of items) {
      this.ctx.fillStyle = item.color;
      this.ctx.fillRect(curX, y, 10, 10);
      this.ctx.fillStyle = '#e0e0e0';
      this.ctx.fillText(item.label, curX + 14, y + 9);
      curX += item.label.length * 7 + 30;
    }
  }
}
