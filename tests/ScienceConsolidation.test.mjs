import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { responseHeader } from '../scripts/HorizonsAcquisition.mjs';
import { createEphemerisProvider } from '../src/science/EphemerisProvider.js';
import { adaptHorizonsSample } from '../src/science/HorizonsEphemerides.js';

const original = JSON.parse(readFileSync(new URL('../public/data/efemerides-2026.json', import.meta.url)));
const state = (name, index) => adaptHorizonsSample(original, name, index);
const base = original.planetas.Tierra[0].jdTDB;

test('encabezados sintéticos Horizons identifican planetas y sondas por último grupo numérico', () => {
  for (const [name, id] of [['Earth', '399'], ['Mars', '499'],
    ['Voyager 1 (spacecraft)', '-31'], ['Cassini (spacecraft)', '-82'],
    ['New Horizons (spacecraft)', '-98']]) {
    const header = `Target body name: ${name} (${id}) {source: synthetic}\nCenter body name: Sun (10)\n$$SOE`;
    assert.equal(responseHeader(header, id).solutionId, 'synthetic');
    assert.throws(() => responseHeader(header, '12345'), /distinto|ambiguo/);
  }
  for (const header of [
    'Center body name: Sun (10)\n$$SOE',
    'Target body name: Voyager 1 (spacecraft)\nCenter body name: Sun (10)\n$$SOE',
    'Target body name: Voyager 1 (-31) (spacecraft)\nCenter body name: Sun (10)\n$$SOE',
    'Target body name: Voyager 1 (42) (-31)\nCenter body name: Sun (10)\n$$SOE',
    'Target body name: Voyager 1 (-31)\nTarget body name: Voyager 2 (-32)\nCenter body name: Sun (10)\n$$SOE',
    'Target body name: Voyager 1 (-31)\nCenter body name: Earth (399)\n$$SOE'
  ]) assert.throws(() => responseHeader(header, '-31'));
});

function entry(id, states, bodyIds, cadenceSeconds) {
  const times = states.map(s => s.time.jdTdb);
  return { id, file: `data/${id}.json`, format: 'scientific-states-v1', formatVersion: 1,
    bodyIds, coverage: { startJdTdb: Math.min(...times), endJdTdb: Math.max(...times) },
    bodyCoverage: Object.fromEntries(bodyIds.map(bodyId => {
      const own = states.filter(s => s.identity.id === bodyId).map(s => s.time.jdTdb);
      return [bodyId, { startJdTdb: Math.min(...own), endJdTdb: Math.max(...own) }];
    })), cadenceSeconds, frameId: 'ICRF_ECLIPTIC_J2000', origin: 'SUN_CENTER',
    fileUnits: { position: 'km', velocity: 'km/s' },
    source: 'NASA/JPL Horizons', sourceVersion: null };
}

test('cobertura individual, muestra única, huecos y cadencias diferentes', async () => {
  const a = [state('Tierra', 0), state('Tierra', 2), state('Marte', 1)];
  const b = [state('Tierra', 2), state('Tierra', 4)];
  const entries = [entry('a', a, ['399', '499'], 86400), entry('b', b, ['399'], 172800)];
  const provider = createEphemerisProvider({ catalog: { catalogVersion: 1, datasets: entries },
    loadJson: async file => ({ formatVersion: 1, states: file === 'data/a.json' ? a : b }) });
  const earth = await provider.getCoverage('399');
  const mars = await provider.getCoverage('499');
  assert.equal(mars.intervals[0].startJdTdb, base + 1);
  assert.equal(mars.intervals[0].endJdTdb, base + 1);
  assert.equal(earth.intervals.length, 2);
  assert.equal(earth.segments.length, 3);
  assert.equal(earth.gaps.filter(g => g.kind === 'within_dataset').length, 1);
  assert.equal(earth.overlaps.length, 1);
  assert.equal((await provider.getExact('499', base)).status, 'missing');
  assert.equal((await provider.getInterpolated('499', base)).reason, 'outside_coverage');
  assert.equal((await provider.getExact('499', base + 1)).status, 'found');
  assert.equal((await provider.getInterpolated('399', base + 1)).status, 'interpolation_rejected');
  assert.equal((await provider.getExact('399', base + 2)).alternates.length, 1);
  assert.equal((await provider.getInterpolated('399', base + 3,
    { maxIntervalSeconds: 172800 })).status, 'interpolated');
  assert.equal((await provider.getExact('399', base + 5)).status, 'missing');
  const legacyEntry = structuredClone(entries[0]);
  delete legacyEntry.bodyCoverage;
  const legacy = createEphemerisProvider({ catalog: { catalogVersion: 1, datasets: [legacyEntry] },
    loadJson: async () => ({ formatVersion: 1, states: a }) });
  assert.equal((await legacy.getInterpolated('499', base)).reason, 'outside_coverage');
  const wrong = structuredClone(entries[0]);
  wrong.bodyCoverage['499'].startJdTdb = base;
  const invalid = createEphemerisProvider({ catalog: { catalogVersion: 1, datasets: [wrong] },
    loadJson: async () => ({ formatVersion: 1, states: a }) });
  await assert.rejects(invalid.getDatasetInfo('a'), /cobertura real del cuerpo/);
  const changed = structuredClone(b);
  changed[0].position.x += 1;
  const conflict = createEphemerisProvider({ catalog: { catalogVersion: 1, datasets: entries },
    loadJson: async file => ({ formatVersion: 1, states: file === 'data/a.json' ? a : changed }) });
  assert.equal((await conflict.getExact('399', base + 2)).status, 'conflict');
});
