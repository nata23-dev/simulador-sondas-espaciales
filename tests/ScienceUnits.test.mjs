import test from 'node:test';
import assert from 'node:assert/strict';
import { KM_PER_AU, SECONDS_PER_DAY, auToKm, kmToAu,
  auPerDayToKmPerSecond, kmPerSecondToAuPerDay } from '../src/science/Units.js';

test('unidades canónicas: AU, km, AU/día y km/s', () => {
  assert.equal(KM_PER_AU, 149597870.7);
  assert.equal(SECONDS_PER_DAY, 86400);
  assert.equal(auToKm(1), 149597870.7);
  assert.equal(auToKm(-2), -299195741.4);
  assert.equal(auToKm(0), 0);
  assert.equal(kmToAu(149597870.7), 1);
  assert.equal(auPerDayToKmPerSecond(1), 149597870.7 / 86400);
  assert.equal(auPerDayToKmPerSecond(-1), -149597870.7 / 86400);
  assert.equal(kmPerSecondToAuPerDay(149597870.7 / 86400), 1);
  assert.equal(kmPerSecondToAuPerDay(0), 0);
});

test('conversiones inversas conservan signos y precisión de coma flotante', () => {
  for (const value of [-30.123456789, -1e-9, 0, 1e-9, 0.123456789, 30.123456789]) {
    assert.ok(Math.abs(kmToAu(auToKm(value)) - value) <= 1e-13 * Math.max(1, Math.abs(value)));
    assert.ok(Math.abs(kmPerSecondToAuPerDay(auPerDayToKmPerSecond(value)) - value)
      <= 1e-13 * Math.max(1, Math.abs(value)));
  }
});

test('conversiones rechazan tipos no numéricos, NaN, infinitos y desbordamientos', () => {
  for (const invalid of ['1', null, undefined, NaN, Infinity, -Infinity]) {
    for (const convert of [auToKm, kmToAu, auPerDayToKmPerSecond, kmPerSecondToAuPerDay]) {
      assert.throws(() => convert(invalid), /número finito/);
    }
  }
  assert.throws(() => auToKm(Number.MAX_VALUE), /rango numérico/);
});
