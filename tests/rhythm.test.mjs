import test from 'node:test';
import assert from 'node:assert/strict';
import { STYLES, METERS, clampBpm, TapTempo, getPattern, getMeter, normalizeMeter } from '../rhythm.js';

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

test('all styles have distinct valid arrangements in every meter and swung styles use triplets', () => {
  assert.deepEqual(STYLES.map(style => style.id), ['pop', 'jazz', 'rock', 'blues']);
  for (const meter of METERS) {
    assert.equal(new Set(STYLES.map(style => JSON.stringify(getPattern(style.id, meter.id)))).size, 4);
    for (const { id } of STYLES) {
      const pattern = getPattern(id, meter.id);
      assert.ok(Object.isFrozen(pattern));
      assert.ok(pattern.some(event => event.sound === 'kick' && event.beat === 0));
      assert.ok(pattern.some(event => event.sound === 'snare'));
      for (const event of pattern) {
        assert.ok(event.beat >= 0 && event.beat < meter.beatsPerBar);
        assert.ok(event.velocity > 0 && event.velocity <= 1);
      }
    }
  }
  assert.ok(getPattern('jazz').some(event => Math.abs(event.beat - 5 / 3) < 1e-10));
  assert.ok(getPattern('blues').some(event => Math.abs(event.beat - 2 / 3) < 1e-10));
});

test('6/8 has two dotted-quarter pulses and invalid meters safely fall back to 4/4', () => {
  assert.equal(getMeter('3/4').beatsPerBar, 3);
  assert.equal(getMeter('4/4').beatsPerBar, 4);
  assert.equal(getMeter('6/8').beatsPerBar, 2);
  assert.equal(normalizeMeter('7/13'), '4/4');
  assert.equal(normalizeMeter(null), '4/4');
  assert.equal(getPattern('unknown', 'unknown'), getPattern('pop', '4/4'));
  for (const { id } of STYLES) {
    assert.ok(getPattern(id, '6/8').some(event => Math.abs(event.beat - 1 / 3) < 1e-10));
    assert.notDeepEqual(getPattern(id, '3/4'), getPattern(id).filter(event => event.beat < 3));
  }
});
