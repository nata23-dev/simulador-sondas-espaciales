import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { getHistoricalEventById } from '../src/science/VoyagerHistoricalEvents.js';

const root = new URL('../evidence/stage2-2/ConsultasOriginales/', import.meta.url);
const encounters = [
  ['v1-jupiter-1979', '-31', '599'], ['v2-jupiter-1979', '-32', '599'],
  ['v1-saturn-1980', '-31', '699'], ['v2-saturn-1981', '-32', '699'],
  ['v2-uranus-1986', '-32', '799'], ['v2-neptune-1989', '-32', '899']
];

async function original(eventId, label) {
  const stem = `${eventId}-${label}`;
  const bytes = await readFile(new URL(`${stem}.json`, root));
  const meta = JSON.parse(await readFile(new URL(`${stem}.request.json`, root), 'utf8'));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), meta.sha256);
  assert.equal(meta.httpStatus, 200);
  const result = JSON.parse(bytes).result;
  const rows = result.match(/\$\$SOE\s*\n([\s\S]*?)\$\$EOE/)?.[1]
    .trim().split(/\r?\n/).map(line => line.split(',').map(item => item.trim()));
  assert.equal(rows?.length, label.endsWith('tdb-crosscheck') ? 1 : 121);
  return { meta, result, rows };
}

const position = row => row.slice(2, 5).map(Number);
const distance = row => Math.hypot(...position(row));
const difference = (a, b) => Math.hypot(...position(a).map((value, i) => value - position(b)[i]));

test('las 18 consultas NASA/JPL originales tienen SHA-256, parámetros y época oficial verificables', async () => {
  for (const [eventId, probeId, planetId] of encounters) {
    const [relative, probe, planet] = await Promise.all([
      original(eventId, 'relative-probe'),
      original(eventId, 'heliocentric-probe'),
      original(eventId, 'heliocentric-planet')
    ]);
    assert.equal(relative.meta.targetId, probeId);
    assert.equal(relative.meta.centerId, `500@${planetId}`);
    assert.equal(probe.meta.targetId, probeId);
    assert.equal(planet.meta.targetId, planetId);
    for (const item of [relative, probe, planet]) {
      assert.equal(item.meta.parameters.TIME_TYPE, "'UT'");
      assert.equal(item.meta.parameters.VEC_CORR, "'NONE'");
      assert.equal(item.meta.parameters.REF_PLANE, "'ECLIPTIC'");
      assert.equal(item.meta.parameters.REF_SYSTEM, "'ICRF'");
      assert.equal(item.meta.parameters.OUT_UNITS, "'KM-S'");
      assert.match(item.result, /Output type\s+: GEOMETRIC cartesian states/);
      const utc = getHistoricalEventById(eventId).dateUtc;
      const calendar = item.rows[60][1].match(/^A\.D\. (\d{4})-([A-Za-z]{3})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
      assert.ok(calendar);
      const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(calendar[2]);
      assert.equal(Date.UTC(Number(calendar[1]), month, Number(calendar[3]),
        Number(calendar[4]), Number(calendar[5]), Number(calendar[6])), Date.parse(utc));
    }
  }
});

test('Horizons directo sitúa los encuentros de Urano y Neptuno dentro del redondeo de radios NSSDCA', async () => {
  for (const [eventId, radii, radiusKm] of [
    ['v2-uranus-1986', 4.19, 25559],
    ['v2-neptune-1989', 1.18, 24760]
  ]) {
    const item = await original(eventId, 'relative-probe');
    const directKm = distance(item.rows[60]);
    const nssdcKm = radii * radiusKm;
    assert.ok(Math.abs(directKm - nssdcKm) <= 0.005 * radiusKm);
    const minimumKm = Math.min(...item.rows.map(distance));
    assert.ok(minimumKm <= directKm);
    assert.ok(minimumKm > radiusKm);
  }
});

test('la resta de vectores heliocéntricos independientes no reproduce el vector relativo Horizons', async () => {
  for (const [eventId] of encounters) {
    const [relative, probe, planet] = await Promise.all([
      original(eventId, 'relative-probe'),
      original(eventId, 'heliocentric-probe'),
      original(eventId, 'heliocentric-planet')
    ]);
    const p = position(probe.rows[60]), b = position(planet.rows[60]);
    const derived = p.map((value, i) => value - b[i]);
    const direct = position(relative.rows[60]);
    const residualKm = Math.hypot(...derived.map((value, i) => value - direct[i]));
    assert.ok(residualKm > 100, `${eventId}: la discrepancia debe quedar visible`);
    if (eventId.includes('uranus') || eventId.includes('neptune')) {
      assert.ok(Math.abs(Math.hypot(...derived) - Math.hypot(...direct)) > 4000);
    }
  }
});

test('la conversión UTC/TDB del simulador coincide con la consulta directa independiente', async () => {
  for (const eventId of ['v2-uranus-1986', 'v2-neptune-1989']) {
    const [utc, tdb] = await Promise.all([
      original(eventId, 'relative-probe'), original(eventId, 'relative-probe-tdb-crosscheck')
    ]);
    assert.equal(tdb.meta.parameters.TIME_TYPE, "'TDB'");
    assert.ok(difference(utc.rows[60], tdb.rows[0]) < 0.01);
  }
});

test('los vectores geométricos directos son recíprocos al invertir nave y planeta', async () => {
  for (const eventId of ['v2-uranus-1986', 'v2-neptune-1989']) {
    const [forward, reverse] = await Promise.all([
      original(eventId, 'relative-probe'), original(eventId, 'reverse-planet')
    ]);
    const a = position(forward.rows[60]), b = position(reverse.rows[60]);
    assert.ok(Math.hypot(...a.map((value, i) => value + b[i])) < 0.001);
  }
});
