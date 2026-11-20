// Etapa 13 — misiones interplanetarias integradas: encuentros (SOI, hipérbola, plano B), capturas impulsiva y finita, efemérides
// de baricentros y satélites, transferencia planetocéntrica, misiones A (Marte) y B (Júpiter → Europa → descenso 12F),
// continuidad entre tramos y reproducción. Las tolerancias se justifican en docs/STAGE13_INTEGRATED_MISSIONS.md; ninguna se
// ajustó para que una prueba pase. Comprobaciones independientes: RK4 de paso fijo propio, vis-viva y fórmulas cerradas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { propagateKepler } from '../src/science/KeplerPropagator.js';
import { solveLambert } from '../src/science/LambertSolver.js';
import { sphereOfInfluenceRadiusKm, hyperbolaFromBPlane, bPlaneFromState, impulsiveCaptureDeltaV, classicalElements, trueAnomalyAtRadius, stateOnConic, asymptoticExcess, timeToNextPeriapsis } from '../src/science/PlanetaryEncounter.js';
import { createPlanetocentricWindow, MEASURED_MOON_INTERPOLATION_ERROR, MOON_UNAVAILABLE_MESSAGE } from '../src/science/PlanetocentricWindow.js';
import { createInterplanetaryEphemeris } from '../src/science/InterplanetaryEphemeris.js';
import { simulateInsertion, impulsiveInsertionReference, INSERTION_STATUS } from '../src/lab/OrbitalInsertion.js';
import { aimEncounter, AIM_STATUS } from '../src/lab/EncounterDesign.js';
import { computeIntegratedMission, DEMO_PROPULSION_MODULE, PHASE_STATUS, ENCOUNTER_TARGETS, IntegratedMissionError, checkContinuity } from '../src/lab/IntegratedMission.js';
import { createIntegratedExecution, sampleIntegratedExecution, deriveIntegratedTelemetry, segmentAtTime } from '../src/lab/IntegratedMissionPlayback.js';
import { refineTransferCandidate, candidateEdgeDiagnostics, MU_SUN, searchLaunchWindows } from '../src/lab/InterplanetaryPlan.js';
import { initialOrbitState, createLandingEnvironment } from '../src/lab/BodyLandingDynamics.js';
import { getBodyProfile } from '../src/lab/CelestialBodyMissionRegistry.js';
import { DEMO_LANDER } from '../src/lab/BodyLandingVehicle.js';
import { PRESETS } from '../src/lab/ProbeDesign.js';
import { calculateEngineering } from '../src/lab/ProbeEngineering.js';
import { G0_M_S2 } from '../src/lab/FiniteThrustDynamics.js';
import { datetimeLocalUtcToJdTdb } from '../src/science/AstrodynamicsTime.js';

const json = file => JSON.parse(readFileSync(file, 'utf8'));
const catalog = { catalogVersion: 1, datasets: [...json('public/data/interplanetary-ephemerides-catalog-v1.json').datasets, ...json('public/data/encounter-ephemerides-catalog-v1.json').datasets] };
const ephemeris = () => createInterplanetaryEphemeris({ catalog, loadJson: async file => json(`public/${file}`) });
const galilean = createPlanetocentricWindow(json('public/data/interplanetary/galilean-moons-jsb-2031-2032.json'));
const holdoutBary = json('tests/fixtures/stage13-encounter-holdout-v1.json');
const holdoutMoons = json('tests/fixtures/stage13-galilean-holdout-v1.json');
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = a => Math.hypot(a[0], a[1], a[2]);
const dist = (a, b) => norm(sub(a, b));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const near = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected} (tol ${tolerance})`);
const design = () => PRESETS.find(p => p.id === 'interplanetary').create();
const MU_MARS = ENCOUNTER_TARGETS['499'].mu, R_MARS = ENCOUNTER_TARGETS['499'].radiusKm, MU_JUP = ENCOUNTER_TARGETS['599'].mu, RJ = ENCOUNTER_TARGETS['599'].radiusKm;
const specificEnergy = (r, v, mu) => dot(v, v) / 2 - mu / norm(r);

// Semillas = mejores candidatos de la cuadrícula 12G (casos A y C de docs/STAGE12G_INTERPLANETARY_PLANNING.md).
const MARS = { departureJdTdb: datetimeLocalUtcToJdTdb('2028-11-30'), tofDays: 316 };
const JUPITER = { departureJdTdb: datetimeLocalUtcToJdTdb('2028-12-26'), tofDays: 1090 };
let marsWindow, jupiterWindow, jupiterRefined;
async function windows() {
  if (marsWindow) return;
  const e = ephemeris();
  marsWindow = await e.loadWindow(['399', '499'], 2462050.5, 2462700.5);
  jupiterWindow = await e.loadWindow(['399', '5'], 2462100.5, 2463400.5);
  jupiterRefined = refineTransferCandidate(jupiterWindow, { destinationId: '5', departureJdTdb: JUPITER.departureJdTdb, tofDays: JUPITER.tofDays, criterion: 'c3', halfSpanDepartureDays: 2, halfSpanTofDays: 5 });
}
const marsMission = (planet, extra = {}) => computeIntegratedMission({ destinationId: '499', opportunity: { departureJdTdb: MARS.departureJdTdb, arrivalJdTdb: MARS.departureJdTdb + MARS.tofDays }, design: design(),
  profile: { planet: { mode: 'capture', periapsisAltitudeKm: 400, ...planet }, ...extra } }, { helio: marsWindow });
const europaMission = (propellantKg, overrides = {}) => computeIntegratedMission({ destinationId: '599', moonId: '502',
  opportunity: overrides.opportunity ?? { departureJdTdb: jupiterRefined.departureJdTdb, arrivalJdTdb: jupiterRefined.arrivalJdTdb }, design: design(),
  propulsionModule: { ...DEMO_PROPULSION_MODULE, propellantKg }, lander: DEMO_LANDER,
  profile: { planet: { mode: 'capture', periapsisAltitudeKm: 3 * RJ, captureBurns: [{ apoapsisAltitudeKm: 4e6 }], orbitCoastDays: 1 },
    moon: { periapsisAltitudeKm: 100, captureBurns: [{ apoapsisAltitudeKm: 5000 }, { apoapsisAltitudeKm: 100 }] }, landing: { enabled: true } } }, { helio: jupiterWindow, moons: galilean });

// ---------- Propagador kepleriano (correcciones de 13) ----------
test('Kepler: órbita casi rectilínea y arco hiperbólico lejano convergen y coinciden con la composición de pasos cortos', () => {
  const cases = [
    { r: [2267561.386767039, -2801661.4713792633, -193763.43382293076], v: [2.721675048691431, -2.60589195122958, -0.1265293873567782], dt: 1447200, mu: MU_JUP },
    { r: [-270676.0135961335, 68630.31973661039, 16191.85821830621], v: [-7.754199206921269, -28.658827005689076, -0.29375024022451507], dt: 86400, mu: MU_JUP },
    { r: [6236696.442460371, -5402894.682927101, 3594717.6348404153], v: [22.230541491370115, -19.13189992961259, 12.384734319250503], dt: 5620.207346814415, mu: MU_JUP }
  ];
  for (const c of cases) {
    const big = propagateKepler(c.r, c.v, c.dt, c.mu);
    assert.ok(big.identityError < 1e-10, `identidad f·ġ − ḟ·g = 1: ${big.identityError}`);
    let s = { positionKm: c.r, velocityKmS: c.v };
    for (let i = 0; i < 200; i++) s = propagateKepler(s.positionKm, s.velocityKmS, c.dt / 200, c.mu);
    assert.ok(dist(big.positionKm, s.positionKm) / norm(big.positionKm) < 1e-9, 'composición de pasos');
    near(specificEnergy(big.positionKm, big.velocityKmS, c.mu), specificEnergy(c.r, c.v, c.mu), 1e-9 * Math.abs(specificEnergy(c.r, c.v, c.mu)) + 1e-12, 'energía');
  }
});

test('Kepler: barrido aleatorio determinista (elipses e hipérbolas, ±10⁷ s) sin fallos de convergencia', () => {
  let seed = 13, worst = 0;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let k = 0; k < 600; k++) {
    const R = 1e4 + rnd() * 3e7, dir = [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5], vc = Math.sqrt(MU_JUP / R);
    const r = dir.map(x => x * R / norm(dir)), v = [0, 1, 2].map(() => (rnd() - 0.5) * 2.4 * vc), dt = (rnd() * 2 - 0.5) * 1e7;
    const big = propagateKepler(r, v, dt, MU_JUP);
    let s = { positionKm: r, velocityKmS: v };
    for (let i = 0; i < 20; i++) s = propagateKepler(s.positionKm, s.velocityKmS, dt / 20, MU_JUP);
    worst = Math.max(worst, dist(big.positionKm, s.positionKm) / Math.max(1, norm(big.positionKm)));
  }
  assert.ok(worst < 1e-7, `error relativo máximo ${worst}`);
});

// ---------- Esfera de influencia, hipérbola y plano B ----------
test('SOI: Laplace y Hill coinciden con las fórmulas cerradas; Hill es mayor', () => {
  const a = 227939366, m = MU_MARS, M = MU_SUN;
  near(sphereOfInfluenceRadiusKm({ model: 'laplace', semiMajorAxisKm: a, muBody: m, muPrimary: M }), a * (m / M) ** 0.4, 1e-6, 'Laplace');
  near(sphereOfInfluenceRadiusKm({ model: 'hill', semiMajorAxisKm: a, eccentricity: 0.0934, muBody: m, muPrimary: M }), a * (1 - 0.0934) * Math.cbrt(m / (3 * M)), 1e-6, 'Hill');
  assert.ok(sphereOfInfluenceRadiusKm({ model: 'hill', semiMajorAxisKm: a, muBody: m, muPrimary: M }) > sphereOfInfluenceRadiusKm({ model: 'laplace', semiMajorAxisKm: a, muBody: m, muPrimary: M }));
  assert.throws(() => sphereOfInfluenceRadiusKm({ model: 'otro', semiMajorAxisKm: a, muBody: m, muPrimary: M }));
});

test('Hipérbola desde el plano B: e, b, giro, periapsis y plano B recuperados desde un estado propagado', () => {
  const vInf = [2.1, -1.4, 0.6], rp = R_MARS + 400, v = norm(vInf);
  for (const theta of [0, 37, -120, 180]) {
    const h = hyperbolaFromBPlane({ vInfVectorKmS: vInf, muKm3S2: MU_MARS, periapsisRadiusKm: rp, bAngleDeg: theta });
    near(h.eccentricity, 1 + rp * v * v / MU_MARS, 1e-12, 'e');
    near(h.impactParameterKm, Math.sqrt(rp * rp + 2 * MU_MARS * rp / (v * v)), 1e-7, 'b');
    near(h.turnAngleDeg, 2 * Math.asin(1 / h.eccentricity) * 180 / Math.PI, 1e-10, 'giro');
    near(norm(h.outgoingVInfVectorKmS), v, 1e-12, '|v∞| de salida');
    // Estado en r = 500 000 km de la rama de entrada → propagar hasta el periapsis (Kepler) → mismo rp.
    const state = stateOnConic(h, trueAnomalyAtRadius(h, 5e5, 'incoming'));
    const next = timeToNextPeriapsis(state.positionKm, state.velocityKmS, MU_MARS);
    near(norm(next.stateAtPeriapsis.positionKm), rp, 1e-6, 'periapsis');
    const b = bPlaneFromState(state.positionKm, state.velocityKmS, MU_MARS);
    near(b.bMagnitudeKm, h.impactParameterKm, 1e-6, '|B|'); near(b.BdotT, h.BdotT, 1e-6, 'B·T'); near(b.BdotR, h.BdotR, 1e-6, 'B·R');
    const ex = asymptoticExcess(state.positionKm, state.velocityKmS, MU_MARS);
    assert.ok(dist(ex.vInfVectorKmS, vInf) < 1e-9, 'asíntota de entrada');
  }
});

test('Captura impulsiva: Δv = √(v∞² + 2μ/rp) − √(μ(2/rp − 1/a)) contra vis-viva independiente', () => {
  const vInf = 3.0885, rp = R_MARS + 400, ra = R_MARS + 33000, a = (rp + ra) / 2;
  const c = impulsiveCaptureDeltaV({ vInfKmS: vInf, muKm3S2: MU_MARS, periapsisRadiusKm: rp, apoapsisRadiusKm: ra });
  const energyHyp = vInf * vInf / 2, vpHyp = Math.sqrt(2 * (energyHyp + MU_MARS / rp)), vpEll = Math.sqrt(2 * (-MU_MARS / (2 * a) + MU_MARS / rp));
  near(c.deltaVKmS, vpHyp - vpEll, 1e-12, 'Δv'); near(c.periodSeconds, 2 * Math.PI * Math.sqrt(a ** 3 / MU_MARS), 1e-6, 'periodo');
  assert.throws(() => impulsiveCaptureDeltaV({ vInfKmS: vInf, muKm3S2: MU_MARS, periapsisRadiusKm: rp, apoapsisRadiusKm: rp - 1 }));
});

// ---------- Captura con empuje finito ----------
function marsArrival() {
  const h = hyperbolaFromBPlane({ vInfVectorKmS: [2.4, -1.6, 0.9], muKm3S2: MU_MARS, periapsisRadiusKm: R_MARS + 400, bAngleDeg: 20 });
  return { h, state: stateOnConic(h, trueAnomalyAtRadius(h, 5.7e5, 'incoming')) };
}
const probeVehicle = () => { const e = calculateEngineering(design()); return { massKg: e.wetMassKg, propellantKg: e.fuelKg, engine: { name: 'sonda', thrustN: e.thrustN, ispS: e.effectiveIspS } }; };

test('Captura finita en Marte: objetivo alcanzado, Δv ≥ impulsivo, Tsiolkovsky exacto y RK4 independiente reproduce el encendido', () => {
  const { h, state } = marsArrival(), vehicle = probeVehicle(), ra = R_MARS + 33000;
  const ins = simulateInsertion({ mu: MU_MARS, bodyRadiusKm: R_MARS, positionKm: state.positionKm, velocityKmS: state.velocityKmS, vehicle, burns: [{ id: 'c1', targetApoapsisRadiusKm: ra }], coastAfterSeconds: 3600 });
  assert.equal(ins.status, INSERTION_STATUS.target);
  const burn = ins.burns[0], ref = impulsiveInsertionReference({ mu: MU_MARS, vInfKmS: h.vInfKmS, periapsisRadiusKm: h.periapsisRadiusKm, burns: [{ targetApoapsisRadiusKm: ra }], massKg: vehicle.massKg, ispS: vehicle.engine.ispS });
  assert.ok(burn.propulsiveDeltaVKmS > burn.impulsiveDeltaVKmS && burn.gravityLossKmS > 0 && burn.gravityLossKmS < 0.05, `pérdida por gravedad ${burn.gravityLossKmS}`);
  near(burn.impulsiveDeltaVKmS, ref.totalDeltaVKmS, 1e-6, 'referencia impulsiva');
  near(burn.integratedDeltaVKmS, burn.propulsiveDeltaVKmS, 1e-7, '∫a dt = ve·ln(m0/m1)');
  const ve = vehicle.engine.ispS * G0_M_S2 / 1000;
  near(Math.log((burn.massAfterKg + burn.propellantKg) / burn.massAfterKg) * ve, burn.propulsiveDeltaVKmS, 1e-12, 'Tsiolkovsky');
  near(ins.final.orbit.apoapsisRadiusKm, ra, 1e-3 * ra, 'apoapsis objetivo (corte por evento)');
  // RK4 de paso fijo, implementado aquí, con la misma ley (retrógrada continua, flujo constante) y el mismo intervalo.
  const seg = ins.segments.find(s => s.kind === 'burn'), flow = vehicle.engine.thrustN / (vehicle.engine.ispS * G0_M_S2);
  const f = s => { const r = Math.hypot(s[0], s[1], s[2]), vv = Math.hypot(s[3], s[4], s[5]), a = vehicle.engine.thrustN / s[6] / 1000, g = -MU_MARS / r ** 3;
    return [s[3], s[4], s[5], g * s[0] - a * s[3] / vv, g * s[1] - a * s[4] / vv, g * s[2] - a * s[5] / vv, -flow]; };
  let s = [...seg.initial.positionKm, ...seg.initial.velocityKmS, seg.initial.massKg];
  const n = 20000, dt = (seg.endSeconds - seg.startSeconds) / n;
  for (let i = 0; i < n; i++) { const k1 = f(s), k2 = f(s.map((x, j) => x + dt / 2 * k1[j])), k3 = f(s.map((x, j) => x + dt / 2 * k2[j])), k4 = f(s.map((x, j) => x + dt * k3[j])); s = s.map((x, j) => x + dt / 6 * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j])); }
  assert.ok(dist(s.slice(0, 3), seg.final.positionKm) < 1e-3, `RK4 posición ${dist(s.slice(0, 3), seg.final.positionKm)} km`);
  assert.ok(dist(s.slice(3, 6), seg.final.velocityKmS) < 1e-6, 'RK4 velocidad');
  // Tramos balísticos: energía específica conservada.
  for (const k of ins.segments.filter(x => x.kind === 'kepler')) near(specificEnergy(k.final.positionKm, k.final.velocityKmS, MU_MARS), specificEnergy(k.initial.positionKm, k.initial.velocityKmS, MU_MARS), 1e-10, 'energía balística');
});

test('Combustible insuficiente: agotamiento registrado; sin frenado: sobrevuelo; nunca se convierte un impulso en un encendido ficticio', () => {
  const { state } = marsArrival(), vehicle = probeVehicle();
  const circ = simulateInsertion({ mu: MU_MARS, bodyRadiusKm: R_MARS, positionKm: state.positionKm, velocityKmS: state.velocityKmS, vehicle, burns: [{ id: 'c1', targetApoapsisRadiusKm: R_MARS + 400 }] });
  assert.equal(circ.status, INSERTION_STATUS.partial); assert.equal(circ.burns[0].endEvent, 'depleted'); assert.equal(circ.burns[0].gravityLossKmS, null);
  near(circ.totals.remainingPropellantKg, 0, 1e-6, 'propelente restante');
  assert.ok(circ.events.some(e => e.kind === 'depletion'));
  const little = simulateInsertion({ mu: MU_MARS, bodyRadiusKm: R_MARS, positionKm: state.positionKm, velocityKmS: state.velocityKmS, vehicle: { ...vehicle, propellantKg: 20 }, burns: [{ id: 'c1', targetApoapsisRadiusKm: R_MARS + 33000 }] });
  assert.equal(little.status, INSERTION_STATUS.flyby); assert.ok(!little.final.orbit.bound);
  // La duración del encendido es la integrada (masa/flujo), no Δv impulsivo/aceleración inicial.
  const flow = vehicle.engine.thrustN / (vehicle.engine.ispS * G0_M_S2);
  near(little.burns[0].durationSeconds, 20 / flow, 1e-3, 'duración = propelente/flujo');
});

test('Elementos clásicos ↔ órbita inicial de 12F: el estado se reconstruye exactamente', () => {
  const env = createLandingEnvironment(getBodyProfile('502'));
  for (const o of [{ periapsisAltitudeKm: 100, apoapsisAltitudeKm: 400, inclinationDeg: 37, raanDeg: 211, argumentOfPeriapsisDeg: 75, trueAnomalyDeg: 300 },
    { periapsisAltitudeKm: 100, apoapsisAltitudeKm: 100, inclinationDeg: 12, raanDeg: 20, argumentOfPeriapsisDeg: 0, trueAnomalyDeg: 80 }]) {
    const s = initialOrbitState(env, o), el = classicalElements(s.positionKm, s.velocityKmS, env.mu, env.radiusKm), s2 = initialOrbitState(env, el);
    assert.ok(dist(s.positionKm, s2.positionKm) < 1e-9 && dist(s.velocityKmS, s2.velocityKmS) < 1e-12);
  }
  assert.throws(() => classicalElements([1e4, 0, 0], [0, 10, 0], 3202.7), /no es ligada/);
});

// ---------- Efemérides de baricentros y satélites ----------
test('Baricentros 5–8: Hermite a 4 días frente a Horizons fuera de los nodos (≤ 10 m); el centro de Júpiter se aparta 10²  km', async () => {
  const e = ephemeris();
  for (const [id, block] of Object.entries(holdoutBary.states)) {
    const rows = block.rows;
    const w = await e.loadWindow([id], rows[0][0] - 8, rows.at(-1)[0] + 8);
    for (const row of rows) {
      const s = w.stateAt(id, row[0]);
      assert.equal(s.status, 'available');
      assert.ok(dist(s.positionKm, row.slice(1, 4)) < 0.01, `${id} @${row[0]}: ${dist(s.positionKm, row.slice(1, 4))} km`);
      assert.ok(dist(s.velocityKmS, row.slice(4, 7)) < 1e-6);
    }
  }
  const offsets = holdoutBary.jupiterCenterFromBarycenter.rows.map(r => norm(r.slice(1, 4)));
  assert.ok(Math.max(...offsets) > 50 && Math.max(...offsets) < 400, 'el centro 599 oscila ~10² km alrededor del baricentro');
});

test('Satélites galileanos (500@5): error de interpolación ≤ el declarado; fuera de la ventana «no disponible» sin extrapolar', () => {
  for (const [key, block] of Object.entries(holdoutMoons.states)) {
    const declared = MEASURED_MOON_INTERPOLATION_ERROR[key];
    for (const row of block.rows) {
      const s = galilean.stateAt(key, row[0]);
      assert.equal(s.status, 'available');
      assert.ok(dist(s.positionKm, row.slice(1, 4)) <= declared.positionKm * 1.02, `${key}: ${dist(s.positionKm, row.slice(1, 4))} km > ${declared.positionKm}`);
      assert.ok(dist(s.velocityKmS, row.slice(4, 7)) <= declared.velocityKmS * 1.02);
    }
  }
  const cov = galilean.coverage('Europa');
  const out = galilean.stateAt('Europa', cov.endJdTdb + 0.01);
  assert.equal(out.status, 'unavailable'); assert.equal(out.message, MOON_UNAVAILABLE_MESSAGE);
  assert.equal(galilean.stateAt('Titan', cov.startJdTdb + 1).status, 'unavailable');
  const bad = json('public/data/interplanetary/galilean-moons-jsb-2031-2032.json');
  bad.bodies.Europa.rows.splice(100, 1);
  assert.throws(() => createPlanetocentricWindow(bad), /hueco|cadencia/);
});

// ---------- Apuntado del encuentro ----------
test('Apuntado: el arco heliocéntrico real llega a la SOI con la hipérbola pedida (periapsis ±1 m) sin inventar orientación', async () => {
  await windows();
  const tgt = ENCOUNTER_TARGETS['499'], earth = marsWindow.stateAt('399', MARS.departureJdTdb);
  const aim = aimEncounter({ departurePositionKm: earth.positionKm, departureJdTdb: MARS.departureJdTdb, periapsisJdTdb: MARS.departureJdTdb + MARS.tofDays,
    targetStateAt: jd => { const s = marsWindow.stateAt('499', jd); return s.status === 'available' ? s : null; }, muCentral: MU_SUN, muTarget: tgt.mu, targetRadiusKm: tgt.radiusKm,
    periapsisRadiusKm: tgt.radiusKm + 400, bPlane: { mode: 'normal', normal: [0, 0, 1] }, soiRadiusKm: 577000 });
  assert.equal(aim.status, AIM_STATUS.aimed);
  near(aim.achieved.periapsisAltitudeKm, 400, 1e-3, 'altitud de periapsis lograda');
  near(norm(aim.soi.relative.positionKm), 577000, 1e-3, 'entrada en la SOI');
  assert.ok(aim.mismatchKmS < 1e-9);
  // Lambert al CENTRO del planeta no define la aproximación: su velocidad de salida difiere de la apuntada (m/s) y terminaría en impacto.
  const center = solveLambert(earth.positionKm, marsWindow.stateAt('499', MARS.departureJdTdb + MARS.tofDays).positionKm, MARS.tofDays * 86400, MU_SUN, { direction: 'prograde' });
  assert.ok(dist(center.departureVelocityKmS, aim.departure.velocityKmS) > 1e-4, 'el apuntado cambia la salida');
  const noCov = aimEncounter({ departurePositionKm: earth.positionKm, departureJdTdb: MARS.departureJdTdb, periapsisJdTdb: MARS.departureJdTdb + MARS.tofDays, targetStateAt: () => null,
    muCentral: MU_SUN, muTarget: tgt.mu, targetRadiusKm: tgt.radiusKm, periapsisRadiusKm: tgt.radiusKm + 400, bPlane: { mode: 'fixed', angleDeg: 0 }, soiRadiusKm: 577000 });
  assert.equal(noCov.status, AIM_STATUS.noCoverage);
});

// ---------- Misión A: Tierra → Marte ----------
test('Misión A1 (Marte, combustible suficiente): cadena completa, continuidad < 1 m y < 10⁻⁹ km/s, descenso atmosférico PENDIENTE', async () => {
  await windows();
  const m = marsMission({ captureBurns: [{ apoapsisAltitudeKm: 33000 }] }, { landing: { enabled: true } });
  const ph = Object.fromEntries(m.phases.map(p => [p.id, p]));
  assert.equal(ph.capture.status, PHASE_STATUS.done); assert.equal(ph.landing.status, PHASE_STATUS.pending);
  assert.equal(ph.departure.status, PHASE_STATUS.initial);
  assert.ok(m.continuity.maxPositionErrorKm < 1e-3 && m.continuity.maxVelocityErrorKmS < 1e-9 && m.continuity.maxTimeGapSeconds === 0 && m.continuity.undeclaredMassJumps === 0);
  assert.ok(m.continuity.boundaries.some(b => b.frameChange), 'hay un cambio de marco Sol → Marte comprobado');
  near(m.departure.c3Km2S2, 8.996, 0.02, 'C3 apuntado a la SOI frente a 12G (8,996 al centro de Marte)');
  const b = m.maneuvers[0];
  assert.ok(b.propellantKg > 150 && b.propellantKg < 190 && b.endEvent === 'cutoff');
  near(m.finalMassKg + b.propellantKg, m.vehicle.totalKg, 1e-6, 'masa conservada');
  // Determinismo.
  const again = marsMission({ captureBurns: [{ apoapsisAltitudeKm: 33000 }] }, { landing: { enabled: true } });
  assert.deepEqual(again.segments.at(-1).initial.positionKm, m.segments.at(-1).initial.positionKm);
});

test('Misión A2/A3 (Marte): órbita circular → captura parcial por agotamiento; sobrevuelo → salida de la SOI y crucero posterior continuo', async () => {
  await windows();
  const a2 = marsMission({ captureBurns: [{ apoapsisAltitudeKm: 400 }] });
  assert.equal(a2.phases.find(p => p.id === 'capture').status, PHASE_STATUS.partial);
  assert.equal(a2.maneuvers[0].endEvent, 'depleted'); assert.ok(a2.tanks.probe < 1e-6);
  const a3 = marsMission({ mode: 'flyby' });
  assert.ok(a3.segments.some(s => s.id === 'flyby') && a3.segments.at(-1).centralBodyId === '10');
  assert.equal(a3.maneuvers.length, 0);
  assert.ok(a3.continuity.maxPositionErrorKm < 1e-3 && a3.continuity.maxVelocityErrorKmS < 1e-9);
  const flyby = a3.segments.find(s => s.id === 'flyby');
  const end = propagateKepler(flyby.initial.positionKm, flyby.initial.velocityKmS, flyby.endSeconds - flyby.startSeconds, flyby.mu);
  near(norm(end.positionKm), a3.approach.soiRadiusKm, 1, 'salida exactamente en la SOI');
  assert.throws(() => computeIntegratedMission({ destinationId: '301', opportunity: { departureJdTdb: 1, arrivalJdTdb: 2 }, design: design() }, { helio: marsWindow }), IntegratedMissionError);
});

// ---------- Misión B: Tierra → Júpiter → Europa ----------
test('Misión B1 (Júpiter → Europa): baricentro, JOI, transferencia finita apuntada, captura en Europa y descenso 12F conectado', async () => {
  await windows();
  const m = europaMission(80000);
  const ph = Object.fromEntries(m.phases.map(p => [p.id, p]));
  for (const id of ['cruise', 'approach', 'capture', 'planet-orbit', 'moon-transfer', 'moon-approach', 'moon-capture', 'landing']) assert.equal(ph[id].status, PHASE_STATUS.done, id);
  assert.equal(m.target.ephemerisId, '5'); assert.match(m.target.massScope, /system/);
  assert.ok(m.continuity.maxPositionErrorKm < 0.05 && m.continuity.maxVelocityErrorKmS < 1e-9 && m.continuity.undeclaredMassJumps === 0, JSON.stringify(m.continuity));
  assert.equal(m.continuity.boundaries.filter(b => b.frameChange).length, 2, 'Sol→Júpiter y Júpiter→Europa (el descenso usa el mismo marco centrado en Europa)');
  assert.ok(m.continuity.boundaries.some(b => b.to === 'landing' && !b.frameChange && b.positionErrorKm < 1e-6));
  assert.ok(m.separations.length === 1 && m.continuity.boundaries.some(b => b.separation));
  const transfer = m.maneuvers.find(x => x.id === 'moon-transfer-burn');
  assert.ok(transfer.missKm < 0.05, `error de apuntado en la SOI de Europa ${transfer.missKm} km`);
  near(ph['moon-approach'].approach.periapsisAltitudeKm, 100, 0.5, 'periapsis en Europa');
  assert.ok(ph.landing.landing.residual.positionKm < 1e-6, 'órbita inicial de 12F = estado final de la captura');
  // Masa: cada encendido descuenta exactamente su propelente del depósito del módulo.
  const used = m.maneuvers.filter(x => x.engineKey === 'module').reduce((n, x) => n + x.propellantKg, 0);
  near(m.tanks.module, 80000 - used, 1e-6, 'depósito del módulo');
  assert.ok(m.tanks.module >= 0 && m.approach.closeApproaches.length === 3);
});

test('Misión B2 (propelente insuficiente): la captura en Europa no es viable, no hay descenso y la cadena se declara NO VIABLE', async () => {
  await windows();
  const m = europaMission(50000);
  const ph = Object.fromEntries(m.phases.map(p => [p.id, p]));
  assert.equal(ph['moon-capture'].status, PHASE_STATUS.failed);
  assert.ok(!m.segments.some(s => s.kind === 'landing') && !ph.landing);
  assert.ok(m.verdict.startsWith('NO VIABLE'));
  near(m.tanks.module, 0, 1e-6, 'módulo agotado');
});

test('Misión B sin efemérides de satélites en la llegada: «datos no disponibles», sin estados inventados', async () => {
  await windows();
  // Llegada a Júpiter en 2031-07 (antes de la ventana galileana 2031-08-01 → 2032-06-01).
  const dep = jupiterRefined.departureJdTdb, m = europaMission(80000, { opportunity: { departureJdTdb: dep, arrivalJdTdb: dep + 940 } });
  const ph = m.phases.find(p => p.id === 'moon-transfer');
  assert.ok(ph && [PHASE_STATUS.noData, PHASE_STATUS.failed, PHASE_STATUS.skipped].includes(ph.status), ph?.status);
  assert.ok(!m.segments.some(s => s.centralBodyId === '502'));
});

// ---------- Reproducción ----------
test('Reproducción: determinista, reversible, contextos coherentes con las efemérides y telemetría de masa por depósito', async () => {
  await windows();
  const d = design(), m = europaMission(80000), data = { helio: jupiterWindow, moons: galilean };
  const ex = createIntegratedExecution({ result: m, data, design: d });
  assert.deepEqual(Object.keys(ex.contexts).sort(), ['helio', 'landing', 'moon', 'planet']);
  const tEuropa = m.segments.find(s => s.centralBodyId === '502').startSeconds + 600;
  const a = sampleIntegratedExecution(ex, tEuropa), b = sampleIntegratedExecution(ex, tEuropa);
  assert.deepEqual(a.positionKm, b.positionKm); assert.equal(a.context, 'moon');
  const inPlanet = sampleIntegratedExecution(ex, tEuropa, 'planet'), moon = galilean.stateAt('Europa', a.jdTdb);
  assert.ok(dist(sub(inPlanet.positionKm, moon.positionKm), a.positionKm) < 1e-9, 'planeta − satélite = estado centrado en el satélite');
  const helio = sampleIntegratedExecution(ex, tEuropa, 'helio'), bary = jupiterWindow.stateAt('5', a.jdTdb);
  assert.ok(dist(sub(helio.positionKm, bary.positionKm), inPlanet.positionKm) < 1e-6);
  for (const e of ex.events) { const s = sampleIntegratedExecution(ex, e.elapsedSeconds); const t = deriveIntegratedTelemetry(ex, s); assert.ok(Number.isFinite(t.propulsion.massKg) && t.propulsion.tanks.module >= -1e-6); }
  const end = deriveIntegratedTelemetry(ex, sampleIntegratedExecution(ex, ex.durationSeconds));
  near(end.propulsion.tanks.module, m.tanks.module, 1e-6, 'depósito al final');
  assert.equal(segmentAtTime(m.segments, m.segments[3].startSeconds), 3, 'en una frontera se toma el tramo que empieza');
  assert.throws(() => sampleIntegratedExecution(ex, -1));
  // La continuidad recalculada desde fuera coincide con la registrada.
  const c = checkContinuity(m.segments, m.separations, data, m.target, 'Europa', m.departureJdTdb);
  near(c.maxPositionErrorKm, m.continuity.maxPositionErrorKm, 1e-12, 'continuidad');
});

// ---------- Observaciones de Gemini sobre 12G ----------
test('OBS-12G-01/03: el refinamiento local no empeora el mejor de la cuadrícula y los bordes se señalan', async () => {
  await windows();
  assert.ok(jupiterRefined.score <= jupiterRefined.gridScore + 1e-12 && jupiterRefined.evaluations <= 160);
  const search = searchLaunchWindows(marsWindow, { originId: '399', destinationId: '499', departureStartUtc: '2028-11-01', departureEndUtc: '2028-11-30', tofMinDays: 200, tofMaxDays: 300,
    departureStepDays: 2, tofStepDays: 4, criterion: 'c3', parkingAltitudeKm: 200 });
  const diag = candidateEdgeDiagnostics(search, search.best, ephemeris().coverage('499'));
  assert.ok(diag.warnings.length >= 1, 'el mínimo cae en un borde del intervalo recortado');
});
