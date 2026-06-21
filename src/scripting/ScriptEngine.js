import { ScriptParser, ScriptError } from './ScriptParser.js';
import { Colony } from '../core/Colony.js';
import { Rule } from '../core/Rule.js';

export class ScriptEngine {
  constructor(app) {
    this.app = app;
    this.parser = new ScriptParser();
    this.variables = new Map();
    this.isRunning = false;
    this.isPaused = false;
    this.shouldStop = false;
    this.currentLine = -1;
    this.nestDepth = 0;
    this.maxNestDepth = 3;
    this.onLog = null;
    this.onError = null;
    this.onLineComplete = null;
    this.onComplete = null;
  }

  async run(scriptText, lineByLine = false) {
    this.isRunning = true;
    this.isPaused = false;
    this.shouldStop = false;
    this.variables = new Map();
    this.nestDepth = 0;

    try {
      const instructions = this.parser.parse(scriptText);
      await this._executeInstructions(instructions, lineByLine);
      this.onComplete?.();
    } catch (e) {
      if (e instanceof ScriptError) {
        this.onError?.(e.lineNumber, e.message);
      } else {
        this.onError?.(this.currentLine, e.message);
      }
    } finally {
      this.isRunning = false;
    }
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

  async _executeInstructions(instructions, lineByLine) {
    for (const instr of instructions) {
      if (this.shouldStop) return;
      while (this.isPaused && !this.shouldStop) {
        await this._sleep(50);
      }
      if (this.shouldStop) return;

      this.currentLine = instr.lineNumber;
      await this._executeSingle(instr, lineByLine);
      this.onLineComplete?.(instr.lineNumber);

      if (lineByLine) {
        this.isPaused = true;
        while (this.isPaused && !this.shouldStop) {
          await this._sleep(50);
        }
      }
    }
  }

  async _executeSingle(instr, lineByLine) {
    const loopVars = { current: 0 };
    const resolvedArgs = this.parser.resolveArgs(instr.args, this.variables, loopVars);

    switch (instr.command) {
      case 'PLACE': {
        const [x, y] = resolvedArgs.map(Math.round);
        const colony = this._getActiveColony();
        if (colony) {
          this.app.cellStore.set(x, y, colony.id);
          this._refresh();
          this._log(instr.lineNumber, `PLACE ${x} ${y}`, '放置1个细胞');
        }
        break;
      }
      case 'ERASE': {
        const [x, y] = resolvedArgs.map(Math.round);
        const removed = this.app.cellStore.delete(x, y) ? 1 : 0;
        this._refresh();
        this._log(instr.lineNumber, `ERASE ${x} ${y}`, `擦除${removed}个细胞`);
        break;
      }
      case 'FILL': {
        const [x1, y1, x2, y2] = resolvedArgs.map(Math.round);
        const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
        const colony = this._getActiveColony();
        let count = 0;
        if (colony) {
          for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
              this.app.cellStore.set(x, y, colony.id);
              count++;
            }
          }
        }
        this._refresh();
        this._log(instr.lineNumber, `FILL ${x1} ${y1} ${x2} ${y2}`, `填充${count}个细胞`);
        break;
      }
      case 'CLEAR': {
        const [x1, y1, x2, y2] = resolvedArgs.map(Math.round);
        const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
        let count = 0;
        const cells = this.app.cellStore.getCellsInRect(minX, minY, maxX, maxY);
        for (const c of cells) {
          if (this.app.cellStore.delete(c.x, c.y)) count++;
        }
        this._refresh();
        this._log(instr.lineNumber, `CLEAR ${x1} ${y1} ${x2} ${y2}`, `清除${count}个细胞`);
        break;
      }
      case 'LINE': {
        const [x1, y1, x2, y2] = resolvedArgs.map(Math.round);
        const colony = this._getActiveColony();
        let count = 0;
        if (colony) {
          const points = this._bresenhamLine(x1, y1, x2, y2);
          for (const [px, py] of points) {
            this.app.cellStore.set(px, py, colony.id);
            count++;
          }
        }
        this._refresh();
        this._log(instr.lineNumber, `LINE ${x1} ${y1} ${x2} ${y2}`, `绘制直线，${count}个细胞`);
        break;
      }
      case 'CIRCLE': {
        const [cx, cy, r] = resolvedArgs;
        const colony = this._getActiveColony();
        let count = 0;
        if (colony) {
          const points = this._circlePoints(Math.round(cx), Math.round(cy), Math.round(Math.abs(r)));
          for (const [px, py] of points) {
            this.app.cellStore.set(px, py, colony.id);
            count++;
          }
        }
        this._refresh();
        this._log(instr.lineNumber, `CIRCLE ${cx} ${cy} ${r}`, `绘制圆环，${count}个细胞`);
        break;
      }
      case 'RECT': {
        const [x1, y1, x2, y2] = resolvedArgs.map(Math.round);
        const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
        const colony = this._getActiveColony();
        let count = 0;
        if (colony) {
          for (let x = minX; x <= maxX; x++) {
            this.app.cellStore.set(x, minY, colony.id);
            this.app.cellStore.set(x, maxY, colony.id);
            count += 2;
          }
          for (let y = minY + 1; y < maxY; y++) {
            this.app.cellStore.set(minX, y, colony.id);
            this.app.cellStore.set(maxX, y, colony.id);
            count += 2;
          }
        }
        this._refresh();
        this._log(instr.lineNumber, `RECT ${x1} ${y1} ${x2} ${y2}`, `绘制矩形边框，${count}个细胞`);
        break;
      }
      case 'COLONY': {
        const name = resolvedArgs[0];
        const colony = this.app.colonyManager.getAll().find(c => c.name === name);
        if (colony) {
          this.app.colonyManager.selectColony(colony.id);
          this._log(instr.lineNumber, `COLONY ${name}`, `已切换到群落 "${name}"`);
        } else {
          throw new ScriptError(`未找到群落: ${name}`, instr.lineNumber);
        }
        break;
      }
      case 'RULE': {
        const [name, bsString, neighborhoodRaw] = instr.args;
        const neighborhood = String(neighborhoodRaw).toLowerCase() === 'vonneumann' ||
          String(neighborhoodRaw).toLowerCase() === 'vn' ? 'vonneumann' : 'moore';
        const { birth, survival } = Rule.parseBS(bsString);
        const colors = ['#e94560', '#4fc3f7', '#81c784', '#ffb74d', '#ba68c8', '#f06292', '#4dd0e1', '#aed581'];
        const color = colors[Math.floor(Math.random() * colors.length)];
        const rule = new Rule({
          name: String(name),
          color,
          birth,
          survival,
          neighborhood
        });
        const colony = new Colony(rule);
        this.app.colonyManager.addColony(colony);
        this._log(instr.lineNumber, `RULE ${name} ${bsString} ${neighborhood}`, `创建规则 "${name}" (${bsString}, ${neighborhood})`);
        break;
      }
      case 'STEP': {
        const [n] = resolvedArgs.map(v => Math.max(0, Math.round(v)));
        const before = this.app.cellStore.size();
        for (let i = 0; i < n && !this.shouldStop; i++) {
          this.app.engine.step();
          while (this.isPaused && !this.shouldStop) await this._sleep(50);
          if (this.shouldStop) break;
        }
        const after = this.app.cellStore.size();
        const diff = after - before;
        const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;
        this._log(instr.lineNumber, `STEP ${n}`, `推进${n}代，细胞数 ${before} → ${after} (${diffStr})`);
        break;
      }
      case 'WAIT': {
        const [ms] = resolvedArgs.map(v => Math.max(0, Math.round(v)));
        await this._sleep(ms);
        this._log(instr.lineNumber, `WAIT ${ms}`, `暂停${ms}毫秒`);
        break;
      }
      case 'SPEED': {
        const [n] = resolvedArgs.map(v => Math.max(1, Math.min(100, Math.round(v))));
        this.app.engine.setSpeed(n);
        this._log(instr.lineNumber, `SPEED ${n}`, `设置演化速度为 ${n} 代/秒`);
        break;
      }
      case 'COLLISION': {
        const [mode] = resolvedArgs;
        const validModes = ['priority', 'competition', 'peace'];
        if (validModes.includes(String(mode).toLowerCase())) {
          this.app.engine.setCollisionStrategy(String(mode).toLowerCase());
          this._log(instr.lineNumber, `COLLISION ${mode}`, `碰撞策略设置为 ${mode}`);
        } else {
          throw new ScriptError(`无效碰撞策略: ${mode}，可选: priority/competition/peace`, instr.lineNumber);
        }
        break;
      }
      case 'SET': {
        const [name, value] = instr.args;
        const varName = String(name).replace(/^\$/, '');
        const loopVars = { current: 0 };
        const resolvedValue = this.parser._evalParam(value, this.variables, loopVars);
        if (typeof resolvedValue === 'number') {
          this.variables.set(varName, resolvedValue);
          this._log(instr.lineNumber, `SET ${varName} ${value}`, `设置变量 $${varName} = ${resolvedValue}`);
        } else {
          throw new ScriptError(`变量值必须是数字: ${value}`, instr.lineNumber);
        }
        break;
      }
      case 'RANDOM': {
        const [x1, y1, x2, y2, density] = resolvedArgs;
        const minX = Math.min(Math.round(x1), Math.round(x2));
        const maxX = Math.max(Math.round(x1), Math.round(x2));
        const minY = Math.min(Math.round(y1), Math.round(y2));
        const maxY = Math.max(Math.round(y1), Math.round(y2));
        const d = Math.max(0, Math.min(1, density));
        const colony = this._getActiveColony();
        let count = 0;
        if (colony) {
          for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
              if (Math.random() < d) {
                this.app.cellStore.set(x, y, colony.id);
                count++;
              }
            }
          }
        }
        this._refresh();
        this._log(instr.lineNumber, `RANDOM ${x1} ${y1} ${x2} ${y2} ${density}`, `随机撒种 ${count} 个细胞 (密度 ${d.toFixed(2)})`);
        break;
      }
      case 'REPEAT': {
        if (this.nestDepth >= this.maxNestDepth) {
          throw new ScriptError(`REPEAT嵌套超过最大层数(${this.maxNestDepth})`, instr.lineNumber);
        }
        const [count] = resolvedArgs.map(v => Math.max(0, Math.round(v)));
        this.nestDepth++;
        for (let i = 0; i < count && !this.shouldStop; i++) {
          while (this.isPaused && !this.shouldStop) await this._sleep(50);
          if (this.shouldStop) break;

          this.variables.set('i', i);
          const innerLoopVars = { current: i };
          const resolvedInstructions = this._resolveBlockVars(instr.block, innerLoopVars);
          await this._executeInstructions(resolvedInstructions, lineByLine);
        }
        this.variables.delete('i');
        this.nestDepth--;
        this._log(instr.lineNumber, `REPEAT ${count} ... END`, `循环执行 ${count} 次`);
        break;
      }
    }
  }

  _resolveBlockVars(instructions, loopVars) {
    return instructions.map(instr => {
      if (instr.command === 'REPEAT') {
        return {
          ...instr,
          args: [this.parser.resolveArgs([instr.args[0]], this.variables, loopVars)[0]],
          block: this._resolveBlockVars(instr.block, loopVars)
        };
      }
      const resolvedArgs = this.parser.resolveArgs(instr.args, this.variables, loopVars);
      return { ...instr, args: resolvedArgs };
    });
  }

  _getActiveColony() {
    return this.app.colonyManager.getSelected();
  }

  _refresh() {
    if (this.app.renderer) {
      this.app.renderer.render();
    }
  }

  _log(lineNumber, command, result) {
    this.onLog?.({ lineNumber, command, result, timestamp: Date.now() });
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _bresenhamLine(x0, y0, x1, y1) {
    const points = [];
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
      points.push([x0, y0]);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
    return points;
  }

  _circlePoints(cx, cy, r) {
    const points = [];
    let x = r;
    let y = 0;
    let err = 0;

    while (x >= y) {
      points.push([cx + x, cy + y]);
      points.push([cx + y, cy + x]);
      points.push([cx - y, cy + x]);
      points.push([cx - x, cy + y]);
      points.push([cx - x, cy - y]);
      points.push([cx - y, cy - x]);
      points.push([cx + y, cy - x]);
      points.push([cx + x, cy - y]);

      if (err <= 0) {
        y += 1;
        err += 2 * y + 1;
      }
      if (err > 0) {
        x -= 1;
        err -= 2 * x + 1;
      }
    }
    return points;
  }
}
