import { audioEngine, midiToFreq } from './AudioEngine.js';
import { GRID_COLS } from './NoteMapper.js';
import { eventBus } from '../core/EventBus.js';

export class WavRecorder {
  constructor(musicScheduler, noteMapper) {
    this.musicScheduler = musicScheduler;
    this.noteMapper = noteMapper;
    this.isRecording = false;
    this.recordedSteps = [];
    this.startTime = 0;
    this.recordDuration = 0;
    this.maxRecordSteps = 1000;
  }

  startRecording() {
    if (this.isRecording) return;
    
    this.isRecording = true;
    this.recordedSteps = [];
    this.startTime = Date.now();
    this.recordDuration = 0;
    
    eventBus.on('music:step', this._onStep);
    
    eventBus.emit('music:recordingStarted');
  }

  stopRecording() {
    if (!this.isRecording) return;
    
    this.isRecording = false;
    eventBus.off('music:step', this._onStep);
    
    eventBus.emit('music:recordingStopped', {
      duration: this.recordDuration,
      steps: this.recordedSteps.length
    });
    
    return this.exportWav();
  }

  toggleRecording() {
    if (this.isRecording) {
      return this.stopRecording();
    } else {
      this.startRecording();
      return null;
    }
  }

  _onStep = (data) => {
    if (!this.isRecording) return;
    
    this.recordedSteps.push({
      step: data.step,
      notes: data.notes.map(n => ({
        midi: n.midi,
        waveform: n.waveform,
        colonyId: n.colonyId
      }))
    });
    
    this.recordDuration = (Date.now() - this.startTime) / 1000;
    
    if (this.recordedSteps.length >= this.maxRecordSteps) {
      this.stopRecording();
    }
    
    eventBus.emit('music:recordingProgress', {
      duration: this.recordDuration,
      steps: this.recordedSteps.length
    });
  }

  async exportWav() {
    if (this.recordedSteps.length === 0) return null;
    
    const bpm = this.musicScheduler.bpm;
    const secondsPerStep = 60.0 / bpm / 4;
    const totalDuration = this.recordedSteps.length * secondsPerStep + 1;
    
    const offlineCtx = audioEngine.createOfflineContext(totalDuration);
    
    const masterGain = offlineCtx.createGain();
    masterGain.gain.value = audioEngine.muted ? 0 : audioEngine.volume;
    masterGain.connect(offlineCtx.destination);
    
    const adsr = audioEngine.adsr;
    
    for (let i = 0; i < this.recordedSteps.length; i++) {
      const stepData = this.recordedSteps[i];
      const stepTime = i * secondsPerStep;
      const noteDuration = secondsPerStep * 0.9;
      
      for (const note of stepData.notes) {
        const freq = midiToFreq(note.midi);
        
        const osc = offlineCtx.createOscillator();
        const gainNode = offlineCtx.createGain();
        
        osc.type = note.waveform;
        osc.frequency.value = freq;
        
        const attack = adsr.attack;
        const decay = adsr.decay;
        const sustain = adsr.sustain;
        const release = adsr.release;
        
        const peakGain = 0.3 * 0.5;
        const sustainGain = peakGain * sustain;
        
        const startTime = stepTime;
        const endTime = stepTime + noteDuration;
        
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(peakGain, startTime + attack);
        gainNode.gain.linearRampToValueAtTime(sustainGain, startTime + attack + decay);
        gainNode.gain.setValueAtTime(sustainGain, endTime - release);
        gainNode.gain.linearRampToValueAtTime(0, endTime);
        
        osc.connect(gainNode);
        gainNode.connect(masterGain);
        
        osc.start(startTime);
        osc.stop(endTime);
      }
    }
    
    try {
      const renderedBuffer = await offlineCtx.startRendering();
      const wavBlob = audioEngine.audioBufferToWav(renderedBuffer);
      
      const url = URL.createObjectURL(wavBlob);
      
      eventBus.emit('music:wavReady', {
        url,
        duration: totalDuration,
        size: wavBlob.size
      });
      
      return { url, blob: wavBlob, duration: totalDuration };
    } catch (e) {
      console.error('WAV导出失败:', e);
      return null;
    }
  }

  getRecordDuration() {
    return this.recordDuration;
  }

  getRecordedSteps() {
    return this.recordedSteps.length;
  }
}
