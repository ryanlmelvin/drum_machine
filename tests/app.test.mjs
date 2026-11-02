import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { TapTempo, clampBpm, getMeter, normalizeMeter } from '../rhythm.js';

const appSource = readFileSync(new URL('../app.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
const settingsKey = 'drum-machine-settings-v1';

// Only the DOM surface used by these interactions. In particular, blur does
// not manufacture a change event: Enter must commit the edited value itself.
class Element {
  constructor() {
    this.listeners = new Map();
    this.attributes = new Map();
    this.dataset = {};
    this.classes = new Set();
    this.classList = {
      add: name => this.classes.add(name),
      remove: name => this.classes.delete(name),
      toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name),
    };
    this.value = '';
    this.textContent = '';
  }
  set value(value) { this._value = String(value); }
  get value() { return this._value; }
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(callback);
  }
  emit(type, event = {}) {
    return (this.listeners.get(type) || []).map(callback => callback({ target: this, ...event }));
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
  select() {}
  blur() { this.emit('blur'); }
}

function openApp(storage = new Map()) {
  const selectors = ['#bpm', '#meter', '#play', '#play-label', '#play-icon path', '#tap', '#volume', '#status', '#slower', '#faster', '#about-dialog', '#about-button', '#about-close', '#install-help', '#install-close'];
  const elements = new Map(selectors.map(selector => [selector, new Element()]));
  const styles = ['pop', 'jazz', 'rock', 'blues'].map(style => {
    const button = new Element();
    button.dataset.style = style;
    return button;
  });
  const beats = Array.from({ length: 4 }, () => new Element());
  const document = new Element();
  document.body = new Element();
  document.visibilityState = 'visible';
  document.querySelector = selector => elements.get(selector) || null;
  document.querySelectorAll = selector => selector === '[data-style]' ? styles : selector === '.beats span' ? beats : [];
  let machine;
  class StubDrumMachine {
    constructor(callbacks) { this.callbacks = callbacks; this.stopCalls = 0; machine = this; }
    async setRhythm(settings) { this.rhythm = { ...settings }; }
    start(settings) {
      this.startedWith = { ...settings };
      this.callbacks.onStateChange('loading');
      return new Promise(resolve => { this.finishStart = resolve; });
    }
    stop() { this.stopCalls++; this.callbacks.onStateChange('stopped'); this.finishStart?.(); }
    getBeat() { return -1; }
    setVolume() {}
  }
  runInNewContext(appSource, {
    document,
    window: new Element(),
    navigator: {},
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    DrumMachine: StubDrumMachine,
    TapTempo,
    clampBpm,
    getMeter,
    normalizeMeter,
    initPwa() {},
    performance,
    setTimeout,
    clearTimeout,
    requestAnimationFrame() { return 1; },
    cancelAnimationFrame() {},
  }, { filename: 'app.js' });
  return { get: selector => elements.get(selector), machine, storage, beats };
}

test('entering 128 and pressing Enter then + yields 129 and restores it on reopening', () => {
  const app = openApp();
  app.get('#bpm').value = '128';
  app.get('#bpm').emit('keydown', { key: 'Enter' });
  app.get('#faster').emit('click');
  assert.equal(app.get('#bpm').value, '129');
  assert.equal(app.machine.rhythm.bpm, 129);
  assert.equal(JSON.parse(app.storage.get(settingsKey)).bpm, 129);
  assert.equal(openApp(app.storage).get('#bpm').value, '129');
});

test('leaving the tempo field commits its value even without a change event', () => {
  const app = openApp();
  app.get('#bpm').value = '86';
  app.get('#bpm').blur();
  assert.equal(app.machine.rhythm.bpm, 86);
  assert.equal(JSON.parse(app.storage.get(settingsKey)).bpm, 86);
  app.get('#slower').emit('click');
  assert.equal(app.get('#bpm').value, '85');
});

test('Start becomes Cancel during loading and a second press cancels playback', async () => {
  const app = openApp();
  const starting = app.get('#play').emit('click');
  assert.equal(app.get('#play-label').textContent, 'Cancel');
  assert.equal(app.get('#play').attributes.get('aria-label'), 'Cancel loading drums');
  assert.equal(app.machine.startedWith.volume, 0.75);
  await Promise.all(app.get('#play').emit('click'));
  await Promise.all(starting);
  assert.equal(app.machine.stopCalls, 1);
  assert.equal(app.get('#play-label').textContent, 'Start');
  assert.equal(app.get('#play').attributes.get('aria-label'), 'Start drums');
  assert.equal(app.get('#play').classes.has('playing'), false);
});

test('changing meter updates playback, pulse lights, and the saved selection', async () => {
  const app = openApp();
  assert.equal(app.get('#meter').value, '4/4');
  app.get('#meter').value = '6/8';
  app.get('#meter').emit('change');
  assert.equal(app.machine.rhythm.meter, '6/8');
  assert.equal(app.beats.filter(beat => !beat.hidden).length, 2);
  assert.match(app.get('#bpm').attributes.get('aria-label'), /dotted-quarter/);
  const reopened = openApp(app.storage);
  assert.equal(reopened.get('#meter').value, '6/8');
  const starting = reopened.get('#play').emit('click');
  assert.equal(reopened.machine.startedWith.meter, '6/8');
  await Promise.all(reopened.get('#play').emit('click'));
  await Promise.all(starting);
  reopened.get('#meter').value = '3/4';
  reopened.get('#meter').emit('change');
  assert.equal(reopened.beats.filter(beat => !beat.hidden).length, 3);
});

test('old settings and unknown meters fall back to 4/4 without losing tempo', () => {
  for (const meter of [undefined, '7/8']) {
    const app = openApp(new Map([[settingsKey, JSON.stringify({ bpm: 128, style: 'jazz', volume: 50, meter })]]));
    assert.equal(app.get('#meter').value, '4/4');
    assert.equal(app.get('#bpm').value, '128');
    assert.equal(app.beats.filter(beat => !beat.hidden).length, 4);
  }
});
