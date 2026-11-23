// En este módulo integro la dinámica traslacional de empuje finito de manera pura (sin DOM, sin Three.js y sin acoplarme al Hangar).
// Propago el estado en km, km/s, s y kg, recibiendo el empuje en newtons y convirtiéndolo a km/s².
//
// Integro un vector de estado de 8 componentes: [x, y, z, vx, vy, vz, m, Δv_acum]
//   dr/dt = v            dv/dt = a_grav + (θ·F/m)·û / 1000
//   dm/dt = −θ·F/(Isp·g0)            dΔv/dt = θ·F/(m·1000)   [km/s]
// Mantengo el acelerador θ (0 < θ ≤ 1) y el Isp constantes dentro de cada encendido, usando g0 = 9,80665 m/s² (NIST SP 811).
import { integrateDopri54 } from '../science/NumericalIntegrator.js';

export const G0_M_S2 = 9.80665;
export const FINITE_THRUST_STATE_SIZE = 8;
export const THRUST_DIRECTIONS = Object.freeze(['prograde', 'retrograde', 'radial-out', 'radial-in', 'normal', 'antinormal', 'inertial']);
export const THRUST_DIRECTION_LABELS = Object.freeze({
  prograde: 'Progrado', retrograde: 'Retrógrado', 'radial-out': 'Radial exterior', 'radial-in': 'Radial interior',
  normal: 'Normal orbital', antinormal: 'Antinormal orbital', inertial: 'Inercial fija (ICRF)'
});
export const MIN_BURN_SECONDS = 1;
export const MAX_BURNS = 8;
// Fijo umbrales para detectar geometrías degeneradas (radio mínimo en km, velocidad en km/s y seno del ángulo entre r y v).
const MIN_RADIUS_KM = 1e-6, MIN_SPEED_KMS = 1e-12, MIN_SIN_ANGLE = 1e-9;
// Omito cualquier encendido residual menor de 1 ms cuando ya casi no queda propelente.
const MIN_EXECUTABLE_BURN_SECONDS = 1e-3;
const MASS_SNAP_TOLERANCE_KG = 1e-6;

export class FiniteThrustError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = 'FiniteThrustError'; this.code = code; this.details = details; }
}

// ---- Conversiones propulsivas explícitas ------------------------------------
export const exhaustVelocityMS = ispS => ispS * G0_M_S2;
export const massFlowKgS = (thrustN, ispS) => thrustN / (ispS * G0_M_S2);
// Convierto la aceleración de N/kg (m/s²) a km/s² dividiendo por 1000.
export const accelerationKmS2 = (thrustN, massKg) => thrustN / massKg / 1000;
export const kmS2ToMS2 = value => value * 1000;
export const tsiolkovskyDeltaVMS = (ispS, initialMassKg, finalMassKg) => exhaustVelocityMS(ispS) * Math.log(initialMassKg / finalMassKg);

// ---- Dirección unitaria del empuje ------------------------------------------
// Calculo el vector unitario de empuje en el marco inercial de propagación (ICRF eclíptico J2000):
//  · progrado/retrógrado = ±v̂ ; radial exterior/interior = ±r̂ ; normal/antinormal = ±ĥ (con h = r × v).
// Reevalúo las seis direcciones orbitales en cada llamada de la derivada; en modo 'inertial' normalizo el vector fijo recibido.
export function thrustDirectionUnit(direction, position, velocity, out = new Float64Array(3)) {
  const type = direction?.type;
  if (type === 'inertial') {
    const v = direction.vector;
    const n = Array.isArray(v) && v.length === 3 && v.every(Number.isFinite) ? Math.hypot(v[0], v[1], v[2]) : NaN;
    if (!(n > 1e-12)) throw new FiniteThrustError('DEGENERATE_DIRECTION', 'La dirección inercial necesita un vector finito no nulo.');
    out[0] = v[0] / n; out[1] = v[1] / n; out[2] = v[2] / n; return out;
  }
  if (!THRUST_DIRECTIONS.includes(type)) throw new FiniteThrustError('INVALID_DIRECTION', 'Dirección de empuje desconocida.');
  const rn = Math.hypot(position[0], position[1], position[2]);
  const vn = Math.hypot(velocity[0], velocity[1], velocity[2]);
  if (!(rn > MIN_RADIUS_KM)) throw new FiniteThrustError('DEGENERATE_DIRECTION', 'Radio orbital nulo: la dirección orbital no está definida.');
  if (type === 'radial-out' || type === 'radial-in') {
    const s = type === 'radial-out' ? 1 : -1;
    out[0] = s * position[0] / rn; out[1] = s * position[1] / rn; out[2] = s * position[2] / rn; return out;
  }
  if (!(vn > MIN_SPEED_KMS)) throw new FiniteThrustError('DEGENERATE_DIRECTION', 'Velocidad orbital nula: la dirección orbital no está definida.');
  if (type === 'prograde' || type === 'retrograde') {
    const s = type === 'prograde' ? 1 : -1;
    out[0] = s * velocity[0] / vn; out[1] = s * velocity[1] / vn; out[2] = s * velocity[2] / vn; return out;
  }
  const hx = position[1] * velocity[2] - position[2] * velocity[1];
  const hy = position[2] * velocity[0] - position[0] * velocity[2];
  const hz = position[0] * velocity[1] - position[1] * velocity[0];
  const hn = Math.hypot(hx, hy, hz);
  if (!(hn / (rn * vn) > MIN_SIN_ANGLE)) throw new FiniteThrustError('DEGENERATE_DIRECTION', 'Momento angular orbital casi nulo: la dirección normal no está definida.');
  const s = type === 'normal' ? 1 : -1;
  out[0] = s * hx / hn; out[1] = s * hy / hn; out[2] = s * hz / hn; return out;
}

// ---- Validación del programa de encendidos ----------------------------------
// Compruebo tiempos, aceleradores, direcciones, horizonte temporal y ausencia de solapes entre encendidos.
export function validateBurnSchedule(burns, { endSeconds, engine }) {
  const issues = [];
  if (!Array.isArray(burns)) return ['El programa de encendidos debe ser una lista.'];
  if (burns.length > MAX_BURNS) issues.push(`Se admiten como máximo ${MAX_BURNS} encendidos.`);
  if (burns.length && !(engine && engine.thrustN > 0 && engine.ispS > 0 && Number.isFinite(engine.thrustN) && Number.isFinite(engine.ispS))) {
    issues.push('Empuje solicitado sin un motor con empuje e impulso específico válidos.');
  }
  burns.forEach((burn, index) => {
    const label = `Encendido ${index + 1}`;
    if (!Number.isFinite(burn?.startSeconds) || burn.startSeconds < 0) issues.push(`${label}: instante de inicio inválido.`);
    if (!Number.isFinite(burn?.durationSeconds) || burn.durationSeconds < MIN_BURN_SECONDS) issues.push(`${label}: la duración mínima es ${MIN_BURN_SECONDS} s.`);
    if (!Number.isFinite(burn?.throttle) || burn.throttle <= 0 || burn.throttle > 1) issues.push(`${label}: el acelerador debe estar en (0, 1].`);
    if (!THRUST_DIRECTIONS.includes(burn?.direction?.type)) issues.push(`${label}: dirección de empuje inválida.`);
    else if (burn.direction.type === 'inertial') {
      const v = burn.direction.vector;
      if (!Array.isArray(v) || v.length !== 3 || !v.every(Number.isFinite) || !(Math.hypot(...v) > 1e-12)) issues.push(`${label}: vector inercial inválido o nulo.`);
    }
    if (Number.isFinite(burn?.startSeconds) && Number.isFinite(burn?.durationSeconds) && burn.startSeconds + burn.durationSeconds > endSeconds + 1e-9) {
      issues.push(`${label}: termina después del horizonte de propagación y de la cobertura temporal.`);
    }
  });
  const ordered = burns.map((burn, index) => ({ burn, index })).filter(item => Number.isFinite(item.burn?.startSeconds) && Number.isFinite(item.burn?.durationSeconds))
    .sort((a, b) => a.burn.startSeconds - b.burn.startSeconds);
  for (let i = 1; i < ordered.length; i++) {
    const previous = ordered[i - 1].burn;
    if (previous.startSeconds + previous.durationSeconds > ordered[i].burn.startSeconds + 1e-9) {
      issues.push(`Encendidos ${ordered[i - 1].index + 1} y ${ordered[i].index + 1} simultáneos o solapados: el diseño dispone de un solo motor y se rechazan.`);
    }
  }
  return issues;
}

function withBurnState(gravityDerivative, burn, engine) {
  const u = new Float64Array(3);
  const thrustN = engine.thrustN * burn.throttle;
  const flow = massFlowKgS(engine.thrustN * burn.throttle, engine.ispS);
  return (t, s, out) => {
    gravityDerivative(t, s, out);
    const m = s[6];
    if (!(m > 0) || !Number.isFinite(m)) throw new FiniteThrustError('INVALID_MASS', 'Masa no positiva o no finita durante el encendido.');
    thrustDirectionUnit(burn.direction, s, [s[3], s[4], s[5]], u);
    const a = accelerationKmS2(thrustN, m);
    out[3] += a * u[0]; out[4] += a * u[1]; out[5] += a * u[2];
    out[6] = -flow; out[7] = a;
  };
}
function coastDerivative(gravityDerivative) {
  return (t, s, out) => { gravityDerivative(t, s, out); out[6] = 0; out[7] = 0; };
}

// Propago por tramos (vuelo libre y encendidos consecutivos) integrando con DOPRI54 y cortando al agotar el propelente.
// Exijo que `gravityDerivative(t, estado, out)` escriba out[0..5] = [v, a_gravedad] a partir de estado[0..5].
export function propagateFiniteThrust({
  gravityDerivative, initialPositionKm, initialVelocityKmS, initialMassKg, dryMassKg, engine = null,
  burns = [], endSeconds, maxCoastStepSeconds = 3600, maxBurnStepSeconds = 600
}) {
  if (typeof gravityDerivative !== 'function') throw new FiniteThrustError('INVALID_CONFIGURATION', 'Falta el modelo gravitacional.');
  const vec = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
  if (!vec(initialPositionKm) || !vec(initialVelocityKmS)) throw new FiniteThrustError('INVALID_CONFIGURATION', 'Estado orbital inicial inválido.');
  if (!Number.isFinite(initialMassKg) || !Number.isFinite(dryMassKg) || dryMassKg <= 0 || initialMassKg < dryMassKg) {
    throw new FiniteThrustError('INVALID_MASS', 'La masa inicial debe ser finita y no inferior a la masa seca positiva.');
  }
  if (!Number.isFinite(endSeconds) || endSeconds <= 0) throw new FiniteThrustError('INVALID_CONFIGURATION', 'Horizonte de propagación inválido.');
  const issues = validateBurnSchedule(burns, { endSeconds, engine });
  if (issues.length) throw new FiniteThrustError('INVALID_SCHEDULE', issues.join(' '), { issues });
  const ordered = burns.map((burn, index) => ({ ...burn, id: burn.id ?? `burn-${index + 1}` })).sort((a, b) => a.startSeconds - b.startSeconds);
  const absTol = [1e-5, 1e-5, 1e-5, 1e-8, 1e-8, 1e-8, 1e-9, 1e-12];

  let t = 0;
  let state = Float64Array.from([...initialPositionKm, ...initialVelocityKmS, initialMassKg, 0]);
  const knots = [{ elapsedSeconds: 0, state: new Float64Array(state) }];
  const segments = [], events = [], burnResults = [];
  const totals = { functionEvaluations: 0, acceptedSteps: 0, rejectedSteps: 0, minStepSeconds: Infinity, maxStepSeconds: 0 };

  function run(kind, burn, target, maxStep) {
    const span = target - t;
    if (!(span > 0)) return;
    const derivative = kind === 'burn' ? withBurnState(gravityDerivative, burn, engine) : coastDerivative(gravityDerivative);
    let result;
    try {
      result = integrateDopri54({ derivative, initialState: state, startSeconds: t, targetSeconds: target,
        initialStepSeconds: Math.min(300, span), maxStepSeconds: Math.min(maxStep, Math.max(span, 1e-6)), absTol, relTol: 1e-11, recordSteps: true });
    } catch (error) {
      if (error instanceof FiniteThrustError) throw error;
      throw new FiniteThrustError('INTEGRATION_FAILED', `Integración interrumpida: ${error.message}`, { cause: error.message });
    }
    if (result.aborted || Math.abs(result.elapsedSeconds - target) > 1e-6) {
      throw new FiniteThrustError('INTEGRATION_FAILED', `Integración incompleta: ${result.abortReason ?? 'no alcanzó el instante objetivo'}.`);
    }
    const first = knots.length;
    for (let i = 1; i < result.knots.times.length; i++) knots.push({ elapsedSeconds: result.knots.times[i], state: new Float64Array(result.knots.states[i]) });
    segments.push({ kind, burnId: burn?.id ?? null, startSeconds: t, endSeconds: target, firstKnot: first - 1, lastKnot: knots.length - 1,
      acceptedSteps: result.acceptedSteps, rejectedSteps: result.rejectedSteps, functionEvaluations: result.functionEvaluations });
    totals.functionEvaluations += result.functionEvaluations; totals.acceptedSteps += result.acceptedSteps; totals.rejectedSteps += result.rejectedSteps;
    totals.minStepSeconds = Math.min(totals.minStepSeconds, result.minStepUsedSeconds); totals.maxStepSeconds = Math.max(totals.maxStepSeconds, result.maxStepUsedSeconds);
    state = new Float64Array(result.finalState); t = target;
  }

  for (const burn of ordered) {
    run('coast', null, burn.startSeconds, maxCoastStepSeconds);
    const massBeforeKg = state[6], dvBefore = state[7];
    const available = massBeforeKg - dryMassKg;
    const flow = massFlowKgS(engine.thrustN * burn.throttle, engine.ispS);
    const fullBurnSeconds = available / flow;
    const base = { id: burn.id, direction: burn.direction, throttle: burn.throttle, plannedStartSeconds: burn.startSeconds,
      plannedDurationSeconds: burn.durationSeconds, massBeforeKg, thrustN: engine.thrustN * burn.throttle, massFlowKgS: flow };
    if (!(available > 0) || fullBurnSeconds < MIN_EXECUTABLE_BURN_SECONDS) {
      events.push({ id: `${burn.id}-skipped`, kind: 'skipped', title: `Encendido ${burn.id.replace('burn-', '')} omitido: sin propelente`, elapsedSeconds: burn.startSeconds, burnId: burn.id, massKg: massBeforeKg });
      burnResults.push({ ...base, status: 'skipped', effectiveStartSeconds: burn.startSeconds, effectiveEndSeconds: burn.startSeconds, effectiveDurationSeconds: 0,
        massAfterKg: massBeforeKg, fuelConsumedKg: 0, propulsiveDeltaVMS: 0, propulsiveDeltaVIntegratedMS: 0, massResidualKg: 0 });
      continue;
    }
    const effective = Math.min(burn.durationSeconds, fullBurnSeconds);
    const depleted = fullBurnSeconds <= burn.durationSeconds;
    events.push({ id: `${burn.id}-start`, kind: 'burn-start', title: `Encendido ${burn.id.replace('burn-', '')} · inicio`, elapsedSeconds: burn.startSeconds, burnId: burn.id, massKg: massBeforeKg });
    run('burn', burn, burn.startSeconds + effective, maxBurnStepSeconds);
    const massAnalytic = massBeforeKg - flow * effective;
    const massResidualKg = Math.abs(state[6] - massAnalytic);
    if (depleted) {
      if (Math.abs(state[6] - dryMassKg) > MASS_SNAP_TOLERANCE_KG) throw new FiniteThrustError('MASS_INCONSISTENT', 'La masa integrada no coincide con la masa seca al agotar el propelente.');
      state[6] = dryMassKg; knots.at(-1).state[6] = dryMassKg;
    }
    events.push({ id: `${burn.id}-${depleted ? 'depleted' : 'end'}`, kind: depleted ? 'depletion' : 'burn-end',
      title: depleted ? `Encendido ${burn.id.replace('burn-', '')} · propelente agotado` : `Encendido ${burn.id.replace('burn-', '')} · fin`,
      elapsedSeconds: burn.startSeconds + effective, burnId: burn.id, massKg: state[6] });
    burnResults.push({ ...base, status: depleted && fullBurnSeconds < burn.durationSeconds ? 'depleted' : 'completed',
      effectiveStartSeconds: burn.startSeconds, effectiveEndSeconds: burn.startSeconds + effective, effectiveDurationSeconds: effective,
      massAfterKg: state[6], fuelConsumedKg: massBeforeKg - state[6],
      propulsiveDeltaVMS: tsiolkovskyDeltaVMS(engine.ispS, massBeforeKg, state[6]),
      propulsiveDeltaVIntegratedMS: (state[7] - dvBefore) * 1000, massResidualKg });
  }
  run('coast', null, endSeconds, maxCoastStepSeconds);
  const final = state;
  const propulsiveDeltaVMS = burnResults.reduce((n, burn) => n + burn.propulsiveDeltaVMS, 0);
  return {
    knots: knots.map(knot => ({ elapsedSeconds: knot.elapsedSeconds, positionKm: Array.from(knot.state.slice(0, 3)),
      velocityKmS: Array.from(knot.state.slice(3, 6)), massKg: knot.state[6], integratedDeltaVKmS: knot.state[7] })),
    segments, events, burns: burnResults,
    final: { elapsedSeconds: endSeconds, positionKm: Array.from(final.slice(0, 3)), velocityKmS: Array.from(final.slice(3, 6)),
      massKg: final[6], fuelKg: final[6] - dryMassKg, integratedDeltaVMS: final[7] * 1000, propulsiveDeltaVMS },
    totals: { fuelConsumedKg: initialMassKg - final[6], burnSeconds: burnResults.reduce((n, burn) => n + burn.effectiveDurationSeconds, 0), propulsiveDeltaVMS,
      integratedDeltaVMS: final[7] * 1000 },
    diagnostics: { ...totals, minStepSeconds: Number.isFinite(totals.minStepSeconds) ? totals.minStepSeconds : 0,
      maxMassResidualKg: burnResults.reduce((n, burn) => Math.max(n, burn.massResidualKg), 0),
      maxDeltaVResidualMS: burnResults.reduce((n, burn) => Math.max(n, Math.abs(burn.propulsiveDeltaVIntegratedMS - burn.propulsiveDeltaVMS)), 0),
      tolerances: { absTol, relTol: 1e-11 } },
    initialMassKg, dryMassKg, endSeconds
  };
}
