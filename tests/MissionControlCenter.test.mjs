import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateMoonDataset, queryMoon } from '../src/science/PlanetaryMoons.js';
import { advanceJdTdb, gregorianTimestampToJdTdb } from '../src/science/Time.js';
import { PRESETS } from '../src/lab/ProbeDesign.js';
import { calculateLunarTransfer, EARTH_MU_KM3_S2, MOON_MU_KM3_S2, EARTH_RADIUS_KM, MOON_RADIUS_KM } from '../src/lab/MissionPhysics.js';
import { evaluateMission } from '../src/lab/MissionEngineering.js';
import { designSignature } from '../src/lab/MissionPlanStore.js';
import { createMissionExecution, createPlaybackClock, sampleMissionExecution } from '../src/lab/MissionPlayback.js';
import { deriveMissionTelemetry } from '../src/lab/MissionTelemetry.js';
import { MISSION_CAMERA_MODES, missionCameraPose } from '../src/lab/MissionExecutionView.js';

const dataset = validateMoonDataset(JSON.parse(readFileSync(new URL('../public/data/moons-2026-10.json', import.meta.url), 'utf8')), { isolate: true }).data;
const departureJd = gregorianTimestampToJdTdb('2026-10-15 12:00');
const options = { destination: 'moon', objective: 'approach', altitudeKm: 100000,
  targetDistanceKm: 50000, departureTdb: '2026-10-15T12:00' };

function fixture({ flyby = false } = {}) {
  const design = PRESETS[1].create();
  const settings = flyby ? { ...options, objective: 'flyby', altitudeKm: 60000, targetDistanceKm: 20000 } : options;
  const transfer = calculateLunarTransfer({ dataset, departureJd, altitudeKm: settings.altitudeKm,
    target: settings.objective, targetDistanceKm: settings.targetDistanceKm });
  const evaluation = evaluateMission(design, transfer);
  const result = { transfer, evaluation, designId: design.id, designSignature: designSignature(design),
    options: JSON.stringify(settings), modelVersion: transfer.model };
  return { design, result, execution: createMissionExecution({ result, design, dataset, name: 'Ensayo lunar' }) };
}
const close = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected}`);
const vectorError = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
function independentMidpoint(start, end) {
  const derivative = (t, state) => {
    const moon = queryMoon(dataset, 'Luna', advanceJdTdb(departureJd, t));
    const earthR = Math.hypot(...state.slice(0, 3));
    const relative = state.slice(0, 3).map((x, i) => x - moon.positionKm[i]);
    const moonR = Math.hypot(...relative);
    return [...state.slice(3), ...relative.map((x, i) =>
      -EARTH_MU_KM3_S2 * state[i] / earthR ** 3 - MOON_MU_KM3_S2 * x / moonR ** 3
      - MOON_MU_KM3_S2 * moon.positionKm[i] / moon.distanceKm ** 3)];
  };
  const midpoint = (start.elapsedSeconds + end.elapsedSeconds) / 2;
  const steps = Math.max(12, Math.ceil((midpoint - start.elapsedSeconds) / 60));
  const h = (midpoint - start.elapsedSeconds) / steps;
  let state = [...start.positionKm, ...start.velocityKmS];
  const add = (s, k, scale) => s.map((x, i) => x + k[i] * scale);
  for (let i = 0; i < steps; i++) {
    const t = start.elapsedSeconds + i * h;
    const k1 = derivative(t, state), k2 = derivative(t + h / 2, add(state, k1, h / 2));
    const k3 = derivative(t + h / 2, add(state, k2, h / 2)), k4 = derivative(t + h, add(state, k3, h));
    state = state.map((x, j) => x + h * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]) / 6);
  }
  return { midpoint, positionKm: state.slice(0, 3), velocityKmS: state.slice(3) };
}

test('inyección: estado previo y posterior comparten posición y época, pero no velocidad ni masa', () => {
  const { execution } = fixture();
  const before = sampleMissionExecution(execution, 0, { side: 'pre' });
  const after = sampleMissionExecution(execution, 0, { side: 'post' });
  assert.deepEqual(before.positionKm, after.positionKm);
  close(before.jdTdb, after.jdTdb);
  close(vectorError(before.velocityKmS, after.velocityKmS) * 1000, execution.transfer.departureDeltaVMS, 1e-4);
  const maneuver = execution.evaluation.budget.maneuvers[0];
  close(before.massKg, maneuver.massBeforeKg);
  close(after.massKg, maneuver.massAfterKg);
  close(before.fuelKg - after.fuelKg, maneuver.fuelConsumedKg);
  close(after.massKg - after.fuelKg, execution.evaluation.engineering.dryMassKg);
  assert.equal(before.maneuverState, 'pendiente');
  assert.equal(after.maneuverState, 'impulso ideal aplicado');
});

test('reproducción determinista: pausa, velocidad, búsqueda, retroceso y consumo único', () => {
  const { execution } = fixture();
  const clock = createPlaybackClock(execution.durationSeconds);
  assert.equal(clock.snapshot().beforeManeuver, true);
  clock.play(); clock.advance(2);
  assert.equal(clock.snapshot().elapsedSeconds, 7200);
  const first = sampleMissionExecution(execution, clock.snapshot().elapsedSeconds);
  clock.pause(); clock.advance(100);
  assert.equal(clock.snapshot().elapsedSeconds, 7200);
  clock.setRate(600); clock.play(); clock.advance(3);
  assert.equal(clock.snapshot().elapsedSeconds, 9000);
  clock.setDirection(-1); clock.advance(3);
  assert.equal(clock.snapshot().elapsedSeconds, 7200);
  assert.deepEqual(sampleMissionExecution(execution, clock.snapshot().elapsedSeconds), first);
  clock.seek(0, { side: 'pre' });
  assert.equal(sampleMissionExecution(execution, 0, { side: 'pre' }).fuelConsumedKg, 0);
  clock.seek(0, { side: 'post' });
  close(sampleMissionExecution(execution, 0).fuelConsumedKg, first.fuelConsumedKg);
  clock.seek(execution.durationSeconds);
  assert.equal(clock.snapshot().finished, true);
  clock.reset(); assert.equal(clock.snapshot().beforeManeuver, true);
  assert.throws(() => clock.seek(execution.durationSeconds + 1), /fuera/);
  assert.throws(() => sampleMissionExecution(execution, -1), /fuera/);
});

test('interpolación Hermite reproduce los nudos y se compara con RK4 independiente en medio de un tramo', () => {
  const { execution } = fixture();
  const knots = execution.transfer.trajectory;
  const a = knots[Math.floor(knots.length * 0.55)], b = knots[Math.floor(knots.length * 0.55) + 1];
  for (const knot of [a, b]) {
    const sample = sampleMissionExecution(execution, knot.elapsedSeconds);
    assert.ok(vectorError(sample.positionKm, knot.positionKm) < 1e-8);
    assert.ok(vectorError(sample.velocityKmS, knot.velocityKmS) < 1e-9);
  }
  // Integración RK4 independiente desde un nudo hasta el punto medio.
  const reference = independentMidpoint(a, b);
  const interpolated = sampleMissionExecution(execution, reference.midpoint);
  assert.ok(vectorError(interpolated.positionKm, reference.positionKm) < 0.2);
  assert.ok(vectorError(interpolated.velocityKmS, reference.velocityKmS) < 0.0001);
});

test('Hermite cerca de la aproximación lunar coincide con una integración RK4 independiente', () => {
  const { execution } = fixture({ flyby: true });
  const knots = execution.transfer.trajectory;
  const nearest = knots.findIndex(point => point.elapsedSeconds >= execution.transfer.closestApproach.elapsedSeconds);
  const index = Math.max(0, Math.min(knots.length - 2, nearest - 1));
  const reference = independentMidpoint(knots[index], knots[index + 1]);
  const interpolated = sampleMissionExecution(execution, reference.midpoint);
  assert.ok(vectorError(interpolated.positionKm, reference.positionKm) < 0.2);
  assert.ok(vectorError(interpolated.velocityKmS, reference.velocityKmS) < 0.0001);
});

test('telemetría distingue estados, distancias, recursos y energía estimada', () => {
  const { execution } = fixture();
  const sample = sampleMissionExecution(execution, execution.durationSeconds / 2);
  const telemetry = deriveMissionTelemetry(execution, sample);
  assert.equal(telemetry.missionName, 'Ensayo lunar');
  assert.deepEqual(telemetry.propagated.positionKm, sample.positionKm);
  close(telemetry.derived.earthDistanceKm - telemetry.derived.earthAltitudeKm, EARTH_RADIUS_KM);
  close(telemetry.derived.lunarDistanceKm - telemetry.derived.lunarAltitudeKm, MOON_RADIUS_KM);
  close(telemetry.resources.massKg - telemetry.resources.fuelKg, telemetry.resources.dryMassKg);
  assert.equal(telemetry.energyEstimate.batteryChargeWh, null);
  assert.equal(telemetry.missionSuccess, null);
  assert.deepEqual(sampleMissionExecution(execution, sample.elapsedSeconds), sample);
});

test('las cinco cámaras calculan encuadres sin alterar posición, velocidad ni FOV', () => {
  const { execution } = fixture();
  const sample = sampleMissionExecution(execution, execution.durationSeconds * 0.7);
  const copy = structuredClone(sample);
  const onboard = missionCameraPose('onboard', sample, execution, { lookTarget: 'moon', aspect: 1.5, fov: 46 });
  close(onboard.position.x, sample.positionKm[0] / 10000);
  close(onboard.position.y, sample.positionKm[2] / 10000);
  close(onboard.position.z, -sample.positionKm[1] / 10000);
  for (const mode of MISSION_CAMERA_MODES) {
    const pose = missionCameraPose(mode, sample, execution, { aspect: 1.5, fov: 46 });
    assert.ok([...pose.position, ...pose.target].every(Number.isFinite));
  }
  const overviewWide = missionCameraPose('overview', sample, execution, { aspect: 1.5, fov: 46 });
  const overviewNarrow = missionCameraPose('overview', sample, execution, { aspect: 0.5, fov: 46 });
  assert.ok(overviewNarrow.position.distanceTo(overviewNarrow.target) > overviewWide.position.distanceTo(overviewWide.target));
  assert.deepEqual(sample, copy);
});

test('sobrevuelo: eventos calculados, distancia mínima y límite de trayectoria', () => {
  const { execution } = fixture({ flyby: true });
  assert.equal(execution.events[0].id, 'parking');
  assert.equal(execution.events[1].id, 'injection');
  assert.ok(execution.events.some(event => event.id === 'closest'));
  assert.ok(execution.events.every((event, index) => index === 0 || event.elapsedSeconds >= execution.events[index - 1].elapsedSeconds));
  const closest = execution.events.find(event => event.id === 'closest');
  const sample = sampleMissionExecution(execution, closest.elapsedSeconds);
  close(sample.lunarDistanceKm, execution.transfer.closestApproach.distanceKm, 0.01);
  assert.equal(deriveMissionTelemetry(execution, sample).objectiveReached, true);
  assert.throws(() => sampleMissionExecution(execution, execution.durationSeconds + 1), /fuera/);
});

test('plan alterado, maniobra insuficiente y efeméride sin cobertura impiden ejecutar', () => {
  const { design, result } = fixture();
  const changed = structuredClone(design);
  changed.parts.find(part => part.socketId === 'tank').fuelKg -= 1;
  assert.throws(() => createMissionExecution({ result, design: changed, dataset }), /obsoleta/);
  const insufficient = { ...result, evaluation: { ...result.evaluation, status: 'INSUFICIENTE' } };
  assert.throws(() => createMissionExecution({ result: insufficient, design, dataset }), /no es viable/);
  const limited = structuredClone(dataset);
  limited.moons.Luna.rows = limited.moons.Luna.rows.slice(0, 2);
  assert.throws(() => createMissionExecution({ result, design, dataset: limited }), /cobertura/);
});
