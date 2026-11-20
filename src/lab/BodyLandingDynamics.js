// Etapa 12F — dinámica y guiado de descenso sobre un cuerpo central cualquiera (modelo de masa puntual, un solo cuerpo).
// Unidades: km, km/s, s, kg, N. Las aceleraciones de guiado se calculan en m/s² y se convierten a km/s² (÷1000).
// Estado (8 componentes, como 12D): [x, y, z, vx, vy, vz, m, Δv_acum]
//   dr/dt = v            dv/dt = −μ r/|r|³ + θ·F_max·û/(m·1000)
//   dm/dt = −θ·F_max/(Isp·g0)            dΔv/dt = θ·F_max/(m·1000)   [km/s]
// Perturbaciones EXPLÍCITAMENTE ausentes: arrastre/atmósfera, J2 y no esfericidad, terceros cuerpos, mareas, radiación solar,
// actitud y deslizamiento de propelente. Todo el modelo depende solo del perfil del cuerpo (μ, R, ω opcional).
import { integrateDopri54 } from '../science/NumericalIntegrator.js';
import { STANDARD_GRAVITY_M_S2 } from './BodyLandingVehicle.js';

export class LandingError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = 'LandingError'; this.code = code; this.details = details; }
}
export const LANDING_ABS_TOL = [1e-7, 1e-7, 1e-7, 1e-10, 1e-10, 1e-10, 1e-6, 1e-12];
export const LANDING_REL_TOL = 1e-10;
export const DEFAULT_LANDING_GUIDANCE = Object.freeze({
  descentPeriapsisAltitudeKm: 15, deorbitDelaySeconds: 0,
  // Perfil vertical: v_z,obj = −√(v_td² + 2·a_d·máx(h − h_ref, 0)), a_d = fracción·(F_max/m − g), ganancia K (1/s).
  // Corredor de altitud h_ref = c·v_h^1,5 + τc·v_h (m, v_h en m/s): el vehículo no desciende por debajo mientras queda velocidad horizontal
  // por frenar. Es una ley heurística de guiado (no una trayectoria óptima ni un resultado predefinido).
  descentDecelFraction: 0.5, verticalGainPerS: 2, corridorCoefficient: 0.2, corridorLinearSeconds: 3, touchdownSpeedMS: 1, horizontalTimeConstantS: 3,
  // Umbrales de fase (solo etiquetas): frenado principal si v_h > 200 m/s; reducción horizontal si v_h > 5 m/s; si no, terminal.
  mainBrakingSpeedMS: 200, horizontalReductionSpeedMS: 5
});
export const DEFAULT_LANDING_LIMITS = Object.freeze({ softVerticalMS: 3, softHorizontalMS: 1.5, hardVerticalMS: 6, hardHorizontalMS: 3 });

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = a => Math.hypot(a[0], a[1], a[2]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export function createLandingEnvironment(profile) {
  if (!profile?.gm || !profile?.radiusKm) throw new LandingError('MISSING_BODY_DATA', `Faltan datos físicos de ${profile?.name ?? 'el cuerpo'}: ${!profile?.gm ? 'GM' : 'radio'}.`);
  const w = profile.rotation ? profile.rotation.angularVelocityRadS : 0;
  return Object.freeze({ bodyId: profile.id, bodyName: profile.name, mu: profile.gm.value, radiusKm: profile.radiusKm.value,
    omegaVectorRadS: profile.rotation ? profile.rotation.axis.map(x => x * w) : null, rotates: Boolean(profile.rotation) });
}

export const surfaceGravityMS2 = env => env.mu / env.radiusKm ** 2 * 1000;
export const circularSpeedKmS = (env, altitudeKm) => Math.sqrt(env.mu / (env.radiusKm + altitudeKm));

// v_rel = v − ω × r. Solo si el cuerpo declara rotación; en otro caso el "suelo" se supone en reposo en el marco local.
export function relativeVelocityKmS(env, position, velocity) {
  if (!env.omegaVectorRadS) return [velocity[0], velocity[1], velocity[2]];
  const wr = cross(env.omegaVectorRadS, position);
  return [velocity[0] - wr[0], velocity[1] - wr[1], velocity[2] - wr[2]];
}
export function surfaceKinematics(env, position, velocity) {
  const r = norm(position), up = [position[0] / r, position[1] / r, position[2] / r];
  const rel = relativeVelocityKmS(env, position, velocity);
  const vz = dot(rel, up), horiz = [rel[0] - vz * up[0], rel[1] - vz * up[1], rel[2] - vz * up[2]];
  return { radiusKm: r, altitudeKm: r - env.radiusKm, up, relativeVelocityKmS: rel, verticalMS: vz * 1000, horizontalMS: norm(horiz) * 1000, horizontalVector: horiz,
    relativeSpeedMS: norm(rel) * 1000, gravityMS2: env.mu / (r * r) * 1000 };
}

export function descentPhaseOf(guidance, horizontalMS) {
  return horizontalMS > guidance.mainBrakingSpeedMS ? 'braking' : horizontalMS > guidance.horizontalReductionSpeedMS ? 'horizontal-reduction' : 'terminal';
}

// Orden de guiado. mode: 'off' | 'retrograde' (salida de órbita, θ = 1 contra la velocidad inercial) | 'descent' (lazo cerrado).
// Devuelve el empuje real (N), dirección, acelerador aplicado y banderas de saturación. Función pura del estado.
export function landingCommand(env, lander, guidance, mode, state, massDryKg) {
  const engine = lander.engine, none = { thrustN: 0, throttle: 0, direction: [0, 0, 0], saturated: false, engineOn: false, phase: null, commandedThrottle: 0 };
  if (mode === 'off' || state[6] <= massDryKg + 1e-9) return none;
  const position = [state[0], state[1], state[2]], velocity = [state[3], state[4], state[5]], m = state[6];
  if (mode === 'retrograde') {
    const speed = norm(velocity);
    if (!(speed > 1e-12)) return none;
    return { thrustN: engine.thrustMaxN, throttle: 1, direction: velocity.map(x => -x / speed), saturated: false, engineOn: true, phase: 'deorbit', commandedThrottle: 1 };
  }
  const k = surfaceKinematics(env, position, velocity);
  const aMax = engine.thrustMaxN / m; // m/s²
  const vh = k.horizontalMS, hM = Math.max(0, k.altitudeKm * 1000);
  const gEff = k.gravityMS2 - vh * vh / (k.radiusKm * 1000); // alivio centrífugo respecto a la superficie
  const aD = Math.max(0.05, guidance.descentDecelFraction * (aMax - k.gravityMS2));
  const hRef = guidance.corridorCoefficient * vh ** 1.5 + guidance.corridorLinearSeconds * vh;
  const vzTarget = -Math.sqrt(guidance.touchdownSpeedMS ** 2 + 2 * aD * Math.max(0, hM - hRef));
  // Prealimentación a_d sobre el perfil (se anula al acercarse a la velocidad de contacto, para no mantener un vuelo estacionario).
  const feedForward = aD * Math.min(1, Math.max(0, (-vzTarget - guidance.touchdownSpeedMS) / guidance.touchdownSpeedMS));
  let aUp = Math.max(0, gEff + feedForward + guidance.verticalGainPerS * (vzTarget - k.verticalMS));
  let saturated = false;
  if (aUp > aMax) { aUp = aMax; saturated = true; }
  const aHorizontalCmd = vh > 1e-9 ? vh / guidance.horizontalTimeConstantS : 0;
  const aHorizontal = Math.min(aHorizontalCmd, Math.sqrt(Math.max(0, aMax * aMax - aUp * aUp)));
  const hv = vh > 1e-12 ? k.horizontalVector.map(x => -x / (vh / 1000)) : [0, 0, 0];
  const cmd = [0, 1, 2].map(i => aUp * k.up[i] + aHorizontal * hv[i]);
  const magnitude = norm(cmd);
  const commanded = magnitude / aMax;
  const phase = descentPhaseOf(guidance, vh);
  if (!(commanded >= (engine.throttleable ? engine.throttleMin : 0.5))) return { ...none, saturated, phase, commandedThrottle: commanded };
  const throttle = engine.throttleable ? Math.min(1, commanded) : 1;
  return { thrustN: throttle * engine.thrustMaxN, throttle, direction: cmd.map(x => x / magnitude), saturated, engineOn: true, phase, commandedThrottle: commanded,
    requiredVerticalMS2: aUp, availableMS2: aMax };
}

export function makeLandingDerivative(env, lander, guidance, mode, massDryKg) {
  const isp = lander.engine.ispS;
  return (t, s, out) => {
    const r2 = s[0] * s[0] + s[1] * s[1] + s[2] * s[2], r = Math.sqrt(r2), g = -env.mu / (r2 * r);
    const c = landingCommand(env, lander, guidance, mode, s, massDryKg);
    const a = c.thrustN / s[6] / 1000; // km/s²
    out[0] = s[3]; out[1] = s[4]; out[2] = s[5];
    out[3] = g * s[0] + a * c.direction[0]; out[4] = g * s[1] + a * c.direction[1]; out[5] = g * s[2] + a * c.direction[2];
    out[6] = -c.thrustN / (isp * STANDARD_GRAVITY_M_S2); out[7] = a;
  };
}

const integrate = (derivative, state, t0, t1, maxStep, record, shouldAbort = null) => integrateDopri54({
  derivative, initialState: state, startSeconds: t0, targetSeconds: t1, initialStepSeconds: Math.min(1, t1 - t0), minStepSeconds: 1e-9,
  maxStepSeconds: Math.min(maxStep, Math.max(t1 - t0, 1e-9)), absTol: LANDING_ABS_TOL, relTol: LANDING_REL_TOL, recordSteps: record, shouldAbort });

// Integra un tramo y se detiene en el primer evento: 'contact' (|r| < R), 'depleted' (m ≤ masa seca), o `stopWhen`. Refina por bisección.
// Tolerancias de contacto (12F.1, OBS-12F-01), que son magnitudes DISTINTAS:
//  · predicado geométrico: contacto si |r| < R − CONTACT_PREDICATE_KM (1e-9 km); fija el signo, no la precisión;
//  · intervalo temporal: la bisección termina con un intervalo [lo, hi] ≤ CONTACT_BRACKET_SECONDS (1e-7 s);
//  · error espacial de localización ≲ |v_r|·Δt_intervalo (≈ 0,15 mm a 1,5 km/s), MAYOR que 1e-9 km;
//  · error de integración: lo gobiernan las tolerancias DOPRI54 (LANDING_ABS_TOL, LANDING_REL_TOL), no la bisección.
export const CONTACT_PREDICATE_KM = 1e-9;
export const CONTACT_BRACKET_SECONDS = 1e-7;
export function runLandingLeg({ env, lander, guidance, mode, massDryKg, state, t0, t1, maxStepSeconds = 2, stopWhen = null }) {
  if (!(t1 >= t0)) throw new LandingError('INVALID_CONFIGURATION', 'Tramo con tiempo final anterior al inicial.');
  const derivative = makeLandingDerivative(env, lander, guidance, mode, massDryKg);
  const predicate = s => (Math.hypot(s[0], s[1], s[2]) < env.radiusKm - CONTACT_PREDICATE_KM) ? 'contact'
    : (mode !== 'off' && s[6] <= massDryKg + 1e-9) ? 'depleted' : (stopWhen && stopWhen(s)) ? 'event' : null;
  const first = predicate(state);
  if (t1 === t0 || first) return { knots: [{ elapsedSeconds: t0, state: new Float64Array(state) }], state: new Float64Array(state), time: t0, stop: first, stats: zero() };
  let result;
  try { result = integrate(derivative, state, t0, t1, maxStepSeconds, true, ({ state: y }) => predicate(y) ?? false); }
  catch (error) { if (error instanceof LandingError) throw error; throw new LandingError('INTEGRATION_FAILED', `Integración interrumpida: ${error.message}`); }
  const knots = Array.from(result.knots.times, (time, i) => ({ elapsedSeconds: time, state: new Float64Array(result.knots.states[i]) }));
  const stats = { acceptedSteps: result.acceptedSteps, rejectedSteps: result.rejectedSteps, functionEvaluations: result.functionEvaluations, minStepSeconds: result.minStepUsedSeconds, maxStepSeconds: result.maxStepUsedSeconds };
  if (!result.aborted) {
    if (Math.abs(result.elapsedSeconds - t1) > 1e-6) throw new LandingError('INTEGRATION_FAILED', 'Integración incompleta.');
    return { knots, state: new Float64Array(result.finalState), time: t1, stop: null, stats };
  }
  const reason = result.abortReason;
  if (knots.length === 1) return { knots, state: new Float64Array(knots[0].state), time: knots[0].elapsedSeconds, stop: predicate(knots[0].state), stats };
  let lo = knots.at(-2), hi = { elapsedSeconds: knots.at(-1).elapsedSeconds, state: new Float64Array(knots.at(-1).state) };
  const hiReason = predicate(hi.state);
  for (let i = 0; i < 80 && hi.elapsedSeconds - lo.elapsedSeconds > CONTACT_BRACKET_SECONDS; i++) {
    const mid = (lo.elapsedSeconds + hi.elapsedSeconds) / 2;
    const run = integrate(derivative, lo.state, lo.elapsedSeconds, mid, maxStepSeconds, false);
    const s = new Float64Array(run.finalState);
    if (predicate(s)) hi = { elapsedSeconds: mid, state: s }; else lo = { elapsedSeconds: mid, state: s };
  }
  const refined = knots.slice(0, -1);
  if (hi.elapsedSeconds > refined.at(-1).elapsedSeconds) refined.push({ elapsedSeconds: hi.elapsedSeconds, state: hi.state });
  else refined[refined.length - 1] = { elapsedSeconds: hi.elapsedSeconds, state: hi.state };
  return { knots: refined, state: new Float64Array(hi.state), time: hi.elapsedSeconds, stop: predicate(hi.state) ?? hiReason ?? reason, stats, bracketSeconds: hi.elapsedSeconds - lo.elapsedSeconds };
}
const zero = () => ({ acceptedSteps: 0, rejectedSteps: 0, functionEvaluations: 0, minStepSeconds: 0, maxStepSeconds: 0 });

// ---- Órbita inicial local -----------------------------------------------------------------------------------------------
// Elementos clásicos en el marco local (inclinación respecto al plano xy local, arbitrario salvo que exista rotación definida).
export function orbitalSummary(env, position, velocity) {
  const r = norm(position), v2 = dot(velocity, velocity), h = cross(position, velocity), hn = norm(h), energy = v2 / 2 - env.mu / r;
  const rv = dot(position, velocity);
  const e = [0, 1, 2].map(i => ((v2 - env.mu / r) * position[i] - rv * velocity[i]) / env.mu), ecc = norm(e);
  const bound = energy < 0, a = bound ? -env.mu / (2 * energy) : null;
  return { radiusKm: r, speedKmS: Math.sqrt(v2), specificEnergyKm2S2: energy, angularMomentumKm2S: hn, eccentricity: ecc, bound, semiMajorAxisKm: a,
    periodSeconds: bound ? 2 * Math.PI * Math.sqrt(a ** 3 / env.mu) : null, periapsisRadiusKm: hn * hn / (env.mu * (1 + ecc)),
    apoapsisRadiusKm: bound ? hn * hn / (env.mu * (1 - ecc)) : null, inclinationDeg: hn > 0 ? Math.acos(Math.max(-1, Math.min(1, h[2] / hn))) * 180 / Math.PI : null,
    eccentricityVector: e, angularMomentumVector: h };
}

export function validateInitialOrbit(env, orbit) {
  const issues = [];
  const rp = orbit.periapsisAltitudeKm, ra = orbit.apoapsisAltitudeKm ?? rp;
  for (const [key, value] of [['periapsisAltitudeKm', rp], ['apoapsisAltitudeKm', ra], ['inclinationDeg', orbit.inclinationDeg], ['raanDeg', orbit.raanDeg ?? 0], ['argumentOfPeriapsisDeg', orbit.argumentOfPeriapsisDeg ?? 0], ['trueAnomalyDeg', orbit.trueAnomalyDeg ?? 0]]) {
    if (!Number.isFinite(value)) issues.push(`${key} debe ser un número finito.`);
  }
  if (issues.length) return issues;
  if (rp <= 0) issues.push('La órbita intersecta la superficie: el periapsis debe estar por encima del suelo (altitud > 0).');
  if (ra < rp) issues.push('El apoapsis no puede ser menor que el periapsis.');
  if (orbit.inclinationDeg < 0 || orbit.inclinationDeg > 180) issues.push('La inclinación debe estar entre 0° y 180°.');
  return issues;
}

export function initialOrbitState(env, orbit) {
  const issues = validateInitialOrbit(env, orbit);
  if (issues.length) throw new LandingError('INVALID_ORBIT', issues.join(' '), { issues });
  const D = Math.PI / 180, rp = env.radiusKm + orbit.periapsisAltitudeKm, ra = env.radiusKm + (orbit.apoapsisAltitudeKm ?? orbit.periapsisAltitudeKm);
  const a = (rp + ra) / 2, e = (ra - rp) / (ra + rp), p = a * (1 - e * e), nu = (orbit.trueAnomalyDeg ?? 0) * D;
  const r = p / (1 + e * Math.cos(nu)), speedScale = Math.sqrt(env.mu / p);
  const pf = [r * Math.cos(nu), r * Math.sin(nu), 0], vf = [-speedScale * Math.sin(nu), speedScale * (e + Math.cos(nu)), 0];
  const O = (orbit.raanDeg ?? 0) * D, i = orbit.inclinationDeg * D, w = (orbit.argumentOfPeriapsisDeg ?? 0) * D;
  const cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(i), si = Math.sin(i), cw = Math.cos(w), sw = Math.sin(w);
  const R = [[cO * cw - sO * sw * ci, -cO * sw - sO * cw * ci, sO * si], [sO * cw + cO * sw * ci, -sO * sw + cO * cw * ci, -cO * si], [sw * si, cw * si, ci]];
  const rot = v => [0, 1, 2].map(row => R[row][0] * v[0] + R[row][1] * v[1] + R[row][2] * v[2]);
  return { positionKm: rot(pf), velocityKmS: rot(vf) };
}
