import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/lab/ProbeDesign.js';
import { propagateFiniteThrust } from '../src/lab/FiniteThrustDynamics.js';
import {
  EARTH_GM_KM3_S2, EARTH_ROTATION_RATE_RAD_S, WGS84_A_KM, WGS84_B_KM, WGS84_E2, corotatingVelocityKmS, ecefToInertial, ellipsoidRadiusKm,
  geodeticFromPosition, geodeticToEcefKm, launchSiteState, localFrame, norm3
} from '../src/lab/LaunchEarth.js';
import { ATMOSPHERE_MODEL, atmosphereAt } from '../src/lab/LaunchAtmosphere.js';
import { DEMO_LAUNCHER, ispAt, liftoffThrustToWeight, massFlowKgS, payloadFromDesign, stackMassKg, thrustAt, validateLauncher } from '../src/lab/LaunchVehicle.js';
import { createEnvironment, evaluateForces, makeDerivative, runSegment } from '../src/lab/LaunchDynamics.js';
import { ORBIT_CLASSES, classifyOrbit, minimumOrbitAltitudeKm, orbitalElements } from '../src/lab/LaunchOrbit.js';
import { DEFAULT_GUIDANCE, DEFAULT_SCHEDULE, LAUNCH_MODEL_VERSION, describeStack, simulateLaunch, validateLaunchOptions } from '../src/lab/LaunchSimulation.js';
import { calculateLaunch, isLaunchResultCurrent } from '../src/lab/LaunchPlan.js';
import { createLaunchExecution, deriveLaunchTelemetry, sampleLaunchExecution } from '../src/lab/LaunchPlayback.js';
import { createPlaybackClock } from '../src/lab/MissionPlayback.js';

const G0 = 9.80665;
const near = (actual, expected, tolerance, label = '') => assert.ok(Math.abs(actual - expected) <= tolerance, `${label} ${actual} ≠ ${expected} (±${tolerance})`);
const options = (patch = {}) => ({
  site: { latDeg: 28.5, lonDeg: -80.6, altitudeM: 3 }, launchDateUtc: '2026-10-10T12:00:00Z', earthRotationAngleDeg: 0, azimuthDeg: 90,
  guidance: structuredClone(DEFAULT_GUIDANCE), schedule: structuredClone(DEFAULT_SCHEDULE),
  target: { minPerigeeAltitudeKm: 160, maxApogeeAltitudeKm: 2000, targetAltitudeKm: 200, inclinationDeg: null, inclinationToleranceDeg: 1 }, ...patch
});
const launcher = (patch = {}) => { const l = structuredClone(DEMO_LAUNCHER); Object.assign(l.stages[0], patch.s1 ?? {}); Object.assign(l.stages[1], patch.s2 ?? {}); Object.assign(l.separation, patch.sep ?? {}); return l; };
const vacuum = createEnvironment({ atmosphere: false, rotation: false });
const kmAt = altitude => [WGS84_A_KM + altitude, 0, 0];

// ---- Geodesia, rotación y marco ---------------------------------------------------------------------
test('E: rotación terrestre y velocidad de superficie contra fórmula independiente', () => {
  const equator = launchSiteState({ latDeg: 0, lonDeg: 0, altitudeM: 0 });
  near(equator.surfaceSpeedKmS * 1000, EARTH_ROTATION_RATE_RAD_S * WGS84_A_KM * 1000, 1e-9, 'ecuador');
  near(equator.surfaceSpeedKmS * 1000, 465.10, 0.01, 'valor nominal ≈ 465,1 m/s');
  const site = launchSiteState({ latDeg: 28.5, lonDeg: -80.6, altitudeM: 3 });
  const phi = 28.5 * Math.PI / 180, n = WGS84_A_KM / Math.sqrt(1 - WGS84_E2 * Math.sin(phi) ** 2);
  near(site.surfaceSpeedKmS, EARTH_ROTATION_RATE_RAD_S * (n + 0.003) * Math.cos(phi), 1e-12, 'v = ω·(N+h)·cosφ');
  assert.ok(Math.abs(site.velocityKmS[2]) === 0, 'la rotación es horizontal');
  const polar = launchSiteState({ latDeg: 90, lonDeg: 0, altitudeM: 0 });
  near(polar.surfaceSpeedKmS, 0, 1e-12, 'polo');
  near(norm3(polar.positionKm), WGS84_B_KM, 1e-9, 'radio polar WGS84');
  // La geodesia es reversible y la altura geodésica reproduce la altitud dada, también tras girar el marco.
  const back = geodeticFromPosition(site.positionKm);
  near(back.altitudeKm, 0.003, 1e-9); near(back.latitudeRad * 180 / Math.PI, 28.5, 1e-9);
  const rotated = ecefToInertial(geodeticToEcefKm({ latDeg: 10, lonDeg: 20, altitudeKm: 5 }), 1.234);
  near(geodeticFromPosition(rotated).altitudeKm, 5, 1e-9);
  near(norm3(geodeticToEcefKm({ latDeg: 0, lonDeg: 0, altitudeKm: 0 })), ellipsoidRadiusKm(0), 1e-9);
  // Un punto fijo a la Tierra avanza ω·t en longitud: mismo radio y velocidad tras media hora.
  const later = ecefToInertial(geodeticToEcefKm({ latDeg: 28.5, lonDeg: -80.6, altitudeKm: 0.003 }), EARTH_ROTATION_RATE_RAD_S * 1800);
  near(norm3(later), norm3(site.positionKm), 1e-9);
  assert.throws(() => geodeticToEcefKm({ latDeg: 95, lonDeg: 0 }), /inválidas/);
});

test('atmósfera US-1976: valores de referencia, continuidad y vacío', () => {
  const geometric = h => 6356.766 * h / (6356.766 - h); // altura geométrica para una altura geopotencial h
  near(atmosphereAt(0).densityKgM3, 1.225, 1e-3, 'ρ0'); near(atmosphereAt(0).pressurePa, 101325, 1e-6, 'p0');
  near(atmosphereAt(geometric(11)).pressurePa / 22632, 1, 2e-4, 'p(11 km geopotencial) = 22 632 Pa');
  near(atmosphereAt(geometric(20)).pressurePa / 5474.9, 1, 5e-4, 'p(20 km) = 5 474,9 Pa');
  near(atmosphereAt(geometric(32)).pressurePa / 868.02, 1, 1e-3, 'p(32 km) = 868,02 Pa');
  near(atmosphereAt(geometric(47)).pressurePa / 110.91, 1, 2e-3, 'p(47 km) = 110,91 Pa');
  near(atmosphereAt(geometric(11)).temperatureK, 216.65, 1e-6);
  let previous = Infinity;
  for (let h = 0; h < 200; h += 0.5) { const rho = atmosphereAt(h).densityKgM3; assert.ok(rho > 0 && rho < previous, `ρ decrece en ${h} km`); previous = rho; }
  const below = atmosphereAt(86 - 1e-9).densityKgM3, above = atmosphereAt(86 + 1e-9).densityKgM3;
  near(above / below, 1, 1e-6, 'continuidad en 86 km');
  assert.equal(atmosphereAt(200.001).densityKgM3, 0); assert.equal(atmosphereAt(500).pressurePa, 0);
  assert.equal(atmosphereAt(-5).densityKgM3, atmosphereAt(0).densityKgM3);
  assert.throws(() => atmosphereAt(NaN), /no finita/);
  assert.match(ATMOSPHERE_MODEL.assumptions, /corrotante/);
});

// ---- Empuje, masa y propulsión ----------------------------------------------------------------------
test('A: sin empuje no hay despegue; la masa y la posición solo siguen la rotación terrestre', () => {
  const noThrust = launcher({ s1: { thrustSeaLevelN: 0 } });
  const sim = simulateLaunch({ launcher: noThrust, payloadMassKg: 1000, options: options() });
  assert.equal(sim.status, 'NO DESPEGA');
  assert.equal(sim.totals.propellantConsumedKg, 0);
  assert.ok(!sim.events.some(e => e.kind === 'liftoff' || e.kind === 'ignition'), 'no hay evento de despegue ni encendido');
  assert.equal(sim.orbit.classification, ORBIT_CLASSES.notReached);
  for (const knot of sim.knots) {
    near(geodeticFromPosition(knot.positionKm).altitudeKm, 0.003, 1e-9, 'permanece en la plataforma');
    near(knot.massKg, stackMassKg(noThrust, 1000), 1e-9);
  }
  assert.throws(() => simulateLaunch({ launcher: launcher({ s1: { thrustVacuumN: 0 } }), payloadMassKg: 1000, options: options() }), /thrustVacuumN/);
});

test('B: empuje/peso menor que 1 no despega; ligeramente mayor que 1 sí asciende', () => {
  const l = launcher();
  const mass = stackMassKg(l, 1000), weightN = mass * EARTH_GM_KM3_S2 / WGS84_A_KM ** 2 * 1000;
  near(liftoffThrustToWeight(l, 1000), l.stages[0].thrustSeaLevelN / weightN, 1e-12);
  const heavy = launcher({ s1: { thrustSeaLevelN: 0.9 * weightN, thrustVacuumN: 0.95 * weightN } });
  assert.ok(liftoffThrustToWeight(heavy, 1000) < 1);
  assert.equal(simulateLaunch({ launcher: heavy, payloadMassKg: 1000, options: options() }).status, 'NO DESPEGA');
  const marginal = launcher({ s1: { thrustSeaLevelN: 1.1 * weightN, thrustVacuumN: 1.2 * weightN } });
  const flight = simulateLaunch({ launcher: marginal, payloadMassKg: 1000, options: options({ schedule: { ...structuredClone(DEFAULT_SCHEDULE), postCoastSeconds: 0 } }) });
  assert.notEqual(flight.status, 'NO DESPEGA');
  const early = flight.knots.find(k => k.elapsedSeconds >= 5);
  assert.ok(geodeticFromPosition(early.positionKm).altitudeKm > 0.003, 'sube con T/W>1');
});

test('C+D: empuje constante sin atmósfera ni gravedad reproduce la ecuación del cohete y la posición analítica', () => {
  const stage = launcher().stages[0];
  const flow = massFlowKgS(stage), ve = stage.ispVacuumS * G0; // m/s
  const noGravity = createEnvironment({ atmosphere: false, rotation: false, mu: 0 });
  const m0 = 107800, duration = 100;
  const r0 = kmAt(0);
  const run = runSegment({ env: noGravity, cfg: { stage, guidance: { mode: 'inertial', vector: [1, 0, 0] }, aero: null }, state: Float64Array.from([...r0, 0, 0, 0, m0, 0]), t0: 0, t1: duration, maxStepSeconds: 5 });
  const m = m0 - flow * duration, v = ve * Math.log(m0 / m) / 1000; // km/s
  near(run.state[6], m, 1e-6, 'masa final'); near(run.state[3], v, 1e-9, 'v = ve·ln(m0/m)');
  near(run.state[7], v, 1e-9, 'Δv acumulado = integral del empuje/masa');
  const x = ve / flow * (m0 - m - m * Math.log(m0 / m)) / 1000; // km
  near(run.state[0] - r0[0], x, 1e-7, 'posición analítica');
  assert.ok(Math.abs(run.state[4]) < 1e-12 && Math.abs(run.state[5]) < 1e-12);
  // Sin gravedad pero con consumo, la masa decrece linealmente: el flujo másico es F/(Isp·g0) = dm/dt.
  near(flow, stage.thrustVacuumN / (stage.ispVacuumS * G0), 1e-12);
  // Empuje dependiente de la presión: p=0 da el empuje de vacío; p=p0 el de nivel del mar; Isp coherente.
  near(thrustAt(stage, 0), stage.thrustVacuumN, 1e-9); near(thrustAt(stage, 101325), stage.thrustSeaLevelN, 1e-9);
  near(ispAt(stage, 0), stage.ispVacuumS, 1e-9); assert.ok(ispAt(stage, 101325) < stage.ispVacuumS);
  assert.ok(thrustAt(stage, 5e4) > stage.thrustSeaLevelN && thrustAt(stage, 5e4) < stage.thrustVacuumN);
  // Con gravedad central y empuje radial, la integración coincide con RK4 independiente de paso fijo.
  const g = createEnvironment({ atmosphere: false, rotation: false });
  const cfg = { stage, guidance: { mode: 'inertial', vector: [1, 0, 0] }, aero: null };
  const fine = runSegment({ env: g, cfg, state: Float64Array.from([...r0, 0, 0, 0, m0, 0]), t0: 0, t1: 60, maxStepSeconds: 2 });
  const f = makeDerivative(g, cfg); let y = Float64Array.from([...r0, 0, 0, 0, m0, 0]); const h = 0.01, k = [0, 1, 2, 3].map(() => new Float64Array(8)), tmp = new Float64Array(8);
  for (let i = 0; i < 6000; i++) {
    const t = i * h; f(t, y, k[0]);
    for (let j = 0; j < 8; j++) tmp[j] = y[j] + h / 2 * k[0][j]; f(t + h / 2, tmp, k[1]);
    for (let j = 0; j < 8; j++) tmp[j] = y[j] + h / 2 * k[1][j]; f(t + h / 2, tmp, k[2]);
    for (let j = 0; j < 8; j++) tmp[j] = y[j] + h * k[2][j]; f(t + h, tmp, k[3]);
    for (let j = 0; j < 8; j++) y[j] += h / 6 * (k[0][j] + 2 * k[1][j] + 2 * k[2][j] + k[3][j]);
  }
  for (let j = 0; j < 6; j++) near(fine.state[j], y[j], 1e-7, `RK4 independiente, componente ${j}`);
  near(fine.state[6], y[6], 1e-6);
});

test('F: arrastre opuesto a la velocidad relativa, con unidades y magnitud correctas', () => {
  const env = createEnvironment();
  const stage = launcher().stages[0];
  const aero = { areaM2: stage.referenceAreaM2, cd: stage.dragCoefficient };
  const site = launchSiteState({ latDeg: 0, lonDeg: 0, altitudeM: 0 });
  // Un cuerpo en reposo respecto de la atmósfera corrotante no sufre arrastre aunque su velocidad inercial sea 465 m/s.
  const atRest = evaluateForces(env, { stage: null, aero }, 0, [...site.positionKm, ...site.velocityKmS, 1000, 0]);
  near(atRest.relativeSpeedKmS, 0, 1e-12); assert.deepEqual(atRest.drag, [0, 0, 0]);
  near(norm3(site.velocityKmS) * 1000, 465.1, 0.01);
  // A 10 km: v relativa conocida → F = ½ρv²·Cd·A y a = F/m en km/s².
  const altitude = 10, r = [WGS84_A_KM + altitude, 0, 0], w = corotatingVelocityKmS(r);
  const rel = [0.1, 0.25, 0.3], mass = 5000;
  const state = [...r, w[0] + rel[0], w[1] + rel[1], w[2] + rel[2], mass, 0];
  const out = evaluateForces(env, { stage: null, aero }, 0, state);
  const rho = atmosphereAt(10).densityKgM3, speed = Math.hypot(...rel) * 1000;
  const expectedN = 0.5 * rho * speed ** 2 * aero.cd * aero.areaM2;
  near(out.dynamicPressurePa, 0.5 * rho * speed ** 2, 1e-9, 'q = ½ρv²');
  near(norm3(out.drag) * mass * 1000, expectedN, 1e-9, 'F arrastre [N]');
  near(norm3(out.drag), expectedN / mass / 1000, 1e-15, 'a [km/s²]');
  const unitRel = rel.map(x => x / Math.hypot(...rel)), unitDrag = out.drag.map(x => x / norm3(out.drag));
  for (let i = 0; i < 3; i++) near(unitDrag[i], -unitRel[i], 1e-12, 'dirección opuesta');
  // Sin atmósfera (o sobre 200 km) no hay arrastre; el ρ del modelo coincide con la tabla estándar a 10 km (±0,5 %).
  near(rho / 0.41271, 1, 5e-3, 'ρ(10 km geométricos)');
  assert.deepEqual(evaluateForces(createEnvironment({ atmosphere: false }), { stage: null, aero }, 0, state).drag, [0, 0, 0]);
  assert.deepEqual(evaluateForces(env, { stage: null, aero }, 0, [WGS84_A_KM + 300, 0, 0, 0, 7.7, 0, 1000, 0]).drag, [0, 0, 0]);
  // La gravedad evaluada es GM/r² hacia el centro (misma constante que el resto del laboratorio).
  const gOut = evaluateForces(env, { stage: null, aero: null }, 0, [7000, 0, 0, 0, 0, 0, 1, 0]);
  near(gOut.gravity[0], -EARTH_GM_KM3_S2 / 7000 ** 2, 1e-15);
  assert.throws(() => evaluateForces(env, { stage: null, aero: null }, 0, [7000, 0, 0, 0, 0, 0, -1, 0]), /Masa/);
});

// ---- Simulación completa ----------------------------------------------------------------------------
const orbitSim = simulateLaunch({ launcher: DEMO_LAUNCHER, payloadMassKg: 1000, options: options() });

test('J: el lanzador demostrativo alcanza una órbita ligada con carga útil ligera y la clasifica según el modelo', () => {
  assert.equal(orbitSim.status, 'LANZAMIENTO COMPLETADO');
  assert.equal(orbitSim.orbit.classification, ORBIT_CLASSES.orbit);
  const el = orbitSim.orbit.elements;
  assert.ok(el.bound && el.specificEnergyKm2S2 < 0 && el.eccentricity < 1);
  assert.ok(orbitSim.orbit.minimumAltitudeKm >= 160, 'perigeo sostenible');
  assert.ok(orbitSim.orbit.apogeeAltitudeKm <= 2000);
  // Vis-viva y energía contra fórmulas independientes con el estado final.
  const last = orbitSim.knots.at(-1), r = norm3(last.positionKm), v = norm3(last.velocityKmS);
  near(v * v, EARTH_GM_KM3_S2 * (2 / r - 1 / el.semiMajorAxisKm), 1e-9, 'vis-viva');
  near(el.specificEnergyKm2S2, v * v / 2 - EARTH_GM_KM3_S2 / r, 1e-9);
  near(-EARTH_GM_KM3_S2 / (2 * el.semiMajorAxisKm), el.specificEnergyKm2S2, 1e-9);
  near(el.periapsisRadiusKm, el.semiMajorAxisKm * (1 - el.eccentricity), 1e-6); near(el.apoapsisRadiusKm, el.semiMajorAxisKm * (1 + el.eccentricity), 1e-6);
  assert.ok(el.inclinationDeg >= 28.3 && el.inclinationDeg < 30, `acimut 90° desde 28,5° N → inclinación ≥ latitud geocéntrica (${el.inclinationDeg})`);
  // El circularizado consumió propelente real y se apagó por perigeo objetivo, no por una corrección artificial de velocidad.
  assert.equal(orbitSim.stages[1].cutoffReason, 'perigeo objetivo alcanzado');
  assert.ok(orbitSim.stages[1].propellantConsumedKg > 0 && orbitSim.stages[1].propellantRemainingKg > 0);
  assert.ok(orbitSim.events.some(e => e.id === 'circularization'));
  // Δv integrado, no impuesto: coherente con el consumo (Tsiolkovsky por etapa) y menor que el ideal sin pérdidas.
  assert.ok(orbitSim.totals.propulsiveDeltaVMS > 8500 && orbitSim.totals.propulsiveDeltaVMS < describeStack(DEMO_LAUNCHER, 1000).idealDeltaVMS);
  assert.match(orbitSim.orbit.reasons[0], /No certifica operatividad/);
});

test('G: la separación conserva posición y velocidad, descarta estructura y residuo sin restar dos veces', () => {
  const sim = orbitSim, sep = sim.events.find(e => e.id === 'separation'), s1 = DEMO_LAUNCHER.stages[0];
  assert.ok(sep && sim.stages[0].separationSeconds === sep.elapsedSeconds);
  near(sep.jettisonedMassKg, s1.structuralMassKg + sim.stages[0].propellantRemainingKg, 1e-9);
  near(sim.stages[0].propellantRemainingKg, 0, 1e-9);
  const before = sim.segments.find(s => s.endSeconds === sep.elapsedSeconds && s.kind === 'coast'), after = sim.segments.find(s => s.startSeconds === sep.elapsedSeconds);
  near(before.massEndKg - after.massStartKg, sep.jettisonedMassKg, 1e-9, 'salto de masa = descartado');
  near(after.massStartKg, 1000 + 1800 + DEMO_LAUNCHER.stages[1].propellantMassKg, 1e-6, 'masa tras la separación = carga + etapa 2 completa');
  const k = sim.knots.filter(x => Math.abs(x.elapsedSeconds - sep.elapsedSeconds) < 1e-9);
  assert.ok(k.length >= 1);
  const meco = sim.events.find(e => e.id === 'meco'), ignition2 = sim.events.find(e => e.id === 'ignition-2');
  const around = sim.knots.filter(x => x.elapsedSeconds >= meco.elapsedSeconds && x.elapsedSeconds <= ignition2.elapsedSeconds);
  for (let i = 1; i < around.length; i++) {
    const dt = around[i].elapsedSeconds - around[i - 1].elapsedSeconds;
    assert.ok(Math.hypot(...around[i].velocityKmS.map((x, j) => x - around[i - 1].velocityKmS[j])) < 2e-2 * dt + 1e-9, 'velocidad continua (solo gravedad)');
    assert.ok(Math.hypot(...around[i].positionKm.map((x, j) => x - around[i - 1].positionKm[j])) < 8 * dt + 1e-9, 'posición continua');
  }
  // Conservación del propelente: consumido + restante = cargado, en cada etapa.
  for (const stage of sim.stages) near(stage.propellantConsumedKg + stage.propellantRemainingKg, stage.propellantLoadedKg, 1e-3, stage.stageId);
  near(sim.totals.propellantConsumedKg, sim.stages.reduce((n, s) => n + s.propellantConsumedKg, 0), 1e-9);
  // Masa final = carga útil + estructura de etapa 2 + propelente restante.
  near(sim.final.massKg, 1000 + 1800 + sim.stages[1].propellantRemainingKg, 1e-3);
  assert.throws(() => simulateLaunch({ launcher: launcher({ sep: { separationImpulseMS: 5 } }), payloadMassKg: 1000, options: options() }), /impulso de separación/);
});

test('H: tras agotar el propelente la etapa solo sigue una trayectoria balística con energía constante', () => {
  const opts = options(); opts.schedule.ascentBurnSeconds = null; opts.schedule.circularization.enabled = false; opts.schedule.postCoastSeconds = 600;
  const sim = simulateLaunch({ launcher: DEMO_LAUNCHER, payloadMassKg: 1000, options: opts });
  const depletion = sim.events.find(e => e.id === 'depletion-2');
  assert.ok(depletion, 'hay evento de agotamiento');
  assert.equal(sim.stages[1].cutoffReason, 'propelente agotado'); near(sim.stages[1].propellantRemainingKg, 0, 1e-6);
  const tail = sim.knots.filter(k => k.elapsedSeconds > depletion.elapsedSeconds + 5 && geodeticFromPosition(k.positionKm).altitudeKm > 200);
  assert.ok(tail.length > 5, 'tramo balístico por encima de la atmósfera');
  const energy = k => norm3(k.velocityKmS) ** 2 / 2 - EARTH_GM_KM3_S2 / norm3(k.positionKm);
  for (const k of tail) { near(energy(k), energy(tail[0]), 1e-6, 'energía específica conservada'); near(k.massKg, 1000 + 1800, 1e-3, 'masa seca constante'); }
  const last = sim.segments.at(-1); assert.equal(last.kind, 'coast'); assert.equal(last.massFlowKgS, 0);
  const first = sim.knots.find(k => k.elapsedSeconds >= depletion.elapsedSeconds), end = sim.knots.at(-1);
  near(end.dvAccKmS, first.dvAccKmS, 1e-9, 'sin empuje no hay Δv adicional');
});

test('I: una carga útil demasiado pesada queda suborbital, termina en impacto y la integración se detiene', () => {
  const sim = simulateLaunch({ launcher: DEMO_LAUNCHER, payloadMassKg: 5000, options: options() });
  assert.equal(sim.status, 'IMPACTO'); assert.equal(sim.orbit.classification, ORBIT_CLASSES.suborbital);
  assert.ok(sim.impact && sim.events.some(e => e.id === 'impact'));
  near(geodeticFromPosition(sim.knots.at(-1).positionKm).altitudeKm, 0, 1e-6, 'último estado sobre la superficie');
  assert.equal(sim.knots.at(-1).elapsedSeconds, sim.impact.elapsedSeconds, 'no hay muestras posteriores al impacto');
  assert.ok(sim.knots.every(k => geodeticFromPosition(k.positionKm).altitudeKm > -1e-6), 'nunca atraviesa la Tierra');
  assert.ok(sim.events.at(-1).id === 'end');
  assert.ok(sim.events.some(e => e.id === 'apogee'), 'apogeo suborbital');
});

test('K: elipse que intersecta la Tierra es suborbital; perigeo atmosférico no es órbita sostenible', () => {
  const r = [WGS84_A_KM + 300, 0, 0];
  const sub = classifyOrbit(r, [0, 6.0, 0]);
  assert.equal(sub.classification, ORBIT_CLASSES.suborbital); assert.ok(sub.minimumAltitudeKm < 0);
  const el = orbitalElements(r, [0, 6.0, 0]);
  near(el.apoapsisRadiusKm, norm3(r), 1e-9, 'velocidad tangencial < circular → el punto es el apogeo');
  near(el.periapsisRadiusKm, 2 * el.semiMajorAxisKm - norm3(r), 1e-9, 'rp = 2a − ra');
  assert.ok(el.eccentricity > 0.05);
  const v90 = Math.sqrt(EARTH_GM_KM3_S2 * (2 / (WGS84_A_KM + 90) - 1 / ((WGS84_A_KM + 90 + WGS84_A_KM + 600) / 2)));
  const draggy = classifyOrbit([WGS84_A_KM + 90, 0, 0], [0, v90, 0]);
  assert.equal(draggy.classification, ORBIT_CLASSES.unverifiable, 'por debajo de 100 km los elementos osculadores no son verificables');
  const v150 = Math.sqrt(EARTH_GM_KM3_S2 * (2 / (WGS84_A_KM + 120) - 1 / ((WGS84_A_KM + 120 + WGS84_A_KM + 500) / 2)));
  const low = classifyOrbit([WGS84_A_KM + 120, 0, 0], [0, v150, 0]);
  assert.equal(low.classification, ORBIT_CLASSES.notReached);
  assert.match(low.reasons[0], /perigeo en la atmósfera/);
  near(minimumOrbitAltitudeKm([WGS84_A_KM + 120, 0, 0], [0, v150, 0]), 120, 1e-6, 'perigeo = punto de partida');
  const circular = classifyOrbit([WGS84_A_KM + 400, 0, 0], [0, Math.sqrt(EARTH_GM_KM3_S2 / (WGS84_A_KM + 400)), 0]);
  assert.equal(circular.classification, ORBIT_CLASSES.orbit); near(circular.elements.eccentricity, 0, 1e-12);
  near(circular.minimumAltitudeKm, 400, 1e-6);
  assert.equal(classifyOrbit([NaN, 0, 0], [0, 7, 0]).classification, ORBIT_CLASSES.unverifiable);
  const inclined = classifyOrbit([WGS84_A_KM + 400, 0, 0], [0, 5.5, 5.5], { inclinationDeg: 90, inclinationToleranceDeg: 1 });
  assert.equal(inclined.classification, ORBIT_CLASSES.notReached); assert.match(inclined.reasons.join(' '), /Inclinación/);
});

test('L: velocidad de escape → trayectoria no ligada, nunca clasificada como órbita', () => {
  const r = [WGS84_A_KM + 400, 0, 0], vEscape = Math.sqrt(2 * EARTH_GM_KM3_S2 / norm3(r));
  const hyperbolic = classifyOrbit(r, [0, vEscape * 1.05, 0]);
  assert.equal(hyperbolic.classification, ORBIT_CLASSES.notReached);
  assert.equal(hyperbolic.elements.bound, false); assert.ok(hyperbolic.elements.specificEnergyKm2S2 > 0);
  assert.match(hyperbolic.elements.trajectoryType, /hiperbólica/); assert.equal(hyperbolic.elements.apoapsisRadiusKm, null);
  assert.equal(hyperbolic.elements.semiMajorAxisKm, null);
  near(hyperbolic.elements.specificEnergyKm2S2, (vEscape * 1.05) ** 2 / 2 - EARTH_GM_KM3_S2 / norm3(r), 1e-9);
  assert.ok(hyperbolic.elements.eccentricity > 1);
  const parabola = classifyOrbit(r, [0, vEscape, 0]); assert.equal(parabola.classification, ORBIT_CLASSES.notReached);
});

test('M: la reproducción es determinista, reversible y no consume propelente ni repite la separación', () => {
  const design = PRESETS[1].create(), payload = payloadFromDesign(design);
  const result = calculateLaunch({ design, launcher: DEMO_LAUNCHER, options: options() });
  const execution = createLaunchExecution({ result, design });
  assert.equal(execution.kind, 'launch'); assert.equal(execution.simulation.payloadMassKg, payload.massKg);
  near(payload.massKg, 561, 1e-9, 'masa húmeda real del Hangar');
  const times = [0, 10, 65.5, 151.5, 153, 156, 200, 400, 900, execution.durationSeconds];
  const forward = times.map(t => sampleLaunchExecution(execution, t));
  const backward = [...times].reverse().map(t => sampleLaunchExecution(execution, t)).reverse();
  assert.deepEqual(forward, backward, 'mismo estado sin importar el orden de consulta');
  for (let i = 1; i < forward.length; i++) assert.ok(forward[i].fuelKg <= forward[i - 1].fuelKg + 1e-9, 'el propelente nunca aumenta con el tiempo');
  const sep = execution.simulation.events.find(e => e.id === 'separation');
  const justBefore = sampleLaunchExecution(execution, sep.elapsedSeconds - 0.5), justAfter = sampleLaunchExecution(execution, sep.elapsedSeconds + 0.5);
  assert.equal(justBefore.separated, false); assert.equal(justAfter.separated, true);
  assert.ok(justBefore.massKg - justAfter.massKg > 5000, 'la masa baja con la estructura descartada');
  const again = sampleLaunchExecution(execution, sep.elapsedSeconds - 0.5);
  assert.deepEqual(again, justBefore, 'volver antes de la separación recupera el estado previo; no se repite');
  assert.equal(execution.simulation.stages[0].separationSeconds, sep.elapsedSeconds, 'la separación sigue siendo un único evento');
  // Reloj: avanzar, retroceder y reproducir otra vez da las mismas muestras; el consumo es función del instante.
  const clock = createPlaybackClock(execution.durationSeconds); clock.setRate(10); clock.play();
  clock.advance(30); const a = sampleLaunchExecution(execution, clock.snapshot().elapsedSeconds);
  clock.setDirection(-1); clock.advance(10); clock.setDirection(1); clock.advance(10);
  assert.deepEqual(sampleLaunchExecution(execution, clock.snapshot().elapsedSeconds), a);
  // Telemetría solo con magnitudes calculadas; no inventa temperatura ni vibración.
  const telemetry = deriveLaunchTelemetry(execution, sampleLaunchExecution(execution, 65.5));
  const keys = JSON.stringify(telemetry).toLowerCase();
  assert.ok(!/temperatura|vibraci|bater/.test(keys.replace(/atmosphere/g, '')), 'sin parámetros inventados');
  assert.ok(telemetry.flight.dynamicPressurePa > 1e4 && telemetry.propulsion.thrustN > 1e6 && telemetry.propulsion.activeStage === 1);
  assert.equal(telemetry.result, null); assert.equal(telemetry.missionSuccess, null);
  const end = deriveLaunchTelemetry(execution, sampleLaunchExecution(execution, execution.durationSeconds));
  assert.equal(end.result.classification, ORBIT_CLASSES.orbit);
  assert.throws(() => sampleLaunchExecution(execution, -1), /fuera/); assert.throws(() => sampleLaunchExecution(execution, execution.durationSeconds + 1), /fuera/);
  // Resultado obsoleto tras cambiar la sonda o el lanzador.
  const changed = PRESETS[2].create();
  assert.equal(isLaunchResultCurrent(result, design, DEMO_LAUNCHER, options()), true);
  assert.equal(isLaunchResultCurrent(result, changed, DEMO_LAUNCHER, options()), false);
  assert.equal(isLaunchResultCurrent(result, design, launcher({ s2: { propellantMassKg: 14000 } }), options()), false);
  assert.throws(() => createLaunchExecution({ result, design: changed }), /obsoleto/);
  assert.equal(result.model, LAUNCH_MODEL_VERSION);
});

test('N: eventos casi simultáneos permanecen ordenados y la secuencia no falla', () => {
  const sim = simulateLaunch({ launcher: launcher({ sep: { coastAfterCutoffSeconds: 0, ignitionDelaySeconds: 0 } }), payloadMassKg: 1000, options: options() });
  const times = sim.events.map(e => e.elapsedSeconds);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] >= times[i - 1], 'orden no decreciente');
  const meco = sim.events.find(e => e.id === 'meco'), separation = sim.events.find(e => e.id === 'separation'), ignition = sim.events.find(e => e.id === 'ignition-2');
  near(separation.elapsedSeconds, meco.elapsedSeconds, 1e-9); near(ignition.elapsedSeconds, meco.elapsedSeconds, 1e-9);
  for (let i = 1; i < sim.knots.length; i++) assert.ok(sim.knots[i].elapsedSeconds > sim.knots[i - 1].elapsedSeconds, 'nudos estrictamente crecientes');
  assert.equal(sim.orbit.classification, ORBIT_CLASSES.orbit);
  const noRise = options(); noRise.guidance.verticalRiseSeconds = 0; noRise.guidance.kickDeg = 0; noRise.guidance.kickSeconds = 0;
  assert.notEqual(simulateLaunch({ launcher: DEMO_LAUNCHER, payloadMassKg: 1000, options: noRise }).status, 'FALLO DE INTEGRACIÓN');
  // Max-Q es un máximo real de q a lo largo de la trayectoria muestreada.
  const execution = createLaunchExecution({ result: calculateLaunch({ design: PRESETS[1].create(), launcher: DEMO_LAUNCHER, options: options() }), design: PRESETS[1].create() });
  const maxQ = execution.simulation.maxQ;
  for (const dt of [-8, -2, 2, 8]) assert.ok(sampleLaunchExecution(execution, maxQ.elapsedSeconds + dt).dynamicPressurePa <= maxQ.dynamicPressurePa + 1e-6);
  assert.ok(maxQ.altitudeKm > 5 && maxQ.altitudeKm < 25);
});

test('O: convergencia — el resultado no depende del paso máximo y coincide con RK4 de paso fino', () => {
  const env = createEnvironment(), stage = launcher().stages[0];
  const site = launchSiteState({ latDeg: 28.5, lonDeg: -80.6, altitudeM: 3 });
  const state0 = Float64Array.from([...site.positionKm, ...site.velocityKmS, 107800, 0]);
  const cfg = { stage, guidance: { mode: 'vertical' }, aero: { areaM2: stage.referenceAreaM2, cd: stage.dragCoefficient } };
  const coarse = runSegment({ env, cfg, state: state0, t0: 0, t1: 30, maxStepSeconds: 5 }), fine = runSegment({ env, cfg, state: state0, t0: 0, t1: 30, maxStepSeconds: 0.25 });
  for (let j = 0; j < 8; j++) near(coarse.state[j], fine.state[j], j < 3 ? 1e-6 : 1e-8, `componente ${j}`);
  assert.ok(fine.stats.acceptedSteps > coarse.stats.acceptedSteps);
  const f = makeDerivative(env, cfg); let y = Float64Array.from(state0); const h = 0.005, k = [0, 1, 2, 3].map(() => new Float64Array(8)), tmp = new Float64Array(8);
  for (let i = 0; i < 6000; i++) {
    const t = i * h; f(t, y, k[0]);
    for (let j = 0; j < 8; j++) tmp[j] = y[j] + h / 2 * k[0][j]; f(t + h / 2, tmp, k[1]);
    for (let j = 0; j < 8; j++) tmp[j] = y[j] + h / 2 * k[1][j]; f(t + h / 2, tmp, k[2]);
    for (let j = 0; j < 8; j++) tmp[j] = y[j] + h * k[2][j]; f(t + h, tmp, k[3]);
    for (let j = 0; j < 8; j++) y[j] += h / 6 * (k[0][j] + 2 * k[1][j] + 2 * k[2][j] + k[3][j]);
  }
  for (let j = 0; j < 3; j++) near(fine.state[j], y[j], 1e-6, `RK4 posición ${j}`);
  for (let j = 3; j < 6; j++) near(fine.state[j], y[j], 1e-8, `RK4 velocidad ${j}`);
  near(fine.state[6], y[6], 1e-6, 'masa');
  // Detección de impacto por bisección: el estado final queda sobre la superficie con tolerancia estricta.
  const fall = runSegment({ env: createEnvironment({ atmosphere: false }), cfg: { stage: null, guidance: null, aero: null },
    state: Float64Array.from([...kmAt(100), 0, 1, 0, 100, 0]), t0: 0, t1: 5000, maxStepSeconds: 20 });
  assert.equal(fall.stop, 'impact'); near(geodeticFromPosition([fall.state[0], fall.state[1], fall.state[2]]).altitudeKm, 0, 2e-6);
  // Elementos osculantes constantes en vuelo balístico en vacío (conservación a la tolerancia del integrador).
  const orbit0 = Float64Array.from([...kmAt(500), 0, Math.sqrt(EARTH_GM_KM3_S2 / (WGS84_A_KM + 500)) * 1.05, 0, 100, 0]);
  const orbit = runSegment({ env: createEnvironment({ atmosphere: false }), cfg: { stage: null, guidance: null, aero: null }, state: orbit0, t0: 0, t1: 20000, maxStepSeconds: 30 });
  near(orbitalElements([...orbit.state.slice(0, 3)], [...orbit.state.slice(3, 6)]).specificEnergyKm2S2, orbitalElements([...orbit0.slice(0, 3)], [...orbit0.slice(3, 6)]).specificEnergyKm2S2, 1e-8);
});

test('P: regresión 12D — el empuje en vacío coincide con propagateFiniteThrust y con Tsiolkovsky', () => {
  const stage = { ...launcher().stages[1] }, m0 = 8000, r0 = kmAt(500), v0 = [0, Math.sqrt(EARTH_GM_KM3_S2 / (WGS84_A_KM + 500)), 0];
  const twoBody = (t, s, out) => { const r = Math.hypot(s[0], s[1], s[2]); out[0] = s[3]; out[1] = s[4]; out[2] = s[5]; for (let i = 0; i < 3; i++) out[i + 3] = -EARTH_GM_KM3_S2 * s[i] / r ** 3; };
  const old = propagateFiniteThrust({ gravityDerivative: twoBody, initialPositionKm: r0, initialVelocityKmS: v0, initialMassKg: m0, dryMassKg: 2000,
    engine: { thrustN: stage.thrustVacuumN, ispS: stage.ispVacuumS }, burns: [{ startSeconds: 100, durationSeconds: 60, throttle: 1, direction: { type: 'inertial', vector: [0, 1, 0] } }], endSeconds: 900 });
  const env = createEnvironment({ atmosphere: false, rotation: false });
  const segment = (state, t0, t1, thrust) => runSegment({ env, cfg: { stage: thrust ? stage : null, guidance: thrust ? { mode: 'inertial', vector: [0, 1, 0] } : null, aero: null }, state, t0, t1, maxStepSeconds: 10 });
  let run = segment(Float64Array.from([...r0, ...v0, m0, 0]), 0, 100, false); run = segment(run.state, 100, 160, true); run = segment(run.state, 160, 900, false);
  const reference = old.final;
  for (let i = 0; i < 3; i++) { near(run.state[i], reference.positionKm[i], 1e-4, `posición ${i} (≈10 cm tras 900 s: pasos distintos, rtol 1e-10/1e-11)`); near(run.state[3 + i], reference.velocityKmS[i], 1e-6, `velocidad ${i}`); }
  near(run.state[6], reference.massKg, 1e-6, 'masa');
  const dv = stage.ispVacuumS * G0 * Math.log(m0 / run.state[6]);
  near(run.state[7] * 1000, dv, 1e-3, 'Δv acumulado = Tsiolkovsky');
  near(old.totals.propulsiveDeltaVMS, dv, 1e-3);
  assert.deepEqual(validateLauncher(DEMO_LAUNCHER), []);
});

// ---- Validaciones y descriptores ---------------------------------------------------------------------
test('validaciones de lanzador y condiciones, y descripción de la pila', () => {
  assert.deepEqual(validateLaunchOptions(options()), []);
  assert.ok(validateLaunchOptions(options({ azimuthDeg: 400 })).length);
  assert.ok(validateLaunchOptions(options({ site: { latDeg: 120, lonDeg: 0, altitudeM: 0 } })).length);
  assert.ok(validateLaunchOptions(options({ launchDateUtc: 'ayer' })).length);
  assert.ok(validateLauncher(launcher({ s1: { propellantMassKg: -1 } })).length);
  assert.ok(validateLauncher(launcher({ s1: { thrustSeaLevelN: 2e6 } })).some(m => /nivel del mar/.test(m)));
  assert.ok(validateLauncher({ stages: [], separation: {} }).length);
  assert.throws(() => simulateLaunch({ launcher: DEMO_LAUNCHER, payloadMassKg: -1, options: options() }), /masa/);
  const d = describeStack(DEMO_LAUNCHER, 1000);
  near(d.liftoffMassKg, 1000 + 6000 + 80000 + 1800 + 15000, 1e-9);
  near(d.stages[0].idealDeltaVMS, 310 * G0 * Math.log(d.stages[0].initialMassKg / d.stages[0].finalMassKg), 1e-9);
  near(d.stages[0].burnSeconds, 80000 / massFlowKgS(DEMO_LAUNCHER.stages[0]), 1e-9);
  const empty = PRESETS[0].create();
  assert.throws(() => calculateLaunch({ design: empty, launcher: DEMO_LAUNCHER, options: options() }), /estructura|masa/i);
  assert.equal(localFrame([7000, 0, 0]).up[0], 1);
});
