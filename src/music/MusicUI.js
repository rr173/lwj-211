import { audioEngine, WAVEFORM_LABELS, NOTE_NAMES, midiToNoteName } from './AudioEngine.js';
import { NoteMapper, GRID_COLS, GRID_ROWS } from './NoteMapper.js';
import { MusicScheduler } from './MusicScheduler.js';
import { WavRecorder } from './WavRecorder.js';
import { eventBus } from '../core/EventBus.js';

export class MusicUI {
  constructor(cellStore, viewState, colonyManager, renderer) {
    this.cellStore = cellStore;
    this.viewState = viewState;
    this.colonyManager = colonyManager;
    this.renderer = renderer;

    this.noteMapper = null;
    this.musicScheduler = null;
    this.wavRecorder = null;

    this.currentStep = 0;
    this.currentNotes = [];
    this.isRecording = false;
    this.pianoRollData = new Array(GRID_COLS).fill(null).map(() => []);

    this._init();
  }

  _init() {
    this.noteMapper = new NoteMapper(this.cellStore, this.viewState, this.colonyManager);
    this.musicScheduler = new MusicScheduler(this.noteMapper);
    this.wavRecorder = new WavRecorder(this.musicScheduler, this.noteMapper);

    this.renderer.setMusicScheduler(this.musicScheduler);

    this._initBeatGrid();
    this._bindControlEvents();
    this._bindPanelEvents();
    this._bindEventBus();
    this._updateColonyMusicList();
    this._startPianoRollAnimation();
  }

  _initBeatGrid() {
    const beatGrid = document.getElementById('beat-grid');
    if (!beatGrid) return;

    let html = '';
    for (let i = 0; i < GRID_COLS; i++) {
      const isAccent = i % 4 === 0;
      html += `<div class="beat-cell ${isAccent ? 'accent' : ''}" data-index="${i}"></div>`;
    }
    beatGrid.innerHTML = html;
  }

  _bindControlEvents() {
    const playBtn = document.getElementById('music-play-btn');
    if (playBtn) {
      playBtn.addEventListener('click', () => this.togglePlay());
    }

    const bpmSlider = document.getElementById('bpm-slider');
    if (bpmSlider) {
      bpmSlider.addEventListener('input', (e) => {
        const bpm = parseInt(e.target.value, 10);
        this.setBPM(bpm);
      });
    }

    const volumeSlider = document.getElementById('volume-slider');
    if (volumeSlider) {
      volumeSlider.addEventListener('input', (e) => {
        const volume = parseInt(e.target.value, 10) / 100;
        this.setVolume(volume);
      });
    }

    const muteBtn = document.getElementById('mute-btn');
    if (muteBtn) {
      muteBtn.addEventListener('click', () => this.toggleMute());
    }
  }

  _bindPanelEvents() {
    const waveformSelect = document.getElementById('music-waveform');
    if (waveformSelect) {
      waveformSelect.addEventListener('change', (e) => {
        const selectedColony = this.colonyManager.getSelected();
        if (selectedColony) {
          selectedColony.setMusicWaveform(e.target.value);
        }
      });
    }

    const attackSlider = document.getElementById('attack-slider');
    if (attackSlider) {
      attackSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value, 10);
        document.getElementById('attack-value').textContent = value;
        audioEngine.setADSR({ attack: value / 1000 });
      });
    }

    const decaySlider = document.getElementById('decay-slider');
    if (decaySlider) {
      decaySlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value, 10);
        document.getElementById('decay-value').textContent = value;
        audioEngine.setADSR({ decay: value / 1000 });
      });
    }

    const sustainSlider = document.getElementById('sustain-slider');
    if (sustainSlider) {
      sustainSlider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        document.getElementById('sustain-value').textContent = value.toFixed(2);
        audioEngine.setADSR({ sustain: value });
      });
    }

    const releaseSlider = document.getElementById('release-slider');
    if (releaseSlider) {
      releaseSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value, 10);
        document.getElementById('release-value').textContent = value;
        audioEngine.setADSR({ release: value / 1000 });
      });
    }

    const recordBtn = document.getElementById('record-btn');
    if (recordBtn) {
      recordBtn.addEventListener('click', () => this.toggleRecording());
    }
  }

  _bindEventBus() {
    eventBus.on('music:step', (data) => {
      this.currentStep = data.step;
      this.currentNotes = data.notes;
      this._updateBeatIndicator(data.step);
      this._updateCurrentNotes(data.notes);
      this._updatePianoRollData(data.step, data.notes);
    });

    eventBus.on('music:playingChanged', (playing) => {
      this._updatePlayButton(playing);
    });

    eventBus.on('colony:added', () => this._updateColonyMusicList());
    eventBus.on('colony:removed', () => this._updateColonyMusicList());
    eventBus.on('colony:selected', () => this._updateSelectedColonyWaveform());
    eventBus.on('colony:musicConfigChanged', () => {
      this._updateColonyMusicList();
      this._updateSelectedColonyWaveform();
    });

    eventBus.on('music:recordingStarted', () => {
      this.isRecording = true;
      this._updateRecordButton();
    });

    eventBus.on('music:recordingStopped', () => {
      this.isRecording = false;
      this._updateRecordButton();
    });

    eventBus.on('music:recordingProgress', (data) => {
      this._updateRecordStatus(data.duration, data.steps);
    });

    eventBus.on('music:wavReady', (data) => {
      this._showDownloadLink(data.url, data.duration, data.size);
    });
  }

  togglePlay() {
    const isPlaying = this.musicScheduler.toggle();
    return isPlaying;
  }

  setBPM(bpm) {
    this.musicScheduler.setBPM(bpm);
    document.getElementById('bpm-value').textContent = bpm;
  }

  setVolume(volume) {
    audioEngine.setVolume(volume);
    const percent = Math.round(volume * 100);
    document.getElementById('volume-value').textContent = `${percent}%`;
  }

  toggleMute() {
    const muted = audioEngine.toggleMute();
    const muteBtn = document.getElementById('mute-btn');
    if (muteBtn) {
      muteBtn.classList.toggle('muted', muted);
      muteBtn.textContent = muted ? '🔇' : '🔊';
    }
    return muted;
  }

  async toggleRecording() {
    if (!this.musicScheduler.isPlaying) {
      alert('请先开始播放音乐再录制');
      return;
    }

    if (this.isRecording) {
      const result = await this.wavRecorder.stopRecording();
      if (result) {
        this._showDownloadLink(result.url, result.duration, result.blob.size);
      }
    } else {
      this.wavRecorder.startRecording();
    }
  }

  _updatePlayButton(playing) {
    const playBtn = document.getElementById('music-play-btn');
    if (playBtn) {
      playBtn.classList.toggle('playing', playing);
      playBtn.textContent = playing ? '⏸' : '▶';
    }
  }

  _updateBeatIndicator(step) {
    const beatGrid = document.getElementById('beat-grid');
    if (!beatGrid) return;

    const cells = beatGrid.querySelectorAll('.beat-cell');
    cells.forEach((cell, index) => {
      cell.classList.toggle('active', index === step);
    });
  }

  _updateCurrentNotes(notes) {
    const container = document.getElementById('current-notes-list');
    if (!container) return;

    if (notes.length === 0) {
      container.innerHTML = '<div class="empty-hint">无</div>';
      return;
    }

    container.innerHTML = notes.map(note => `
      <div class="note-badge" style="border-left: 2px solid ${note.colony.color}">
        ${note.noteName}
      </div>
    `).join('');
  }

  _updateColonyMusicList() {
    const container = document.getElementById('colony-music-list');
    if (!container) return;

    const colonies = this.colonyManager.getAll();

    if (colonies.length === 0) {
      container.innerHTML = '<div class="empty-hint">暂无群落</div>';
      return;
    }

    container.innerHTML = colonies.map(colony => {
      const isSelected = this.colonyManager.selectedColonyId === colony.id;
      const waveformLabel = WAVEFORM_LABELS[colony.musicConfig.waveform] || colony.musicConfig.waveform;
      const octaveOffset = colony.musicConfig.octaveOffset;
      const octaveText = octaveOffset > 0 ? `+${octaveOffset}` : octaveOffset.toString();

      return `
        <div class="colony-music-item ${isSelected ? 'selected' : ''}" 
             data-id="${colony.id}" style="border-left-color: ${colony.color}">
          <div class="colony-music-header">
            <div class="colony-music-name">
              <span class="colony-music-color" style="background: ${colony.color}"></span>
              <span>${this._escapeHtml(colony.name)}</span>
            </div>
          </div>
          <div class="colony-music-controls">
            <div class="colony-music-row">
              <label>波形</label>
              <select class="colony-waveform-select" data-id="${colony.id}">
                <option value="sine" ${colony.musicConfig.waveform === 'sine' ? 'selected' : ''}>正弦波</option>
                <option value="square" ${colony.musicConfig.waveform === 'square' ? 'selected' : ''}>方波</option>
                <option value="sawtooth" ${colony.musicConfig.waveform === 'sawtooth' ? 'selected' : ''}>锯齿波</option>
                <option value="triangle" ${colony.musicConfig.waveform === 'triangle' ? 'selected' : ''}>三角波</option>
              </select>
            </div>
            <div class="colony-music-row">
              <label>八度</label>
              <input type="range" class="colony-octave-slider" data-id="${colony.id}" 
                     min="-2" max="2" step="1" value="${octaveOffset}">
              <span class="octave-value">${octaveText}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.colony-music-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
        this.colonyManager.selectColony(el.dataset.id);
      });
    });

    container.querySelectorAll('.colony-waveform-select').forEach(select => {
      select.addEventListener('change', (e) => {
        e.stopPropagation();
        const colonyId = select.dataset.id;
        const colony = this.colonyManager.getColony(colonyId);
        if (colony) {
          colony.setMusicWaveform(e.target.value);
        }
      });
    });

    container.querySelectorAll('.colony-octave-slider').forEach(slider => {
      slider.addEventListener('input', (e) => {
        e.stopPropagation();
        const colonyId = slider.dataset.id;
        const colony = this.colonyManager.getColony(colonyId);
        if (colony) {
          const value = parseInt(e.target.value, 10);
          colony.setMusicOctaveOffset(value);
          const valueEl = slider.parentElement.querySelector('.octave-value');
          if (valueEl) {
            valueEl.textContent = value > 0 ? `+${value}` : value.toString();
          }
        }
      });
    });
  }

  _updateSelectedColonyWaveform() {
    const selected = this.colonyManager.getSelected();
    const waveformSelect = document.getElementById('music-waveform');
    if (waveformSelect && selected) {
      waveformSelect.value = selected.musicConfig.waveform;
    }
  }

  _updatePianoRollData(step, notes) {
    this.pianoRollData[step] = [...notes];
  }

  _startPianoRollAnimation() {
    const canvas = document.getElementById('piano-roll-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    const animate = () => {
      this._renderPianoRoll(ctx, canvas);
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  _renderPianoRoll(ctx, canvas) {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const cols = GRID_COLS;
    const rows = GRID_ROWS;
    const cellW = w / cols;
    const cellH = h / rows;

    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(15, 52, 96, 0.5)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= cols; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cellW, 0);
      ctx.lineTo(i * cellW, h);
      ctx.stroke();
    }
    for (let i = 0; i <= rows; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * cellH);
      ctx.lineTo(w, i * cellH);
      ctx.stroke();
    }

    const noteIndices = [0, 2, 4, 5, 7, 9, 11];
    for (let i = 0; i < rows; i++) {
      const noteIdx = 11 - i;
      if (!noteIndices.includes(noteIdx)) {
        ctx.fillStyle = 'rgba(15, 52, 96, 0.2)';
        ctx.fillRect(0, i * cellH, w, cellH);
      }
    }

    for (let col = 0; col < cols; col++) {
      const notes = this.pianoRollData[col] || [];
      for (const note of notes) {
        const row = 11 - (note.midi % 12);
        const x = col * cellW;
        const y = row * cellH;
        ctx.fillStyle = note.colony.color + 'cc';
        ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);
      }
    }

    const stepInfo = this.musicScheduler.getCurrentStep();
    let currentStep = 0;
    if (typeof stepInfo === 'object') {
      currentStep = stepInfo.step;
    } else {
      currentStep = stepInfo;
    }
    const scanX = currentStep * cellW;
    ctx.fillStyle = 'rgba(233, 69, 96, 0.3)';
    ctx.fillRect(scanX, 0, cellW, h);

    ctx.strokeStyle = 'rgba(233, 69, 96, 0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(scanX, 0);
    ctx.lineTo(scanX, h);
    ctx.stroke();
  }

  _updateRecordButton() {
    const recordBtn = document.getElementById('record-btn');
    const recordText = recordBtn?.querySelector('.record-text');
    
    if (recordBtn) {
      recordBtn.classList.toggle('recording', this.isRecording);
    }
    if (recordText) {
      recordText.textContent = this.isRecording ? '停止录制' : '开始录制';
    }
  }

  _updateRecordStatus(duration, steps) {
    const statusEl = document.getElementById('record-status');
    if (statusEl) {
      const mins = Math.floor(duration / 60);
      const secs = Math.floor(duration % 60);
      const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
      statusEl.textContent = `录制中... ${timeStr} (${steps}步)`;
    }
  }

  _showDownloadLink(url, duration, size) {
    const downloadSection = document.getElementById('download-section');
    const downloadLink = document.getElementById('wav-download-link');
    const statusEl = document.getElementById('record-status');

    if (downloadSection) {
      downloadSection.style.display = 'block';
    }
    if (downloadLink) {
      downloadLink.href = url;
    }
    if (statusEl) {
      const mins = Math.floor(duration / 60);
      const secs = Math.floor(duration % 60);
      const sizeKb = Math.round(size / 1024);
      statusEl.textContent = `录制完成: ${mins}:${secs.toString().padStart(2, '0')} / ${sizeKb}KB`;
    }
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
