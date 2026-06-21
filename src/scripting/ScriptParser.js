export class ScriptParser {
  constructor() {
    this.variables = new Map();
  }

  parse(scriptText) {
    const lines = scriptText.split('\n');
    const { instructions, endIndex } = this._parseBlock(lines, 0);
    return instructions;
  }

  _parseBlock(lines, startIndex) {
    const instructions = [];
    let i = startIndex;

    while (i < lines.length) {
      const rawLine = lines[i];
      const lineNumber = i + 1;
      const trimmed = rawLine.trim();

      if (trimmed === '' || trimmed.startsWith('#')) {
        i++;
        continue;
      }

      if (trimmed.toUpperCase() === 'END') {
        return { instructions, endIndex: i };
      }

      const instruction = this._parseLine(trimmed, lineNumber);
      instruction.lineNumber = lineNumber;
      instruction.rawText = rawLine;

      if (instruction.command === 'REPEAT') {
        const nested = this._parseBlock(lines, i + 1);
        if (nested.endIndex >= lines.length) {
          throw new ScriptError(`REPEAT 缺少对应的 END`, lineNumber);
        }
        instruction.block = nested.instructions;
        instruction.endLine = nested.endIndex;
        i = nested.endIndex + 1;
      } else {
        i++;
      }

      instructions.push(instruction);
    }

    return { instructions, endIndex: i - 1 };
  }

  _parseLine(trimmed, lineNumber) {
    const firstSpace = trimmed.search(/\s/);
    let command, args;
    
    if (firstSpace === -1) {
      command = trimmed.toUpperCase();
      args = [];
    } else {
      command = trimmed.slice(0, firstSpace).toUpperCase();
      const rest = trimmed.slice(firstSpace).trim();
      
      if (command === 'SET') {
        const varMatch = rest.match(/^([^\s]+)\s+(.*)$/);
        if (varMatch) {
          args = [varMatch[1], varMatch[2]];
        } else {
          args = rest ? [rest] : [];
        }
      } else if (command === 'RULE') {
        const tokens = this._splitArgs(rest);
        args = tokens;
      } else {
        args = this._splitArgs(rest);
      }
    }

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

  _splitArgs(str) {
    const args = [];
    let current = '';
    let depth = 0;
    let i = 0;
    
    while (i < str.length) {
      const ch = str[i];
      
      if (ch === '(') {
        depth++;
        current += ch;
      } else if (ch === ')') {
        depth--;
        current += ch;
      } else if (/\s/.test(ch) && depth === 0) {
        if (current.trim() !== '') {
          args.push(current.trim());
          current = '';
        }
      } else {
        current += ch;
      }
      i++;
    }
    
    if (current.trim() !== '') {
      args.push(current.trim());
    }
    
    return args;
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
    return args.map(arg => this.evalExpression(String(arg), variables, loopVars));
  }

  evalExpression(expr, variables = new Map(), loopVars = null) {
    return this._parseExpr(expr.trim(), variables, loopVars);
  }

  _parseExpr(expr, variables, loopVars) {
    let pos = 0;

    const parseValue = () => {
      while (pos < expr.length && /\s/.test(expr[pos])) pos++;

      let negative = false;
      if (expr[pos] === '-' && pos + 1 < expr.length) {
        negative = true;
        pos++;
      }

      if (expr[pos] === '(') {
        pos++;
        let val = parseAddSub();
        if (negative) val = -val;
        while (pos < expr.length && /\s/.test(expr[pos])) pos++;
        if (expr[pos] === ')') pos++;
        return val;
      }

      let start = pos;
      if (expr[pos] === '$') {
        pos++;
        while (pos < expr.length && /[a-zA-Z0-9_]/.test(expr[pos])) pos++;
        const varName = expr.slice(start + 1, pos);
        if (varName === 'i' && loopVars) {
          return negative ? -loopVars.current : loopVars.current;
        }
        if (variables.has(varName)) {
          const val = variables.get(varName);
          return negative ? -val : val;
        }
        throw new Error(`未定义的变量: $${varName}`);
      }

      while (pos < expr.length && /[a-zA-Z0-9_.]/.test(expr[pos])) pos++;
      const token = expr.slice(start, pos);

      if (pos < expr.length && expr[pos] === '(') {
        const funcName = token.toLowerCase();
        pos++;
        let arg = parseAddSub();
        while (pos < expr.length && /\s/.test(expr[pos])) pos++;
        if (expr[pos] === ')') pos++;
        let result;
        switch (funcName) {
          case 'sin': result = Math.sin(arg); break;
          case 'cos': result = Math.cos(arg); break;
          case 'tan': result = Math.tan(arg); break;
          case 'sqrt': result = Math.sqrt(arg); break;
          case 'abs': result = Math.abs(arg); break;
          case 'round': result = Math.round(arg); break;
          case 'floor': result = Math.floor(arg); break;
          case 'ceil': result = Math.ceil(arg); break;
          default: throw new Error(`未知函数: ${funcName}`);
        }
        return negative ? -result : result;
      }

      const num = parseFloat(token);
      if (!isNaN(num)) {
        return negative ? -num : num;
      }

      if (negative) {
        throw new Error(`无法解析: -${token}`);
      }
      throw new Error(`无法解析: ${token}`);
    };

    const parseMulDiv = () => {
      let left = parseValue();
      while (pos < expr.length) {
        while (pos < expr.length && /\s/.test(expr[pos])) pos++;
        if (expr[pos] === '*' || expr[pos] === '/') {
          const op = expr[pos];
          pos++;
          const right = parseValue();
          if (op === '*') left *= right;
          else left /= right;
        } else {
          break;
        }
      }
      return left;
    };

    const parseAddSub = () => {
      let left = parseMulDiv();
      while (pos < expr.length) {
        while (pos < expr.length && /\s/.test(expr[pos])) pos++;
        if (expr[pos] === '+' || expr[pos] === '-') {
          const op = expr[pos];
          pos++;
          const right = parseMulDiv();
          if (op === '+') left += right;
          else left -= right;
        } else {
          break;
        }
      }
      return left;
    };

    const result = parseAddSub();
    return result;
  }

  _evalParam(param, variables = new Map(), loopVars = null) {
    if (typeof param === 'number') return param;
    return this.evalExpression(String(param), variables, loopVars);
  }

  _evalArithmetic(expr, variables, loopVars) {
    return this.evalExpression(expr, variables, loopVars);
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
  nestedRepeat: {
    name: '嵌套循环方阵',
    script: `# 示例: REPEAT嵌套 - 画方格点阵
SET x0 -40
SET y0 -30
SET step 8
SET size 8

REPEAT $size
  SET x $x0
  REPEAT $size
    FILL $x $y0 $x+3 $y0+3
    SET x $x+$step
  END
  SET y0 $y0+$step
END
`,
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
SET radius 3
SET angle 0

REPEAT 80
  SET x round($cx + $radius * cos($angle))
  SET y round($cy + $radius * sin($angle))
  PLACE $x $y
  SET angle $angle + 0.4
  SET radius $radius + 0.15
END`,
  }
};
