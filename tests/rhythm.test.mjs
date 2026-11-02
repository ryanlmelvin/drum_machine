import test from 'node:test';
import assert from 'node:assert/strict';
import { STYLES, clampBpm, TapTempo, getPattern } from '../rhythm.js';

test('tempo input rounds, clamps, and preserves a valid fallback', () => {
  assert.equal(clampBpm('119.6'), 120);
  assert.equal(clampBpm(12), 40);
  assert.equal(clampBpm(999), 240);
  assert.equal(clampBpm('', 92), 92);
  assert.equal(clampBpm('nope', 92), 92);
  assert.equal(clampBpm(Infinity, 92), 92);
});

test('tap tempo averages the seven intervals between the last eight taps', () => {
  const tempo = new TapTempo();
  assert.equal(tempo.tap(0), null);
  assert.equal(tempo.tap(600), 100);
  for (const time of [1100, 1600, 2100, 2600, 3100, 3600]) tempo.tap(time);
  assert.equal(tempo.taps.length, 8);
  assert.equal(tempo.tap(4100), 120);
  assert.deepEqual(tempo.taps, [600, 1100, 1600, 2100, 2600, 3100, 3600, 4100]);
});

test('a pause resets the tap phrase and accidental double taps are ignored', () => {
  const tempo = new TapTempo();
  tempo.tap(0);
  assert.equal(tempo.tap(90), null);
  assert.equal(tempo.tap(500), 120);
  assert.equal(tempo.tap(3100), null);
  assert.equal(tempo.tap(4100), 60);
  tempo.reset();
  assert.equal(tempo.tap(5000), null);
});

test('all four styles have distinct valid four-beat patterns and swung styles use triplets', () => {
  assert.deepEqual(STYLES.map(style => style.id), ['pop', 'jazz', 'rock', 'blues']);
  assert.equal(new Set(STYLES.map(style => JSON.stringify(getPattern(style.id)))).size, 4);
  for (const { id } of STYLES) {
    for (const event of getPattern(id)) {
      assert.ok(event.beat >= 0 && event.beat < 4);
      assert.ok(event.velocity > 0 && event.velocity <= 1);
    }
  }
  assert.ok(getPattern('jazz').some(event => Math.abs(event.beat - 5 / 3) < 1e-10));
  assert.ok(getPattern('blues').some(event => Math.abs(event.beat - 2 / 3) < 1e-10));
});
