import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateMoonDataset } from '../src/science/PlanetaryMoons.js';
import { gregorianTimestampToJdTdb } from '../src/science/Time.js';
import { PRESETS } from '../src/lab/ProbeDesign.js';
import { STANDARD_GRAVITY_M_S2 } from '../src/lab/ProbeEngineering.js';
import { calculateLunarTransfer, EARTH_MU_KM3_S2, restrictedDerivative } from '../src/lab/MissionPhysics.js';
import { createPlaybackClock } from '../src/lab/MissionPlayback.js';
import {
  G0_M_S2, FiniteThrustError, accelerationKmS2, kmS2ToMS2, massFlowKgS, propagateFiniteThrust, thrustDirectionUnit,
  tsiolkovskyDeltaVMS, validateBurnSchedule, exhaustVelocityMS
} from '../src/lab/FiniteThrustDynamics.js';
import {
  calculateFiniteThrustManeuver, getPropulsionSystem, isFiniteThrustResultCurrent, normalizeFiniteThrustOptions
} from '../src/lab/FiniteThrustPlan.js';
import { createFiniteThrustExecution, deriveFiniteThrustTelemetry, sampleFiniteThrustExecution } from '../src/lab/FiniteThrustPlayback.js';

const dataset = validateMoonDataset(JSON.parse(readFileSync(new URL('../public/data/moons-2026-10.json', import.meta.url), 'utf8')), { isolate: true }).data;
const departureJd = gregorianTimestampToJdTdb('2026-10-15 12:00');
const near = (actual, expected, tolerance, label = '') => assert.ok(Math.abs(actual - expected) <= tolerance, `${label} ${actual} ≠ ${expected} (±${tolerance})`);
const vecErr = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));
const baseOptions = (burns, extra = {}) => ({ altitudeKm: 100000, departureTdb: '2026-10-15T12:00', phaseDeg: 0, horizonSeconds: 4 * 86400, burns, ...extra });
const chemicalBurn = (extra = {}) => ({ startSeconds: 3600, durationSeconds: 300, throttle: 1, direction: { type: 'prograde' }, ...extra });
const freeSpace = (t, s, out) => { out[0] = s[3]; out[1] = s[4]; out[2] = s[5]; out[3] = 0; out[4] = 0; out[5] = 0; };
const twoBody = (t, s, out) => {
  const r = Math.hypot(s[0], s[1], s[2]); out[0] = s[3]; out[1] = s[4]; out[2] = s[5];
  for (let i = 0; i < 3; i++) out[i + 3] = -EARTH_MU_KM3_S2 * s[i] / r ** 3;
};
const ENGINE = { thrustN: 1000, ispS: 300 };

// ---- Unidades y constantes -----------------------------------------------------------
test('conversiones N→km/s², caudal másico y g0 explícitas y coherentes', () => {
  assert.equal(G0_M_S2, 9.80665);
  assert.equal(G0_M_S2, STANDARD_GRAVITY_M_S2); // misma constante que la ingeniería de 12A
  near(accelerationKmS2(1, 1), 1e-3, 1e-18); // 1 N sobre 1 kg = 1 m/s² = 1e-3 km/s²
  near(accelerationKmS2(650, 561), 650 / 561 / 1000, 1e-18);
  near(kmS2ToMS2(accelerationKmS2(650, 561)), 650 / 561, 1e-12);
  near(massFlowKgS(650, 310), 650 / (310 * 9.80665), 1e-15); // dm/dt = F/(Isp·g0)
  near(exhaustVelocityMS(310), 310 * 9.80665, 1e-12);
  near(tsiolkovskyDeltaVMS(300, 1000, 500), 300 * 9.80665 * Math.log(2), 1e-9);
});

// ---- Dirección del empuje --------------------------------------------------------------
test('direcciones orbitales y degenerados', () => {
  const r = [7000, 0, 0], v = [0, 7.5, 0];
  const u = d => Array.from(thrustDirectionUnit(typeof d === 'string' ? { type: d } : d, r, v));
  assert.deepEqual(u('prograde'), [0, 1, 0]);
  assert.deepEqual(u('retrograde'), [-0, -1, -0]);
  assert.deepEqual(u('radial-out'), [1, 0, 0]);
  assert.deepEqual(u('radial-in'), [-1, -0, -0]);
  assert.deepEqual(u('normal'), [0, 0, 1]); // ĥ = r×v
  assert.deepEqual(u('antinormal'), [-0, -0, -1]);
  assert.deepEqual(u({ type: 'inertial', vector: [0, 0, 5] }), [0, 0, 1]);
  assert.throws(() => thrustDirectionUnit({ type: 'normal' }, [7000, 0, 0], [1, 0, 0]), error => error.code === 'DEGENERATE_DIRECTION');
  assert.throws(() => thrustDirectionUnit({ type: 'prograde' }, r, [0, 0, 0]), /Velocidad orbital nula/);
  assert.throws(() => thrustDirectionUnit({ type: 'radial-out' }, [0, 0, 0], v), /Radio orbital nulo/);
  assert.throws(() => thrustDirectionUnit({ type: 'inertial', vector: [0, 0, 0] }), /vector finito no nulo/);
  assert.throws(() => thrustDirectionUnit({ type: 'diagonal' }, r, v), /desconocida/);
});

test('la dirección orbital cambia durante el vuelo y la inercial no', () => {
  // Órbita circular: tras un cuarto de periodo el progrado gira 90°; un vector inercial permanece fijo.
  const speed = Math.sqrt(EARTH_MU_KM3_S2 / 7000);
  const run = direction => propagateFiniteThrust({ gravityDerivative: twoBody, initialPositionKm: [7000, 0, 0], initialVelocityKmS: [0, speed, 0],
    initialMassKg: 1000, dryMassKg: 500, engine: { thrustN: 10, ispS: 300 }, endSeconds: 600,
    burns: [{ startSeconds: 0, durationSeconds: 600, throttle: 1, direction }] });
  const orbital = run({ type: 'prograde' }), inertial = run({ type: 'inertial', vector: [0, 1, 0] });
  assert.notDeepEqual(orbital.final.velocityKmS, inertial.final.velocityKmS);
  near(orbital.final.massKg, inertial.final.massKg, 1e-9);
});

// ---- Validación ----------------------------------------------------------------------------
test('validación rechaza parámetros no físicos y solapes', () => {
  const ok = chemicalBurn();
  assert.deepEqual(validateBurnSchedule([ok], { endSeconds: 86400, engine: ENGINE }), []);
  const bad = burn => validateBurnSchedule([burn], { endSeconds: 86400, engine: ENGINE }).join(' ');
  assert.match(bad({ ...ok, durationSeconds: 0 }), /duración mínima/);
  assert.match(bad({ ...ok, durationSeconds: Number.NaN }), /duración mínima/);
  assert.match(bad({ ...ok, throttle: 0 }), /acelerador/);
  assert.match(bad({ ...ok, throttle: 1.5 }), /acelerador/);
  assert.match(bad({ ...ok, startSeconds: -1 }), /inicio inválido/);
  assert.match(bad({ ...ok, startSeconds: 86000, durationSeconds: 1000 }), /horizonte/);
  assert.match(bad({ ...ok, direction: { type: 'inertial', vector: [0, 0, 0] } }), /vector inercial/);
  assert.match(bad({ ...ok, direction: { type: 'diagonal' } }), /dirección/);
  const overlap = validateBurnSchedule([ok, { ...ok, startSeconds: 3700 }], { endSeconds: 86400, engine: ENGINE }).join(' ');
  assert.match(overlap, /simultáneos o solapados/);
  assert.match(validateBurnSchedule([ok], { endSeconds: 86400, engine: null }).join(' '), /sin un motor/);
  assert.match(validateBurnSchedule(Array.from({ length: 9 }, (_, i) => chemicalBurn({ startSeconds: i * 1000 })), { endSeconds: 86400, engine: ENGINE }).join(' '), /máximo/);
  const base = { gravityDerivative: freeSpace, initialPositionKm: [7000, 0, 0], initialVelocityKmS: [0, 7.5, 0], engine: ENGINE, endSeconds: 600, burns: [] };
  assert.throws(() => propagateFiniteThrust({ ...base, initialMassKg: 400, dryMassKg: 500 }), error => error.code === 'INVALID_MASS'); // masa < seca
  assert.throws(() => propagateFiniteThrust({ ...base, initialMassKg: -5, dryMassKg: 500 }), error => error.code === 'INVALID_MASS');
  assert.throws(() => propagateFiniteThrust({ ...base, initialMassKg: Number.NaN, dryMassKg: 500 }), error => error.code === 'INVALID_MASS');
  assert.throws(() => propagateFiniteThrust({ ...base, initialMassKg: 600, dryMassKg: 500, burns: [{ ...ok, startSeconds: 0, durationSeconds: 600, id: 'a' }, { ...ok, startSeconds: 100, durationSeconds: 100 }] }), error => error.code === 'INVALID_SCHEDULE');
});

// ---- Caso A: sin empuje ----------------------------------------------------------------------
test('Caso A: sin empuje reproduce la propagación gravitacional anterior (DOPRI54, modelo lunar)', () => {
  const transfer = calculateLunarTransfer({ dataset, departureJd, altitudeKm: 100000, target: 'approach', targetDistanceKm: 50000 });
  const run = propagateFiniteThrust({ gravityDerivative: restrictedDerivative(dataset, departureJd), initialPositionKm: transfer.initialPositionKm,
    initialVelocityKmS: transfer.initialVelocityKmS, initialMassKg: 561, dryMassKg: 371, engine: null, burns: [], endSeconds: transfer.flightSeconds });
  // Tolerancia: el control de error de 8 componentes difiere ligeramente del de 6; ambas con relTol 1e-11 (~µm a 4e5 km).
  assert.ok(vecErr(run.final.positionKm, transfer.arrivalPositionKm) < 1e-3, `posición ${vecErr(run.final.positionKm, transfer.arrivalPositionKm)} km`);
  assert.ok(vecErr(run.final.velocityKmS, transfer.arrivalVelocityKmS) < 1e-8);
  assert.equal(run.final.massKg, 561); // conservación de masa sin propulsión
  assert.equal(run.final.integratedDeltaVMS, 0);
  assert.equal(run.burns.length, 0);
});

test('Caso A (analítico): órbita circular kepleriana vuelve a su estado tras un período', () => {
  const radius = 7000, speed = Math.sqrt(EARTH_MU_KM3_S2 / radius), period = 2 * Math.PI * Math.sqrt(radius ** 3 / EARTH_MU_KM3_S2);
  const run = propagateFiniteThrust({ gravityDerivative: twoBody, initialPositionKm: [radius, 0, 0], initialVelocityKmS: [0, speed, 0],
    initialMassKg: 800, dryMassKg: 500, engine: null, burns: [], endSeconds: period });
  assert.ok(vecErr(run.final.positionKm, [radius, 0, 0]) < 1e-4, `posición ${vecErr(run.final.positionKm, [radius, 0, 0])} km`);
  assert.ok(vecErr(run.final.velocityKmS, [0, speed, 0]) < 1e-7);
  assert.equal(run.final.massKg, 800);
});

// ---- Caso B y C: sin gravedad, Tsiolkovsky -----------------------------------------------------
function freeRun({ duration = 600, thrustN = 1000, ispS = 300, m0 = 1000, dry = 500, throttle = 1 } = {}) {
  return propagateFiniteThrust({ gravityDerivative: freeSpace, initialPositionKm: [7000, 0, 0], initialVelocityKmS: [0, 0, 0],
    initialMassKg: m0, dryMassKg: dry, engine: { thrustN, ispS }, endSeconds: duration + 100,
    burns: [{ startSeconds: 0, durationSeconds: duration, throttle, direction: { type: 'inertial', vector: [1, 0, 0] } }] });
}
test('Caso B: empuje constante sin gravedad coincide con la solución analítica (masa, velocidad, posición)', () => {
  const duration = 600, F = 1000, isp = 300, m0 = 1000;
  const run = freeRun({ duration }), ve = isp * G0_M_S2, flow = F / ve;
  const m1 = m0 - flow * duration;
  const atBurnEnd = run.knots.find(k => Math.abs(k.elapsedSeconds - duration) < 1e-9);
  near(atBurnEnd.massKg, m1, 1e-9, 'masa');
  near(atBurnEnd.velocityKmS[0] * 1000, ve * Math.log(m0 / m1), 1e-6, 'velocidad (m/s)');
  const x = ve * (duration - (m1 / flow) * Math.log(m0 / m1)); // m
  near((atBurnEnd.positionKm[0] - 7000) * 1000, x, 1e-3, 'posición (m)');
  // Después del apagado: deriva rectilínea uniforme sin variación de masa.
  near(run.final.massKg, m1, 1e-9);
  near(run.final.velocityKmS[0] * 1000, ve * Math.log(m0 / m1), 1e-6);
  near((run.final.positionKm[0] - atBurnEnd.positionKm[0]) * 1000, atBurnEnd.velocityKmS[0] * 1000 * 100, 1e-3);
  assert.ok(Math.abs(run.final.velocityKmS[1]) < 1e-12 && Math.abs(run.final.velocityKmS[2]) < 1e-12);
});

test('Caso C: Tsiolkovsky — Δv integrado numéricamente = Isp·g0·ln(m0/mf), con aceleración creciente', () => {
  for (const [thrustN, ispS, duration] of [[1000, 300, 600], [650, 310, 300], [0.04, 2500, 86400]]) {
    const m0 = 1000, run = freeRun({ thrustN, ispS, duration, m0, dry: 1 });
    const burn = run.burns[0];
    const expected = ispS * G0_M_S2 * Math.log(m0 / burn.massAfterKg);
    near(burn.propulsiveDeltaVIntegratedMS, expected, 1e-7 * Math.max(1, expected), `Δv integrado ${thrustN} N`);
    near(burn.propulsiveDeltaVMS, expected, 1e-9 * Math.max(1, expected));
    near(burn.massAfterKg, m0 - massFlowKgS(thrustN, ispS) * duration, 1e-9);
    assert.ok(burn.massResidualKg < 1e-9);
  }
});

// ---- Caso F: combustible insuficiente ---------------------------------------------------------
test('Caso F: el motor se apaga exactamente al agotarse el propelente y continúa el vuelo balístico', () => {
  const m0 = 520, dry = 500, isp = 300, F = 1000, ve = isp * G0_M_S2, flow = F / ve;
  const run = freeRun({ duration: 600, m0, dry, thrustN: F, ispS: isp });
  const burn = run.burns[0];
  const tDepletion = (m0 - dry) / flow; // instante analítico de agotamiento
  assert.equal(burn.status, 'depleted');
  near(burn.effectiveDurationSeconds, tDepletion, 1e-9, 'instante de agotamiento');
  assert.equal(burn.massAfterKg, dry); // nunca por debajo de la masa seca
  assert.equal(run.final.massKg, dry);
  assert.ok(run.knots.every(knot => knot.massKg >= dry - 1e-12 && knot.massKg > 0));
  const depletion = run.events.find(e => e.kind === 'depletion');
  near(depletion.elapsedSeconds, tDepletion, 1e-9);
  const dvExpected = ve * Math.log(m0 / dry);
  near(run.final.velocityKmS[0] * 1000, dvExpected, 1e-6, 'Δv total');
  // Tras el agotamiento la velocidad no cambia (el aceleración residual es nula).
  const after = run.knots.filter(k => k.elapsedSeconds > tDepletion + 1);
  assert.ok(after.length > 0 && after.every(k => Math.abs(k.velocityKmS[0] - run.final.velocityKmS[0]) < 1e-12));
});

test('Caso F (Hangar): un tanque casi vacío agota el propelente y los encendidos siguientes se omiten sin consumir', () => {
  const design = PRESETS[1].create();
  design.parts.find(p => p.socketId === 'tank').fuelKg = 5;
  const options = baseOptions([chemicalBurn({ durationSeconds: 600 }), chemicalBurn({ startSeconds: 7200, durationSeconds: 100 })]);
  const result = calculateFiniteThrustManeuver({ dataset, design, options });
  const [first, second] = result.propagation.burns;
  assert.equal(first.status, 'depleted');
  near(first.effectiveDurationSeconds, 5 / massFlowKgS(650, 310), 1e-9);
  assert.equal(second.status, 'skipped');
  assert.equal(second.fuelConsumedKg, 0);
  assert.equal(result.propagation.final.massKg, result.system.dryMassKg);
  assert.ok(result.propagation.events.some(e => e.kind === 'skipped'));
  assert.ok(result.propagation.final.fuelKg >= 0);
});

// ---- Caso D y E: motores del catálogo ------------------------------------------------------------
test('Caso D: motor químico del catálogo — encendido corto, consumo y aceleración', () => {
  const design = PRESETS[1].create();
  const result = calculateFiniteThrustManeuver({ dataset, design, options: baseOptions([chemicalBurn()]) });
  const burn = result.propagation.burns[0];
  assert.equal(result.system.engine.kind, 'químico');
  near(burn.fuelConsumedKg, massFlowKgS(650, 310) * 300, 1e-9);
  near(burn.massAfterKg, 561 - massFlowKgS(650, 310) * 300, 1e-9);
  near(result.comparison.fuelConsumedKg, burn.fuelConsumedKg, 1e-12);
  near(result.comparison.accumulatedDeltaVMS, 310 * G0_M_S2 * Math.log(561 / burn.massAfterKg), 1e-9);
  near(result.comparison.integratedDeltaVMS, result.comparison.accumulatedDeltaVMS, 1e-6);
  const execution = createFiniteThrustExecution({ result, design, dataset });
  const sample = sampleFiniteThrustExecution(execution, 3600);
  near(sample.accelerationMS2, 650 / 561, 1e-12);
  assert.equal(sample.engineOn, true);
  assert.equal(sampleFiniteThrustExecution(execution, 3900).engineOn, false);
  assert.equal(sampleFiniteThrustExecution(execution, 3599).thrustN, 0);
});

test('Caso E: motor iónico — encendido prolongado, aceleración creciente por pérdida de masa', () => {
  const design = PRESETS[2].create();
  const options = baseOptions([{ startSeconds: 0, durationSeconds: 3 * 86400, throttle: 1, direction: { type: 'prograde' } }], { horizonSeconds: 4 * 86400 });
  const result = calculateFiniteThrustManeuver({ dataset, design, options });
  const burn = result.propagation.burns[0];
  assert.equal(result.system.engine.kind, 'iónico');
  near(burn.fuelConsumedKg, massFlowKgS(0.04, 2500) * 3 * 86400, 1e-9);
  const execution = createFiniteThrustExecution({ result, design, dataset });
  const a0 = sampleFiniteThrustExecution(execution, 0).accelerationMS2;
  const a1 = sampleFiniteThrustExecution(execution, 3 * 86400 - 1).accelerationMS2;
  near(a0, 0.04 / 336, 1e-15);
  assert.ok(a1 > a0);
  near(a1 / a0, 336 / sampleFiniteThrustExecution(execution, 3 * 86400 - 1).massKg, 1e-9);
  near(result.comparison.integratedDeltaVMS, result.comparison.accumulatedDeltaVMS, 1e-6);
  assert.ok(result.comparison.accumulatedDeltaVMS > 0 && result.comparison.accumulatedDeltaVMS < 40);
  assert.ok(result.comparison.positionDifferenceFromBallisticKm > 1); // la trayectoria sí cambia
});

// ---- Caso G: potencia ----------------------------------------------------------------------------------
test('Caso G: potencia nominal insuficiente bloquea el encendido (sin batería asumida)', () => {
  const design = PRESETS[2].create();
  design.parts = design.parts.filter(p => p.socketId !== 'solar-left'); // 730 W < 87 W reposo + 900 W motor
  const system = getPropulsionSystem(design);
  assert.equal(system.ready, false);
  assert.match(system.issues.join(' '), /Potencia insuficiente/);
  assert.ok(system.batteryWh > 0); // la batería existe, pero no se usa para habilitar el encendido
  assert.throws(() => calculateFiniteThrustManeuver({ dataset, design, options: baseOptions([chemicalBurn({ durationSeconds: 3600 })]) }), error => error.code === 'NOT_READY' && /Potencia insuficiente/.test(error.message));
});

test('motor incompatible, ausente o sin propelente se rechaza', () => {
  const noEngine = PRESETS[1].create(); noEngine.parts = noEngine.parts.filter(p => p.socketId !== 'engine');
  assert.match(getPropulsionSystem(noEngine).issues.join(' '), /Falta un motor/);
  const mismatched = PRESETS[1].create(); mismatched.parts.find(p => p.socketId === 'tank').componentId = 'tank-xenon';
  assert.match(getPropulsionSystem(mismatched).issues.join(' '), /incompatibles/);
  const empty = PRESETS[1].create(); empty.parts.find(p => p.socketId === 'tank').fuelKg = 0;
  assert.match(getPropulsionSystem(empty).issues.join(' '), /sin propelente/);
  const noTank = PRESETS[1].create(); noTank.parts = noTank.parts.filter(p => p.socketId !== 'tank');
  assert.match(getPropulsionSystem(noTank).issues.join(' '), /Falta un tanque/);
});

// ---- Caso H: secuenciales -------------------------------------------------------------------------------
test('Caso H: cada maniobra comienza con la masa final de la anterior y los estados son continuos', () => {
  const design = PRESETS[1].create();
  const burns = [chemicalBurn(), chemicalBurn({ startSeconds: 7200, durationSeconds: 200, direction: { type: 'retrograde' }, throttle: 0.5 }),
    chemicalBurn({ startSeconds: 10800, durationSeconds: 100, direction: { type: 'normal' } })];
  const result = calculateFiniteThrustManeuver({ dataset, design, options: baseOptions(burns) });
  const list = result.propagation.burns;
  assert.equal(list[0].massBeforeKg, 561);
  assert.equal(list[1].massBeforeKg, list[0].massAfterKg);
  assert.equal(list[2].massBeforeKg, list[1].massAfterKg);
  near(list[1].fuelConsumedKg, massFlowKgS(325, 310) * 200, 1e-9); // acelerador 50 % → empuje 325 N
  near(result.comparison.fuelConsumedKg, list.reduce((n, b) => n + b.fuelConsumedKg, 0), 1e-9);
  near(result.propagation.final.massKg, list[2].massAfterKg, 1e-12);
  // Continuidad de posición y velocidad en las fronteras de encendido (un paso nunca las atraviesa).
  const times = new Set(result.propagation.knots.map(k => k.elapsedSeconds));
  for (const b of list) { assert.ok(times.has(b.effectiveStartSeconds), 'nudo en inicio'); assert.ok(times.has(b.effectiveEndSeconds), 'nudo en fin'); }
  const k = result.propagation.knots;
  for (let i = 1; i < k.length; i++) {
    const dt = k[i].elapsedSeconds - k[i - 1].elapsedSeconds;
    assert.ok(vecErr(k[i].positionKm, k[i - 1].positionKm) < Math.hypot(...k[i - 1].velocityKmS) * dt * 1.5 + 1e-6);
    assert.ok(vecErr(k[i].velocityKmS, k[i - 1].velocityKmS) < 2e-3 * dt + 1e-9);
  }
});

// ---- Caso I: reproducción determinista -----------------------------------------------------------------------
test('Caso I: avanzar, retroceder y repetir produce estados idénticos sin consumir combustible adicional', () => {
  const design = PRESETS[1].create();
  const result = calculateFiniteThrustManeuver({ dataset, design, options: baseOptions([chemicalBurn(), chemicalBurn({ startSeconds: 20000, durationSeconds: 120 })]) });
  const execution = createFiniteThrustExecution({ result, design, dataset });
  const clock = createPlaybackClock(execution.durationSeconds);
  clock.setRate(3600); clock.play();
  const sampleAt = () => sampleFiniteThrustExecution(execution, clock.snapshot().elapsedSeconds);
  clock.advance(2); const first = sampleAt();
  clock.advance(20);
  clock.setDirection(-1); clock.advance(22);
  assert.equal(clock.snapshot().elapsedSeconds, 0);
  clock.setDirection(1); clock.play(); clock.advance(2);
  assert.deepEqual(sampleAt(), first);
  for (const t of [0, 3600, 3750, 3900, 20000, 20060, 20120, execution.durationSeconds]) {
    assert.deepEqual(sampleFiniteThrustExecution(execution, t), sampleFiniteThrustExecution(execution, t));
  }
  assert.equal(sampleFiniteThrustExecution(execution, 0).fuelConsumedKg, 0);
  const afterAll = sampleFiniteThrustExecution(execution, execution.durationSeconds);
  assert.deepEqual(sampleFiniteThrustExecution(execution, execution.durationSeconds), afterAll);
  near(afterAll.fuelConsumedKg, result.comparison.fuelConsumedKg, 1e-9);
  near(sampleFiniteThrustExecution(execution, 3750).fuelConsumedKg, massFlowKgS(650, 310) * 150, 1e-6);
  // La masa decrece monótonamente al reproducir hacia adelante, nunca crece.
  let previous = Infinity;
  for (let t = 0; t <= execution.durationSeconds; t += 977) { const m = sampleFiniteThrustExecution(execution, t).massKg; assert.ok(m <= previous + 1e-12); previous = m; }
  assert.throws(() => sampleFiniteThrustExecution(execution, -1), /fuera/);
  assert.throws(() => sampleFiniteThrustExecution(execution, execution.durationSeconds + 1), /fuera/);
  // Los estados de la muestra coinciden con los nudos integrados.
  for (const knot of execution.propagation.knots.filter((_, i) => i % 7 === 0)) {
    const sample = sampleFiniteThrustExecution(execution, knot.elapsedSeconds);
    assert.deepEqual(sample.positionKm, knot.positionKm); assert.equal(sample.massKg, knot.massKg);
  }
});

// ---- Caso J: cobertura temporal --------------------------------------------------------------------------------
test('Caso J: rechaza propagaciones que exceden la cobertura temporal', () => {
  const design = PRESETS[1].create();
  assert.throws(() => calculateFiniteThrustManeuver({ dataset, design, options: baseOptions([chemicalBurn()], { departureTdb: '2026-10-31T00:00', horizonSeconds: 5 * 86400 }) }),
    error => error.code === 'COVERAGE' && /cobertura/.test(error.message));
  assert.throws(() => calculateFiniteThrustManeuver({ dataset, design, options: baseOptions([chemicalBurn()], { departureTdb: '2026-09-20T00:00' }) }), /cobertura/);
  assert.throws(() => calculateFiniteThrustManeuver({ dataset, design, options: baseOptions([chemicalBurn({ startSeconds: 4 * 86400 - 100, durationSeconds: 300 })]) }), /horizonte/);
  assert.throws(() => calculateFiniteThrustManeuver({ dataset, design, options: baseOptions([chemicalBurn()], { horizonSeconds: 31 * 86400 }) }), /horizonte/);
  assert.throws(() => calculateFiniteThrustManeuver({ dataset, design, options: baseOptions([]) }), /al menos un encendido/);
  assert.throws(() => calculateFiniteThrustManeuver({ dataset, design, options: baseOptions([chemicalBurn(), chemicalBurn({ startSeconds: 3700 })]) }), /simultáneos/);
});

// ---- Convergencia numérica -----------------------------------------------------------------------------------------
test('convergencia: el resultado no depende del paso máximo permitido (hasta tolerancias explícitas)', () => {
  const run = (maxBurnStepSeconds, maxCoastStepSeconds) => propagateFiniteThrust({
    gravityDerivative: restrictedDerivative(dataset, departureJd), initialPositionKm: [-100000, 0, 0].map((x, i) => x), initialVelocityKmS: [0, -1.9, 0.1],
    initialMassKg: 561, dryMassKg: 371, engine: { thrustN: 650, ispS: 310 }, endSeconds: 2 * 86400,
    burns: [{ startSeconds: 1800, durationSeconds: 600, throttle: 1, direction: { type: 'prograde' } }], maxBurnStepSeconds, maxCoastStepSeconds });
  const coarse = run(600, 3600), fine = run(20, 600);
  assert.ok(vecErr(coarse.final.positionKm, fine.final.positionKm) < 5e-4, `Δr ${vecErr(coarse.final.positionKm, fine.final.positionKm)} km`);
  assert.ok(vecErr(coarse.final.velocityKmS, fine.final.velocityKmS) < 1e-8);
  near(coarse.final.massKg, fine.final.massKg, 1e-9);
  assert.ok(fine.diagnostics.acceptedSteps > coarse.diagnostics.acceptedSteps);
});

test('convergencia: Hermite entre nudos coincide con una malla más fina', () => {
  const design = PRESETS[1].create();
  const options = baseOptions([chemicalBurn({ durationSeconds: 1200 })]);
  const result = calculateFiniteThrustManeuver({ dataset, design, options });
  const execution = createFiniteThrustExecution({ result, design, dataset });
  const fine = propagateFiniteThrust({ gravityDerivative: restrictedDerivative(dataset, result.departureJd), initialPositionKm: result.initial.positionKm,
    initialVelocityKmS: result.initial.velocityKmS, initialMassKg: result.initial.massKg, dryMassKg: result.system.dryMassKg, engine: result.system.engine,
    burns: [{ ...options.burns[0], id: 'burn-1' }], endSeconds: options.horizonSeconds, maxBurnStepSeconds: 10, maxCoastStepSeconds: 120 });
  for (const t of [1234, 3700, 4400, 12345, 60000, 200000]) {
    const sample = sampleFiniteThrustExecution(execution, t);
    // Referencia: la malla fina contiene nudos cerca de t; se compara con interpolación Hermite sobre ella.
    const fineExecution = { ...execution, propagation: fine };
    const reference = sampleFiniteThrustExecution(fineExecution, t);
    assert.ok(vecErr(sample.positionKm, reference.positionKm) < 0.05, `t=${t} Δr=${vecErr(sample.positionKm, reference.positionKm)} km`);
    near(sample.massKg, reference.massKg, 1e-6);
  }
});

// ---- Hangar, obsolescencia y no regresión ------------------------------------------------------------------------------
test('integración con el Hangar: lee el diseño sin modificarlo y detecta resultados obsoletos', () => {
  const design = PRESETS[1].create();
  const before = JSON.stringify(design);
  const options = baseOptions([chemicalBurn()]);
  const result = calculateFiniteThrustManeuver({ dataset, design, options });
  assert.equal(JSON.stringify(design), before); // el diseño no cambia ni se migra
  assert.equal(result.system.dryMassKg, 371); assert.equal(result.system.wetMassKg, 561);
  assert.equal(result.system.engine.componentId, 'engine-chemical');
  assert.equal(isFiniteThrustResultCurrent(result, design, options), true);
  assert.equal(isFiniteThrustResultCurrent(result, design, baseOptions([chemicalBurn({ durationSeconds: 301 })])), false); // opciones distintas
  const edited = structuredClone(design); edited.parts.find(p => p.socketId === 'tank').fuelKg = 100;
  assert.equal(isFiniteThrustResultCurrent(result, edited, options), false); // diseño distinto
  assert.throws(() => createFiniteThrustExecution({ result, design: edited, dataset }), /obsoleto/);
  const swapped = structuredClone(design); swapped.parts.find(p => p.socketId === 'engine').componentId = 'engine-ion';
  assert.equal(isFiniteThrustResultCurrent(result, swapped, options), false);
  assert.throws(() => createFiniteThrustExecution({ result: { ...result, kind: 'lunar' }, design, dataset }), /no corresponde/);
  assert.deepEqual(normalizeFiniteThrustOptions(options), normalizeFiniteThrustOptions(structuredClone(options)));
});

test('telemetría procede de los estados integrados y reporta motor, empuje, masa y Δv', () => {
  const design = PRESETS[1].create();
  const result = calculateFiniteThrustManeuver({ dataset, design, options: baseOptions([chemicalBurn()]) });
  const execution = createFiniteThrustExecution({ result, design, dataset, name: 'Ensayo 12D' });
  const on = deriveFiniteThrustTelemetry(execution, sampleFiniteThrustExecution(execution, 3750));
  const off = deriveFiniteThrustTelemetry(execution, sampleFiniteThrustExecution(execution, 100000));
  assert.equal(on.propulsion.engineOn, true); assert.equal(on.phase, 'burn'); assert.equal(on.propulsion.thrustN, 650);
  assert.equal(off.propulsion.engineOn, false); assert.equal(off.phase, 'coast'); assert.equal(off.propulsion.thrustN, 0);
  assert.ok(on.propulsion.fuelKg > off.propulsion.fuelKg);
  near(off.propulsion.propulsiveDeltaVMS, result.comparison.accumulatedDeltaVMS, 1e-9);
  assert.equal(on.energyEstimate.batteryChargeWh, null);
  assert.ok(on.energyEstimate.consumptionW > off.energyEstimate.consumptionW);
  assert.equal(on.missionSuccess, null);
  assert.ok(execution.events.some(e => e.kind === 'burn-start') && execution.events.some(e => e.kind === 'burn-end'));
  assert.equal(execution.transfer.trajectory.length, execution.propagation.knots.length);
});

test('el empuje finito mejora la referencia: Δv acumulado = presupuestado y difiere de la trayectoria balística', () => {
  const design = PRESETS[1].create();
  const result = calculateFiniteThrustManeuver({ dataset, design, options: baseOptions([chemicalBurn()]) });
  const c = result.comparison;
  near(c.plannedDeltaVMS, c.accumulatedDeltaVMS, 1e-9);
  assert.ok(c.positionDifferenceFromBallisticKm > 100);
  assert.match(c.note, /no es físicamente equivalente/);
  assert.match(result.limitations.join(' '), /no certifica captura lunar/);
});
