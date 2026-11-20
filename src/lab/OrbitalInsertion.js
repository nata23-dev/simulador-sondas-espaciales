// Etapa 13 — captura e inserción orbital alrededor de un cuerpo cualquiera (planeta o satélite) con empuje FINITO integrado.
// Generaliza los componentes de 12D (dirección de empuje, flujo másico, Isp/g0, DOPRI54) a cualquier μ central.
//
// Estado integrado (8 componentes, como 12D/12F): [x, y, z, vx, vy, vz, m, Δv_acum] en el marco centrado en el cuerpo
// (ejes ICRF eclíptico J2000, origen el centro/baricentro declarado), km, km/s, s, kg.
//   dr/dt = v      dv/dt = −μ r/|r|³ + (F/m)·û/1000      dm/dt = −F/(Isp·g0)      dΔv/dt = F/(m·1000)
// û = retrógrado respecto a la velocidad relativa al cuerpo (se reevalúa en cada evaluación de la derivada).
// Cada encendido se centra en el periapsis con una duración ESTIMADA por Tsiolkovsky a partir del Δv impulsivo; el apagado
// real lo decide un evento de la integración: apoapsis ≤ objetivo (o propelente agotado, o contacto con la superficie). El
// resultado (órbita final, consumo, pérdidas por gravedad) es el de la integración: no se fuerza ninguna órbita.
// Las fases sin empuje se propagan con Kepler (dos cuerpos, exacto) para que la reproducción sea determinista y barata.
import { integrateDopri54 } from '../science/NumericalIntegrator.js';
import { propagateKepler, conicSummary } from '../science/KeplerPropagator.js';
import { timeToNextPeriapsis } from '../science/PlanetaryEncounter.js';
import { thrustDirectionUnit, massFlowKgS, tsiolkovskyDeltaVMS, exhaustVelocityMS } from './FiniteThrustDynamics.js';

export const ORBITAL_INSERTION_VERSION = '13-finite-insertion-1';
export const INSERTION_STATUS = Object.freeze({
  target: 'ÓRBITA OBJETIVO ALCANZADA SEGÚN EL MODELO', partial: 'CAPTURADA · ÓRBITA OBJETIVO NO ALCANZADA', flyby: 'SIN CAPTURA · SOBREVUELO HIPERBÓLICO',
  impact: 'IMPACTO CON EL CUERPO', failed: 'INTEGRACIÓN NO VERIFICABLE'
});
export const INSERTION_ABS_TOL = Object.freeze([1e-6, 1e-6, 1e-6, 1e-9, 1e-9, 1e-9, 1e-6, 1e-12]);
export const INSERTION_REL_TOL = 1e-11;
// Intervalo temporal final de la bisección de eventos (apagado, agotamiento, contacto).
export const EVENT_BRACKET_SECONDS = 1e-4;

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = a => Math.hypot(a[0], a[1], a[2]);

export class InsertionError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = 'InsertionError'; this.code = code; this.details = details; }
}

/** Elementos osculantes con altitudes respecto a un radio de referencia. */
export function orbitDescription(positionKm, velocityKmS, mu, radiusKm) {
  const c = conicSummary(positionKm, velocityKmS, mu), bound = c.specificEnergyKm2S2 < 0 && c.eccentricity < 1;
  return { bound, eccentricity: c.eccentricity, semiMajorAxisKm: c.semiMajorAxisKm, specificEnergyKm2S2: c.specificEnergyKm2S2,
    periapsisRadiusKm: c.periapsisKm, apoapsisRadiusKm: bound ? c.apoapsisKm : null, periapsisAltitudeKm: c.periapsisKm - radiusKm,
    apoapsisAltitudeKm: bound ? c.apoapsisKm - radiusKm : null, inclinationDeg: c.inclinationDeg,
    periodSeconds: bound ? 2 * Math.PI * Math.sqrt(c.semiMajorAxisKm ** 3 / mu) : null, vInfKmS: bound ? null : Math.sqrt(2 * c.specificEnergyKm2S2),
    angularMomentumVector: c.angularMomentumVector, eccentricityVector: c.eccentricityVector };
}

function burnDerivative(mu, thrustN, flowKgS) {
  const u = new Float64Array(3);
  return (t, s, out) => {
    const r2 = s[0] * s[0] + s[1] * s[1] + s[2] * s[2], r = Math.sqrt(r2), g = -mu / (r2 * r), m = s[6];
    if (!(m > 0)) throw new InsertionError('INVALID_MASS', 'Masa no positiva durante el encendido.');
    thrustDirectionUnit({ type: 'retrograde' }, s, [s[3], s[4], s[5]], u);
    const a = thrustN / m / 1000;
    out[0] = s[3]; out[1] = s[4]; out[2] = s[5];
    out[3] = g * s[0] + a * u[0]; out[4] = g * s[1] + a * u[1]; out[5] = g * s[2] + a * u[2];
    out[6] = -flowKgS; out[7] = a;
  };
}

// Integra hasta t1 o hasta el primer evento del predicado; refina el instante del evento por bisección (≤ EVENT_BRACKET_SECONDS).
export function integrateUntilEvent({ derivative, state, t0, t1, predicate, maxStepSeconds = 30 }) {
  const run = (y, a, b, record, abort) => integrateDopri54({ derivative, initialState: y, startSeconds: a, targetSeconds: b, initialStepSeconds: Math.min(1, b - a),
    minStepSeconds: 1e-9, maxStepSeconds: Math.min(maxStepSeconds, Math.max(b - a, 1e-9)), absTol: INSERTION_ABS_TOL, relTol: INSERTION_REL_TOL, recordSteps: record, shouldAbort: abort });
  const first = predicate(state);
  if (first || !(t1 > t0)) return { knots: [{ t: t0, s: new Float64Array(state) }], state: new Float64Array(state), time: t0, event: first, stats: { acceptedSteps: 0, rejectedSteps: 0 } };
  let result;
  try { result = run(state, t0, t1, true, ({ state: y }) => predicate(y) ?? false); }
  catch (error) { if (error instanceof InsertionError) throw error; throw new InsertionError('INTEGRATION_FAILED', `Integración interrumpida: ${error.message}`); }
  const knots = Array.from(result.knots.times, (time, i) => ({ t: time, s: new Float64Array(result.knots.states[i]) }));
  const stats = { acceptedSteps: result.acceptedSteps, rejectedSteps: result.rejectedSteps };
  if (!result.aborted) return { knots, state: new Float64Array(result.finalState), time: t1, event: null, stats };
  let lo = knots.at(-2), hi = knots.at(-1);
  for (let i = 0; i < 90 && hi.t - lo.t > EVENT_BRACKET_SECONDS; i++) {
    const mid = (lo.t + hi.t) / 2, y = new Float64Array(run(lo.s, lo.t, mid, false, null).finalState);
    if (predicate(y)) hi = { t: mid, s: y }; else lo = { t: mid, s: y };
  }
  const refined = knots.slice(0, -1).filter(k => k.t < hi.t);
  refined.push(hi);
  return { knots: refined, state: new Float64Array(hi.s), time: hi.t, event: predicate(hi.s), stats, bracketSeconds: hi.t - lo.t };
}

/**
 * Secuencia de encendidos de captura, cada uno centrado en el siguiente periapsis.
 * `vehicle`: { massKg, engine: { name, thrustN, ispS }, propellantKg } — el propelente disponible para ESTE motor.
 * `burns`: [{ id, targetApoapsisRadiusKm, label }] — apoapsis objetivo (radio); igual al periapsis ⇒ circularización.
 * Devuelve tramos (kepler | burn) en tiempo relativo al estado inicial, eventos, resultado y diagnóstico.
 */
export function simulateInsertion({ mu, bodyRadiusKm, bodyName = 'cuerpo', positionKm, velocityKmS, vehicle, burns, coastAfterSeconds = 0, startOffsetFraction = 0.5 }) {
  if (!(mu > 0) || !(bodyRadiusKm > 0)) throw new InsertionError('INVALID_BODY', 'μ y radio del cuerpo deben ser positivos.');
  if (!vehicle?.engine || !(vehicle.engine.thrustN > 0) || !(vehicle.engine.ispS > 0)) throw new InsertionError('INVALID_ENGINE', 'El motor de captura necesita empuje e Isp positivos.');
  if (!(vehicle.massKg > 0) || !(vehicle.propellantKg >= 0) || vehicle.propellantKg >= vehicle.massKg) throw new InsertionError('INVALID_MASS', 'Masa y propelente de captura inválidos.');
  if (!Array.isArray(burns) || !burns.length) throw new InsertionError('INVALID_SCHEDULE', 'Se requiere al menos un encendido de captura.');
  const thrustN = vehicle.engine.thrustN, flow = massFlowKgS(thrustN, vehicle.engine.ispS), ve = exhaustVelocityMS(vehicle.engine.ispS) / 1000;
  const massFloor = vehicle.massKg - vehicle.propellantKg;
  let t = 0, r = [...positionKm], v = [...velocityKmS], m = vehicle.massKg, dvAcc = 0, status = null, failure = null;
  const segments = [], events = [], burnResults = [];
  const describe = () => orbitDescription(r, v, mu, bodyRadiusKm);
  const coast = (duration, id, label) => {
    if (!(duration > 0)) return;
    // Impacto durante el vuelo balístico: si la cónica corta la superficie antes de `duration`, se detiene en el contacto.
    const o = describe(); let end = duration, hit = false;
    if (o.periapsisRadiusKm < bodyRadiusKm && dot(r, v) < 0) {
      const f = x => norm(propagateKepler(r, v, x, mu).positionKm) - bodyRadiusKm;
      const toPeri = timeToNextPeriapsis(r, v, mu).seconds ?? duration;
      if (f(Math.min(duration, toPeri)) < 0) { let a = 0, b = Math.min(duration, toPeri); for (let i = 0; i < 200 && b - a > EVENT_BRACKET_SECONDS; i++) { const c = (a + b) / 2; if (f(c) < 0) b = c; else a = c; } end = b; hit = true; }
    }
    const final = propagateKepler(r, v, end, mu);
    segments.push({ kind: 'kepler', id, label, startSeconds: t, endSeconds: t + end, mu, initial: { positionKm: [...r], velocityKmS: [...v], massKg: m, dvAccKmS: dvAcc },
      final: { positionKm: final.positionKm, velocityKmS: final.velocityKmS, massKg: m, dvAccKmS: dvAcc } });
    r = final.positionKm; v = final.velocityKmS; t += end;
    if (hit) { status = INSERTION_STATUS.impact; events.push({ id: `${id}-impact`, kind: 'impact', title: `Impacto con ${bodyName}`, elapsedSeconds: t }); }
  };
  for (const [index, spec] of burns.entries()) {
    const id = spec.id ?? `capture-${index + 1}`;
    const next = timeToNextPeriapsis(r, v, mu);
    if (next.passed) { failure = 'La nave ya pasó el periapsis en la rama de salida: no hay periapsis donde encender.'; break; }
    const peri = next.stateAtPeriapsis, rpNow = norm(peri.positionKm), vpNow = norm(peri.velocityKmS);
    if (rpNow < bodyRadiusKm) { coast(next.seconds, `${id}-coast`, 'Aproximación balística'); if (!status) status = INSERTION_STATUS.impact; break; }
    const raTarget = Math.max(spec.targetApoapsisRadiusKm, rpNow);
    const aT = (rpNow + raTarget) / 2, vTarget = Math.sqrt(mu * (2 / rpNow - 1 / aT));
    const dvImpulsive = Math.max(0, vpNow - vTarget);
    const available = m - massFloor;
    const tEst = m * (1 - Math.exp(-dvImpulsive / ve)) / flow;
    const offset = Math.min(next.seconds, startOffsetFraction * tEst);
    coast(next.seconds - offset, `${id}-coast`, index === 0 ? 'Aproximación balística al periapsis' : 'Órbita intermedia (balística)');
    if (status) break;
    if (!(available > 1e-9)) { events.push({ id: `${id}-skipped`, kind: 'skipped', title: `${spec.label ?? 'Encendido'} omitido: sin propelente`, elapsedSeconds: t }); failure = 'Sin propelente para el encendido.'; break; }
    const tStart = t, mStart = m, dvStart = dvAcc;
    events.push({ id: `${id}-start`, kind: 'burn-start', title: `${spec.label ?? 'Encendido de captura'} · inicio`, elapsedSeconds: t, massKg: m });
    const predicate = s => {
      const rr = Math.hypot(s[0], s[1], s[2]);
      if (rr < bodyRadiusKm) return 'contact';
      if (s[6] <= massFloor + 1e-9) return 'depleted';
      const v2 = s[3] * s[3] + s[4] * s[4] + s[5] * s[5], energy = v2 / 2 - mu / rr;
      if (energy < 0) { const o = orbitDescription([s[0], s[1], s[2]], [s[3], s[4], s[5]], mu, bodyRadiusKm); if (o.apoapsisRadiusKm <= raTarget * (1 + 1e-9)) return 'cutoff'; }
      return null;
    };
    const maxDuration = Math.min(available / flow, Math.max(3 * tEst, tEst + 600));
    let leg;
    try { leg = integrateUntilEvent({ derivative: burnDerivative(mu, thrustN, flow), state: Float64Array.from([...r, ...v, m, dvAcc]), t0: t, t1: t + maxDuration, predicate, maxStepSeconds: Math.max(1, tEst / 200) }); }
    catch (error) { failure = error.message; status = INSERTION_STATUS.failed; break; }
    if (!leg.event && leg.state[6] <= massFloor + 1e-6) leg.event = 'depleted';
    const s = leg.state;
    r = [s[0], s[1], s[2]]; v = [s[3], s[4], s[5]]; m = leg.event === 'depleted' ? massFloor : s[6]; dvAcc = s[7]; t = leg.time;
    const knots = leg.knots.map(k => ({ elapsedSeconds: k.t, positionKm: [k.s[0], k.s[1], k.s[2]], velocityKmS: [k.s[3], k.s[4], k.s[5]], massKg: k.s[6], dvAccKmS: k.s[7] }));
    knots.at(-1).massKg = m;
    segments.push({ kind: 'burn', id, label: spec.label ?? 'Encendido de captura (empuje finito)', startSeconds: tStart, endSeconds: t, mu, knots, engine: { ...vehicle.engine }, throttle: 1,
      initial: { positionKm: knots[0].positionKm, velocityKmS: knots[0].velocityKmS, massKg: mStart, dvAccKmS: dvStart }, final: { positionKm: [...r], velocityKmS: [...v], massKg: m, dvAccKmS: dvAcc } });
    const after = describe(), used = mStart - m;
    const result = { id, label: spec.label ?? 'Encendido de captura', engine: vehicle.engine.name, thrustN, ispS: vehicle.engine.ispS, startSeconds: tStart, endSeconds: t, durationSeconds: t - tStart,
      estimatedDurationSeconds: tEst, plannedOffsetSeconds: offset, impulsiveDeltaVKmS: dvImpulsive, targetApoapsisRadiusKm: raTarget,
      propellantKg: used, propulsiveDeltaVKmS: tsiolkovskyDeltaVMS(vehicle.engine.ispS, mStart, m) / 1000, integratedDeltaVKmS: dvAcc - dvStart,
      gravityLossKmS: leg.event === 'cutoff' ? tsiolkovskyDeltaVMS(vehicle.engine.ispS, mStart, m) / 1000 - dvImpulsive : null, endEvent: leg.event ?? 'horizon', bracketSeconds: leg.bracketSeconds ?? null, orbitAfter: after,
      massAfterKg: m, stats: leg.stats };
    burnResults.push(result);
    const endTitle = { cutoff: 'apagado: apoapsis objetivo alcanzado', depleted: 'propelente agotado', contact: 'contacto con la superficie' }[leg.event] ?? 'fin del encendido sin alcanzar el objetivo';
    events.push({ id: `${id}-end`, kind: leg.event === 'depleted' ? 'depletion' : leg.event === 'contact' ? 'impact' : 'burn-end', title: `${spec.label ?? 'Encendido'} · ${endTitle}`, elapsedSeconds: t, massKg: m });
    if (leg.event === 'contact') { status = INSERTION_STATUS.impact; break; }
    if (leg.event !== 'cutoff') { if (leg.event === 'depleted') failure = 'Propelente agotado antes de alcanzar el apoapsis objetivo.'; else failure = 'El encendido terminó sin alcanzar el apoapsis objetivo.'; break; }
  }
  if (!status) coast(coastAfterSeconds, 'final-coast', 'Órbita final (balística)');
  const final = describe();
  if (!status) {
    const reachedAll = !failure && burnResults.length === burns.length && burnResults.every(b => b.endEvent === 'cutoff');
    status = !final.bound ? INSERTION_STATUS.flyby : final.periapsisRadiusKm < bodyRadiusKm ? INSERTION_STATUS.impact : reachedAll ? INSERTION_STATUS.target : INSERTION_STATUS.partial;
  }
  return Object.freeze({ model: ORBITAL_INSERTION_VERSION, status, failure, segments, events, burns: burnResults, durationSeconds: t,
    final: { positionKm: r, velocityKmS: v, massKg: m, dvAccKmS: dvAcc, orbit: final },
    totals: { propellantKg: vehicle.massKg - m, propulsiveDeltaVKmS: tsiolkovskyDeltaVMS(vehicle.engine.ispS, vehicle.massKg, m) / 1000,
      impulsiveReferenceKmS: burnResults.reduce((n, b) => n + b.impulsiveDeltaVKmS, 0), remainingPropellantKg: m - massFloor },
    tolerances: { absTol: INSERTION_ABS_TOL, relTol: INSERTION_REL_TOL, eventBracketSeconds: EVENT_BRACKET_SECONDS } });
}

/** Referencia impulsiva ideal de la misma secuencia: Δv y propelente por Tsiolkovsky, sin propagar. */
export function impulsiveInsertionReference({ mu, vInfKmS, periapsisRadiusKm, burns, massKg, ispS }) {
  const ve = exhaustVelocityMS(ispS) / 1000;
  let vp = Math.sqrt(vInfKmS * vInfKmS + 2 * mu / periapsisRadiusKm), m = massKg, total = 0;
  const steps = burns.map(spec => {
    const ra = Math.max(spec.targetApoapsisRadiusKm, periapsisRadiusKm), a = (periapsisRadiusKm + ra) / 2, vt = Math.sqrt(mu * (2 / periapsisRadiusKm - 1 / a));
    const dv = Math.max(0, vp - vt), mAfter = m * Math.exp(-dv / ve);
    const step = { targetApoapsisRadiusKm: ra, deltaVKmS: dv, propellantKg: m - mAfter, massAfterKg: mAfter };
    vp = vt; m = mAfter; total += dv; return step;
  });
  return { steps, totalDeltaVKmS: total, propellantKg: massKg - m, note: 'Impulsos instantáneos ideales en el periapsis (referencia); no es la maniobra ejecutada.' };
}

/** Muestra un tramo de inserción en un instante relativo (Kepler exacto o Hermite entre nudos DOPRI54; masa lineal). */
export function sampleInsertionSegment(segment, elapsedSeconds) {
  const t = Math.min(segment.endSeconds, Math.max(segment.startSeconds, elapsedSeconds));
  if (segment.kind === 'kepler') {
    const s = propagateKepler(segment.initial.positionKm, segment.initial.velocityKmS, t - segment.startSeconds, segment.mu);
    return { positionKm: s.positionKm, velocityKmS: s.velocityKmS, massKg: segment.initial.massKg, dvAccKmS: segment.initial.dvAccKmS, engineOn: false };
  }
  const k = segment.knots;
  let lo = 0, hi = k.length - 1;
  if (t <= k[0].elapsedSeconds) return { ...k[0], engineOn: true };
  if (t >= k[hi].elapsedSeconds) return { ...k[hi], engineOn: false };
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (k[mid].elapsedSeconds <= t) lo = mid; else hi = mid; }
  const a = k[lo], b = k[hi], h = b.elapsedSeconds - a.elapsedSeconds, u = (t - a.elapsedSeconds) / h, u2 = u * u, u3 = u2 * u;
  const positionKm = [], velocityKmS = [];
  for (let i = 0; i < 3; i++) {
    positionKm.push((2 * u3 - 3 * u2 + 1) * a.positionKm[i] + (u3 - 2 * u2 + u) * h * a.velocityKmS[i] + (-2 * u3 + 3 * u2) * b.positionKm[i] + (u3 - u2) * h * b.velocityKmS[i]);
    velocityKmS.push(((6 * u2 - 6 * u) * a.positionKm[i] + (-6 * u2 + 6 * u) * b.positionKm[i]) / h + (3 * u2 - 4 * u + 1) * a.velocityKmS[i] + (3 * u2 - 2 * u) * b.velocityKmS[i]);
  }
  return { positionKm, velocityKmS, massKg: a.massKg + (b.massKg - a.massKg) * u, dvAccKmS: a.dvAccKmS + (b.dvAccKmS - a.dvAccKmS) * u, engineOn: true };
}
