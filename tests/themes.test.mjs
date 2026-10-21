import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_THEME, handAngles, validateCatalog } from '../site/clock-preview.js';

const swiss = { ...DEFAULT_THEME, id: 'swiss', label: 'Swiss', sweep_seconds: 58.5 };
const at = (seconds, milliseconds = 0) => new Date(2026, 9, 21, 12, 1, seconds, milliseconds);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≠ ${expected}`);
test('each theme reaches twelve at its own sweep duration and waits until the minute', () => {
  close(handAngles(at(29), DEFAULT_THEME).second, 180);
  close(handAngles(at(29, 250), swiss).second, 180);
  close(handAngles(at(58), DEFAULT_THEME).second, 0);
  assert.ok(handAngles(at(58), swiss).second > 350);
  close(handAngles(at(58, 500), swiss).second, 0);
  for (const theme of [DEFAULT_THEME, swiss]) {
    close(handAngles(at(59, 999), theme).second, 0);
    close(handAngles(at(0), theme).minute, 4320);
    close(handAngles(at(0, 90), theme).minute, 4323);
    close(handAngles(at(0, 180), theme).minute, 4326);
  }
});
test('theme catalog rejects traversal, invalid geometry and unsupported timing', () => {
  const catalog = [structuredClone(DEFAULT_THEME), structuredClone(swiss)];
  assert.equal(validateCatalog(catalog), catalog);
  for (const mutate of [
    (data) => { data[1].assets.hour.path = '../secret.png'; },
    (data) => { data[1].assets.hour.pivot = [999, 0]; },
    (data) => { data[1].assets.dial.width = 400; },
    (data) => { data[1].advance_seconds = 0; },
    (data) => { data[1].sweep_seconds = 0; },
    (data) => { data[1].id = 'other'; },
  ]) {
    const changed = structuredClone(catalog); mutate(changed);
    assert.throws(() => validateCatalog(changed), /Invalid/);
  }
});
