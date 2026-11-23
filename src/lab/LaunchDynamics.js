// Aquí modelo la dinámica traslacional de masa puntual para el ascenso desde la superficie terrestre.
// Integro un estado de 8 componentes en el marco inercial ECI-L (km, km/s, kg, s): [x, y, z, vx, vy, vz, m, Δv_acum]
//   dr/dt = v
//   dv/dt = a_grav + a_empuje + a_arrastre
//   a_grav     = −GM·r/|r|³
//   a_empuje   = F(p)·û/m            [F en N, m en kg → m/s²; divido por 1000 → km/s²]
//   a_arrastre = −(q·Cd·A/m)·v̂_rel   [q = ½ρ v_rel² en Pa, A en m²; divido por 1000 → km/s²]
//   v_rel      = v − ω×r  (velocidad relativa a la atmósfera corrotante)
//   dm/dt      = −F_vac/(Isp_vac·g0) con motor encendido (0 si está apagado); dΔv/dt = |a_empuje| (km/s)
// Reutilizo el integrador DOPRI54 y la clase de error de FiniteThrustDynamics.
import { integrateDopri54 } from '../science/NumericalIntegrator.js';
import { FiniteThrustError } from './FiniteThrustDynamics.js';
import { EARTH_GM_KM3_S2, EARTH_ROTATION_RATE_RAD_S, corotatingVelocityKmS, geodeticFromPosition, horizontalDirection, localFrame, norm3, dot3, unit3 } from './LaunchEarth.js';
import { atmosphereAt } from './LaunchAtmosphere.js';
import { massFlowKgS, thrustAt } from './LaunchVehicle.js';

const DEG = Math.PI / 180;
// Tolerancias del integrador DOPRI54 sobre posición (km), velocidad (km/s), masa (kg) y Δv acumulado (km/s).
export const LAUNCH_ABS_TOL = [1e-6, 1e-6, 1e-6, 1e-9, 1e-9, 1e-9, 1e-6, 1e-12];
export const LAUNCH_REL_TOL = 1e-10;

// Construyo un entorno físico inmutable para el ascenso (con o sin atmósfera y rotación terrestre).
export function createEnvironment({ atmosphere = true, rotation = true, mu = EARTH_GM_KM3_S2, omega = EARTH_ROTATION_RATE_RAD_S } = {}) {
  return Object.freeze({ atmosphere, rotation, mu, omega: rotation ? omega : 0 });
}

// Calculo la dirección unitaria de empuje según la ley de guiado idealizada (sin dinámica de actitud del cuerpo rígido).
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
// Resto la velocidad de corrotación terrestre para obtener la velocidad del vehículo respecto al aire (km/s).
export function relativeVelocityKmS(position, velocity, env) {
  const w = corotatingVelocityKmS(position, env.omega);
  return [velocity[0] - w[0], velocity[1] - w[1], velocity[2] - w[2]];
}

// Evalúo gravedad, arrastre aerodinámico y empuje en una única implementación compartida por integración y telemetría.
// Recibo cfg = { stage|null (motor encendido), guidance: spec|null, aero: { areaM2, cd } }.
export function evaluateForces(env, cfg, t, state) {
  const r = [state[0], state[1], state[2]], v = [state[3], state[4], state[5]], m = state[6];
  if (!(m > 0) || !Number.isFinite(m)) throw new FiniteThrustError('INVALID_MASS', 'Masa no positiva o no finita.');
  const rn = norm3(r);
  if (!(rn > 1)) throw new FiniteThrustError('SINGULAR_POSITION', 'La posición colapsó hacia el centro de la Tierra.');
  const gravity = r.map(x => -env.mu * x / rn ** 3);
  const altitudeKm = geodeticFromPosition(r).altitudeKm;
  const atm = env.atmosphere ? atmosphereAt(altitudeKm) : { densityKgM3: 0, pressurePa: 0 };
  const rel = relativeVelocityKmS(r, v, env), relSpeedKmS = norm3(rel);
  const q = 0.5 * atm.densityKgM3 * (relSpeedKmS * 1000) ** 2; // Presión dinámica en Pa.
  let drag = [0, 0, 0];
  if (q > 0 && relSpeedKmS > 0 && cfg.aero) {
    const dragN = q * cfg.aero.cd * cfg.aero.areaM2; // Fuerza de arrastre en N, opuesta a v_rel.
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

// Construyo la función derivada dy/dt de 8 componentes que alimenta al integrador DOPRI54.
export function makeDerivative(env, cfg) {
  return (t, s, out) => {
    const f = evaluateForces(env, cfg, t, s);
    out[0] = s[3]; out[1] = s[4]; out[2] = s[5];
    for (let i = 0; i < 3; i++) out[3 + i] = f.gravity[i] + f.drag[i] + f.thrust[i];
    out[6] = -f.massFlowKgS;
    out[7] = f.thrustN / s[6] / 1000;
  };
}

// Envuelvo integrateDopri54 con las tolerancias y límites de paso del ascenso.
const integrate = (derivative, state, t0, t1, maxStepSeconds, record, shouldAbort = null) => integrateDopri54({
  derivative, initialState: state, startSeconds: t0, targetSeconds: t1, initialStepSeconds: Math.min(1, t1 - t0), minStepSeconds: 1e-9,
  maxStepSeconds: Math.min(maxStepSeconds, Math.max(t1 - t0, 1e-9)), absTol: LAUNCH_ABS_TOL, relTol: LAUNCH_REL_TOL, recordSteps: record, shouldAbort });

// Integro un tramo del lanzamiento entre t0 y t1 vigilando impacto con la superficie o un evento stopWhen(state, t),
// y cuando salta un evento refino su instante exacto por bisección.
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
  if (knots.length === 1) return { knots, state: new Float64Array(last.state), time: last.elapsedSeconds, stop: reason, stats }; // Si el evento ya se cumple al inicio, detengo de inmediato.
  // Refino el instante del evento por bisección entre el último nudo previo (lo) y el primer nudo disparado (hi).
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
// Devuelvo estadísticas nulas para tramos de duración cero.
const zeroStats = () => ({ acceptedSteps: 0, rejectedSteps: 0, functionEvaluations: 0, minStepSeconds: 0, maxStepSeconds: 0 });
