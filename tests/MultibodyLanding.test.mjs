import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/lab/ProbeDesign.js';
import { MOONS } from '../src/science/PlanetaryMoons.js';
import { SOLAR_SYSTEM_GM_CATALOG } from '../src/science/GravitationalParameters.js';
import { PLANETAS } from '../src/astronomy/Ephemerides.js';
import { CAPABILITY, SATELLITE_GM_JPL, createBodyProfile, getBodyProfile, landingCapability, listBodyProfiles, localFrameDescriptor } from '../src/lab/CelestialBodyMissionRegistry.js';
import { DEMO_LANDER, landerStructuralMassKg, payloadFromDesign } from '../src/lab/BodyLandingVehicle.js';
import { DEFAULT_LANDING_GUIDANCE, LandingError, circularSpeedKmS, createLandingEnvironment, initialOrbitState, landingCommand, orbitalSummary, runLandingLeg,
  surfaceGravityMS2, surfaceKinematics } from '../src/lab/BodyLandingDynamics.js';
import { DEFAULT_DESCENT_ORBIT, LANDING_OUTCOMES, classifyContact, simulateLanding } from '../src/lab/BodyLandingSimulation.js';
import { calculateLanding, isLandingResultCurrent } from '../src/lab/BodyLandingPlan.js';
import { createLandingExecution, deriveLandingTelemetry, sampleLandingExecution } from '../src/lab/BodyLandingPlayback.js';
import { ATMOSPHERE_BLEND_START_KM, ATMOSPHERE_TOP_KM, atmosphereAt, blendFactor } from '../src/lab/LaunchAtmosphere.js';
import { ORBIT_CLASSES, SUBORBITAL_OUTCOMES, classifyOrbit } from '../src/lab/LaunchOrbit.js';
import { EARTH_GM_KM3_S2, WGS84_A_KM } from '../src/lab/LaunchEarth.js';
import { DEFAULT_GUIDANCE, DEFAULT_SCHEDULE, simulateLaunch } from '../src/lab/LaunchSimulation.js';
import { DEMO_LAUNCHER } from '../src/lab/LaunchVehicle.js';
import { propagateFiniteThrust } from '../src/lab/FiniteThrustDynamics.js';
import { MISSION_CAMERA_MODES, localCameraGeometry, missionCameraPose } from '../src/lab/MissionExecutionView.js';

const G0 = 9.80665;
const near = (actual, expected, tolerance, label = '') => assert.ok(Math.abs(actual - expected) <= tolerance, `${label} ${actual} ≠ ${expected} (±${tolerance})`);
const rel = (actual, expected, tolerance, label = '') => near(actual / expected, 1, tolerance, label);
const MOON = getBodyProfile('301'), EUROPA = getBodyProfile('502');
const lander = (patch = {}, engine = {}) => { const l = structuredClone(DEMO_LANDER); Object.assign(l, patch); Object.assign(l.engine, engine); return l; };
const land = ({ profile = MOON, l = lander(), payload = 561, orbit = {}, guidance = {} } = {}) =>
  simulateLanding({ profile, lander: l, payloadMassKg: payload, options: { orbit: { ...DEFAULT_DESCENT_ORBIT, ...orbit }, guidance } });
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = a => Math.hypot(a[0], a[1], a[2]);

// ---- A–C: catálogo, perfiles y datos incompletos ------------------------------------------------------------------------------
test('A: el registro se deriva de los catálogos reales y sus identificadores son estables', () => {
  const ids = listBodyProfiles().map(p => p.id);
  assert.deepEqual(ids, ['10', '199', '299', '399', '499', '599', '699', '799', '899', '301', '501', '502', '503', '504', '606', '602', '703', '705', '801']);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length, 1 + PLANETAS.length + Object.keys(MOONS).length, 'Sol + planetas con efemérides + satélites del catálogo');
  for (const moon of Object.values(MOONS)) assert.equal(getBodyProfile(moon.id).radiusKm.value, moon.radiusKm, 'radio de PlanetaryMoons, sin duplicar');
  assert.throws(() => getBodyProfile('999'), /desconocido/);
});
test('B: cada perfil operable tiene GM, radio y procedencia válidos; el GM del catálogo no se duplica', () => {
  for (const p of listBodyProfiles()) {
    assert.ok(p.gm?.value > 0 && p.gm.source, `${p.name}: GM con fuente`);
    assert.ok(p.radiusKm?.value > 0, `${p.name}: radio`);
    assert.equal(p.rotation, null, 'la rotación no está en el proyecto y no se inventa');
    assert.match(p.frames.inertialLocal, /sin conexión con ICRF/);
  }
  assert.equal(MOON.gm.value, SOLAR_SYSTEM_GM_CATALOG.getMu('301'));
  assert.equal(getBodyProfile('399').gm.value, SOLAR_SYSTEM_GM_CATALOG.getMu('399'));
  for (const [id, entry] of Object.entries(SATELLITE_GM_JPL)) assert.equal(getBodyProfile(id).gm.value, entry.gm);
  assert.equal(SOLAR_SYSTEM_GM_CATALOG.hasBody('502'), false, 'Europa no estaba en el catálogo DE440: su GM procede de la tabla JPL declarada');
});
test('C: los perfiles incompletos o inválidos se rechazan', () => {
  assert.throws(() => createBodyProfile({ name: 'X', type: 'rocky-moon' }), /inválido/);
  assert.throws(() => createBodyProfile({ id: 'x', name: 'X', type: 'rocky-moon', gm: { value: -1 } }), /gm\.value/);
  assert.throws(() => createBodyProfile({ id: 'x', name: 'X', type: 'planeta' }), /type/);
  assert.throws(() => createBodyProfile({ id: 'x', name: 'X', type: 'rocky-moon', gm: { value: 1 }, radiusKm: { value: 1 }, rotation: { angularVelocityRadS: 1e-5, axis: [0, 0, 0] } }), /rotation/);
});

// ---- D–H: gravedad, velocidad circular, período, energía ------------------------------------------------------------------------
test('D: gravedad superficial de la Luna', () => {
  near(surfaceGravityMS2(createLandingEnvironment(MOON)), 4902.800118 / 1737.4 ** 2 * 1000, 1e-12);
  near(surfaceGravityMS2(createLandingEnvironment(MOON)), 1.62, 0.005, 'valor conocido ≈ 1,62 m/s²');
});
test('E: gravedad de Europa (otro satélite) con su propio GM y radio', () => {
  const g = surfaceGravityMS2(createLandingEnvironment(EUROPA));
  near(g, 3202.7121 / 1560.8 ** 2 * 1000, 1e-12); near(g, 1.315, 0.005);
  assert.ok(Math.abs(g - surfaceGravityMS2(createLandingEnvironment(MOON))) > 0.2, 'no reutiliza valores lunares');
});
test('F: velocidad circular distinta en cada cuerpo y coherente con el estado inicial', () => {
  for (const [p, alt] of [[MOON, 100], [EUROPA, 100]]) {
    const env = createLandingEnvironment(p), v = circularSpeedKmS(env, alt);
    near(v, Math.sqrt(p.gm.value / (p.radiusKm.value + alt)), 1e-12);
    const s = initialOrbitState(env, { periapsisAltitudeKm: alt, inclinationDeg: 30, raanDeg: 40, trueAnomalyDeg: 70 });
    near(norm(s.velocityKmS), v, 1e-12); near(norm(s.positionKm), p.radiusKm.value + alt, 1e-9); near(dot(s.positionKm, s.velocityKmS), 0, 1e-9);
    near(orbitalSummary(env, s.positionKm, s.velocityKmS).inclinationDeg, 30, 1e-9);
  }
  near(circularSpeedKmS(createLandingEnvironment(MOON), 100), 1.6336, 1e-3, 'Luna a 100 km ≈ 1,634 km/s');
});
test('G: período orbital analítico y cierre de la órbita integrada con DOPRI54', () => {
  const env = createLandingEnvironment(MOON), s0 = initialOrbitState(env, { periapsisAltitudeKm: 100, apoapsisAltitudeKm: 600, inclinationDeg: 20, trueAnomalyDeg: 10 });
  const summary = orbitalSummary(env, s0.positionKm, s0.velocityKmS), a = (2 * 1737.4 + 700) / 2;
  rel(summary.periodSeconds, 2 * Math.PI * Math.sqrt(a ** 3 / env.mu), 1e-12);
  const run = runLandingLeg({ env, lander: DEMO_LANDER, guidance: DEFAULT_LANDING_GUIDANCE, mode: 'off', massDryKg: 100, state: Float64Array.from([...s0.positionKm, ...s0.velocityKmS, 500, 0]), t0: 0, t1: summary.periodSeconds, maxStepSeconds: 20 });
  assert.equal(run.stop, null);
  near(norm([0, 1, 2].map(i => run.state[i] - s0.positionKm[i])), 0, 1e-4, 'vuelve al punto inicial tras un período (km)');
});
test('H: sin empuje se conservan energía y momento angular en el modelo central', () => {
  const env = createLandingEnvironment(EUROPA), s0 = initialOrbitState(env, { periapsisAltitudeKm: 80, apoapsisAltitudeKm: 900, inclinationDeg: 55, trueAnomalyDeg: 100 });
  const e0 = orbitalSummary(env, s0.positionKm, s0.velocityKmS);
  const run = runLandingLeg({ env, lander: DEMO_LANDER, guidance: DEFAULT_LANDING_GUIDANCE, mode: 'off', massDryKg: 100, state: Float64Array.from([...s0.positionKm, ...s0.velocityKmS, 800, 0]), t0: 0, t1: 3 * e0.periodSeconds, maxStepSeconds: 30 });
  const e1 = orbitalSummary(env, [run.state[0], run.state[1], run.state[2]], [run.state[3], run.state[4], run.state[5]]);
  rel(e1.specificEnergyKm2S2, e0.specificEnergyKm2S2, 1e-9, 'energía'); rel(e1.angularMomentumKm2S, e0.angularMomentumKm2S, 1e-9, 'momento angular');
  assert.equal(run.state[6], 800, 'sin empuje no cambia la masa');
});

// ---- I–L: propulsión, modulación, consumo, frenado ---------------------------------------------------------------------------------
test('I: propulsión con masa variable satisface Tsiolkovsky (Δv acumulado = ve·ln(m0/m))', () => {
  const env = createLandingEnvironment(MOON), s0 = initialOrbitState(env, { periapsisAltitudeKm: 100, inclinationDeg: 0 });
  const m0 = landerStructuralMassKg(DEMO_LANDER) + 561 + DEMO_LANDER.propellantMassKg;
  const run = runLandingLeg({ env, lander: DEMO_LANDER, guidance: DEFAULT_LANDING_GUIDANCE, mode: 'retrograde', massDryKg: 100, state: Float64Array.from([...s0.positionKm, ...s0.velocityKmS, m0, 0]), t0: 0, t1: 120, maxStepSeconds: 2 });
  const flow = DEMO_LANDER.engine.thrustMaxN / (DEMO_LANDER.engine.ispS * G0);
  near(run.state[6], m0 - flow * 120, 1e-6, 'ṁ = F/(Isp·g0)');
  rel(run.state[7] * 1000, DEMO_LANDER.engine.ispS * G0 * Math.log(m0 / run.state[6]), 1e-8, 'Δv');
});
test('J: la modulación del empuje responde a la masa y respeta los límites del motor', () => {
  const env = createLandingEnvironment(MOON), h = 300, speedDown = -38; // 300 m, 38 m/s hacia abajo (cerca del perfil del módulo ligero)
  const stateFor = m => [MOON.radiusKm.value + h / 1000, 0, 0, speedDown / 1000, 0, 0, m, 0];
  const light = landingCommand(env, DEMO_LANDER, DEFAULT_LANDING_GUIDANCE, 'descent', stateFor(2500), 2000), heavy = landingCommand(env, DEMO_LANDER, DEFAULT_LANDING_GUIDANCE, 'descent', stateFor(5000), 2000);
  assert.ok(light.engineOn && heavy.engineOn);
  assert.ok(heavy.throttle > light.throttle, 'más masa → más acelerador para la misma aceleración');
  for (const c of [light, heavy]) { assert.ok(c.throttle >= DEMO_LANDER.engine.throttleMin && c.throttle <= 1); near(c.thrustN, c.throttle * DEMO_LANDER.engine.thrustMaxN, 1e-9); near(norm(c.direction), 1, 1e-12); }
  assert.deepEqual(landingCommand(env, DEMO_LANDER, DEFAULT_LANDING_GUIDANCE, 'descent', stateFor(2000), 2000).thrustN, 0, 'sin propelente (m = masa seca) no hay empuje');
  assert.throws(() => land({ l: lander({}, { throttleable: false }) }), error => error instanceof LandingError && error.code === 'NOT_SUPPORTED', 'no se simula un estrangulamiento inexistente');
});
test('K: el consumo integrado coincide con el Δv y la masa nunca baja de la seca', () => {
  const s = land();
  const ve = DEMO_LANDER.engine.ispS * G0;
  rel(s.totals.propulsiveDeltaVMS, ve * Math.log(s.masses.wetKg / s.final.massKg), 1e-7, 'Tsiolkovsky sobre toda la misión');
  near(s.totals.propellantConsumedKg, s.masses.wetKg - s.final.massKg, 1e-9);
  assert.ok(s.knots.every(k => k.massKg >= s.masses.dryKg - 1e-9), 'masa ≥ seca'); assert.ok(s.knots.every((k, i) => !i || k.massKg <= s.knots[i - 1].massKg + 1e-12), 'la masa no aumenta');
  assert.ok(s.final.fuelKg > 0 && s.totals.propellantConsumedKg < s.masses.propellantKg);
});
test('L: la salida de órbita reduce el periapsis al valor pedido consumiendo propelente real', () => {
  const s = land();
  const cut = s.events.find(e => e.id === 'deorbit-cutoff'), k = s.knots.find(n => Math.abs(n.elapsedSeconds - cut.elapsedSeconds) < 1e-6);
  const env = createLandingEnvironment(MOON), summary = orbitalSummary(env, k.positionKm, k.velocityKmS);
  near(summary.periapsisRadiusKm - env.radiusKm, 15, 1e-3, 'periapsis tras el frenado orbital (km)');
  assert.ok(k.massKg < s.masses.wetKg, 'consumió propelente'); near(cut.burnSeconds, 8, 2, 'encendido breve de ~8 s');
});

// ---- M–N: superficie rotatoria y contacto ------------------------------------------------------------------------------------------
test('M: velocidad relativa a una superficie rotatoria v − ω × r (perfil de prueba con rotación declarada)', () => {
  const w = 2e-4, spinning = createBodyProfile({ ...MOON, rotation: { angularVelocityRadS: w, axis: [0, 0, 1], source: 'sintético de prueba' } });
  const env = createLandingEnvironment(spinning), r = [MOON.radiusKm.value + 10, 0, 0];
  const coRotating = surfaceKinematics(env, r, [0, w * r[0], 0]);
  near(coRotating.relativeSpeedMS, 0, 1e-9, 'un punto que corrota está en reposo respecto al suelo');
  const inertialRest = surfaceKinematics(env, r, [0, 0, 0]);
  near(inertialRest.horizontalMS, w * r[0] * 1000, 1e-9, 'en reposo inercial se mueve a −ω×r'); near(inertialRest.verticalMS, 0, 1e-12);
  const plain = surfaceKinematics(createLandingEnvironment(MOON), r, [0, 0.1, 0.02]);
  near(plain.horizontalMS, Math.hypot(100, 20), 1e-9, 'sin rotación declarada v_rel = v'); assert.equal(createLandingEnvironment(MOON).rotates, false);
});
test('N: caída radial: el contacto localizado coincide con la solución analítica de Kepler y no atraviesa la superficie', () => {
  const env = createLandingEnvironment(MOON), r0 = env.radiusKm + 10, mu = env.mu, x = env.radiusKm / r0;
  const analytic = Math.sqrt(r0 ** 3 / (2 * mu)) * (Math.sqrt(x * (1 - x)) + Math.acos(Math.sqrt(x)));
  const run = runLandingLeg({ env, lander: DEMO_LANDER, guidance: DEFAULT_LANDING_GUIDANCE, mode: 'off', massDryKg: 100, state: Float64Array.from([r0, 0, 0, 0, 0, 0, 500, 0]), t0: 0, t1: 600, maxStepSeconds: 5 });
  assert.equal(run.stop, 'contact');
  near(run.time, analytic, 1e-4, 'instante de contacto (s)');
  near(Math.hypot(run.state[0], run.state[1], run.state[2]) - env.radiusKm, 0, 1e-6, 'altitud en el contacto (km)');
  near(-run.state[3], Math.sqrt(2 * mu * (1 / env.radiusKm - 1 / r0)), 1e-6, 'velocidad de impacto analítica (km/s)');
  assert.ok(run.knots.every(k => Math.hypot(k.state[0], k.state[1], k.state[2]) >= env.radiusKm - 1e-6), 'nunca por debajo de la superficie');
});

// ---- O–S: escenarios de integración ---------------------------------------------------------------------------------------------------
test('O: aterrizaje suave en la Luna desde una órbita de 100 km, surgido de la integración', () => {
  const s = land();
  assert.equal(s.outcome, LANDING_OUTCOMES.soft); assert.equal(s.contactClass, 'soft'); assert.equal(s.status, 'CONTACTO');
  assert.ok(Math.abs(s.contact.verticalMS) <= 3 && s.contact.horizontalMS <= 1.5); near(s.contact.altitudeKm, 0, 1e-6);
  for (const id of ['orbit-start', 'deorbit-ignition', 'deorbit-cutoff', 'periapsis', 'phase-horizontal-reduction', 'phase-terminal', 'contact']) assert.ok(s.events.some(e => e.id === id), id);
  assert.ok(s.knots.length > 1000, 'trayectoria integrada, no predefinida'); assert.equal(s.knots.at(-1).elapsedSeconds, s.contact.elapsedSeconds);
  assert.equal(s.contact.engineOn, true); assert.match(s.contact.surfaceCoordinates.bodyFixed, /no disponible/);
  assert.ok(s.totals.propulsiveDeltaVMS > 1500 && s.totals.propulsiveDeltaVMS < 2500, 'Δv del orden del ideal (≈1,65–1,9 km/s) más pérdidas');
});
test('P: el mismo motor aterriza en Europa y en Ganímedes con su propio GM y radio', () => {
  const europa = land({ profile: EUROPA }), ganymede = land({ profile: getBodyProfile('503') });
  assert.equal(europa.outcome, LANDING_OUTCOMES.soft); assert.equal(ganymede.outcome, LANDING_OUTCOMES.soft);
  assert.equal(europa.environment.mu, 3202.7121); assert.equal(ganymede.environment.radiusKm, 2631.2);
  assert.ok(Math.abs(europa.endSeconds - land().endSeconds) > 50, 'la dinámica depende del cuerpo');
  assert.ok(europa.diagnostics.thrustToWeightPdi > land().diagnostics.thrustToWeightPdi, 'menor gravedad → más empuje/peso');
  const enceladus = land({ profile: getBodyProfile('602'), l: lander({}, { thrustMaxN: 1200 }), payload: 100 });
  assert.equal(enceladus.outcome, LANDING_OUTCOMES.soft, 'un módulo pequeño aterriza en Encélado');
  assert.throws(() => land({ profile: getBodyProfile('602') }), error => error.code === 'NOT_SUPPORTED' && /estacionario/.test(error.message), 'el módulo demostrativo no puede sostener vuelo estacionario allí');
});
test('Q: velocidad de contacto excesiva produce aterrizaje brusco o impacto según los umbrales', () => {
  assert.equal(classifyContact({ softVerticalMS: 3, softHorizontalMS: 1.5, hardVerticalMS: 6, hardHorizontalMS: 3 }, -2, 1), 'soft');
  assert.equal(classifyContact({ softVerticalMS: 3, softHorizontalMS: 1.5, hardVerticalMS: 6, hardHorizontalMS: 3 }, -5, 1), 'hard');
  assert.equal(land({ guidance: { touchdownSpeedMS: 4.5 } }).outcome, LANDING_OUTCOMES.hard);
  const impact = land({ guidance: { touchdownSpeedMS: 9 } });
  assert.equal(impact.outcome, LANDING_OUTCOMES.impact); assert.ok(Math.abs(impact.contact.verticalMS) > 6);
});
test('R: propelente insuficiente → COMBUSTIBLE AGOTADO, evento localizado y vuelo balístico evaluado', () => {
  const s = land({ l: lander({ propellantMassKg: 1500 }) });
  assert.equal(s.outcome, LANDING_OUTCOMES.fuel); assert.ok(s.depletedAt > 0 && s.events.some(e => e.id === 'depletion'));
  near(s.final.massKg, s.masses.dryKg, 1e-9, 'masa final = seca'); assert.ok(s.knots.every(k => k.massKg >= s.masses.dryKg - 1e-9));
  assert.match(s.reasons[0], /balístico restante: impacto/); assert.ok(Math.abs(s.contact.verticalMS) > 6 || s.contact.horizontalMS > 3);
});
test('S: empuje insuficiente (empuje/peso ≤ 1) → EMPUJE INSUFICIENTE, también por gravedad del destino', () => {
  const weak = land({ l: lander({}, { thrustMaxN: 4000 }) });
  assert.equal(weak.outcome, LANDING_OUTCOMES.thrust); assert.ok(weak.diagnostics.thrustToWeightPdi < 1);
  const mercury = land({ profile: getBodyProfile('199') });
  assert.equal(mercury.outcome, LANDING_OUTCOMES.thrust, 'el módulo que aterriza en la Luna no aterriza en Mercurio (g = 3,7 m/s²)'); assert.notEqual(mercury.contactClass, 'soft');
});

// ---- T–V: destinos no disponibles, invalidación ------------------------------------------------------------------------------------
test('T: un destino sin datos físicos suficientes queda PENDIENTE y no se calcula', () => {
  const incomplete = createBodyProfile({ id: 'x1', name: 'Sin GM', type: 'rocky-moon', radiusKm: { value: 500 }, atmosphere: { atmosphere: 'none-significant', note: 'prueba' }, ephemeris: {} });
  const cap = landingCapability(incomplete);
  assert.equal(cap.state, CAPABILITY.pending); assert.match(cap.reason, /GM/); assert.ok(cap.missing.includes('GM (parámetro gravitacional)'));
  assert.throws(() => land({ profile: incomplete }), error => error.code === 'NOT_AVAILABLE');
});
test('U: gigantes, Sol y destinos con atmósfera no usan el modelo de vacío', () => {
  for (const id of ['599', '699', '799', '899']) { const c = landingCapability(id); assert.equal(c.state, CAPABILITY.notApplicable); assert.match(c.reason, /superficie sólida convencional/); assert.equal(c.futureCategory, 'Sonda de entrada atmosférica'); assert.throws(() => land({ profile: getBodyProfile(id) }), /superficie sólida/); }
  assert.equal(landingCapability('10').state, CAPABILITY.notApplicable);
  for (const id of ['299', '399', '499', '606']) { const c = landingCapability(id); assert.equal(c.state, CAPABILITY.pending); assert.match(c.reason, /atmosférico pendiente/); assert.throws(() => land({ profile: getBodyProfile(id) }), error => error.code === 'NOT_AVAILABLE'); }
  assert.equal(landingCapability('801').state, CAPABILITY.pending, 'Tritón: atmósfera tenue sin analizar');
  const states = Object.fromEntries(listBodyProfiles().map(p => [p.name, landingCapability(p).state]));
  assert.equal(states.Luna, CAPABILITY.operational); assert.equal(states.Europa, CAPABILITY.operational); assert.equal(states.Ganímedes, CAPABILITY.experimental);
});
test('V: cambiar destino, vehículo, órbita, masa, motor o perfil invalida el resultado', () => {
  const design = PRESETS[1].create(), options = { orbit: { ...DEFAULT_DESCENT_ORBIT }, guidance: {} };
  const result = calculateLanding({ bodyId: '301', design, lander: DEMO_LANDER, options });
  assert.equal(isLandingResultCurrent(result, design, '301', DEMO_LANDER, options), true);
  assert.equal(isLandingResultCurrent(result, design, '502', DEMO_LANDER, options), false, 'destino');
  assert.equal(isLandingResultCurrent(result, design, '301', lander({ propellantMassKg: 4000 }), options), false, 'combustible');
  assert.equal(isLandingResultCurrent(result, design, '301', lander({}, { thrustMaxN: 15000 }), options), false, 'motor');
  assert.equal(isLandingResultCurrent(result, design, '301', DEMO_LANDER, { ...options, orbit: { ...options.orbit, periapsisAltitudeKm: 90, apoapsisAltitudeKm: 90 } }), false, 'órbita');
  assert.equal(isLandingResultCurrent(result, design, '301', DEMO_LANDER, { ...options, guidance: { touchdownSpeedMS: 2 } }), false, 'perfil de descenso');
  assert.equal(isLandingResultCurrent(result, PRESETS[2].create(), '301', DEMO_LANDER, options), false, 'sonda / masa');
  assert.throws(() => createLandingExecution({ result, design: PRESETS[2].create() }), /obsoleto/);
  assert.throws(() => calculateLanding({ bodyId: '599', design, lander: DEMO_LANDER, options }), /superficie sólida/);
  assert.throws(() => calculateLanding({ bodyId: '301', design, lander: DEMO_LANDER, options: { orbit: { ...DEFAULT_DESCENT_ORBIT, periapsisAltitudeKm: -5, apoapsisAltitudeKm: -5 } } }), /intersecta la superficie/);
  const payload = payloadFromDesign(design); near(result.simulation.payloadMassKg, payload.massKg, 1e-12, 'la carga útil es la masa húmeda real del Hangar');
});

// ---- W–X: reproducción y convergencia --------------------------------------------------------------------------------------------------
test('W: la reproducción es determinista, reversible y no recalcula combustible', () => {
  const design = PRESETS[1].create(), result = calculateLanding({ bodyId: '301', design, lander: DEMO_LANDER, options: { orbit: { ...DEFAULT_DESCENT_ORBIT } } });
  const execution = createLandingExecution({ result, design }), T = execution.durationSeconds;
  const times = [0, 5, 3000, 3500, 3900, 3950, T - 1, T];
  const forward = times.map(t => sampleLandingExecution(execution, t)), again = [...times].reverse().map(t => sampleLandingExecution(execution, t)).reverse();
  for (let i = 0; i < times.length; i++) { assert.deepEqual(forward[i], again[i], `t = ${times[i]}`); }
  for (let i = 1; i < forward.length; i++) assert.ok(forward[i].fuelKg <= forward[i - 1].fuelKg + 1e-9, 'el combustible no aumenta con el tiempo');
  near(forward[0].fuelKg, DEMO_LANDER.propellantMassKg, 1e-9); near(forward[0].massKg, result.simulation.masses.wetKg, 1e-9);
  const end = forward.at(-1), tel = deriveLandingTelemetry(execution, end), mid = deriveLandingTelemetry(execution, forward[3]);
  assert.equal(tel.result.classification, LANDING_OUTCOMES.soft); assert.equal(mid.result, null);
  assert.equal(tel.bodyName, 'Luna'); assert.equal(tel.target, null); assert.match(tel.flight.groundVelocityBasis, /sin rotación declarada/);
  assert.ok(forward.some(s => s.engineOn) && forward[0].engineOn === true && forward[2].engineOn === false, 'encendido de salida de órbita y coast de aproximación'); assert.ok(forward.every(s => Number.isFinite(s.throttle) && s.positionKm.every(Number.isFinite)));
  assert.throws(() => sampleLandingExecution(execution, T + 1), /fuera/);
  assert.equal(execution.transfer.hideMoon, true); near(execution.transfer.bodyRadiusKm * execution.transfer.sceneScale, 0.63710084, 1e-12);
});
test('X: convergencia DOPRI54: la órbita y el contacto no dependen del paso máximo', () => {
  const env = createLandingEnvironment(EUROPA), s0 = initialOrbitState(env, { periapsisAltitudeKm: 200, apoapsisAltitudeKm: 700, inclinationDeg: 40, trueAnomalyDeg: 30 });
  const state = Float64Array.from([...s0.positionKm, ...s0.velocityKmS, 600, 0]);
  const orbit = step => runLandingLeg({ env, lander: DEMO_LANDER, guidance: DEFAULT_LANDING_GUIDANCE, mode: 'off', massDryKg: 100, state, t0: 0, t1: 9000, maxStepSeconds: step }).state;
  const a = orbit(5), b = orbit(100);
  near(norm([0, 1, 2].map(i => a[i] - b[i])), 0, 1e-5, 'posición (km)'); near(norm([3, 4, 5].map(i => a[i] - b[i])), 0, 1e-8, 'velocidad (km/s)');
  const fall = step => runLandingLeg({ env, lander: DEMO_LANDER, guidance: DEFAULT_LANDING_GUIDANCE, mode: 'off', massDryKg: 100, state: Float64Array.from([env.radiusKm + 50, 0, 0, 0, 0.1, 0, 500, 0]), t0: 0, t1: 3000, maxStepSeconds: step }).time;
  near(fall(2), fall(50), 1e-5, 'instante de contacto (s)');
});

// ---- Y: integridad de 12D y 12E ----------------------------------------------------------------------------------------------------------
test('Y: los módulos 12D y 12E conservan su comportamiento validado', () => {
  assert.equal(typeof propagateFiniteThrust, 'function');
  const options = { site: { latDeg: 28.5, lonDeg: -80.6, altitudeM: 3 }, launchDateUtc: '2026-10-10T12:00:00Z', earthRotationAngleDeg: 0, azimuthDeg: 90, guidance: structuredClone(DEFAULT_GUIDANCE), schedule: structuredClone(DEFAULT_SCHEDULE),
    target: { minPerigeeAltitudeKm: 160, maxApogeeAltitudeKm: 2000, targetAltitudeKm: 200, inclinationDeg: null, inclinationToleranceDeg: 1 } };
  const sim = simulateLaunch({ launcher: DEMO_LAUNCHER, payloadMassKg: 561, options });
  assert.equal(sim.orbit.classification, ORBIT_CLASSES.orbit); assert.ok(sim.orbit.minimumAltitudeKm > 160);
  assert.equal(EARTH_GM_KM3_S2, SOLAR_SYSTEM_GM_CATALOG.getMu('399'), 'la Tierra sigue usando el GM del catálogo');
});

// ---- Z: correcciones 12E.1 ------------------------------------------------------------------------------------------------------------------
test('Z1: la atmósfera se desvanece entre 180 y 200 km de forma continua, derivable y no negativa', () => {
  const rho = h => atmosphereAt(h).densityKgM3, d = (h, e = 1e-4) => (rho(h + e) - rho(h - e)) / (2 * e);
  assert.equal(ATMOSPHERE_BLEND_START_KM, 180); assert.equal(ATMOSPHERE_TOP_KM, 200);
  near(blendFactor(180), 1, 0); near(blendFactor(200), 0, 0); near(blendFactor(190), 0.5, 1e-12);
  assert.equal(rho(200), 0); assert.equal(rho(201), 0); assert.equal(rho(500), 0); assert.equal(atmosphereAt(250).pressurePa, 0);
  near(rho(200 - 1e-9), 0, 1e-25, 'continuidad en 200 km'); rel(rho(180 + 1e-9), rho(180 - 1e-9), 1e-6, 'continuidad en 180 km');
  rel(d(180 + 1e-3, 1e-5), d(180 - 1e-3, 1e-5), 1e-3, 'primera derivada continua en 180 km'); near(d(199.999, 1e-4), 0, 1e-17, 'derivada ≈ 0 en 200 km (≪ 7e-14 en 180 km)');
  let previous = Infinity; for (let h = 0; h <= 200; h += 0.25) { const v = rho(h); assert.ok(v >= 0 && v <= previous, `no negativa y decreciente en ${h} km`); previous = v; }
  const raw = 1.2e-9; // conserva las capas inferiores: bajo 180 km es exactamente la extrapolación original
  assert.ok(rho(150) > raw * 0 && rho(100) > rho(150)); assert.equal(atmosphereAt(100).region, 'extrapolación exponencial');
  rel(rho(86 + 1e-6), rho(86 - 1e-6), 1e-6, 'capa estándar intacta'); near(rho(0), 1.225, 1e-3);
});
test('Z2: clasificación suborbital — 561 kg órbita; 3000 y 5000 kg impacto confirmado; descendente sin contacto localizado', () => {
  const options = { site: { latDeg: 28.5, lonDeg: -80.6, altitudeM: 3 }, launchDateUtc: '2026-10-10T12:00:00Z', earthRotationAngleDeg: 0, azimuthDeg: 90, guidance: structuredClone(DEFAULT_GUIDANCE), schedule: structuredClone(DEFAULT_SCHEDULE),
    target: { minPerigeeAltitudeKm: 160, maxApogeeAltitudeKm: 2000, targetAltitudeKm: 200, inclinationDeg: null, inclinationToleranceDeg: 1 } };
  const run = mass => simulateLaunch({ launcher: DEMO_LAUNCHER, payloadMassKg: mass, options });
  assert.equal(run(561).orbit.classification, ORBIT_CLASSES.orbit);
  for (const mass of [3000, 5000]) { const s = run(mass); assert.equal(s.status, 'IMPACTO'); assert.equal(s.orbit.classification, ORBIT_CLASSES.suborbital); assert.equal(s.orbit.outcome, SUBORBITAL_OUTCOMES.impactConfirmed); assert.ok(s.impact && s.events.some(e => e.id === 'impact')); }
  assert.notEqual(run(3000).orbit.classification, ORBIT_CLASSES.unverifiable, 'ya no es NO VERIFICABLE');
  const r = WGS84_A_KM + 90, v = 0.85 * Math.sqrt(EARTH_GM_KM3_S2 / r), descending = classifyOrbit([r, 0, 0], [-1.2, v, 0]);
  assert.equal(descending.outcome, SUBORBITAL_OUTCOMES.descending); assert.equal(descending.classification, ORBIT_CLASSES.suborbital); assert.match(descending.reasons[0], /aún no se detectó/);
  assert.equal(classifyOrbit([r, 0, 0], [0, Math.sqrt(EARTH_GM_KM3_S2 * (2 / r - 1 / ((r + WGS84_A_KM + 600) / 2))), 0]).classification, ORBIT_CLASSES.unverifiable, 'estado indeterminado a baja altitud sigue siendo NO VERIFICABLE');
});
test('Z3: la cámara local solo mueve la cámara y la escala del modelo, nunca las posiciones científicas', () => {
  assert.ok(MISSION_CAMERA_MODES.includes('local'));
  const execution = { transfer: { moonArrivalPositionKm: [7000, 0, 0], overviewMinDistance: 2.4 } };
  const sample = (altKm) => ({ positionKm: [6371.0084 + altKm, 0, 0], velocityKmS: [0, 0.4, 0], moonPositionKm: [0, 0, 0] });
  const low = localCameraGeometry(sample(0.01), execution), high = localCameraGeometry(sample(150), execution);
  assert.ok(low.distance < 1e-3 && high.distance > 50 * low.distance, 'el encuadre sigue la altitud');
  const pose = missionCameraPose('local', sample(0.01), execution);
  assert.ok(pose.target.distanceTo(low.position) < 1e-12 && pose.position.distanceTo(pose.target) < 1e-3, 'cámara pegada al vehículo');
  near(missionCameraPose('overview', sample(0.01), execution).target.x, 0.5 * 7000 / 10000, 1e-12, 'la vista general no cambia');
  const sampleCopy = structuredClone(sample(0.01)); missionCameraPose('local', sampleCopy, execution); assert.deepEqual(sampleCopy, sample(0.01), 'el estado científico no se altera');
  const landing = { transfer: { bodyRadiusKm: 1737.4, sceneScale: 0.63710084 / 1737.4, moonArrivalPositionKm: [1800, 0, 0], overviewMinDistance: 2.4 } };
  near(localCameraGeometry({ positionKm: [1737.4, 0, 0], velocityKmS: [0, 1, 0], moonPositionKm: [0, 0, 0] }, landing).position.x, 0.63710084, 1e-12, 'escala local del cuerpo central');
});
test('Z4: marco local declarado, sin conexión con ICRF', () => {
  const frame = localFrameDescriptor(MOON, { epochUtc: '2026-10-10T12:00:00Z' });
  assert.equal(frame.connectedToIcrf, false); assert.equal(frame.epochTdbJd, null); assert.match(frame.warning, /no es una trayectoria ICRF absoluta/);
  assert.equal(land().frame.originBodyId, '301');
});
