import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HORIZONS_FRAME } from '../src/science/Frames.js';
import { createScientificState } from '../src/science/ScientificState.js';
import { secondsBetweenJdTdb } from '../src/science/Time.js';
import { interpolateHermiteState } from '../src/science/HermiteInterpolation.js';
import { createEphemerisProvider } from '../src/science/EphemerisProvider.js';
import { adaptHorizonsSample } from '../src/science/HorizonsEphemerides.js';

const jd0 = 2461314.5;
const day = 86400;
const original = JSON.parse(readFileSync(new URL('../public/data/efemerides-2026.json', import.meta.url)));
const earth = index => structuredClone(adaptHorizonsSample(original, 'Tierra', index));

function analytic(jd, p, v, id = 'fixture-analytic') {
  return createScientificState({ identity: { id, type: 'probe', origin: 'SUN_CENTER' },
    time: { jdTdb: jd, scale: 'TDB' },
    position: { x: p, y: p * 2, z: -p, unit: 'km' },
    velocity: { x: v, y: v * 2, z: -v, unit: 'km/s' },
    reference: HORIZONS_FRAME,
    provenance: { source: 'fixture analítico', sourceUrl: null, version: null,
      queriedAtUtc: null, precision: null, uncertainty: null, sourceMetadata: {} } });
}

function entry(id, states, cadenceSeconds = 86400) {
  const times = states.map(state => state.time.jdTdb);
  return { id, file: `data/${id}.json`, format: 'scientific-states-v1', formatVersion: 1,
    bodyIds: ['399'], coverage: { startJdTdb: Math.min(...times), endJdTdb: Math.max(...times) },
    cadenceSeconds, frameId: 'ICRF_ECLIPTIC_J2000', origin: 'SUN_CENTER',
    fileUnits: { position: 'km', velocity: 'km/s' },
    source: 'NASA/JPL Horizons', sourceVersion: null };
}

function provider(fixtures, cadences = {}) {
  return createEphemerisProvider({ catalog: { catalogVersion: 1,
    datasets: Object.entries(fixtures).map(([id, states]) => entry(id, states,
      Object.hasOwn(cadences, id) ? cadences[id] : 86400)) },
  loadJson: async file => ({ formatVersion: 1, states: fixtures[file.slice(5, -5)] }) });
}

test('Hermite conserva posición constante y velocidad nula', () => {
  const a = analytic(jd0, 12, 0);
  const b = analytic(jd0 + 1, 12, 0);
  for (const fraction of [0.1, 0.25, 0.5, 0.75, 0.9]) {
    const s = interpolateHermiteState(a, b, jd0 + fraction);
    assert.ok(Math.abs(s.position.x - 12) < 1e-12);
    assert.ok(Math.abs(s.velocity.x) < 1e-12);
    assert.equal(s.time.scale, 'TDB');
    assert.equal(s.reference.id, HORIZONS_FRAME.id);
  }
});

test('Hermite reproduce movimiento uniforme y ambos extremos exactamente', () => {
  const a = analytic(jd0, 100, 2);
  const b = analytic(jd0 + 1, 100 + 2 * day, 2);
  assert.deepEqual(interpolateHermiteState(a, b, jd0), a);
  assert.deepEqual(interpolateHermiteState(a, b, jd0 + 1), b);
  const middle = interpolateHermiteState(a, b, jd0 + 0.5);
  assert.ok(Math.abs(middle.position.x - (100 + day)) < 1e-8);
  assert.ok(Math.abs(middle.velocity.x - 2) < 1e-12);
  assert.equal(middle.provenance.source, 'Interpolación cúbica de Hermite');
  assert.equal(middle.provenance.precision, null);
});

test('Hermite reproduce un polinomio cúbico y su derivada con intervalos distintos', () => {
  for (const days of [0.5, 1, 2]) {
    const end = jd0 + days;
    const duration = secondsBetweenJdTdb(jd0, end);
    const p = u => 7 + 3 * u + 5 * u * u - 2 * u * u * u;
    const dp = u => (3 + 10 * u - 6 * u * u) / duration;
    const a = analytic(jd0, p(0), dp(0));
    const b = analytic(end, p(1), dp(1));
    for (const u of [0.125, 0.5, 0.875]) {
      const jd = jd0 + days * u;
      const actualU = secondsBetweenJdTdb(jd0, jd) / duration;
      const result = interpolateHermiteState(a, b, jd, { maxIntervalSeconds: 2 * day });
      assert.ok(Math.abs(result.position.x - p(actualU)) < 1e-12);
      assert.ok(Math.abs(result.velocity.x - dp(actualU)) < 1e-14);
      assert.ok(Number.isFinite(result.position.x));
    }
  }
});

test('la velocidad coincide con la derivada numérica de la posición y la curva es continua', () => {
  const a = analytic(jd0, 1e8, 10);
  const b = analytic(jd0 + 1, 1e8 + 500000, -5);
  const middle = jd0 + 0.5;
  const delta = 0.001;
  const left = interpolateHermiteState(a, b, middle - delta);
  const center = interpolateHermiteState(a, b, middle);
  const right = interpolateHermiteState(a, b, middle + delta);
  const derivative = (right.position.x - left.position.x)
    / secondsBetweenJdTdb(middle - delta, middle + delta);
  assert.ok(Math.abs(derivative - center.velocity.x) < 2e-4);
  assert.ok(left.position.x < center.position.x && center.position.x < right.position.x);
  const nearStart = interpolateHermiteState(a, b, jd0 + 1e-6);
  const nearEnd = interpolateHermiteState(a, b, jd0 + 1 - 1e-6);
  assert.ok(Math.abs(nearStart.position.x - a.position.x) < 2);
  assert.ok(Math.abs(nearEnd.position.x - b.position.x) < 2);
});

test('intervalo corto representable y coordenadas astronómicas grandes permanecen finitos', () => {
  const end = jd0 + 1 / day;
  const duration = secondsBetweenJdTdb(jd0, end);
  const a = analytic(jd0, 1e9, 12);
  const b = analytic(end, 1e9 + 12 * duration, 12);
  const estimate = interpolateHermiteState(a, b, jd0 + 0.5 / day,
    { maxIntervalSeconds: 2 });
  assert.ok(Number.isFinite(estimate.position.x));
  assert.ok(Math.abs(estimate.velocity.x - 12) < 1e-6);
});

test('comparación numérica con la forma expandida en posiciones grandes', () => {
  const firstJd = jd0;
  const lastJd = jd0 + 1 / day;
  const duration = secondsBetweenJdTdb(firstJd, lastJd);
  const p0 = 1e12;
  const p1 = p0 + 1000;
  const v = 1000 / duration;
  const first = analytic(firstJd, p0, v);
  const last = analytic(lastJd, p1, v);
  let oldMaxPosition = 0;
  let newMaxPosition = 0;
  let oldMaxVelocity = 0;
  let newMaxVelocity = 0;
  for (let n = 1; n < 20; n++) {
    const jd = firstJd + n * (lastJd - firstJd) / 20;
    if (jd === firstJd || jd === lastJd) continue;
    const u = secondsBetweenJdTdb(firstJd, jd) / duration;
    const u2 = u * u;
    const u3 = u2 * u;
    const oldPosition = (2 * u3 - 3 * u2 + 1) * p0
      + (u3 - 2 * u2 + u) * duration * v
      + (-2 * u3 + 3 * u2) * p1
      + (u3 - u2) * duration * v;
    const oldVelocity = ((6 * u2 - 6 * u) * p0
      + (3 * u2 - 4 * u + 1) * duration * v
      + (-6 * u2 + 6 * u) * p1
      + (3 * u2 - 2 * u) * duration * v) / duration;
    const improved = interpolateHermiteState(first, last, jd, { maxIntervalSeconds: 2 });
    const expectedPosition = p0 + 1000 * u;
    oldMaxPosition = Math.max(oldMaxPosition, Math.abs(oldPosition - expectedPosition));
    newMaxPosition = Math.max(newMaxPosition, Math.abs(improved.position.x - expectedPosition));
    oldMaxVelocity = Math.max(oldMaxVelocity, Math.abs(oldVelocity - v));
    newMaxVelocity = Math.max(newMaxVelocity, Math.abs(improved.velocity.x - v));
  }
  console.log(`NUMERIC old/new position ${oldMaxPosition}/${newMaxPosition} km; velocity ${oldMaxVelocity}/${newMaxVelocity} km/s`);
  assert.ok(newMaxPosition <= oldMaxPosition);
  assert.ok(newMaxVelocity <= oldMaxVelocity);
});

test('rechaza extrapolación, orden, identidad, origen, marco y componentes inválidos', () => {
  const a = analytic(jd0, 0, 0);
  const b = analytic(jd0 + 1, 1, 0);
  assert.throws(() => interpolateHermiteState(a, b, jd0 - 0.1), /extrapolar/);
  assert.throws(() => interpolateHermiteState(b, a, jd0 + 0.5), /crecientes/);
  assert.throws(() => interpolateHermiteState(a, a, jd0), /distintos/);
  assert.throws(() => interpolateHermiteState(a, b, jd0 + 0.5, { maxIntervalSeconds: 100 }), /excede/);
  assert.throws(() => interpolateHermiteState(a, analytic(jd0 + 1, 1, 0, 'otro'), jd0 + 0.5), /mismo cuerpo/);
  const wrongOrigin = structuredClone(b);
  wrongOrigin.identity.origin = 'EARTH_CENTER';
  assert.throws(() => interpolateHermiteState(a, wrongOrigin, jd0 + 0.5), /origin/);
  const wrongFrame = structuredClone(b);
  wrongFrame.reference.id = 'otro';
  assert.throws(() => interpolateHermiteState(a, wrongFrame, jd0 + 0.5), /reference.id/);
  const nonfinite = structuredClone(b);
  nonfinite.position.x = Infinity;
  assert.throws(() => interpolateHermiteState(a, nonfinite, jd0 + 0.5), /position.x/);
});

test('proveedor distingue exacto, interpolado, ausente y preserva muestras', async () => {
  const source = [earth(0), earth(1)];
  const snapshot = JSON.stringify(source);
  const p = provider({ first: source });
  const exact = await p.getInterpolated('399', jd0);
  assert.equal(exact.status, 'exact');
  assert.equal((await p.getExact('399', jd0 + 0.5)).status, 'missing');
  const middle = await p.getInterpolated('399', jd0 + 0.5);
  assert.equal(middle.status, 'interpolated');
  assert.equal(middle.algorithm, 'cubic-hermite');
  assert.equal(middle.samples.length, 2);
  assert.equal(middle.state.provenance.sourceMetadata.firstDatasetId, 'first');
  assert.equal(middle.state.time.jdTdb, jd0 + 0.5);
  assert.equal((await p.getInterpolated('399', jd0 - 1)).reason, 'outside_coverage');
  assert.equal(JSON.stringify(source), snapshot);
});

test('huecos, cadencia irregular y límite temporal requieren política explícita', async () => {
  const gap = provider({ gap: [earth(0), earth(2)] });
  assert.equal((await gap.getInterpolated('399', jd0 + 1, { maxIntervalSeconds: 2 * day }))
    .reason, 'gap_requires_authorization');
  const allowed = await gap.getInterpolated('399', jd0 + 1,
    { maxIntervalSeconds: 2 * day, allowGap: true });
  assert.equal(allowed.status, 'interpolated');
  assert.equal(allowed.warnings.length, 1);
  assert.equal((await gap.getInterpolated('399', jd0 + 1)).reason, 'interval_exceeds_limit');
  const irregular = provider({ irregular: [earth(0), earth(2)] }, { irregular: null });
  assert.equal((await irregular.getInterpolated('399', jd0 + 1, { maxIntervalSeconds: 2 * day }))
    .reason, 'irregular_sampling_requires_authorization');
  assert.equal((await irregular.getInterpolated('399', jd0 + 1,
    { maxIntervalSeconds: 2 * day, allowIrregular: true })).status, 'interpolated');
});

test('conflictos y solapamientos ambiguos no producen estimaciones silenciosas', async () => {
  const altered = earth(1);
  altered.position.x += 1;
  const conflict = provider({ a: [earth(0), earth(1)], b: [altered, earth(2)] });
  const result = await conflict.getInterpolated('399', jd0 + 0.5);
  assert.equal(result.status, 'conflict');
  assert.equal(result.reason, 'conflicting_endpoint');
  const selected = await conflict.getInterpolated('399', jd0 + 0.5, { datasetId: 'a' });
  assert.equal(selected.status, 'interpolated');
  const shifted = earth(2);
  shifted.position.x += 1;
  const ambiguous = provider({ a: [earth(0), earth(2)], b: [earth(0), shifted] });
  assert.equal((await ambiguous.getInterpolated('399', jd0 + 1,
    { maxIntervalSeconds: 2 * day, allowGap: true })).reason, 'ambiguous_overlap');
});

test('regresión interna: muestras retenidas de los ocho planetas, intervalos de 2 días', () => {
  const limits = {
    Mercurio: [200, 8e-5], Venus: [4, 3e-7],
    Tierra: [2, 1e-6], Marte: [0.1, 1e-7],
    Jupiter: [70, 7e-4], Saturno: [2, 2e-5],
    Urano: [5, 3e-5], Neptuno: [5, 2e-5]
  };
  for (const [name, [positionLimit, velocityLimit]] of Object.entries(limits)) {
    const rows = original.planetas[name];
    let maxPosition = 0;
    let maxVelocity = 0;
    for (let middle = 1; middle < rows.length - 1; middle += 2) {
      const reference = adaptHorizonsSample(original, name, middle);
      const estimate = interpolateHermiteState(
        adaptHorizonsSample(original, name, middle - 1),
        adaptHorizonsSample(original, name, middle + 1), reference.time.jdTdb,
        { maxIntervalSeconds: 2 * day });
      const position = Math.hypot(...['x', 'y', 'z'].map(axis =>
        estimate.position[axis] - reference.position[axis]));
      const velocity = Math.hypot(...['x', 'y', 'z'].map(axis =>
        estimate.velocity[axis] - reference.velocity[axis]));
      maxPosition = Math.max(maxPosition, position);
      maxVelocity = Math.max(maxVelocity, velocity);
      assert.ok(position <= positionLimit, `${name} JD ${reference.time.jdTdb}: ${position} km`);
      assert.ok(velocity <= velocityLimit, `${name} JD ${reference.time.jdTdb}: ${velocity} km/s`);
    }
    console.log(`RESIDUAL ${name} 2d ${maxPosition} km ${maxVelocity} km/s`);
  }
});
