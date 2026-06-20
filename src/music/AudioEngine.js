export const WAVEFORMS = {
  SINE: 'sine',
  SQUARE: 'square',
  SAWTOOTH: 'sawtooth',
  TRIANGLE: 'triangle'
};

export const WAVEFORM_LABELS = {
  sine: '正弦波',
  square: '方波',
  sawtooth: '锯齿波',
  triangle: '三角波'
};

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function noteNameToMidi(noteName, octave) {
  const noteIndex = NOTE_NAMES.indexOf(noteName);
  if (noteIndex === -1) return 60;
  return (octave + 1) * 12 + noteIndex;
}

export function rowToMidi(row, octaveOffset = 0) {
  const baseOctave = 4 + octaveOffset;
  const noteIndex = 11 - row;
  return (baseOctave + 1) * 12 + noteIndex;
}

export function midiToNoteName(midi) {
  const octave = Math.floor(midi / 12) - 1;
  const noteIndex = midi % 12;
  return `${NOTE_NAMES[noteIndex]}${octave}`;
}

export class AudioEngine {
  constructor() {
    this.audioContext = null;
    this.masterGain = null;
    this.initialized = false;
    this.activeOscillators = new Map();
    this.maxPolyphony = 6;
    this.volume = 0.7;
    this.muted = false;

    this.adsr = {
      attack: 0.05,
      decay: 0.1,
      sustain: 0.7,
      release: 0.3
    };
  }

  init() {
    if (this.initialized) return;
    
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = this.muted ? 0 : this.volume;
    this.masterGain.connect(this.audioContext.destination);
    this.initialized = true;
  }

  resume() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.masterGain && !this.muted) {
      this.masterGain.gain.value = this.volume;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.masterGain) {
      this.masterGain.gain.value = muted ? 0 : this.volume;
    }
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setADSR(adsr) {
    Object.assign(this.adsr, adsr);
  }

  setMaxPolyphony(max) {
    this.maxPolyphony = Math.max(1, Math.min(12, max));
  }

  getCurrentTime() {
    if (!this.audioContext) return 0;
    return this.audioContext.currentTime;
  }

  playNote(midi, startTime, duration, waveform = 'sine', velocity = 0.5) {
    if (!this.audioContext) return null;

    const freq = midiToFreq(midi);
    const osc = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    osc.type = waveform;
    osc.frequency.value = freq;

    const attack = this.adsr.attack;
    const decay = this.adsr.decay;
    const sustain = this.adsr.sustain;
    const release = this.adsr.release;

    const peakGain = velocity * 0.3;
    const sustainGain = peakGain * sustain;

    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(peakGain, startTime + attack);
    gainNode.gain.linearRampToValueAtTime(sustainGain, startTime + attack + decay);
    gainNode.gain.setValueAtTime(sustainGain, startTime + duration - release);
    gainNode.gain.linearRampToValueAtTime(0, startTime + duration);

    osc.connect(gainNode);
    gainNode.connect(this.masterGain);

    osc.start(startTime);
    osc.stop(startTime + duration);

    const noteId = `${midi}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    this.activeOscillators.set(noteId, { osc, gainNode, midi, startTime, endTime: startTime + duration });

    osc.onended = () => {
      this.activeOscillators.delete(noteId);
      gainNode.disconnect();
      osc.disconnect();
    };

    return noteId;
  }

  stopNote(noteId) {
    const note = this.activeOscillators.get(noteId);
    if (note) {
      try {
        note.osc.stop();
      } catch (e) {}
      this.activeOscillators.delete(noteId);
    }
  }

  stopAll() {
    for (const [noteId, note] of this.activeOscillators) {
      try {
        note.osc.stop();
      } catch (e) {}
    }
    this.activeOscillators.clear();
  }

  getActiveNoteCount() {
    return this.activeOscillators.size;
  }

  createOfflineContext(duration, sampleRate = 44100) {
    return new OfflineAudioContext(2, duration * sampleRate, sampleRate);
  }

  renderToOfflineContext(offlineCtx, renderFn) {
    return new Promise((resolve) => {
      const originalCtx = this.audioContext;
      const originalMaster = this.masterGain;

      const offlineMaster = offlineCtx.createGain();
      offlineMaster.gain.value = this.muted ? 0 : this.volume;
      offlineMaster.connect(offlineCtx.destination);

      this.audioContext = offlineCtx;
      this.masterGain = offlineMaster;

      renderFn(offlineCtx);

      offlineCtx.startRendering().then((renderedBuffer) => {
        this.audioContext = originalCtx;
        this.masterGain = originalMaster;
        resolve(renderedBuffer);
      });
    });
  }

  audioBufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1;
    const bitDepth = 16;

    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;

    const dataLength = buffer.length * blockAlign;
    const bufferLength = 44 + dataLength;

    const arrayBuffer = new ArrayBuffer(bufferLength);
    const view = new DataView(arrayBuffer);

    this._writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    this._writeString(view, 8, 'WAVE');
    this._writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    this._writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    const channels = [];
    for (let i = 0; i < numChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }

    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = Math.max(-1, Math.min(1, channels[ch][i]));
        const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset, intSample, true);
        offset += 2;
      }
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  _writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }
}

export const audioEngine = new AudioEngine();
