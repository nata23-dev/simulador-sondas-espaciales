import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adaptHorizonsSample, validateHorizonsDataset } from '../src/science/HorizonsEphemerides.js';
import { createEphemerisCatalog } from '../src/science/EphemerisCatalog.js';
import { createStaticJsonReader } from '../src/science/EphemerisFileReader.js';
import { createEphemerisProvider } from '../src/science/EphemerisProvider.js';

const original = JSON.parse(readFileSync(new URL('../public/data/efemerides-2026.json', import.meta.url)));
const realCatalog = JSON.parse(readFileSync(new URL('../public/data/ephemerides-catalog-v1.json', import.meta.url)));
const earth = index => structuredClone(adaptHorizonsSample(original, 'Tierra', index));
const mars = index => structuredClone(adaptHorizonsSample(original, 'Marte', index));
const fixture = states => ({ formatVersion: 1, states });

function entry(id, states, cadenceSeconds = 86400) {
  const times = states.map(state => state.time.jdTdb);
  return { id, file: `data/${id}.json`, format: 'scientific-states-v1', formatVersion: 1,
    bodyIds: [...new Set(states.map(state => state.identity.id))],
    coverage: { startJdTdb: Math.min(...times), endJdTdb: Math.max(...times) },
    cadenceSeconds, frameId: 'ICRF_ECLIPTIC_J2000', origin: 'SUN_CENTER',
    fileUnits: { position: 'km', velocity: 'km/s' },
    source: 'NASA/JPL Horizons', sourceVersion: null };
}

function providerFrom(fixtures, options = {}) {
  const catalog = { catalogVersion: 1,
    datasets: Object.entries(fixtures).map(([id, data]) => entry(id, data.states,
      Object.hasOwn(options[id] ?? {}, 'cadenceSeconds') ? options[id].cadenceSeconds : 86400)) };
  const reads = [];
  const provider = createEphemerisProvider({ catalog, loadJson: async file => {
    reads.push(file);
    return fixtures[file.slice(5, -5)];
  }, ...options.provider });
  return { provider, reads, catalog };
}

test('el catálogo real conserva el validador estricto y los ocho cuerpos', async () => {
  assert.equal(validateHorizonsDataset(original).sampleCountPerPlanet, 32);
  const reads = [];
  const provider = createEphemerisProvider({ catalog: realCatalog, loadJson: async file => {
    reads.push(file);
    return original;
  } });
  assert.equal(provider.listDatasets().length, 1);
  assert.deepEqual(provider.listBodies(), ['199', '299', '399', '499', '599', '699', '799', '899']);
  const result = await provider.getExact('399', 2461314.5);
  assert.equal(result.status, 'found');
  assert.equal(result.state.position.unit, 'km');
  assert.equal(result.state.velocity.unit, 'km/s');
  assert.equal(result.state.reference.id, 'ICRF_ECLIPTIC_J2000');
  assert.equal(result.state.provenance.version, null);
  assert.equal(result.state.provenance.queriedAtUtc, original.metadatos.consultaUTC);
  assert.equal(result.state.provenance.sourceMetadata.ephemerisDatasetId, 'horizons-planets-2026-10');
  assert.equal(result.state.provenance.sourceMetadata.ephemerisFile, 'data/efemerides-2026.json');
  assert.equal(result.state.provenance.sourceMetadata.ephemerisFormatVersion, 1);
  assert.equal(result.state.provenance.sourceMetadata.sourceDistanceUnit, 'AU');
  const info = await provider.getDatasetInfo('horizons-planets-2026-10');
  assert.equal(info.stateCount, 256);
  assert.equal(info.sampleCounts['399'], 32);
  assert.deepEqual(reads, ['data/efemerides-2026.json']);
});

test('varios periodos y cuerpos parciales se registran y consultan sin fechas fijas', async () => {
  const { provider } = providerFrom({ first: fixture([earth(0), mars(0), earth(1), mars(1)]),
    later: fixture([earth(10), earth(11)]) });
  assert.deepEqual(provider.listBodies(), ['399', '499']);
  assert.equal((await provider.getExact('499', earth(0).time.jdTdb)).status, 'found');
  assert.equal((await provider.getExact('499', earth(10).time.jdTdb)).reason, 'outside_coverage');
  assert.equal((await provider.getExact('399', earth(5).time.jdTdb)).reason, 'outside_coverage');
  const coverage = await provider.getCoverage('399');
  assert.equal(coverage.intervals.length, 2);
  assert.deepEqual(coverage.intervals.map(item => item.file), ['data/first.json', 'data/later.json']);
  assert.ok(coverage.gaps.some(gap => gap.kind === 'between_datasets'));
});

test('cadencias distintas y distribución irregular conservan solo muestras exactas', async () => {
  const twoDays = fixture([earth(0), earth(2), earth(4)]);
  const irregular = fixture([mars(0), mars(1), mars(3)]);
  const { provider } = providerFrom({ twoDays, irregular },
    { twoDays: { cadenceSeconds: 172800 }, irregular: { cadenceSeconds: null } });
  assert.equal((await provider.getExact('399', earth(1).time.jdTdb)).reason, 'no_exact_sample');
  assert.equal((await provider.getCoverage('399')).gaps.length, 0);
  assert.equal((await provider.getCoverage('499')).intervals[0].cadenceSeconds, null);
  assert.equal((await provider.getCoverage('499')).gaps.length, 0);
  assert.deepEqual((await provider.getRange('399', earth(0).time.jdTdb, earth(4).time.jdTdb))
    .map(result => result.jdTdb), [earth(0), earth(2), earth(4)].map(state => state.time.jdTdb));
});

test('huecos dentro de un conjunto y solicitudes sin muestra quedan explícitos', async () => {
  const { provider } = providerFrom({ gap: fixture([earth(0), earth(2)]) });
  const coverage = await provider.getCoverage('399');
  assert.deepEqual(coverage.gaps.map(gap => gap.kind), ['within_dataset']);
  assert.equal(coverage.gaps[0].afterJdTdb, earth(0).time.jdTdb);
  assert.equal(coverage.gaps[0].beforeJdTdb, earth(2).time.jdTdb);
  assert.equal((await provider.getExact('399', earth(1).time.jdTdb)).reason, 'no_exact_sample');
  assert.equal((await provider.getExact('399', earth(2).time.jdTdb + 0.25)).reason, 'outside_coverage');
});

test('solapamientos compatibles tienen prioridad estable por orden del catálogo', async () => {
  const { provider } = providerFrom({ first: fixture([earth(0), earth(1), earth(2)]),
    second: fixture([earth(2), earth(3)]) });
  const result = await provider.getExact('399', earth(2).time.jdTdb);
  assert.equal(result.status, 'found');
  assert.equal(result.datasetId, 'first');
  assert.deepEqual(result.alternates.map(item => item.datasetId), ['second']);
  const coverage = await provider.getCoverage('399');
  assert.equal(coverage.overlaps.length, 1);
  assert.deepEqual(coverage.overlaps[0].datasetIds, ['first', 'second']);
  assert.equal(coverage.conflicts.length, 0);
  assert.deepEqual((await provider.getProvenance('399', earth(2).time.jdTdb))
    .sources.map(item => item.datasetId), ['first', 'second']);
});

test('una contradicción de fixture se declara sin sobrescribir estados', async () => {
  const altered = earth(2);
  altered.position.x += 1; // Perturbación deliberada exclusivamente en esta prueba.
  const { provider } = providerFrom({ first: fixture([earth(1), earth(2)]),
    conflicting: fixture([altered, earth(3)]) });
  const result = await provider.getExact('399', earth(2).time.jdTdb);
  assert.equal(result.status, 'conflict');
  assert.equal(result.candidates.length, 2);
  assert.notEqual(result.candidates[0].state.position.x, result.candidates[1].state.position.x);
  assert.equal((await provider.getCoverage('399')).conflicts.length, 1);
  assert.equal((await provider.getRange('399', earth(1).time.jdTdb, earth(3).time.jdTdb))
    .filter(item => item.status === 'conflict').length, 1);
  assert.equal((await provider.getProvenance('399', earth(2).time.jdTdb)).sources.length, 2);
});

test('unidades, marcos, fuente, cobertura y orden temporal inconsistentes se rechazan', async () => {
  for (const [name, change, pattern] of [
    ['unit', states => { states[0].position.unit = 'AU'; }, /position\.unit/],
    ['frame', states => { states[0].reference.id = 'otro'; }, /reference\.id/],
    ['source', states => { states[0].provenance.source = 'otro'; }, /fuente o versión/],
    ['order', states => { states.push(earth(0)); }, /duplicados o desordenados/],
    ['body', states => { states[0].identity.id = '899'; }, /cuerpo no declarado/],
    ['type', states => { states[1].identity.type = 'probe'; }, /tipo de cuerpo inconsistente/],
    ['cadence', states => { states[1].time.jdTdb += 0.5; }, /cadencia declarada incompatible/]
  ]) {
    const states = [earth(0), earth(1)];
    const declared = entry(name, states);
    change(states);
    const provider = createEphemerisProvider({ catalog: { catalogVersion: 1, datasets: [declared] },
      loadJson: async () => fixture(states) });
    await assert.rejects(provider.getDatasetInfo(name), pattern);
  }
  const states = [earth(0), earth(1)];
  const wrongCoverage = entry('coverage', states);
  wrongCoverage.coverage.endJdTdb += 1;
  const provider = createEphemerisProvider({ catalog: { catalogVersion: 1, datasets: [wrongCoverage] },
    loadJson: async () => fixture(states) });
  await assert.rejects(provider.getDatasetInfo('coverage'), /cobertura real/);
  const wrongFrame = entry('bad', states);
  wrongFrame.frameId = 'INCOMPATIBLE';
  assert.throws(() => createEphemerisCatalog({ catalogVersion: 1, datasets: [wrongFrame] }), /frameId\/origin incompatible/);
});

test('archivos ausentes, HTTP fallido y JSON malformado producen errores y permiten reintento', async () => {
  const requests = [];
  const read = createStaticJsonReader({ baseUrl: '/simulador-sondas-espaciales/',
    fetchImpl: async url => { requests.push(url); return { ok: false, status: 404 }; } });
  await assert.rejects(read('data/missing.json'), /HTTP 404/);
  assert.deepEqual(requests, ['/simulador-sondas-espaciales/data/missing.json']);
  const malformed = createStaticJsonReader({ baseUrl: '/', fetchImpl: async () =>
    ({ ok: true, json: async () => { throw new SyntaxError('bad JSON'); } }) });
  await assert.rejects(malformed('data/bad.json'), /JSON malformado/);
  await assert.rejects(read('../escape.json'), /ruta JSON local/);
  let attempts = 0;
  const states = [earth(0)];
  const provider = createEphemerisProvider({ catalog: { catalogVersion: 1,
    datasets: [entry('retry', states)] }, loadJson: async () => {
    attempts++;
    if (attempts === 1) throw new Error('falla transitoria');
    return fixture(states);
  } });
  await assert.rejects(provider.getExact('399', earth(0).time.jdTdb), /falla transitoria/);
  assert.equal((await provider.getExact('399', earth(0).time.jdTdb)).status, 'found');
  assert.equal(attempts, 2);
  const malformedProvider = createEphemerisProvider({ catalog: { catalogVersion: 1,
    datasets: [entry('malformed', states)] }, loadJson: async () => ({ states }) });
  await assert.rejects(malformedProvider.getDatasetInfo('malformed'), /formatVersion/);
  const limitedProvider = createEphemerisProvider({ catalog: { catalogVersion: 1,
    datasets: [entry('limited', [earth(0), earth(1)])] }, loadJson: async () => fixture([earth(0), earth(1)]),
  maxStatesPerDataset: 1 });
  await assert.rejects(limitedProvider.getDatasetInfo('limited'), /excede el límite/);
});

test('la caché comparte cargas concurrentes y respeta el límite de conjuntos', async () => {
  const data = { first: fixture([earth(0)]), second: fixture([earth(10)]) };
  const { provider, reads } = providerFrom(data, { provider: { maxCachedDatasets: 1 } });
  const jd0 = earth(0).time.jdTdb;
  const [a, b] = await Promise.all([provider.getExact('399', jd0), provider.getExact('399', jd0)]);
  assert.strictEqual(a.state, b.state);
  assert.deepEqual(reads, ['data/first.json']);
  await provider.getExact('399', earth(10).time.jdTdb);
  await provider.getExact('399', jd0);
  assert.deepEqual(reads, ['data/first.json', 'data/second.json', 'data/first.json']);
});

test('los resultados no mutan los fixtures y las consultas repetidas son deterministas', async () => {
  const source = fixture([earth(0), earth(1)]);
  const originalJson = JSON.stringify(source);
  const { provider } = providerFrom({ stable: source });
  const jd = earth(0).time.jdTdb;
  const first = await provider.getExact('399', jd);
  const second = await provider.getExact('399', jd);
  assert.deepEqual(first, second);
  assert.strictEqual(first.state, second.state);
  assert.ok(Object.isFrozen(first.state));
  assert.ok(Object.isFrozen(first.state.provenance.sourceMetadata));
  assert.throws(() => { first.state.position.x = 0; }, TypeError);
  assert.equal(JSON.stringify(source), originalJson);
});

test('el catálogo rechaza rutas inseguras y archivos duplicados', () => {
  const e = entry('one', [earth(0)]);
  assert.throws(() => createEphemerisCatalog({ catalogVersion: 1,
    datasets: [{ ...e, file: '../outside.json' }] }), /ruta JSON local/);
  assert.throws(() => createEphemerisCatalog({ catalogVersion: 1,
    datasets: [e, { ...e, id: 'two' }] }), /file duplicado/);
  assert.throws(() => createEphemerisCatalog({ catalogVersion: 2, datasets: [e] }), /catalogVersion/);
});
