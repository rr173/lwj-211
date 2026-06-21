export class ScriptParser {
  constructor() {
    this.variables = new Map();
    this.loopStack = [];
    this.currentLoopVar = null;
  }

  parse(scriptText) {
    const lines = scriptText.split('\n');
    const parsed = [];
    let i = 0;

    while (i < lines.length) {
      const rawLine = lines[i];
      const lineNumber = i + 1;
      const trimmed = rawLine.trim();

      if (trimmed === '' || trimmed.startsWith('#')) {
        i++;
        continue;
      }

      const instruction = this._parseLine(trimmed, lineNumber);
      parsed.push({ ...instruction, lineNumber, rawText: rawLine });

      if (instruction.command === 'REPEAT') {
        const repeatCount = this._evalParam(instruction.args[0]);
        const block = this._parseBlock(lines, i + 1);
        parsed[parsed.length - 1] = {
          command: 'REPEAT',
          args: [repeatCount],
          block: block.instructions,
          lineNumber,
          rawText: rawLine
        };
        i = block.endLine + 1;
        continue;
      }

      i++;
    }

    return parsed;
  }

  _parseBlock(lines, startIndex) {
    const instructions = [];
    let depth = 1;
    let i = startIndex;

    while (i < lines.length) {
      const rawLine = lines[i];
      const lineNumber = i + 1;
      const trimmed = rawLine.trim();

      if (trimmed === '' || trimmed.startsWith('#')) {
        i++;
        continue;
      }

      if (trimmed.toUpperCase().startsWith('REPEAT')) {
        depth++;
      }

      if (trimmed.toUpperCase() === 'END') {
        depth--;
        if (depth === 0) {
          return { instructions, endLine: i };
        }
      }

      const instruction = this._parseLine(trimmed, lineNumber);
      instructions.push({ ...instruction, lineNumber, rawText: rawLine });

      if (instruction.command === 'REPEAT') {
        const repeatCount = this._evalParam(instruction.args[0]);
        const block = this._parseBlock(lines, i + 1);
        instructions[instructions.length - 1] = {
          command: 'REPEAT',
          args: [repeatCount],
          block: block.instructions,
          lineNumber,
          rawText: rawLine
        };
        i = block.endLine + 1;
        continue;
      } else {
        i++;
      }
    }

    throw new Error(`REPEAT 缺少对应的 END`);
  }

  _parseLine(trimmed, lineNumber) {
    const tokens = trimmed.split(/\s+/);
    const command = tokens[0].toUpperCase();
    const args = tokens.slice(1);

    const validCommands = [
      'PLACE', 'ERASE', 'FILL', 'CLEAR', 'LINE', 'CIRCLE', 'RECT',
      'COLONY', 'RULE', 'STEP', 'WAIT', 'SPEED', 'COLLISION',
      'REPEAT', 'END', 'SET', 'RANDOM'
    ];

    if (!validCommands.includes(command) && command !== 'END') {
      throw new ScriptError(`未知指令: ${command}`, lineNumber);
    }

    this._validateArgs(command, args, lineNumber);

    return { command, args };
  }

  _validateArgs(command, args, lineNumber) {
    const argCounts = {
      'PLACE': [2],
      'ERASE': [2],
      'FILL': [4],
      'CLEAR': [4],
      'LINE': [4],
      'CIRCLE': [3],
      'RECT': [4],
      'COLONY': [1],
      'RULE': [3],
      'STEP': [1],
      'WAIT': [1],
      'SPEED': [1],
      'COLLISION': [1],
      'REPEAT': [1],
      'SET': [2],
      'RANDOM': [5]
    };

    if (argCounts[command] && !argCounts[command].includes(args.length) && command !== 'END') {
      throw new ScriptError(
        `${command} 需要 ${argCounts[command].join(' 或 ')} 个参数，实际 ${args.length}`,
        lineNumber
      );
    }
  }

  resolveArgs(args, variables, loopVars = null) {
    return args.map(arg => this._evalParam(arg, variables, loopVars));
  }

  _evalParam(param, variables = new Map(), loopVars = null) {
    if (typeof param === 'number') return param;

    const str = String(param).trim();

    if (str.startsWith('cos(') && str.endsWith(')')) {
      const inner = str.slice(4, -1);
      const val = this._evalParam(inner, variables, loopVars);
      return Math.cos(val);
    }
    if (str.startsWith('sin(') && str.endsWith(')')) {
      const inner = str.slice(4, -1);
      const val = this._evalParam(inner, variables, loopVars);
      return Math.sin(val);
    }
    if (str.startsWith('sqrt(') && str.endsWith(')')) {
      const inner = str.slice(5, -1);
      const val = this._evalParam(inner, variables, loopVars);
      return Math.sqrt(val);
    }

    if (str.includes('+') || str.includes('-') || str.includes('*') || str.includes('/')) {
      return this._evalArithmetic(str, variables, loopVars);
    }

    if (str.startsWith('$')) {
      const varName = str.slice(1);
      if (loopVars && varName === 'i') {
        if (loopVars.current !== undefined) return loopVars.current;
      }
      if (variables.has(varName)) {
        return variables.get(varName);
      }
      throw new Error(`未定义的变量: ${str}`);
    }

    const num = parseFloat(str);
    if (!isNaN(num)) return num;

    return str;
  }

  _evalArithmetic(expr, variables, loopVars) {
    const operators = ['+', '-', '*', '/'];
    for (const op of operators) {
      const idx = expr.indexOf(op);
      if (idx > 0 && idx < expr.length - 1) {
        const leftStr = expr.slice(0, idx);
        const rightStr = expr.slice(idx + 1);
        const left = this._evalParam(leftStr, variables, loopVars);
        const right = this._evalParam(rightStr, variables, loopVars);
        switch (op) {
          case '+': return left + right;
          case '-': return left - right;
          case '*': return left * right;
          case '/': return left / right;
        }
      }
    }
    const num = parseFloat(expr);
    if (!isNaN(num)) return num;
    return expr;
  }
}

export class ScriptError extends Error {
  constructor(message, lineNumber) {
    super(message);
    this.name = 'ScriptError';
    this.lineNumber = lineNumber;
  }
}

export const SCRIPT_EXAMPLES = {
  gliderArray: {
    name: '滑翔机阵列',
    script: `# 示例1: 用REPEAT在不同位置放置5个滑翔机
SET start_x 10
SET start_y 10
SET spacing 15

REPEAT 5
  PLACE $start_x $start_y
  PLACE $start_x+1 $start_y+1
  PLACE $start_x+2 $start_y+2
  PLACE $start_x $start_y+2
  PLACE $start_x-1 $start_y+2
  SET start_x $start_x+$spacing
END

STEP 10
WAIT 500
STEP 10`,
  },
  multiRule: {
    name: '多规则对比',
    script: `# 示例2: 创建3种不同规则，各自撒种，然后跑200代

RULE rule_a B3/S23 Moore
COLONY rule_a
RANDOM -30 0 0 30 0.3

RULE rule_b B36/S23 Moore
COLONY rule_b
RANDOM 0 0 30 30 0.3

RULE rule_c B2/S013 Moore
COLONY rule_c
RANDOM 0 -30 30 0 0.3

SPEED 10
STEP 200`,
  },
  spiral: {
    name: '螺旋图案',
    script: `# 示例3: 用REPEAT画一个螺旋
SET cx 0
SET cy 0
SET radius 2
SET angle 0

REPEAT 50
  SET x $cx+$radius*cos($angle)
  SET y $cy+$radius*sin($angle)
  PLACE $x $y
  SET angle $angle+0.5
  SET radius $radius+0.1
END`,
  }
};
