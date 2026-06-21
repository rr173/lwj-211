import { ScriptEngine } from './ScriptEngine.js';
import { SCRIPT_EXAMPLES } from './ScriptParser.js';

export class ScriptUI {
  constructor(app, containerId) {
    this.app = app;
    this.container = document.getElementById(containerId);
    this.engine = new ScriptEngine(app);
    this.logLines = [];
    this.maxLogLines = 100;
    this.errorLine = -1;
    this.highlightedLine = -1;

    this.engine.onLog = (log) => this._appendLog(log);
    this.engine.onError = (line, msg) => this._showError(line, msg);
    this.engine.onLineComplete = (line) => this._highlightLine(line);
    this.engine.onComplete = () => this._onExecutionComplete();

    if (this.container) {
      this.render();
      this.bindEvents();
    }
  }

  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="script-panel">
        <div class="panel-header">
          <h3>📜 脚本编辑器</h3>
          <div class="script-header-actions">
            <select id="script-example-select" class="example-select">
              <option value="">📂 示例脚本...</option>
              ${Object.entries(SCRIPT_EXAMPLES).map(([key, ex]) => 
                `<option value="${key}">${ex.name}</option>`
              ).join('')}
            </select>
          </div>
        </div>

        <div class="panel-section">
          <div class="script-editor-wrapper">
            <div class="script-line-numbers" id="script-line-numbers"></div>
            <textarea 
              id="script-editor" 
              class="script-editor"
              spellcheck="false"
              placeholder="# 在此输入脚本指令&#10;# 每行一条指令，# 开头为注释&#10;# 支持指令: PLACE, ERASE, FILL, CLEAR, LINE, CIRCLE, RECT&#10;# COLONY, RULE, STEP, WAIT, SPEED, COLLISION, REPEAT...END, SET, RANDOM"
            ></textarea>
          </div>
          <div id="script-error" class="script-error hidden"></div>
        </div>

        <div class="panel-section">
          <div class="script-toolbar">
            <button id="script-run-btn" class="primary-btn">▶ 运行</button>
            <button id="script-step-btn">⏭ 逐行运行</button>
            <button id="script-pause-btn" class="hidden">⏸ 暂停</button>
            <button id="script-resume-btn" class="hidden">▶ 继续</button>
            <button id="script-stop-btn" class="hidden">⏹ 停止</button>
            <button id="script-clear-btn">🗑 清空</button>
          </div>
        </div>

        <div class="panel-section">
          <div class="section-title">执行日志</div>
          <div id="script-log" class="script-log"></div>
        </div>

        <div class="panel-section">
          <div class="section-title">指令速查</div>
          <div class="script-cheatsheet">
            <div class="cheatsheet-row"><code>PLACE x y</code><span>放置活细胞</span></div>
            <div class="cheatsheet-row"><code>ERASE x y</code><span>擦除细胞</span></div>
            <div class="cheatsheet-row"><code>FILL x1 y1 x2 y2</code><span>填充矩形</span></div>
            <div class="cheatsheet-row"><code>CLEAR x1 y1 x2 y2</code><span>清除矩形</span></div>
            <div class="cheatsheet-row"><code>LINE x1 y1 x2 y2</code><span>画直线</span></div>
            <div class="cheatsheet-row"><code>CIRCLE cx cy r</code><span>画圆环</span></div>
            <div class="cheatsheet-row"><code>RECT x1 y1 x2 y2</code><span>画矩形边框</span></div>
            <div class="cheatsheet-row"><code>COLONY name</code><span>切换群落</span></div>
            <div class="cheatsheet-row"><code>RULE name Bx/Sy type</code><span>创建新规则</span></div>
            <div class="cheatsheet-row"><code>STEP n</code><span>推进n代</span></div>
            <div class="cheatsheet-row"><code>WAIT ms</code><span>暂停毫秒</span></div>
            <div class="cheatsheet-row"><code>SPEED n</code><span>设置速度</span></div>
            <div class="cheatsheet-row"><code>COLLISION mode</code><span>碰撞策略</span></div>
            <div class="cheatsheet-row"><code>REPEAT n ... END</code><span>重复n次</span></div>
            <div class="cheatsheet-row"><code>SET var value</code><span>定义变量</span></div>
            <div class="cheatsheet-row"><code>RANDOM x1 y1 x2 y2 d</code><span>随机撒种</span></div>
            <div class="cheatsheet-row"><code>$var, $i</code><span>变量引用($i=循环计数)</span></div>
            <div class="cheatsheet-row"><code>$a+1, $b*2</code><span>简单算术运算</span></div>
          </div>
        </div>
      </div>
    `;

    this.cacheElements();
    this._updateLineNumbers();
  }

  cacheElements() {
    this.els = {
      editor: document.getElementById('script-editor'),
      lineNumbers: document.getElementById('script-line-numbers'),
      errorDiv: document.getElementById('script-error'),
      logDiv: document.getElementById('script-log'),
      exampleSelect: document.getElementById('script-example-select'),
      runBtn: document.getElementById('script-run-btn'),
      stepBtn: document.getElementById('script-step-btn'),
      pauseBtn: document.getElementById('script-pause-btn'),
      resumeBtn: document.getElementById('script-resume-btn'),
      stopBtn: document.getElementById('script-stop-btn'),
      clearBtn: document.getElementById('script-clear-btn')
    };
  }

  bindEvents() {
    this.els.editor.addEventListener('input', () => {
      this._updateLineNumbers();
      this._clearErrorHighlight();
    });

    this.els.editor.addEventListener('scroll', () => {
      this.els.lineNumbers.scrollTop = this.els.editor.scrollTop;
    });

    this.els.exampleSelect.addEventListener('change', (e) => {
      const key = e.target.value;
      if (key && SCRIPT_EXAMPLES[key]) {
        this.els.editor.value = SCRIPT_EXAMPLES[key].script;
        this._updateLineNumbers();
      }
      e.target.value = '';
    });

    this.els.runBtn.addEventListener('click', () => this._run(false));
    this.els.stepBtn.addEventListener('click', () => this._run(true));
    this.els.pauseBtn.addEventListener('click', () => this._pause());
    this.els.resumeBtn.addEventListener('click', () => this._resume());
    this.els.stopBtn.addEventListener('click', () => this._stop());
    this.els.clearBtn.addEventListener('click', () => this._clearEditor());

    this.els.editor.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = this.els.editor.selectionStart;
        const end = this.els.editor.selectionEnd;
        this.els.editor.value = this.els.editor.value.substring(0, start) + '  ' + this.els.editor.value.substring(end);
        this.els.editor.selectionStart = this.els.editor.selectionEnd = start + 2;
        this._updateLineNumbers();
      }
    });
  }

  async _run(lineByLine) {
    if (this.engine.isRunning) return;
    const script = this.els.editor.value;
    if (!script.trim()) return;

    this._clearErrorHighlight();
    this._clearLog();
    this._setRunningState(true, lineByLine);

    try {
      await this.engine.run(script, lineByLine);
    } catch (e) {
      console.error('Script execution error:', e);
    }
  }

  _pause() {
    this.engine.pause();
    this.els.pauseBtn.classList.add('hidden');
    this.els.resumeBtn.classList.remove('hidden');
  }

  _resume() {
    this.engine.resume();
    this.els.pauseBtn.classList.remove('hidden');
    this.els.resumeBtn.classList.add('hidden');
  }

  _stop() {
    this.engine.stop();
    this._setRunningState(false, false);
    this._appendLog({ lineNumber: -1, command: '', result: '⏹ 脚本已被用户停止', timestamp: Date.now() });
  }

  _clearEditor() {
    if (this.engine.isRunning) {
      if (!confirm('脚本正在运行，确定要清空吗？')) return;
      this.engine.stop();
    }
    this.els.editor.value = '';
    this._updateLineNumbers();
    this._clearLog();
    this._clearErrorHighlight();
  }

  _setRunningState(running, lineByLine) {
    this.els.runBtn.disabled = running;
    this.els.stepBtn.disabled = running;
    this.els.clearBtn.disabled = running;
    this.els.editor.disabled = running;
    this.els.exampleSelect.disabled = running;

    if (running) {
      this.els.stopBtn.classList.remove('hidden');
      if (lineByLine) {
        this.els.pauseBtn.classList.add('hidden');
        this.els.resumeBtn.classList.remove('hidden');
      } else {
        this.els.pauseBtn.classList.remove('hidden');
        this.els.resumeBtn.classList.add('hidden');
      }
    } else {
      this.els.stopBtn.classList.add('hidden');
      this.els.pauseBtn.classList.add('hidden');
      this.els.resumeBtn.classList.add('hidden');
    }
  }

  _onExecutionComplete() {
    this._setRunningState(false, false);
    if (this.errorLine < 0) {
      this._appendLog({ lineNumber: -1, command: '', result: '✅ 脚本执行完成', timestamp: Date.now() });
    }
  }

  _updateLineNumbers() {
    const lines = this.els.editor.value.split('\n');
    const lineCount = Math.max(lines.length, 20);
    let html = '';
    for (let i = 1; i <= lineCount; i++) {
      const errorClass = i === this.errorLine ? 'error-line' : '';
      const highlightClass = i === this.highlightedLine ? 'highlight-line' : '';
      html += `<div class="script-line-num ${errorClass} ${highlightClass}">${i}</div>`;
    }
    this.els.lineNumbers.innerHTML = html;
  }

  _highlightLine(lineNumber) {
    this.highlightedLine = lineNumber;
    this._updateLineNumbers();
  }

  _showError(lineNumber, message) {
    this.errorLine = lineNumber;
    this.els.errorDiv.textContent = `第 ${lineNumber} 行错误: ${message}`;
    this.els.errorDiv.classList.remove('hidden');
    this._updateLineNumbers();

    const lines = this.els.editor.value.split('\n');
    let charCount = 0;
    for (let i = 0; i < lineNumber - 1 && i < lines.length; i++) {
      charCount += lines[i].length + 1;
    }
    this.els.editor.focus();
    this.els.editor.setSelectionRange(charCount, charCount + (lines[lineNumber - 1]?.length || 0));

    this._appendLog({ lineNumber, command: '', result: `❌ ${message}`, timestamp: Date.now() });
  }

  _clearErrorHighlight() {
    this.errorLine = -1;
    this.highlightedLine = -1;
    this.els.errorDiv.classList.add('hidden');
    this._updateLineNumbers();
  }

  _appendLog(log) {
    const time = new Date(log.timestamp).toLocaleTimeString();
    const lineStr = log.lineNumber > 0 ? `[L${log.lineNumber}]` : '[---]';
    const commandStr = log.command ? ` <code>${this._escapeHtml(log.command)}</code>` : '';
    const entry = document.createElement('div');
    entry.className = 'script-log-entry';
    entry.innerHTML = `<span class="log-time">${time}</span> <span class="log-line">${lineStr}</span>${commandStr} <span class="log-result">${this._escapeHtml(log.result)}</span>`;

    this.logLines.push(entry);
    while (this.logLines.length > this.maxLogLines) {
      const removed = this.logLines.shift();
      removed.remove();
    }
    this.els.logDiv.appendChild(entry);
    this.els.logDiv.scrollTop = this.els.logDiv.scrollHeight;
  }

  _clearLog() {
    this.logLines = [];
    this.els.logDiv.innerHTML = '';
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }
}
