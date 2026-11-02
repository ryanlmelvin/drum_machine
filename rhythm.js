export const MIN_BPM = 40;
export const MAX_BPM = 240;
export const STYLES = Object.freeze([
  { id: 'pop', label: 'Pop' },
  { id: 'jazz', label: 'Jazz' },
  { id: 'rock', label: 'Rock' },
  { id: 'blues', label: 'Blues' },
]);

export function clampBpm(value, fallback = 100) {
  if (value === '' || value === null || value === undefined) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(number))) : fallback;
}

export class TapTempo {
  constructor({ count = 8, resetAfter = 2500 } = {}) {
    this.count = Math.max(2, Math.floor(count));
    this.resetAfter = resetAfter;
    this.taps = [];
  }

  tap(timestamp = performance.now()) {
    const last = this.taps.at(-1);
    if (last !== undefined && (timestamp <= last || timestamp - last > this.resetAfter)) this.reset();
    // Ignore accidental double taps; 240 BPM is the fastest supported pulse.
    if (this.taps.length && timestamp - this.taps.at(-1) < 150) return null;
    this.taps.push(timestamp);
    if (this.taps.length > this.count) this.taps.shift();
    if (this.taps.length < 2) return null;
    return clampBpm(60000 * (this.taps.length - 1) / (timestamp - this.taps[0]));
  }

  reset() { this.taps = []; }
}

const hit = (sound, beat, velocity = 1) => ({ sound, beat, velocity });

// Original four-beat arrangements. Positions are in quarter notes; 2/3 gives
// swung eighth notes without changing the quarter-note tempo.
const PATTERNS = {
  pop: [
    ...[0, 2, 2.5].map(beat => hit('kick', beat, 0.92)),
    ...[1, 3].map(beat => hit('snare', beat, 0.85)),
    ...Array.from({ length: 8 }, (_, index) => hit('closedHat', index / 2, index % 2 ? 0.36 : 0.5)),
  ],
  jazz: [
    ...[0, 1, 2, 3].map(beat => hit('ride', beat, beat % 2 ? 0.62 : 0.5)),
    ...[1 + 2 / 3, 3 + 2 / 3].map(beat => hit('ride', beat, 0.32)),
    ...[1, 3].map(beat => hit('pedalHat', beat, 0.42)),
    ...[0, 2].map(beat => hit('kick', beat, 0.34)),
    hit('snare', 1 + 2 / 3, 0.22), hit('rim', 3, 0.4),
  ],
  rock: [
    ...[0, 0.5, 2, 2.75].map(beat => hit('kick', beat)),
    ...[1, 3].map(beat => hit('snare', beat)),
    ...Array.from({ length: 7 }, (_, index) => hit('closedHat', index / 2, index % 2 ? 0.45 : 0.64)),
    hit('openHat', 3.5, 0.46),
  ],
  blues: [
    ...[0, 1, 2, 3].flatMap(beat => [hit('closedHat', beat, 0.56), hit('closedHat', beat + 2 / 3, 0.32)]),
    ...[0, 2, 2 + 2 / 3].map(beat => hit('kick', beat, 0.82)),
    ...[1, 3].map(beat => hit('snare', beat, 0.77)),
    hit('snare', 3 + 2 / 3, 0.19),
  ],
};

for (const pattern of Object.values(PATTERNS)) {
  pattern.forEach(Object.freeze);
  Object.freeze(pattern);
}
Object.freeze(PATTERNS);

export function getPattern(style) {
  return PATTERNS[style] || PATTERNS.pop;
}

export function normalizeStyle(style) {
  return Object.hasOwn(PATTERNS, style) ? style : 'pop';
}
