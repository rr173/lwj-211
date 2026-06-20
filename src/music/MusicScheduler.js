import { audioEngine, midiToNoteName } from './AudioEngine.js';
import { GRID_COLS, GRID_ROWS } from './NoteMapper.js';
import { eventBus } from '../core/EventBus.js';

export class MusicScheduler {
  constructor(noteMapper) {
    this.noteMapper = noteMapper;
    this.isPlaying = false;
    this.bpm = 120;
    this.currentStep = 0;
    this.nextNoteTime = 0;
    this.scheduleAheadTime = 0.1;
    this.lookahead = 25;
    this.timerId = null;
    this.currentNotes = [];
    this.pulseCells = new Map();
  }

  setBPM(bpm) {
    this.bpm = Math.max(60, Math.min(240, bpm));
    eventBus.emit('music:bpmChanged', this.bpm);
  }

  getSecondsPerStep() {
    return 60.0 / this.bpm / 4;
  }

  start() {
    if (this.isPlaying) return;
    
    audioEngine.init();
    audioEngine.resume();
    
    this.isPlaying = true;
    this.nextNoteTime = audioEngine.getCurrentTime() + 0.05;
    this.currentStep = 0;
    
    this._scheduler();
    
    eventBus.emit('music:playingChanged', true);
  }

  stop() {
    this.isPlaying = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    audioEngine.stopAll();
    this.currentNotes = [];
    eventBus.emit('music:playingChanged', false);
  }

  toggle() {
    if (this.isPlaying) {
      this.stop();
    } else {
      this.start();
    }
    return this.isPlaying;
  }

  _scheduler() {
    if (!this.isPlaying) return;

    const currentTime = audioEngine.getCurrentTime();
    while (this.nextNoteTime < currentTime + this.scheduleAheadTime) {
      this._scheduleNote(this.currentStep, this.nextNoteTime);
      this._nextNote();
    }

    this.timerId = setTimeout(() => this._scheduler(), this.lookahead);
  }

  _nextNote() {
    const secondsPerStep = this.getSecondsPerStep();
    this.nextNoteTime += secondsPerStep;
    this.currentStep = (this.currentStep + 1) % GRID_COLS;
  }

  _scheduleNote(step, time) {
    const scanResult = this.noteMapper.scanColumn(step);
    const notes = scanResult.notes;
    const duration = this.getSecondsPerStep() * 0.9;

    this.currentNotes = notes.map(n => ({
      ...n,
      noteName: midiToNoteName(n.midi)
    }));

    this.pulseCells.clear();
    if (scanResult.rowToCellsByColony) {
      for (const [row, colonyMap] of Object.entries(scanResult.rowToCellsByColony)) {
        for (const [colonyId, cells] of colonyMap) {
          for (const cell of cells) {
            const key = `${colonyId}|${cell.x}|${cell.y}`;
            this.pulseCells.set(key, {
              startTime: time,
              duration
            });
          }
        }
      }
    }

    for (const note of notes) {
      audioEngine.playNote(
        note.midi,
        time,
        duration,
        note.waveform,
        0.5
      );
    }

    eventBus.emit('music:step', {
      step,
      notes: this.currentNotes,
      time
    });
  }

  getCurrentStep() {
    if (!this.isPlaying) return this.currentStep;
    
    const currentTime = audioEngine.getCurrentTime();
    const secondsPerStep = this.getSecondsPerStep();
    const timeSinceLastNote = currentTime - (this.nextNoteTime - secondsPerStep);
    const progress = timeSinceLastNote / secondsPerStep;
    
    const visualStep = (this.currentStep - 1 + GRID_COLS) % GRID_COLS;
    
    return {
      step: visualStep,
      progress: Math.max(0, Math.min(1, progress))
    };
  }

  hasActivePulse(cellX, cellY, colonyId) {
    const currentTime = audioEngine.getCurrentTime();
    const key = `${colonyId}|${cellX}|${cellY}`;
    const pulseData = this.pulseCells.get(key);
    
    if (!pulseData) return { active: false, progress: 0 };
    
    const elapsed = currentTime - pulseData.startTime;
    if (elapsed >= 0 && elapsed < pulseData.duration) {
      const progress = elapsed / pulseData.duration;
      return { active: true, progress };
    }
    
    return { active: false, progress: 0 };
  }

  getPulseScale(cellX, cellY, colonyId) {
    const result = this.hasActivePulse(cellX, cellY, colonyId);
    if (!result.active) return 1;
    
    const progress = result.progress;
    const pulseDuration = 0.3;
    const normalizedProgress = Math.min(1, progress / pulseDuration);
    
    if (normalizedProgress < 0.5) {
      return 1 + normalizedProgress * 0.6;
    } else {
      return 1.3 - (normalizedProgress - 0.5) * 0.6;
    }
  }
}
