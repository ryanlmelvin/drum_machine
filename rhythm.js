export const MIN_BPM = 40;
export const MAX_BPM = 240;
export const STYLES = Object.freeze([
  { id: 'pop', label: 'Pop' },
  { id: 'jazz', label: 'Jazz' },
  { id: 'rock', label: 'Rock' },
  { id: 'blues', label: 'Blues' },
]);
export const METERS = Object.freeze([
  Object.freeze({ id: '3/4', label: '3/4', beatsPerBar: 3 }),
  Object.freeze({ id: '4/4', label: '4/4', beatsPerBar: 4 }),
  Object.freeze({ id: '6/8', label: '6/8', beatsPerBar: 2 }),
]);

export function getMeter(meter) {
  return METERS.find(item => item.id === meter) || METERS[1];
}

export function normalizeMeter(meter) { return getMeter(meter).id; }

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

// Original arrangements. Positions follow the tapped pulse: quarter notes in
// simple meters, dotted quarters in 6/8. Each compound pulse has three eighths.
const PATTERNS = {
  '4/4': {
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
  },
  '3/4': {
    pop: [
      hit('kick', 0, 0.92), hit('kick', 2.5, 0.6),
      hit('snare', 1, 0.76), hit('rim', 2, 0.46),
      ...Array.from({ length: 6 }, (_, index) => hit('closedHat', index / 2, index % 2 ? 0.32 : 0.48)),
    ],
    jazz: [
      hit('ride', 0, 0.58), hit('ride', 1, 0.48), hit('ride', 1 + 2 / 3, 0.3), hit('ride', 2, 0.48),
      hit('kick', 0, 0.34), hit('pedalHat', 1, 0.38), hit('pedalHat', 2, 0.38),
      hit('rim', 2, 0.35), hit('snare', 2 + 2 / 3, 0.18),
    ],
    rock: [
      hit('kick', 0), hit('kick', 0.5, 0.72),
      hit('snare', 1, 0.88), hit('snare', 2, 0.88),
      ...Array.from({ length: 5 }, (_, index) => hit('closedHat', index / 2, index % 2 ? 0.42 : 0.62)),
      hit('openHat', 2.5, 0.42),
    ],
    blues: [
      ...[0, 1, 2].flatMap(beat => [hit('closedHat', beat, 0.52), hit('closedHat', beat + 2 / 3, 0.3)]),
      hit('kick', 0, 0.82), hit('kick', 2 + 2 / 3, 0.58),
      hit('rim', 1, 0.52), hit('snare', 2, 0.72), hit('snare', 2 + 2 / 3, 0.16),
    ],
  },
  '6/8': {
    pop: [
      hit('kick', 0, 0.92), hit('kick', 1 + 2 / 3, 0.56), hit('snare', 1, 0.84),
      ...Array.from({ length: 6 }, (_, index) => hit('closedHat', index / 3, index % 3 ? 0.3 : 0.52)),
    ],
    jazz: [
      ...Array.from({ length: 6 }, (_, index) => hit('ride', index / 3, index % 3 ? 0.26 : 0.54)),
      hit('kick', 0, 0.32), hit('pedalHat', 1, 0.4), hit('rim', 1, 0.36),
      hit('snare', 1 + 2 / 3, 0.2),
    ],
    rock: [
      hit('kick', 0), hit('kick', 2 / 3, 0.7), hit('kick', 1 + 2 / 3, 0.72), hit('snare', 1),
      ...Array.from({ length: 5 }, (_, index) => hit('closedHat', index / 3, index % 3 ? 0.4 : 0.64)),
      hit('openHat', 1 + 2 / 3, 0.42),
    ],
    blues: [
      ...Array.from({ length: 6 }, (_, index) => hit('closedHat', index / 3, index % 3 ? 0.28 : 0.56)),
      hit('kick', 0, 0.82), hit('kick', 2 / 3, 0.58), hit('snare', 1, 0.77),
      hit('snare', 1 + 1 / 3, 0.16), hit('snare', 1 + 2 / 3, 0.22),
    ],
  },
};

for (const arrangements of Object.values(PATTERNS)) {
  for (const pattern of Object.values(arrangements)) {
    pattern.forEach(Object.freeze);
    Object.freeze(pattern);
  }
  Object.freeze(arrangements);
}
Object.freeze(PATTERNS);

export function getPattern(style, meter = '4/4') {
  return PATTERNS[normalizeMeter(meter)][normalizeStyle(style)];
}

export function normalizeStyle(style) {
  return Object.hasOwn(PATTERNS['4/4'], style) ? style : 'pop';
}
