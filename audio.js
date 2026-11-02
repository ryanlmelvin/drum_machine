import { clampBpm, getPattern, normalizeStyle } from './rhythm.js';

const SAMPLE_FILES = {
  kick: 'kick.wav',
  snare: 'snare.wav',
  closedHat: 'hihat-closed.wav',
  openHat: 'hihat-open.wav',
  pedalHat: 'hihat-pedal.wav',
  ride: 'ride.wav',
  rim: 'rim.wav',
};

/** Render one seamless bar, including cymbal tails crossing its boundary. */
export function renderLoop(context, samples, bpm, style) {
  const length = Math.round(context.sampleRate * 240 / bpm);
  const output = context.createBuffer(2, length, context.sampleRate);
  const channels = [output.getChannelData(0), output.getChannelData(1)];
  const pattern = getPattern(style);
  for (const { sound, beat, velocity } of pattern) {
    const sample = samples[sound];
    const offset = Math.round(beat * 60 / bpm * context.sampleRate);
    let chokeFrame = Infinity;
    const fadeFrames = Math.max(1, Math.round(context.sampleRate * 0.006));
    if (sound === 'openHat') {
      for (const next of pattern) {
        if (next.sound !== 'closedHat' && next.sound !== 'pedalHat') continue;
        const beatsUntilClose = ((next.beat - beat + 4) % 4) || 4;
        chokeFrame = Math.min(chokeFrame, Math.round(beatsUntilClose * 60 / bpm * context.sampleRate));
      }
    }
    for (let channel = 0; channel < 2; channel++) {
      const input = sample.getChannelData(Math.min(channel, sample.numberOfChannels - 1));
      for (let frame = 0; frame < Math.min(input.length, chokeFrame + fadeFrames); frame++) {
        const envelope = frame < chokeFrame ? 1 : 1 - (frame - chokeFrame) / fadeFrames;
        channels[channel][(offset + frame) % length] += input[frame] * velocity * envelope;
      }
    }
  }
  // Preserve dynamics while leaving headroom for simultaneous drum hits.
  let peak = 0;
  for (const channel of channels) for (const value of channel) peak = Math.max(peak, Math.abs(value));
  const gain = peak > 0.9 ? 0.9 / peak : 1;
  if (gain < 1) for (const channel of channels) for (let frame = 0; frame < length; frame++) channel[frame] *= gain;
  return output;
}

export class DrumMachine {
  constructor({ onStateChange = () => {}, onError = () => {} } = {}) {
    this.onStateChange = onStateChange;
    this.onError = onError;
    this.context = null;
    this.samples = null;
    this.loading = null;
    this.isPlaying = false;
    this.bpm = 100;
    this.style = 'pop';
    this.volume = 0.75;
    this.generation = 0;
    this.voices = new Set();
    this.activeVoice = null;
    this.anchorTime = 0;
    this.anchorBeat = 0;
    this.beatRate = this.bpm / 60;
  }

  ensureContext() {
    if (this.context && this.context.state !== 'closed') return;
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Context) throw new Error('This browser cannot play the drum kit. Try Safari, Chrome, or Firefox.');
    this.context = new Context({ latencyHint: 'interactive' });
    this.master = this.context.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.context.destination);
    this.context.addEventListener('statechange', () => {
      if (this.isPlaying && this.context.state !== 'running') {
        this.stop();
        this.onError(new Error('Audio paused. Tap Start to resume.'));
      }
    });
  }

  async loadSamples() {
    if (this.samples) return this.samples;
    if (!this.loading) {
      this.loading = Promise.all(Object.entries(SAMPLE_FILES).map(async ([sound, file]) => {
        const response = await fetch(new URL(`./assets/audio/${file}`, import.meta.url));
        if (!response.ok) throw new Error(`Could not load ${file}.`);
        return [sound, await this.context.decodeAudioData(await response.arrayBuffer())];
      })).then(entries => {
        this.samples = Object.fromEntries(entries);
        return this.samples;
      }).catch(error => {
        throw new Error('The drum kit could not load. Check your connection and tap Start again.', { cause: error });
      }).finally(() => { this.loading = null; });
    }
    return this.loading;
  }

  async start({ bpm = this.bpm, style = this.style, volume = this.volume } = {}) {
    if (this.isPlaying) {
      this.setVolume(volume);
      return this.setRhythm({ bpm, style });
    }
    const generation = ++this.generation;
    this.bpm = clampBpm(bpm);
    this.style = normalizeStyle(style);
    this.setVolume(volume);
    this.onStateChange('loading');
    try {
      this.ensureContext();
      // Resume inside the initial tap gesture, before waiting for downloads.
      const resume = this.context.resume();
      await Promise.all([resume, this.loadSamples()]);
      if (generation !== this.generation) return;
      if (this.context.state !== 'running') throw new Error('Audio is paused. Tap Start to try again.');
      const buffer = renderLoop(this.context, this.samples, this.bpm, this.style);
      this.anchorBeat = 0;
      this.anchorTime = this.context.currentTime + 0.025;
      this.beatRate = 4 / buffer.duration;
      this.activeVoice = this.playBuffer(buffer, this.anchorTime, 0);
      this.isPlaying = true;
      this.onStateChange('playing');
    } catch (error) {
      if (generation !== this.generation) return;
      this.stop();
      this.onError(error);
      throw error;
    }
  }

  playBuffer(buffer, when, offset, fadeIn = false) {
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain);
    gain.connect(this.master);
    gain.gain.setValueAtTime(fadeIn ? 0 : 1, when);
    if (fadeIn) gain.gain.linearRampToValueAtTime(1, when + 0.015);
    const voice = { source, gain, fadeInStart: fadeIn ? when : -Infinity };
    this.voices.add(voice);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      this.voices.delete(voice);
    };
    source.start(when, offset);
    return voice;
  }

  async setRhythm({ bpm = this.bpm, style = this.style } = {}) {
    const nextBpm = clampBpm(bpm, this.bpm);
    const nextStyle = normalizeStyle(style);
    if (!this.isPlaying) {
      this.bpm = nextBpm;
      this.style = nextStyle;
      return;
    }
    if (nextBpm === this.bpm && nextStyle === this.style) return;
    const buffer = renderLoop(this.context, this.samples, nextBpm, nextStyle);
    const when = this.context.currentTime + 0.025;
    const beat = this.anchorBeat + (when - this.anchorTime) * this.beatRate;
    const phase = ((beat % 4) + 4) % 4;
    const previous = this.activeVoice;
    this.activeVoice = this.playBuffer(buffer, when, phase / 4 * buffer.duration, true);
    const previousLevel = Math.max(0, Math.min(1, (when - previous.fadeInStart) / 0.015));
    if (previous.gain.gain.cancelAndHoldAtTime) previous.gain.gain.cancelAndHoldAtTime(when);
    else {
      previous.gain.gain.cancelScheduledValues(when);
      previous.gain.gain.setValueAtTime(previousLevel, when);
    }
    previous.gain.gain.linearRampToValueAtTime(0, when + 0.015);
    previous.source.stop(when + 0.02);
    this.bpm = nextBpm;
    this.style = nextStyle;
    this.anchorBeat = beat;
    this.anchorTime = when;
    this.beatRate = 4 / buffer.duration;
  }

  setVolume(value) {
    const number = Number(value);
    this.volume = Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : this.volume;
    if (this.master) this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.015);
  }

  getBeat() {
    if (!this.isPlaying || this.context.currentTime < this.anchorTime && this.anchorBeat === 0) return -1;
    const beat = this.anchorBeat + (this.context.currentTime - this.anchorTime) * this.beatRate;
    return ((Math.floor(beat) % 4) + 4) % 4;
  }

  stop() {
    ++this.generation;
    this.isPlaying = false;
    for (const { source } of this.voices) {
      try { source.stop(); } catch { /* The source may have already finished. */ }
    }
    this.voices.clear();
    this.activeVoice = null;
    this.onStateChange('stopped');
  }
}
