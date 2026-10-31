import test from 'node:test';
import assert from 'node:assert/strict';
import { HORIZONS_FRAME, eclipticToSceneAxes, sceneToEclipticAxes } from '../src/science/Frames.js';
import { createScientificState } from '../src/science/ScientificState.js';

function validInput() {
  return {
    identity: { id: '399', type: 'planet', origin: 'SUN_CENTER' },
    time: { jdTdb: 2461314.5, scale: 'TDB' },
    position: { x: 100, y: -200, z: 0, unit: 'km' },
    velocity: { x: 0, y: 1, z: -2, unit: 'km/s' },
    reference: { ...HORIZONS_FRAME },
    provenance: { source: 'NASA/JPL Horizons', sourceUrl: 'https://example.test',
      version: null, queriedAtUtc: '2026-10-10T00:00:00Z', precision: null,
      uncertainty: null, sourceMetadata: { centro: 'Sol (500@10)' } }
  };
}

test('estado conserva identidad, unidades, marco, época y procedencia sin mutar la entrada', () => {
  const input = validInput();
  const state = createScientificState(input);
  assert.deepEqual(state.identity, input.identity);
  assert.deepEqual(state.time, input.time);
  assert.equal(state.position.unit, 'km');
  assert.equal(state.velocity.unit, 'km/s');
  assert.equal(state.reference.id, 'ICRF_ECLIPTIC_J2000');
  assert.equal(state.reference.originCode, '500@10');
  assert.equal(state.provenance.precision, null);
  assert.equal(state.provenance.sourceMetadata.centro, 'Sol (500@10)');
  input.position.x = 999;
  input.provenance.sourceMetadata.centro = 'otro';
  assert.equal(state.position.x, 100);
  assert.equal(state.provenance.sourceMetadata.centro, 'Sol (500@10)');
  assert.ok(Object.isFrozen(state.position));
  assert.ok(Object.isFrozen(state.provenance.sourceMetadata));
});

test('contrato rechaza componentes, unidades, marco, origen y procedencia inválidos', () => {
  for (const [mutate, pattern] of [
    [s => { delete s.position.z; }, /position.z/],
    [s => { s.velocity.x = NaN; }, /velocity.x/],
    [s => { s.position.unit = 'AU'; }, /position.unit/],
    [s => { s.velocity.unit = 'AU\/dia'; }, /velocity.unit/],
    [s => { s.identity.origin = 'SOLAR_SYSTEM_BARYCENTER'; }, /identity.origin/],
    [s => { s.reference.id = 'ICRF_EQUATORIAL'; }, /reference.id/],
    [s => { s.reference.originCode = '500@0'; }, /reference.origin/],
    [s => { s.time.scale = 'UTC'; }, /time.scale/],
    [s => { s.provenance.source = ''; }, /provenance.source/],
    [s => { delete s.provenance.precision; }, /provenance.precision/]
  ]) {
    const input = validInput();
    mutate(input);
    assert.throws(() => createScientificState(input), pattern);
  }
});

test('rotación de ejes coincide con la escena y conserva distancias', () => {
  const ecliptic = { x: 3, y: -4, z: 12 };
  const scene = eclipticToSceneAxes(ecliptic);
  assert.deepEqual(scene, { x: 3, y: 12, z: 4 });
  assert.deepEqual(sceneToEclipticAxes(scene), ecliptic);
  assert.equal(Math.hypot(ecliptic.x, ecliptic.y, ecliptic.z), 13);
  assert.equal(Math.hypot(scene.x, scene.y, scene.z), 13);
  assert.deepEqual(ecliptic, { x: 3, y: -4, z: 12 });
  assert.throws(() => eclipticToSceneAxes({ x: 1, y: Infinity, z: 2 }), /vector.y/);
});
