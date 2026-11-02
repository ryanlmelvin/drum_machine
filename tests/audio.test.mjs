import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DrumMachine, renderLoop } from '../audio.js';

function buffer(channels, length, sampleRate) {
  const data = Array.from({ length: channels }, () => new Float32Array(length));
  return { length, numberOfChannels: channels, sampleRate, duration: length / sampleRate, getChannelData: channel => data[channel] };
}

class FakeContext {
  constructor() {
    this.sampleRate = 120;
    this.currentTime = 0;
    this.state = 'running';
    this.destination = {};
    this.sources = [];
  }
  createBuffer(...args) { return buffer(...args); }
  createGain() {
    return { connect() {}, disconnect() {}, gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} } };
  }
  createBufferSource() {
    const source = {
      connect() {}, disconnect() {},
      start(time, offset) { this.started = { time, offset }; },
      stop(time) { this.stopped = time ?? 0; },
    };
    this.sources.push(source);
    return source;
  }
  addEventListener() {}
  async resume() {}
  async decodeAudioData() {
    const sample = buffer(1, 24, this.sampleRate);
    sample.getChannelData(0)[0] = 0.5;
    return sample;
  }
}

function kit(context, length = 1, level = 0) {
  return Object.fromEntries(['kick', 'snare', 'closedHat', 'openHat', 'pedalHat', 'ride', 'rim'].map(sound => {
    const sample = buffer(1, length, context.sampleRate);
    sample.getChannelData(0).fill(level);
    return [sound, sample];
  }));
}

test('rendered loops use the requested tempo, retain stereo, and never clip', () => {
  const context = new FakeContext();
  const samples = kit(context, 30, 1);
  for (const bpm of [40, 100, 240]) {
    const loop = renderLoop(context, samples, bpm, 'rock');
    assert.equal(loop.length, Math.round(context.sampleRate * 240 / bpm));
    assert.equal(loop.numberOfChannels, 2);
    for (const value of loop.getChannelData(0)) assert.ok(Math.abs(value) <= 0.900001);
  }
});

test('a cymbal tail at the end of a bar wraps into its beginning', () => {
  const context = new FakeContext();
  const samples = kit(context);
  samples.ride = buffer(1, 80, context.sampleRate);
  samples.ride.getChannelData(0)[60] = 0.5;
  const loop = renderLoop(context, samples, 120, 'jazz');
  // Last ride begins at frame 220; its tail at frame 280 wraps to 40.
  assert.ok(loop.getChannelData(0)[40] > 0);
});

test('a closed hi-hat chokes the open hi-hat across the bar boundary', () => {
  const context = new FakeContext();
  const samples = kit(context);
  samples.openHat = buffer(1, 80, context.sampleRate);
  samples.openHat.getChannelData(0).fill(0.5);
  const loop = renderLoop(context, samples, 120, 'rock');
  assert.ok(loop.getChannelData(0)[210] > 0);
  assert.ok(loop.getChannelData(0)[239] > 0);
  assert.equal(loop.getChannelData(0)[1], 0);
  assert.equal(loop.getChannelData(0)[40], 0);
});

async function withAudio(run, fetchImplementation = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) })) {
  const originalContext = globalThis.AudioContext;
  const originalFetch = globalThis.fetch;
  globalThis.AudioContext = FakeContext;
  globalThis.fetch = fetchImplementation;
  try { await run(); } finally {
    globalThis.AudioContext = originalContext;
    globalThis.fetch = originalFetch;
  }
}

test('tempo changes preserve beat phase and replace the native looping source', async () => {
  await withAudio(async () => {
    const machine = new DrumMachine();
    await machine.start({ bpm: 120, style: 'pop' });
    assert.equal(machine.isPlaying, true);
    assert.equal(machine.activeVoice.source.loop, true);
    machine.context.currentTime = 0.625; // 1.2 beats after the scheduled start.
    assert.equal(machine.getBeat(), 1);
    const previous = machine.activeVoice.source;
    await machine.setRhythm({ bpm: 60, style: 'blues' });
    assert.ok(Math.abs(machine.anchorBeat - 1.25) < 1e-10);
    assert.ok(Math.abs(machine.activeVoice.source.started.offset - 1.25) < 1e-10);
    assert.ok(previous.stopped > machine.context.currentTime);
    assert.equal(machine.getBeat(), 1);
    machine.stop();
    assert.equal(machine.isPlaying, false);
    assert.equal(machine.getBeat(), -1);
    assert.equal(machine.voices.size, 0);
  });
});

test('stopping while samples load never starts delayed playback', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await withAudio(async () => {
    const states = [];
    const machine = new DrumMachine({ onStateChange: state => states.push(state) });
    const starting = machine.start();
    machine.stop();
    release();
    await starting;
    assert.equal(machine.isPlaying, false);
    assert.equal(machine.context.sources.length, 0);
    assert.deepEqual(states, ['loading', 'stopped']);
  }, async () => {
    await gate;
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) };
  });
});

test('a failed kit download is actionable and can be retried', async () => {
  let fail = true;
  await withAudio(async () => {
    const errors = [];
    const machine = new DrumMachine({ onError: error => errors.push(error.message) });
    await assert.rejects(machine.start(), /Check your connection/);
    assert.equal(machine.isPlaying, false);
    assert.equal(errors.length, 1);
    fail = false;
    await machine.start();
    assert.equal(machine.isPlaying, true);
    machine.stop();
  }, async () => ({ ok: !fail, arrayBuffer: async () => new ArrayBuffer(1) }));
});

test('rapid changes stay in range near the last frame and cancel every voice on stop', async () => {
  await withAudio(async () => {
    const machine = new DrumMachine();
    await machine.start({ bpm: 137 });
    machine.context.currentTime = machine.anchorTime + machine.activeVoice.source.buffer.duration - 0.025000001;
    for (const bpm of [239, 41, 177, 240]) {
      await machine.setRhythm({ bpm });
      const { buffer: loop, started } = machine.activeVoice.source;
      assert.ok(started.offset >= 0 && started.offset < loop.duration);
      assert.ok(machine.getBeat() >= 0 && machine.getBeat() < 4);
    }
    machine.stop();
    assert.ok(machine.context.sources.every(source => source.stopped === 0));
  });
});

function readWav(filename) {
  const bytes = readFileSync(new URL(`../assets/audio/${filename}.wav`, import.meta.url));
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.readUInt16LE(20), 1); // PCM
  assert.equal(bytes.readUInt16LE(22), 1); // mono
  assert.equal(bytes.readUInt16LE(34), 16);
  let start = 12;
  while (bytes.toString('ascii', start, start + 4) !== 'data') start += 8 + bytes.readUInt32LE(start + 4);
  const size = bytes.readUInt32LE(start + 4);
  const result = buffer(1, size / 2, bytes.readUInt32LE(24));
  for (let index = 0; index < result.length; index++) result.getChannelData(0)[index] = bytes.readInt16LE(start + 8 + index * 2) / 32768;
  return result;
}

test('the bundled acoustic kit renders audible, finite, unclipped loops for all styles and tempo extremes', () => {
  const context = new FakeContext();
  context.sampleRate = 44100;
  const samples = Object.fromEntries(Object.entries({
    kick: 'kick', snare: 'snare', closedHat: 'hihat-closed', openHat: 'hihat-open',
    pedalHat: 'hihat-pedal', ride: 'ride', rim: 'rim',
  }).map(([sound, filename]) => [sound, readWav(filename)]));
  for (const style of ['pop', 'jazz', 'rock', 'blues']) {
    for (const bpm of [40, 100, 137, 240]) {
      const loop = renderLoop(context, samples, bpm, style);
      let energy = 0;
      for (const value of loop.getChannelData(0)) {
        assert.ok(Number.isFinite(value), `${style} ${bpm}: non-finite sample`);
        assert.ok(Math.abs(value) <= 0.900001, `${style} ${bpm}: clipping`);
        energy += value * value;
      }
      assert.ok(Math.sqrt(energy / loop.length) > 0.01, `${style} ${bpm}: silent output`);
      // Sample tails remain continuous at the wrap; new downbeat attacks are intentional.
      const data = loop.getChannelData(0);
      assert.ok(Math.abs(data[0] - data.at(-1)) < 0.25, `${style} ${bpm}: seam discontinuity`);
    }
  }
});
