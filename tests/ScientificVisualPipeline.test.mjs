import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adaptHorizonsSample, HORIZONS_PLANETS } from '../src/science/HorizonsEphemerides.js';
import { KM_PER_AU } from '../src/science/Units.js';
import { createEphemerisProvider } from '../src/science/EphemerisProvider.js';
import { derivarDatos } from '../src/ui/PlanetInfoPanel.js';
import { loadScientificPipeline, queryVisualStates,
  scientificPipelineEnabled, scientificStateToVisual } from '../src/integration/ScientificVisualPipeline.js';

const original = JSON.parse(readFileSync(new URL('../public/data/efemerides-2026.json', import.meta.url)));
const catalog = JSON.parse(readFileSync(new URL('../public/data/ephemerides-catalog-v1.json', import.meta.url)));
const jd = original.planetas.Tierra[0].jdTDB;
const read = async file => file.endsWith('ephemerides-catalog-v1.json') ? catalog : original;
const provider = () => createEphemerisProvider({ catalog, loadJson: read });

test('adaptador puro convierte km a escena y ficha sin modificar el estado científico', () => {
  const source = adaptHorizonsSample(original, 'Tierra', 0);
  const snapshot = JSON.stringify(source);
  const visual = scientificStateToVisual(source, '399');
  assert.ok(Math.abs(visual.posicionEscena.x - source.position.x * 32 / KM_PER_AU) < 1e-12);
  assert.ok(Math.abs(visual.posicionEscena.y - source.position.z * 32 / KM_PER_AU) < 1e-12);
  assert.ok(Math.abs(visual.posicionEscena.z + source.position.y * 32 / KM_PER_AU) < 1e-12);
  assert.ok(Math.abs(derivarDatos(visual).distanciaKm - Math.hypot(
    source.position.x, source.position.y, source.position.z)) < 1e-5);
  assert.ok(Math.abs(derivarDatos(visual).velocidadKmPorSegundo - Math.hypot(
    source.velocity.x, source.velocity.y, source.velocity.z)) < 1e-12);
  assert.equal(JSON.stringify(source), snapshot);
  assert.throws(() => { visual.posicionEscena.x = 0; }, TypeError);
  assert.throws(() => scientificStateToVisual(source, '499'), /Identidad inesperada/);
});

test('consultas del pipeline distinguen exacto, interpolado y ausencia atómica', async () => {
  const p = provider();
  const exact = await queryVisualStates(p, jd);
  assert.equal(exact.status, 'exact');
  assert.equal(Object.keys(exact.states).length, 8);
  assert.deepEqual(Object.keys(exact.states), Object.keys(HORIZONS_PLANETS));
  const interpolated = await queryVisualStates(p, jd + 0.5);
  assert.equal(interpolated.status, 'interpolated');
  assert.equal(interpolated.states.Tierra.scientificStatus, 'interpolated');
  await assert.rejects(queryVisualStates(p, jd - 1), /missing/);
  const conflictProvider = { getInterpolated: async id => id === '399'
    ? { status: 'conflict' } : { status: 'exact', state: adaptHorizonsSample(original,
      Object.keys(HORIZONS_PLANETS).find(name => HORIZONS_PLANETS[name] === id), 0) } };
  await assert.rejects(queryVisualStates(conflictProvider, jd), /conflict/);
});

test('activación por URL y lectura local bajo la base de GitHub Pages', async () => {
  assert.equal(scientificPipelineEnabled('?ephemeris=scientific'), true);
  assert.equal(scientificPipelineEnabled(''), false);
  assert.equal(scientificPipelineEnabled('?ephemeris=legacy'), false);
  const requested = [];
  const p = await loadScientificPipeline({ baseUrl: '/simulador-sondas-espaciales/',
    fetchImpl: async url => {
      requested.push(url);
      return { ok: true, json: async () => url.endsWith('ephemerides-catalog-v1.json')
        ? catalog : original };
    } });
  assert.equal((await queryVisualStates(p, jd)).status, 'exact');
  assert.deepEqual(requested, ['/simulador-sondas-espaciales/data/ephemerides-catalog-v1.json',
    '/simulador-sondas-espaciales/data/efemerides-2026.json']);
});
