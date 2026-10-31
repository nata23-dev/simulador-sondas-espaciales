import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptHorizonsSample, validateHorizonsDataset, validateHorizonsSample,
  validateHorizonsMetadata } from '../src/science/HorizonsEphemerides.js';
import { eclipticToSceneAxes } from '../src/science/Frames.js';
import { posicionEscenaProporcional, UNIDADES_POR_AU } from '../src/graphics/SpatialScale.js';

const dataset = JSON.parse(fs.readFileSync(
  new URL('../public/data/efemerides-2026.json', import.meta.url), 'utf8'
));
const clone = () => structuredClone(dataset);

test('conjunto real: ocho series completas, fechas y JD TDB coherentes', () => {
  const report = validateHorizonsDataset(dataset);
  assert.equal(report.sampleCountPerPlanet, 32);
  assert.equal(report.firstJdTdb, 2461314.5);
  assert.equal(report.lastJdTdb, 2461345.5);
  assert.deepEqual(report.warnings, []);
});

test('adaptador conserva una muestra real, metadatos y unidades originales', () => {
  const record = dataset.planetas.Tierra[9]; // 2026-10-10, valor literal del archivo.
  const original = structuredClone(record);
  const state = adaptHorizonsSample(dataset, 'Tierra', 9);
  assert.equal(state.identity.id, '399');
  assert.equal(state.identity.origin, 'SUN_CENTER');
  assert.equal(state.time.jdTdb, 2461323.5);
  assert.equal(state.time.scale, 'TDB');
  assert.ok(Math.abs(state.position.x - 143385080.850637) < 0.001); // Calculado independientemente de la función probada.
  assert.ok(Math.abs(state.position.y - 42029610.8393856) < 0.001);
  assert.ok(Math.abs(state.position.z - (-3157.52505251765)) < 0.001);
  assert.ok(Math.abs(state.velocity.x - record.velocidadAUporDia.x * 149597870.7 / 86400) < 1e-11);
  assert.equal(state.reference.id, 'ICRF_ECLIPTIC_J2000');
  assert.equal(state.provenance.version, null);
  assert.equal(state.provenance.precision, null);
  assert.equal(state.provenance.uncertainty, null);
  assert.equal(state.provenance.sourceMetadata.sourceDistanceUnit, 'AU');
  assert.equal(state.provenance.sourceMetadata.sourceVelocityUnit, 'AU/dia');
  assert.equal(state.provenance.sourceMetadata.consultaUTC, dataset.metadatos.consultaUTC);
  assert.deepEqual(record, original);
  const scene = posicionEscenaProporcional(record.posicionAU);
  const rotated = eclipticToSceneAxes(record.posicionAU);
  assert.deepEqual(scene.toArray(), [rotated.x, rotated.y, rotated.z].map(x => x * UNIDADES_POR_AU));
});

test('metadatos desconocidos o incompatibles se rechazan con ruta de propiedad', () => {
  for (const [key, value] of [
    ['centro', 'Baricentro'], ['plano', 'Ecuatorial'], ['referencia', 'B1950'],
    ['tiempo', 'UTC'], ['distancia', 'km'], ['velocidad', 'km/s'],
    ['consultaUTC', 'ayer']
  ]) {
    const copy = clone();
    copy.metadatos[key] = value;
    assert.throws(() => validateHorizonsMetadata(copy.metadatos), new RegExp(`metadatos\\.${key}`));
  }
});

test('consultaUTC acepta fechas y horas gregorianas reales con fracción opcional', () => {
  for (const consultaUTC of [
    '2026-10-10T23:43:55.158Z',
    '2026-01-01T00:00:00Z',
    '2024-02-29T23:59:59.123456789Z',
    '2000-02-29T12:30:45Z',
    '2026-04-30T08:09:10Z'
  ]) {
    const metadata = { ...dataset.metadatos, consultaUTC };
    assert.deepEqual(validateHorizonsMetadata(metadata), {
      firstJdTdb: 2461314.5,
      lastJdTdb: 2461345.5
    }, consultaUTC);
  }
});

test('consultaUTC rechaza fechas imposibles y campos horarios fuera de rango', () => {
  for (const consultaUTC of [
    '2026-02-30T12:00:00Z',
    '2025-02-29T12:00:00Z',
    '1900-02-29T12:00:00Z',
    '2026-13-01T12:00:00Z',
    '2026-00-01T12:00:00Z',
    '2026-01-32T12:00:00Z',
    '2026-01-00T12:00:00Z',
    '2026-01-01T25:00:00Z',
    '2026-01-01T24:00:00Z',
    '2026-01-01T12:60:00Z',
    '2026-01-01T12:00:60Z'
  ]) {
    const metadata = { ...dataset.metadatos, consultaUTC };
    assert.throws(() => validateHorizonsMetadata(metadata), /metadatos\.consultaUTC/, consultaUTC);
  }
});

test('fechaTDB mantiene su formato diario literal y rechaza variantes malformadas', () => {
  const record = dataset.planetas.Tierra[0];
  assert.deepEqual(validateHorizonsSample(record), { date: '2026-10-01', jdTdb: 2461314.5 });
  for (const fechaTDB of [
    'A?D? 2026-Oct-01 00:00:00.0000',
    'A.D. 2026-Oct-01 01:00:00.0000',
    'A.D. 2026-Oct-01 00:00:00X0000',
    'A.D. 2026-October-01 00:00:00.0000'
  ]) {
    assert.throws(() => validateHorizonsSample({ ...record, fechaTDB }), /fechaTDB/, fechaTDB);
  }
});

test('validador detecta componentes, fechas, orden, duplicados y tamaño de series', () => {
  const invalidCases = [
    [d => { delete d.planetas.Tierra[0].posicionAU.z; }, /posicionAU.z/],
    [d => { d.planetas.Tierra[0].velocidadAUporDia.x = NaN; }, /velocidadAUporDia.x/],
    [d => { d.planetas.Tierra[0].posicionAU.x = '1'; }, /posicionAU.x/],
    [d => { d.planetas.Tierra[0].jdTDB = Infinity; }, /jdTdb|número finito/],
    [d => { d.planetas.Tierra[0].fechaTDB = 'A.D. 2026-Oct-02 00:00:00.0000'; }, /jdTDB/],
    [d => { d.planetas.Tierra[1] = structuredClone(d.planetas.Tierra[0]); }, /jdTDB/],
    [d => { d.planetas.Tierra.reverse(); }, /jdTDB/],
    [d => { d.planetas.Tierra.pop(); }, /32 muestras/],
    [d => { d.metadatos.fin = '2026-12-01'; }, /62 muestras/]
  ];
  for (const [mutate, pattern] of invalidCases) {
    const copy = clone();
    mutate(copy);
    assert.throws(() => validateHorizonsDataset(copy), pattern);
  }
  assert.throws(() => validateHorizonsSample({ jdTDB: 1, posicionAU: {}, velocidadAUporDia: {} }), /fechaTDB/);
  assert.throws(() => adaptHorizonsSample(dataset, 'Pluton', 0), /Planeta desconocido/);
  assert.throws(() => adaptHorizonsSample(dataset, 'Tierra', 99), /no existe/);
});

test('anomalías físicas conservadoras producen advertencia, no rechazo', () => {
  const copy = clone();
  copy.planetas.Tierra[0].posicionAU = { x: 1001, y: 0, z: 0 };
  copy.planetas.Tierra[0].velocidadAUporDia = { x: 2, y: 0, z: 0 };
  const report = validateHorizonsDataset(copy);
  assert.equal(report.warnings.length, 2);
  assert.match(report.warnings[0], /posicionAU/);
  assert.match(report.warnings[1], /velocidadAUporDia/);
});
