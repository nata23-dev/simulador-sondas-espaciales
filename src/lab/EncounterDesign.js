// Etapa 13 — diseño de encuentros con cónicas parcheadas sobre efemérides reales.
//
// 1) aimEncounter: apuntado de un arco de Lambert (cuerpo central μc) a la ENTRADA en la esfera de influencia del objetivo,
//    con la hipérbola de llegada fijada por (radio de periapsis, ángulo del plano B) y el periapsis en una época dada.
//    Iteración de punto fijo: hipérbola(v∞) → estado en la SOI → punto heliocéntrico/planetocéntrico = objetivo(t_SOI) +
//    estado relativo → Lambert hasta ese punto → v∞ asintótica del estado relativo REAL del arco → repetir. Al converger,
//    el estado del arco en la frontera, transformado con la efeméride del objetivo, ES el estado de la hipérbola apuntada:
//    posición y velocidad continuas por construcción. La verificación propaga ese estado y mide periapsis y plano B.
// 2) targetFiniteBurn: un encendido FINITO de dirección inercial fija (12D) que lleva la nave al punto de apuntado en la
//    época pedida (método de disparo, Newton con jacobiano por diferencias finitas). No se sustituye por un impulso.
// 3) searchMoonTransfer: transferencias planetocéntricas de cero revoluciones desde la órbita de captura hasta un satélite.
// 4) screenCloseApproaches: distancia mínima a otros satélites a lo largo de un tramo (validez de la cónica parcheada).
import { solveLambert, LAMBERT_STATUS } from '../science/LambertSolver.js';
import { propagateKepler, conicSummary } from '../science/KeplerPropagator.js';
import { integrateDopri54 } from '../science/NumericalIntegrator.js';
import { hyperbolaFromBPlane, stateOnConic, trueAnomalyAtRadius, hyperbolicTimeFromPeriapsis, asymptoticExcess, bPlaneFromState,
  bAngleForReferenceNormal, impulsiveCaptureDeltaV, timeToNextPeriapsis } from '../science/PlanetaryEncounter.js';
import { massFlowKgS, exhaustVelocityMS, tsiolkovskyDeltaVMS, thrustDirectionUnit } from './FiniteThrustDynamics.js';
import { INSERTION_ABS_TOL, INSERTION_REL_TOL } from './OrbitalInsertion.js';

export const ENCOUNTER_DESIGN_VERSION = '13-encounter-design-1';
export const AIM_STATUS = Object.freeze({ aimed: 'APUNTADO CONVERGENTE', noCoverage: 'EFEMÉRIDES NO DISPONIBLES', lambert: 'LAMBERT NO CONVERGENTE',
  noConvergence: 'APUNTADO NO CONVERGENTE', impact: 'PERIAPSIS BAJO LA SUPERFICIE', invalid: 'PARÁMETROS INVÁLIDOS' });
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = a => Math.hypot(a[0], a[1], a[2]);
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

function resolveB(bPlane, vInfVector, pole) {
  if (bPlane?.mode === 'normal') { const r = bAngleForReferenceNormal(vInfVector, pole, bPlane.normal); return { angle: r.bAngleDeg, minimumInclinationDeg: r.minimumInclinationDeg }; }
  return { angle: bPlane?.angleDeg ?? 0, minimumInclinationDeg: null };
}

/** ¿Corta el arco (r1, v1, duración) la esfera de radio R? Solo puede hacerlo si su periapsis está dentro y se recorre en el tramo. */
export function arcIntersectsBody(r1, v1, durationSeconds, mu, radiusKm) {
  const c = conicSummary(r1, v1, mu);
  if (c.periapsisKm >= radiusKm) return false;
  const next = timeToNextPeriapsis(r1, v1, mu);
  if (next.passed || next.seconds == null) return norm(r1) < radiusKm;
  if (next.seconds <= durationSeconds) return true;
  return norm(propagateKepler(r1, v1, durationSeconds, mu).positionKm) < radiusKm;
}

/**
 * `targetStateAt(jdTdb)` → { positionKm, velocityKmS } del objetivo respecto al cuerpo central (o null sin cobertura).
 * `bPlane`: { mode: 'fixed', angleDeg } | { mode: 'normal', normal } (minimiza la inclinación respecto a esa normal).
 */
export function aimEncounter({ departurePositionKm, departureJdTdb, periapsisJdTdb, targetStateAt, muCentral, muTarget, targetRadiusKm, periapsisRadiusKm,
  bPlane = { mode: 'fixed', angleDeg: 0 }, poleVector = [0, 0, 1], soiRadiusKm, maxIterations = 40, toleranceKmS = 1e-10, centralRadiusKm = 0 }) {
  const base = { model: ENCOUNTER_DESIGN_VERSION, departureJdTdb, periapsisJdTdb, periapsisRadiusKm, soiRadiusKm, bPlaneRequest: bPlane };
  if (!(periapsisRadiusKm > targetRadiusKm)) return Object.freeze({ ...base, status: AIM_STATUS.impact, reason: `El periapsis pedido (${periapsisRadiusKm.toFixed(1)} km) está bajo la superficie (R = ${targetRadiusKm} km).` });
  if (!(soiRadiusKm > periapsisRadiusKm)) return Object.freeze({ ...base, status: AIM_STATUS.invalid, reason: 'El periapsis debe estar dentro de la esfera de influencia.' });
  const tof0 = (periapsisJdTdb - departureJdTdb) * 86400;
  if (!(tof0 > 0)) return Object.freeze({ ...base, status: AIM_STATUS.invalid, reason: 'La llegada debe ser posterior a la salida.' });
  const at = jd => { const s = targetStateAt(jd); if (!s || !s.positionKm) throw new RangeError('Efemérides no disponibles para el intervalo solicitado'); return s; };
  let target, lambert;
  try { target = at(periapsisJdTdb); } catch (error) { return Object.freeze({ ...base, status: AIM_STATUS.noCoverage, reason: error.message }); }
  lambert = solveLambert(departurePositionKm, target.positionKm, tof0, muCentral, { direction: 'prograde' });
  if (lambert.status !== LAMBERT_STATUS.converged) return Object.freeze({ ...base, status: AIM_STATUS.lambert, reason: lambert.reason ?? 'Lambert al centro del objetivo no convergió.' });
  // Incógnita: v∞ (vector) de la hipérbola apuntada. Residuo F(v∞) = v∞ asintótica del estado relativo REAL del arco en la
  // SOI − v∞. Newton amortiguado con jacobiano por diferencias finitas (el punto fijo simple diverge cuando la SOI es grande,
  // p. ej., Júpiter: ~95 d de hipérbola). Al anularse F, el arco y la hipérbola coinciden en la frontera.
  const evaluate = vInfVector => {
    const b = resolveB(bPlane, vInfVector, poleVector);
    const hyp = hyperbolaFromBPlane({ vInfVectorKmS: vInfVector, muKm3S2: muTarget, periapsisRadiusKm, bAngleDeg: b.angle, poleVector });
    const nu = trueAnomalyAtRadius(hyp, soiRadiusKm, 'incoming'), rel = stateOnConic(hyp, nu), dt = -hyperbolicTimeFromPeriapsis(hyp, nu);
    const jdSoi = periapsisJdTdb - dt / 86400;
    if (!(jdSoi > departureJdTdb)) return { error: AIM_STATUS.invalid, reason: 'La entrada en la esfera de influencia sería anterior a la salida.' };
    let target;
    try { target = at(jdSoi); } catch (error) { return { error: AIM_STATUS.noCoverage, reason: error.message }; }
    const aim = add(target.positionKm, rel.positionKm);
    const lam = solveLambert(departurePositionKm, aim, (jdSoi - departureJdTdb) * 86400, muCentral, { direction: 'prograde' });
    if (lam.status !== LAMBERT_STATUS.converged) return { error: AIM_STATUS.lambert, reason: lam.reason ?? 'Lambert al punto de apuntado no convergió.' };
    const relV = sub(lam.arrivalVelocityKmS, target.velocityKmS);
    const ex = asymptoticExcess(rel.positionKm, relV, muTarget, 'incoming');
    if (!ex) return { error: AIM_STATUS.noConvergence, reason: 'El estado relativo en la esfera de influencia no es hiperbólico.' };
    return { b, hyp, lambert: lam, F: sub(ex.vInfVectorKmS, vInfVector), mismatch: norm(sub(relV, rel.velocityKmS)),
      soi: { jdTdb: jdSoi, secondsToPeriapsis: dt, trueAnomalyRad: nu, aimPositionKm: aim, arcVelocityKmS: lam.arrivalVelocityKmS, targetState: target,
        relative: { positionKm: rel.positionKm, velocityKmS: relV }, hyperbolaVelocityKmS: rel.velocityKmS } };
  };
  let x = sub(lambert.arrivalVelocityKmS, target.velocityKmS), cur = evaluate(x), iterations = 0;
  const history = [];
  if (cur.error) return Object.freeze({ ...base, status: cur.error, reason: cur.reason });
  for (; iterations < maxIterations && cur.mismatch > toleranceKmS; iterations++) {
    history.push(cur.mismatch);
    const h = 1e-7 * Math.max(1, norm(x)), J = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    let failed = false;
    for (let j = 0; j < 3; j++) { const xp = [...x]; xp[j] += h; const e = evaluate(xp); if (e.error) { failed = true; break; } for (let i = 0; i < 3; i++) J[i][j] = (e.F[i] - cur.F[i]) / h; }
    if (failed) break;
    const step = solve3(J, cur.F);
    if (!step) break;
    let lambda = 1, next = null;
    for (let k = 0; k < 10; k++) { const trial = sub(x, scale(step, lambda)), e = evaluate(trial); if (!e.error && norm(e.F) < norm(cur.F)) { x = trial; next = e; break; } lambda /= 2; }
    if (!next) break;
    cur = next;
  }
  history.push(cur.mismatch);
  let { hyp, soi, mismatch, b } = cur;
  lambert = cur.lambert;
  if (!(mismatch <= Math.max(toleranceKmS, 1e-8))) return Object.freeze({ ...base, status: AIM_STATUS.noConvergence, iterations, mismatchKmS: mismatch, history, reason: `Desajuste de velocidad ${mismatch} km/s tras ${iterations} iteraciones.` });
  if (centralRadiusKm > 0 && arcIntersectsBody(departurePositionKm, lambert.departureVelocityKmS, (soi.jdTdb - departureJdTdb) * 86400, muCentral, centralRadiusKm)) {
    return Object.freeze({ ...base, status: AIM_STATUS.impact, reason: 'El arco de transferencia atraviesa el cuerpo central.' });
  }
  // Verificación independiente: propagar el estado relativo REAL desde la SOI hasta el periapsis y medir el resultado.
  const atPeri = propagateKepler(soi.relative.positionKm, soi.relative.velocityKmS, soi.secondsToPeriapsis, muTarget);
  const achievedB = bPlaneFromState(soi.relative.positionKm, soi.relative.velocityKmS, muTarget, poleVector);
  const achievedConic = conicSummary(soi.relative.positionKm, soi.relative.velocityKmS, muTarget);
  const achieved = { periapsisRadiusKm: achievedConic.periapsisKm, periapsisAltitudeKm: achievedConic.periapsisKm - targetRadiusKm, radiusAtPlannedEpochKm: norm(atPeri.positionKm),
    BdotT: achievedB.BdotT, BdotR: achievedB.BdotR, bAngleDeg: achievedB.bAngleDeg, bMagnitudeKm: achievedB.bMagnitudeKm, vInfKmS: achievedB.vInfKmS,
    eccentricity: achievedConic.eccentricity, inclinationToPoleDeg: hyp.inclinationToPoleDeg, impact: achievedConic.periapsisKm < targetRadiusKm };
  return Object.freeze({ ...base, status: achieved.impact ? AIM_STATUS.impact : AIM_STATUS.aimed, iterations, mismatchKmS: mismatch, history, lambert, hyperbola: hyp,
    bAngleDeg: b.angle, minimumInclinationDeg: b.minimumInclinationDeg, soi, achieved,
    departure: { jdTdb: departureJdTdb, positionKm: [...departurePositionKm], velocityKmS: lambert.departureVelocityKmS } });
}

function inertialBurnDerivative(mu, thrustN, flow, direction) {
  const u = new Float64Array(3);
  return (t, s, out) => {
    const r2 = s[0] * s[0] + s[1] * s[1] + s[2] * s[2], r = Math.sqrt(r2), g = -mu / (r2 * r);
    thrustDirectionUnit({ type: 'inertial', vector: direction }, s, null, u);
    const a = thrustN / s[6] / 1000;
    out[0] = s[3]; out[1] = s[4]; out[2] = s[5]; out[3] = g * s[0] + a * u[0]; out[4] = g * s[1] + a * u[1]; out[5] = g * s[2] + a * u[2]; out[6] = -flow; out[7] = a;
  };
}

function solve3(J, f) {
  const [a, b, c] = J, det = a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  if (!(Math.abs(det) > 0)) return null;
  const inv = [[b[1] * c[2] - b[2] * c[1], a[2] * c[1] - a[1] * c[2], a[1] * b[2] - a[2] * b[1]], [b[2] * c[0] - b[0] * c[2], a[0] * c[2] - a[2] * c[0], a[2] * b[0] - a[0] * b[2]],
    [b[0] * c[1] - b[1] * c[0], a[1] * c[0] - a[0] * c[1], a[0] * b[1] - a[1] * b[0]]];
  return [0, 1, 2].map(i => (inv[i][0] * f[0] + inv[i][1] * f[1] + inv[i][2] * f[2]) / det);
}

/**
 * Encendido finito de dirección inercial fija centrado en `burnCenterSeconds` que lleva la nave a `aimPositionKm` en
 * `arrivalSeconds` (tiempos relativos al estado dado). Incógnita: vector u (km/s) — dirección û y duración por Tsiolkovsky
 * T = m(1 − e^(−|u|/ve))/ṁ. La integración (DOPRI54, gravedad central + empuje) decide el resultado; Newton ajusta u.
 */
export function targetFiniteBurn({ mu, positionKm, velocityKmS, massKg, propellantKg, engine, burnCenterSeconds, aimPositionKm, arrivalSeconds, initialDeltaVKmS, toleranceKm = 0.05, maxIterations = 20, centralRadiusKm = 0 }) {
  const flow = massFlowKgS(engine.thrustN, engine.ispS), ve = exhaustVelocityMS(engine.ispS) / 1000;
  const simulate = (u, record = false) => {
    const dv = norm(u), mAfter = massKg * Math.exp(-dv / ve), used = massKg - mAfter;
    if (used > propellantKg + 1e-9) return { feasible: false, used };
    const duration = used / flow, start = burnCenterSeconds - duration / 2, end = start + duration;
    if (start < 0 || end > arrivalSeconds) return { feasible: false, used, reason: 'El encendido no cabe entre el estado inicial y la llegada.' };
    const pre = propagateKepler(positionKm, velocityKmS, start, mu);
    let post = { positionKm: pre.positionKm, velocityKmS: pre.velocityKmS }, mass = massKg, dvAcc = 0, knots = null;
    if (duration > 0) {
      const res = integrateDopri54({ derivative: inertialBurnDerivative(mu, engine.thrustN, flow, u), initialState: Float64Array.from([...pre.positionKm, ...pre.velocityKmS, massKg, 0]),
        startSeconds: start, targetSeconds: end, initialStepSeconds: Math.min(1, duration), minStepSeconds: 1e-9, maxStepSeconds: Math.max(1, duration / 50),
        absTol: INSERTION_ABS_TOL, relTol: INSERTION_REL_TOL, recordSteps: record });
      const s = res.finalState; post = { positionKm: [s[0], s[1], s[2]], velocityKmS: [s[3], s[4], s[5]] }; mass = s[6]; dvAcc = s[7];
      if (record) knots = Array.from(res.knots.times, (time, i) => { const y = res.knots.states[i]; return { elapsedSeconds: time, positionKm: [y[0], y[1], y[2]], velocityKmS: [y[3], y[4], y[5]], massKg: y[6], dvAccKmS: y[7] }; });
    }
    const arrival = propagateKepler(post.positionKm, post.velocityKmS, arrivalSeconds - end, mu);
    return { feasible: true, used, duration, start, end, pre, post, mass, dvAcc, arrival, knots, miss: sub(arrival.positionKm, aimPositionKm) };
  };
  let u = [...initialDeltaVKmS], current = simulate(u), iterations = 0;
  if (!current.feasible) return { converged: false, reason: current.reason ?? `Propelente insuficiente para el encendido de corrección (${current.used.toFixed(1)} kg necesarios, ${propellantKg.toFixed(1)} kg disponibles).`, requiredPropellantKg: current.used };
  const h = 1e-6;
  for (; iterations < maxIterations && norm(current.miss) > toleranceKm; iterations++) {
    const J = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let j = 0; j < 3; j++) {
      const up = [...u]; up[j] += h; const s = simulate(up);
      if (!s.feasible) return { converged: false, reason: 'El ajuste del encendido requiere más propelente del disponible.', requiredPropellantKg: s.used };
      for (let i = 0; i < 3; i++) J[i][j] = (s.miss[i] - current.miss[i]) / h;
    }
    const step = solve3(J, current.miss);
    if (!step) break;
    let lambda = 1, next = null;
    for (let k = 0; k < 8; k++) { const trial = sub(u, scale(step, lambda)), s = simulate(trial); if (s.feasible && norm(s.miss) < norm(current.miss)) { u = trial; next = s; break; } lambda /= 2; }
    if (!next) break;
    current = next;
  }
  const missKm = norm(current.miss);
  if (!(missKm <= toleranceKm)) return { converged: false, reason: `El encendido finito no alcanzó el punto de apuntado (error ${missKm.toFixed(3)} km).`, missKm, iterations };
  const final = simulate(u, true);
  if (centralRadiusKm > 0 && arcIntersectsBody(final.post.positionKm, final.post.velocityKmS, arrivalSeconds - final.end, mu, centralRadiusKm)) return { converged: false, reason: 'El arco corregido atraviesa el cuerpo central.' };
  return { converged: true, iterations, missKm: norm(final.miss), deltaVVectorKmS: u, direction: scale(u, 1 / norm(u)), startSeconds: final.start, endSeconds: final.end, durationSeconds: final.duration,
    propellantKg: final.used, massAfterKg: final.mass, propulsiveDeltaVKmS: tsiolkovskyDeltaVMS(engine.ispS, massKg, final.mass) / 1000, integratedDeltaVKmS: final.dvAcc,
    knots: final.knots, preBurn: final.pre, postBurn: final.post, arrival: final.arrival };
}

/**
 * Exploración (tiempo de salida en la órbita × tiempo de vuelo) de transferencias planetocéntricas de cero revoluciones a un
 * satélite. Coste = Δv impulsivo de salida + Δv impulsivo de captura ideal en el satélite (referencia para elegir).
 */
export function searchMoonTransfer({ spacecraft, mu, centralRadiusKm, moonStateAt, moon, departureOffsetsSeconds, tofSecondsList, objective = 'capture' }) {
  // 15: con objetivo «flyby» el coste es solo el Δv de salida (el satélite no se captura).
  const cost = cell => (objective === 'flyby' ? cell.transferDeltaVKmS : cell.totalKmS);
  let best = null, evaluated = 0, rejected = { coverage: 0, lambert: 0, impact: 0 };
  const cells = [];
  for (const t1 of departureOffsetsSeconds) {
    const sc = propagateKepler(spacecraft.positionKm, spacecraft.velocityKmS, t1, mu);
    for (const tof of tofSecondsList) {
      const jdArr = spacecraft.jdTdb + (t1 + tof) / 86400, m = moonStateAt(jdArr);
      if (!m) { rejected.coverage++; continue; }
      const lam = solveLambert(sc.positionKm, m.positionKm, tof, mu, { direction: 'prograde' });
      if (lam.status !== LAMBERT_STATUS.converged || !(lam.diagnostics.closurePositionKm < 1)) { rejected.lambert++; continue; }
      if (arcIntersectsBody(sc.positionKm, lam.departureVelocityKmS, tof, mu, centralRadiusKm)) { rejected.impact++; continue; }
      evaluated++;
      const dv1 = norm(sub(lam.departureVelocityKmS, sc.velocityKmS)), vInf = norm(sub(lam.arrivalVelocityKmS, m.velocityKmS));
      const capture = impulsiveCaptureDeltaV({ vInfKmS: vInf, muKm3S2: moon.mu, periapsisRadiusKm: moon.periapsisRadiusKm, apoapsisRadiusKm: moon.apoapsisRadiusKm }).deltaVKmS;
      const cell = { departureOffsetSeconds: t1, tofSeconds: tof, transferDeltaVKmS: dv1, vInfMoonKmS: vInf, captureDeltaVKmS: capture, totalKmS: dv1 + capture,
        deltaVVectorKmS: sub(lam.departureVelocityKmS, sc.velocityKmS) };
      cells.push(cell);
      if (!best || cost(cell) < cost(best)) best = cell;
    }
  }
  return { best, evaluated, rejected, cells };
}

/** Distancia mínima de la nave a cada satélite en un tramo; marca si entra en su esfera de influencia (cónica joviana no válida allí). */
export function screenCloseApproaches({ sampleSpacecraft, startSeconds, endSeconds, jdAt, moons, stepSeconds = 1800 }) {
  return moons.map(moon => {
    let best = { distanceKm: Infinity, elapsedSeconds: null }, available = 0;
    const distance = t => { const s = moon.stateAt(jdAt(t)); if (!s) return null; return norm(sub(sampleSpacecraft(t), s.positionKm)); };
    let prev = null;
    for (let t = startSeconds; t <= endSeconds + 1e-9; t += stepSeconds) {
      const d = distance(Math.min(t, endSeconds)); if (d == null) continue; available++;
      if (d < best.distanceKm) best = { distanceKm: d, elapsedSeconds: Math.min(t, endSeconds) };
      prev = d;
    }
    if (best.elapsedSeconds != null) { // refinamiento por sección áurea alrededor del mínimo muestreado
      let a = Math.max(startSeconds, best.elapsedSeconds - stepSeconds), b = Math.min(endSeconds, best.elapsedSeconds + stepSeconds);
      for (let i = 0; i < 60 && b - a > 1; i++) { const c = b - (b - a) / 1.618, d = a + (b - a) / 1.618, fc = distance(c), fd = distance(d); if (fc == null || fd == null) break; if (fc < fd) b = d; else a = c; }
      const t = (a + b) / 2, d = distance(t); if (d != null && d < best.distanceKm) best = { distanceKm: d, elapsedSeconds: t };
    }
    return { key: moon.key, name: moon.name, minimumDistanceKm: best.distanceKm, elapsedSeconds: best.elapsedSeconds, insideSoi: best.distanceKm < moon.soiKm, soiKm: moon.soiKm,
      covered: available > 0, prev };
  });
}
