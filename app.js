import { DrumMachine } from './audio.js';
import { TapTempo, clampBpm } from './rhythm.js';
import { initPwa } from './pwa.js';

const $ = (selector) => document.querySelector(selector);
const bpmInput = $('#bpm');
const play = $('#play');
const playLabel = $('#play-label');
const playIcon = $('#play-icon path');
const tap = $('#tap');
const volume = $('#volume');
const status = $('#status');
const beats = [...document.querySelectorAll('.beats span')];
const styleButtons = [...document.querySelectorAll('[data-style]')];
const storageKey = 'drum-machine-settings-v1';
let settings = { bpm: 100, style: 'pop', volume: 75 };
try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  if (saved) {
    settings.bpm = clampBpm(saved.bpm);
    if (styleButtons.some(button => button.dataset.style === saved.style)) settings.style = saved.style;
    if (Number.isFinite(saved.volume)) settings.volume = Math.max(0, Math.min(100, saved.volume));
  }
} catch { /* Storage can be unavailable in private browsing. */ }
let playbackState = 'stopped';
let wakeLock = null;
let wakeRequest = null;
let tapFlash;
let animationFrame;
let lastBeat = -1;
const tapTempo = new TapTempo();

function saveSettings() {
  try { localStorage.setItem(storageKey, JSON.stringify(settings)); } catch { /* Playback does not depend on storage. */ }
}
function showStatus(message) {
  status.textContent = message || '';
  status.hidden = !message;
}
async function releaseWakeLock() {
  const lock = wakeLock;
  wakeLock = null;
  if (lock) await lock.release().catch(() => {});
}
async function keepAwake() {
  if (!('wakeLock' in navigator) || wakeLock || wakeRequest || document.visibilityState !== 'visible' || playbackState !== 'playing') return;
  wakeRequest = navigator.wakeLock.request('screen');
  try {
    const lock = await wakeRequest;
    if (playbackState !== 'playing' || document.visibilityState !== 'visible') {
      await lock.release();
      return;
    }
    wakeLock = lock;
    lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; });
  } catch { /* Screen wake lock is an enhancement; audio remains usable. */ }
  finally { wakeRequest = null; }
}
function updateBeat() {
  const beat = machine.getBeat();
  if (lastBeat !== beat) {
    beats.forEach((element, index) => element.classList.toggle('active', index === beat));
    lastBeat = beat;
  }
  if (playbackState === 'playing') animationFrame = requestAnimationFrame(updateBeat);
}
function onStateChange(state) {
  playbackState = state;
  const active = state !== 'stopped';
  play.classList.toggle('playing', active);
  playLabel.textContent = state === 'loading' ? 'Cancel' : active ? 'Stop' : 'Start';
  play.setAttribute('aria-label', state === 'loading' ? 'Cancel loading drums' : active ? 'Stop drums' : 'Start drums');
  playIcon.setAttribute('d', active ? 'M8 8h16v16H8Z' : 'M10 5 27 16 10 27Z');
  cancelAnimationFrame(animationFrame);
  if (state === 'playing') {
    showStatus('');
    void keepAwake();
    updateBeat();
  } else {
    void releaseWakeLock();
    beats.forEach(element => element.classList.remove('active'));
    lastBeat = -1;
  }
}
const machine = new DrumMachine({ onStateChange, onError: error => showStatus(error?.message || 'Could not play the drums. Tap Start to try again.') });

function refreshTempo() {
  bpmInput.value = settings.bpm;
  $('#slower').disabled = settings.bpm <= 40;
  $('#faster').disabled = settings.bpm >= 240;
}
function setTempo(value, resetTaps = true) {
  settings.bpm = clampBpm(value, settings.bpm);
  if (resetTaps) tapTempo.reset();
  refreshTempo();
  saveSettings();
  void machine.setRhythm(settings).catch(error => showStatus(error.message));
}
function selectStyle(style) {
  settings.style = style;
  styleButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.style === style)));
  saveSettings();
  void machine.setRhythm(settings).catch(error => showStatus(error.message));
}
function tapBeat() {
  const bpm = tapTempo.tap(performance.now());
  if (bpm !== null) setTempo(bpm, false);
  clearTimeout(tapFlash);
  tap.classList.add('tapped');
  tapFlash = setTimeout(() => tap.classList.remove('tapped'), 110);
}
async function togglePlayback() {
  if (playbackState !== 'stopped') {
    machine.stop();
    return;
  }
  setTempo(bpmInput.value);
  showStatus('');
  try { await machine.start({ ...settings, volume: settings.volume / 100 }); }
  catch (error) { showStatus(error.message || 'Could not load the drums. Connect to the internet and tap Start to retry.'); }
}

bpmInput.addEventListener('change', () => setTempo(bpmInput.value));
bpmInput.addEventListener('blur', () => {
  if (bpmInput.value !== String(settings.bpm)) setTempo(bpmInput.value);
});
bpmInput.addEventListener('focus', () => bpmInput.select());
bpmInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') { setTempo(bpmInput.value); bpmInput.blur(); }
});
$('#slower').addEventListener('click', () => setTempo(settings.bpm - 1));
$('#faster').addEventListener('click', () => setTempo(settings.bpm + 1));
styleButtons.forEach(button => button.addEventListener('click', () => selectStyle(button.dataset.style)));
play.addEventListener('click', togglePlayback);
// Pointerdown measures the moment of contact, instead of waiting for finger release.
tap.addEventListener('pointerdown', event => { if (event.isPrimary && event.button === 0) tapBeat(); });
tap.addEventListener('click', event => { if (event.detail === 0) tapBeat(); });
volume.addEventListener('input', () => {
  settings.volume = Number(volume.value);
  machine.setVolume(settings.volume / 100);
  saveSettings();
});
document.addEventListener('keydown', event => {
  if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || document.querySelector('dialog[open]') || event.target.closest('input,textarea,select,[contenteditable=true]')) return;
  if (event.code === 'Space' && event.target === document.body) { event.preventDefault(); void togglePlayback(); }
  if (event.key.toLowerCase() === 't') { event.preventDefault(); tapBeat(); }
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void keepAwake();
});
window.addEventListener('pagehide', () => { machine.stop(); void releaseWakeLock(); });

function bindDialog(dialog, openButton, closeButton) {
  openButton?.addEventListener('click', () => dialog.showModal());
  closeButton?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
}
bindDialog($('#about-dialog'), $('#about-button'), $('#about-close'));
bindDialog($('#install-help'), null, $('#install-close'));
refreshTempo();
volume.value = settings.volume;
styleButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.style === settings.style)));
initPwa({ beforeReload: () => { machine.stop(); void releaseWakeLock(); }, onStatus: showStatus });
