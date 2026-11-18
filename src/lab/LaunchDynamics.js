// Etapa 12E — dinámica traslacional de masa puntual para el ascenso desde la superficie terrestre.
// Estado integrado (8 componentes, marco inercial ECI-L, km, km/s, kg):  [x, y, z, vx, vy, vz, m, Δv_acum]
//   dr/dt = v
//   dv/dt = a_grav + a_empuje + a_arrastre
//   a_grav    = −GM·r/|r|³
//   a_empuje  = F(p)·û/m           [F en N, m en kg → m/s²; ÷1000 → km/s²]
//   a_arrastre= −(q·Cd·A/m)·v̂_rel  [q = ½ρ v_rel² en Pa, A en m²; ÷1000 → km/s²]
//   v_rel     = v − ω×r  (velocidad respecto a la atmósfera corrotante)
//   dm/dt     = −F_vac/(Isp_vac·g0) en un encendido, 0 en caso contrario;  dΔv/dt = |a_empuje| (km/s)
// Se reutiliza integrateDopri54 y los errores de FiniteThrustDynamics.
import { integrateDopri54 } from '../science/NumericalIntegrator.js';
import { FiniteThrustError } from './FiniteThrustDynamics.js';
import { EARTH_GM_KM3_S2, EARTH_ROTATION_RATE_RAD_S, corotatingVelocityKmS, geodeticFromPosition, horizontalDirection, localFrame, norm3, dot3, unit3 } from './LaunchEarth.js';
import { atmosphereAt } from './LaunchAtmosphere.js';
import { massFlowKgS, thrustAt } from './LaunchVehicle.js';

const DEG = Math.PI / 180;
export const LAUNCH_ABS_TOL = [1e-6, 1e-6, 1e-6, 1e-9, 1e-9, 1e-9, 1e-6, 1e-12];
export const LAUNCH_REL_TOL = 1e-10;

export function createEnvironment({ atmosphere = true, rotation = true, mu = EARTH_GM_KM3_S2, omega = EARTH_ROTATION_RATE_RAD_S } = {}) {
  return Object.freeze({ atmosphere, rotation, mu, omega: rotation ? omega : 0 });
}

// ---- Programa de orientación del empuje (ley de guiado idealizada, sin dinámica de actitud) -----------------
export function guidanceDirection(spec, t, position, velocity, env) {
  const frame = localFrame(position);
  const horizontal = az => horizontalDirection(frame, az);
  const tilted = (elevationDeg, azimuthDeg) => { const e = elevationDeg * DEG, h = horizontal(azimuthDeg);
    return [0, 1, 2].map(i => Math.sin(e) * frame.up[i] + Math.cos(e) * h[i]); };
  switch (spec?.mode) {
    case 'vertical': return frame.up;
    case 'fixed-elevation': return tilted(spec.elevationDeg, spec.azimuthDeg);
    case 'gravity-turn': {
      const rel = relativeVelocityKmS(position, velocity, env);
      return norm3(rel) > 1e-3 ? unit3(rel) : tilted(spec.fallbackElevationDeg, spec.fallbackAzimuthDeg);
    }
    case 'pitch-program': {
      const up = frame.up, vr = dot3(velocity, up);
      const vh = [0, 1, 2].map(i => velocity[i] - vr * up[i]);
      const h = norm3(vh) > 1e-3 ? unit3(vh) : horizontal(spec.azimuthDeg);
      const u = spec.rampSeconds > 0 ? Math.min(1, Math.max(0, (t - spec.startSeconds) / spec.rampSeconds)) : 1;
      const e = (spec.startElevationDeg + (spec.endElevationDeg - spec.startElevationDeg) * u) * DEG;
      return [0, 1, 2].map(i => Math.sin(e) * up[i] + Math.cos(e) * h[i]);
    }
    case 'prograde': { const n = norm3(velocity); if (!(n > 1e-9)) throw new FiniteThrustError('DEGENERATE_DIRECTION', 'Velocidad nula: el progrado no está definido.'); return unit3(velocity); }
    case 'inertial': { const n = norm3(spec.vector); if (!(n > 1e-12)) throw new FiniteThrustError('DEGENERATE_DIRECTION', 'Vector inercial nulo.'); return unit3(spec.vector); }
    default: throw new FiniteThrustError('INVALID_DIRECTION', 'Modo de guiado desconocido.');
  }
}
export function relativeVelocityKmS(position, velocity, env) {
  const w = corotatingVelocityKmS(position, env.omega);
  return [velocity[0] - w[0], velocity[1] - w[1], velocity[2] - w[2]];
}

// ---- Fuerzas (una sola implementación para la integración y la telemetría) ------------------------------
// cfg = { stage|null (motor encendido), guidance: spec|null, aero: { areaM2, cd } }
export function evaluateForces(env, cfg, t, state) {
  const r = [state[0], state[1], state[2]], v = [state[3], state[4], state[5]], m = state[6];
  if (!(m > 0) || !Number.isFinite(m)) throw new FiniteThrustError('INVALID_MASS', 'Masa no positiva o no finita.');
  const rn = norm3(r);
  if (!(rn > 1)) throw new FiniteThrustError('SINGULAR_POSITION', 'La posición colapsó hacia el centro de la Tierra.');
  const gravity = r.map(x => -env.mu * x / rn ** 3);
  const altitudeKm = geodeticFromPosition(r).altitudeKm;
  const atm = env.atmosphere ? atmosphereAt(altitudeKm) : { densityKgM3: 0, pressurePa: 0 };
  const rel = relativeVelocityKmS(r, v, env), relSpeedKmS = norm3(rel);
  const q = 0.5 * atm.densityKgM3 * (relSpeedKmS * 1000) ** 2; // Pa
  let drag = [0, 0, 0];
  if (q > 0 && relSpeedKmS > 0 && cfg.aero) {
    const dragN = q * cfg.aero.cd * cfg.aero.areaM2; // N, opuesto a v_rel
    drag = rel.map(x => -dragN / m / 1000 * x / relSpeedKmS);
  }
  let thrust = [0, 0, 0], thrustN = 0, flow = 0, direction = null;
  if (cfg.stage) {
    direction = guidanceDirection(cfg.guidance, t, r, v, env);
    if (!direction.every(Number.isFinite) || Math.abs(norm3(direction) - 1) > 1e-9) throw new FiniteThrustError('INVALID_DIRECTION', 'Dirección de empuje inválida o no unitaria.');
    thrustN = thrustAt(cfg.stage, atm.pressurePa); flow = massFlowKgS(cfg.stage);
    thrust = direction.map(x => thrustN / m / 1000 * x);
  }
  return { gravity, drag, thrust, thrustN, massFlowKgS: flow, direction, altitudeKm, densityKgM3: atm.densityKgM3, pressurePa: atm.pressurePa,
    dynamicPressurePa: q, relativeVelocityKmS: rel, relativeSpeedKmS: relSpeedKmS, massKg: m };
}

export function makeDerivative(env, cfg) {
  return (t, s, out) => {
    const f = evaluateForces(env, cfg, t, s);
    out[0] = s[3]; out[1] = s[4]; out[2] = s[5];
    for (let i = 0; i < 3; i++) out[3 + i] = f.gravity[i] + f.drag[i] + f.thrust[i];
    out[6] = -f.massFlowKgS;
    out[7] = f.thrustN / s[6] / 1000;
  };
}

// ---- Integración de un tramo con detección de eventos --------------------------------------------------
// stopWhen(state, t) → true detiene el tramo en el primer estado que lo cumple y se refina por bisección.
const integrate = (derivative, state, t0, t1, maxStepSeconds, record, shouldAbort = null) => integrateDopri54({
  derivative, initialState: state, startSeconds: t0, targetSeconds: t1, initialStepSeconds: Math.min(1, t1 - t0), minStepSeconds: 1e-9,
  maxStepSeconds: Math.min(maxStepSeconds, Math.max(t1 - t0, 1e-9)), absTol: LAUNCH_ABS_TOL, relTol: LAUNCH_REL_TOL, recordSteps: record, shouldAbort });

export function runSegment({ env, cfg, state, t0, t1, maxStepSeconds = 2, stopWhen = null, stopImpact = true }) {
  if (!(t1 >= t0)) throw new FiniteThrustError('INVALID_CONFIGURATION', 'Tramo con tiempo final anterior al inicial.');
  const derivative = makeDerivative(env, cfg);
  const underground = s => geodeticFromPosition([s[0], s[1], s[2]]).altitudeKm < -1e-9;
  const predicate = (s, t) => (stopImpact && underground(s)) ? 'impact' : (stopWhen && stopWhen(s, t)) ? 'event' : null;
  if (t1 === t0) return { knots: [{ elapsedSeconds: t0, state: new Float64Array(state) }], state: new Float64Array(state), time: t0, stop: null, stats: zeroStats() };
  let result;
  try { result = integrate(derivative, state, t0, t1, maxStepSeconds, true, ({ state: y, elapsedSeconds }) => predicate(y, elapsedSeconds) ?? false); }
  catch (error) { if (error instanceof FiniteThrustError) throw error; throw new FiniteThrustError('INTEGRATION_FAILED', `Integración interrumpida: ${error.message}`); }
  const knots = Array.from(result.knots.times, (time, i) => ({ elapsedSeconds: time, state: new Float64Array(result.knots.states[i]) }));
  const stats = { acceptedSteps: result.acceptedSteps, rejectedSteps: result.rejectedSteps, functionEvaluations: result.functionEvaluations,
    minStepSeconds: result.minStepUsedSeconds, maxStepSeconds: result.maxStepUsedSeconds };
  if (!result.aborted) {
    if (Math.abs(result.elapsedSeconds - t1) > 1e-6) throw new FiniteThrustError('INTEGRATION_FAILED', 'Integración incompleta.');
    return { knots, state: new Float64Array(result.finalState), time: t1, stop: null, stats };
  }
  const reason = result.abortReason;
  const last = knots.at(-1);
  if (knots.length === 1) return { knots, state: new Float64Array(last.state), time: last.elapsedSeconds, stop: reason, stats }; // evento ya cumplido al inicio
  // Refinamiento: lo = último estado sin evento, hi = primer estado con evento.
  let lo = knots.at(-2), hi = { elapsedSeconds: last.elapsedSeconds, state: new Float64Array(last.state) };
  for (let i = 0; i < 80 && hi.elapsedSeconds - lo.elapsedSeconds > 1e-7; i++) {
    const mid = (lo.elapsedSeconds + hi.elapsedSeconds) / 2;
    const run = integrate(derivative, lo.state, lo.elapsedSeconds, mid, maxStepSeconds, false);
    const s = new Float64Array(run.finalState);
    if (predicate(s, mid)) hi = { elapsedSeconds: mid, state: s }; else lo = { elapsedSeconds: mid, state: s };
  }
  const refined = knots.slice(0, -1);
  if (hi.elapsedSeconds > refined.at(-1).elapsedSeconds) refined.push({ elapsedSeconds: hi.elapsedSeconds, state: hi.state });
  else refined[refined.length - 1] = { elapsedSeconds: hi.elapsedSeconds, state: hi.state };
  return { knots: refined, state: new Float64Array(hi.state), time: hi.elapsedSeconds, stop: reason, stats };
}
const zeroStats = () => ({ acceptedSteps: 0, rejectedSteps: 0, functionEvaluations: 0, minStepSeconds: 0, maxStepSeconds: 0 });
