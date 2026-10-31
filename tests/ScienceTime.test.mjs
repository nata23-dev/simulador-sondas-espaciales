import test from 'node:test';
import assert from 'node:assert/strict';
import { requireJdTdb, secondsBetweenJdTdb, advanceJdTdb, compareJdTdb,
  gregorianLabelToJulianMidnight } from '../src/science/Time.js';

test('instantes TDB: diferencias, avance, retroceso y comparación', () => {
  const start = 2461314.5;
  assert.equal(requireJdTdb(start), start);
  assert.equal(secondsBetweenJdTdb(start, start + 1), 86400);
  assert.equal(secondsBetweenJdTdb(start + 1, start), -86400);
  assert.equal(advanceJdTdb(start, 86400), start + 1);
  assert.equal(advanceJdTdb(start, -86400), start - 1);
  assert.equal(compareJdTdb(start, start + 1), -1);
  assert.equal(compareJdTdb(start, start), 0);
  assert.equal(compareJdTdb(start + 1, start), 1);
});

test('etiquetas gregorianas de medianoche dan JD conocido sin convertir UTC a TDB', () => {
  assert.equal(gregorianLabelToJulianMidnight('2000-01-01'), 2451544.5);
  assert.equal(gregorianLabelToJulianMidnight('2026-10-01'), 2461314.5);
  assert.equal(gregorianLabelToJulianMidnight('2026-11-01'), 2461345.5);
  assert.equal(gregorianLabelToJulianMidnight('2024-02-29') + 1,
    gregorianLabelToJulianMidnight('2024-03-01'));
});

test('tiempo rechaza fechas civiles y valores no finitos o no representables', () => {
  for (const invalid of [new Date(), '2026-10-01', NaN, Infinity, null]) {
    assert.throws(() => requireJdTdb(invalid), /número finito/);
  }
  assert.throws(() => secondsBetweenJdTdb(1, '2'), /número finito/);
  assert.throws(() => advanceJdTdb(2461314.5, 1e-8), /precisión/);
  assert.throws(() => gregorianLabelToJulianMidnight('2026-02-29'), /inválida/);
  assert.throws(() => gregorianLabelToJulianMidnight('2026/10/01'), /YYYY-MM-DD/);
});
