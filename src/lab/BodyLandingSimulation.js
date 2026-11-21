// Etapa 12F — simulación completa de un descenso propulsado sobre un cuerpo sólido sin atmósfera significativa.
// Fases: órbita inicial → salida de órbita (encendido retrógrado) → aproximación al periapsis → frenado principal →
// reducción de velocidad horizontal → descenso terminal → contacto → evaluación. Todo resulta de integrar DOPRI54
// con el guiado en lazo cerrado de BodyLandingDynamics; nada está predefinido. El contacto es un evento numérico |r| = R.
import { CAPABILITY, landingCapability, localFrameDescriptor } from './CelestialBodyMissionRegistry.js';
import { DEFAULT_LANDING_GUIDANCE, DEFAULT_LANDING_LIMITS, LandingError, createLandingEnvironment, descentPhaseOf, initialOrbitState, landingCommand,
  orbitalSummary, runLandingLeg, surfaceGravityMS2, surfaceKinematics, CONTACT_PREDICATE_KM, CONTACT_BRACKET_SECONDS, LANDING_ABS_TOL, LANDING_REL_TOL } from './BodyLandingDynamics.js';
import { landerStructuralMassKg, landerWetMassKg, massFlowAtThrottle, validateLander } from './BodyLandingVehicle.js';
import { sampleIntegratedState } from './MissionPlayback.js';

export const LANDING_MODEL_VERSION = 'body-landing-point-mass-v1';
export const LANDING_OUTCOMES = Object.freeze({
  soft: 'ATERRIZAJE SUAVE SEGÚN EL MODELO', hard: 'ATERRIZAJE BRUSCO', impact: 'IMPACTO', fuel: 'COMBUSTIBLE AGOTADO',
  thrust: 'EMPUJE INSUFICIENTE', incomplete: 'DESCENSO INCOMPLETO', unverifiable: 'NO VERIFICABLE'
});
export const DEFAULT_LANDING_SCHEDULE = Object.freeze({ maxDescentSeconds: 4000 });
export const DEFAULT_DESCENT_ORBIT = Object.freeze({ periapsisAltitudeKm: 100, apoapsisAltitudeKm: 100, inclinationDeg: 30, raanDeg: 0, argumentOfPeriapsisDeg: 0, trueAnomalyDeg: 0 });
const DEG = 180 / Math.PI;

export function classifyContact(limits, verticalMS, horizontalMS) {
  const down = Math.abs(verticalMS);
  if (down <= limits.softVerticalMS && horizontalMS <= limits.softHorizontalMS) return 'soft';
  if (down <= limits.hardVerticalMS && horizontalMS <= limits.hardHorizontalMS) return 'hard';
  return 'impact';
}

export function validateLandingOptions(options) {
  const issues = [];
  if (!options?.orbit) return ['Falta la órbita inicial.'];
  const g = { ...DEFAULT_LANDING_GUIDANCE, ...options.guidance };
  for (const key of ['descentPeriapsisAltitudeKm', 'deorbitDelaySeconds', 'descentDecelFraction', 'verticalGainPerS', 'touchdownSpeedMS', 'horizontalTimeConstantS']) if (!Number.isFinite(g[key])) issues.push(`guidance.${key} debe ser finito.`);
  if (g.descentPeriapsisAltitudeKm <= 0) issues.push('La altitud del periapsis de descenso debe ser positiva.');
  if (g.descentDecelFraction <= 0 || g.descentDecelFraction > 1) issues.push('La fracción de deceleración debe estar en (0, 1].');
  if (g.touchdownSpeedMS <= 0) issues.push('La velocidad objetivo de contacto debe ser positiva.');
  if (g.horizontalTimeConstantS <= 0) issues.push('La constante de tiempo horizontal debe ser positiva.');
  if (g.deorbitDelaySeconds < 0) issues.push('El retardo de salida de órbita no puede ser negativo.');
  const s = { ...DEFAULT_LANDING_SCHEDULE, ...options.schedule };
  if (!(Number.isFinite(s.maxDescentSeconds) && s.maxDescentSeconds > 0)) issues.push('La duración máxima de descenso debe ser positiva.');
  return issues;
}

// 12F.1 (OBS-12F-01): informe separado de las tolerancias del contacto; ninguna sustituye a otra.
export function contactToleranceReport(contact, contactInfo, env) {
  if (!contact || !contactInfo) return null;
  const r = contactInfo.positionKm, v = contactInfo.velocityKmS, rn = Math.hypot(r[0], r[1], r[2]);
  const radialSpeedKmS = Math.abs((r[0] * v[0] + r[1] * v[1] + r[2] * v[2]) / rn), bracket = contact.bracketSeconds;
  return { predicateToleranceKm: CONTACT_PREDICATE_KM, bracketLimitSeconds: CONTACT_BRACKET_SECONDS, bracketSeconds: bracket, radialSpeedKmS,
    spatialBoundKm: Number.isFinite(bracket) ? radialSpeedKmS * bracket : null, observedResidualKm: rn - env.radiusKm,
    integrationTolerance: { absPositionKm: LANDING_ABS_TOL[0], rel: LANDING_REL_TOL },
    note: 'El predicado (1e-9 km) solo fija que el estado está bajo R; la precisión espacial la limita |v_r|·Δt del intervalo de bisección, y el error de integración lo fijan las tolerancias DOPRI54.' };
}
export function simulateLanding({ profile, lander, payloadMassKg, options }) {
  const capability = landingCapability(profile);
  if (![CAPABILITY.operational, CAPABILITY.experimental].includes(capability.state)) throw new LandingError('NOT_AVAILABLE', capability.reason, { capability });
  const landerIssues = validateLander(lander);
  if (landerIssues.length) throw new LandingError('INVALID_LANDER', landerIssues.join(' '), { issues: landerIssues });
  if (!Number.isFinite(payloadMassKg) || payloadMassKg < 0) throw new LandingError('INVALID_MASS', 'La masa de la carga útil debe ser finita y no negativa.');
  const optionIssues = validateLandingOptions(options);
  if (optionIssues.length) throw new LandingError('INVALID_OPTIONS', optionIssues.join(' '), { issues: optionIssues });
  // Guiado de lazo cerrado: exige estrangulamiento real y que el empuje mínimo permita sostener el vuelo estacionario.
  if (!lander.engine.throttleable) throw new LandingError('NOT_SUPPORTED', 'El guiado de descenso implementado requiere un motor estrangulable: los motores de empuje fijo necesitan una ley de encendido único que aún no está implementada. No se simula un estrangulamiento que el motor no tiene.');
  const guidance = { ...DEFAULT_LANDING_GUIDANCE, ...options.guidance }, limits = { ...DEFAULT_LANDING_LIMITS, ...options.limits }, schedule = { ...DEFAULT_LANDING_SCHEDULE, ...options.schedule };
  const env = createLandingEnvironment(profile);
  const minimumAccelMS2 = lander.engine.throttleMin * lander.engine.thrustMaxN / (landerStructuralMassKg(lander) + payloadMassKg);
  if (minimumAccelMS2 > surfaceGravityMS2(env)) throw new LandingError('NOT_SUPPORTED', `El empuje mínimo del módulo (${minimumAccelMS2.toFixed(3)} m/s² con la masa final) supera la gravedad de ${profile.name} (${surfaceGravityMS2(env).toFixed(3)} m/s²): no puede sostener un vuelo estacionario y el guiado en lazo cerrado no es aplicable (la integración conmutaría el motor en el umbral). Se necesita un módulo con menor empuje mínimo.`, { minimumAccelMS2 });
  const start = initialOrbitState(env, options.orbit);
  const mDry = landerStructuralMassKg(lander) + payloadMassKg, m0 = landerWetMassKg(lander, payloadMassKg);
  const flow = massFlowAtThrottle(lander.engine, 1);
  const initial = orbitalSummary(env, start.positionKm, start.velocityKmS);
  const rpTarget = env.radiusKm + guidance.descentPeriapsisAltitudeKm;

  let state = Float64Array.from([...start.positionKm, ...start.velocityKmS, m0, 0]), t = 0, contact = null, depletedAt = null;
  const knots = [], segments = [], events = [], stats = { acceptedSteps: 0, rejectedSteps: 0, functionEvaluations: 0, minStepSeconds: Infinity, maxStepSeconds: 0 };
  const event = (id, kind, title, extra = {}) => events.push({ id, kind, title, elapsedSeconds: t, ...extra });
  const append = run => {
    for (let i = knots.length ? 1 : 0; i < run.knots.length; i++) { const k = run.knots[i]; knots.push({ elapsedSeconds: k.elapsedSeconds, positionKm: Array.from(k.state.slice(0, 3)), velocityKmS: Array.from(k.state.slice(3, 6)), massKg: k.state[6], dvAccKmS: k.state[7] }); }
    stats.acceptedSteps += run.stats.acceptedSteps; stats.rejectedSteps += run.stats.rejectedSteps; stats.functionEvaluations += run.stats.functionEvaluations;
    if (run.stats.maxStepSeconds) { stats.minStepSeconds = Math.min(stats.minStepSeconds, run.stats.minStepSeconds); stats.maxStepSeconds = Math.max(stats.maxStepSeconds, run.stats.maxStepSeconds); }
  };
  // Ejecuta un tramo; contacto y agotamiento se registran aquí para que ningún tramo posterior los ignore.
  function leg({ id, label, mode, duration, maxStepSeconds = 20, stopWhen = null }) {
    const t0 = t, run = runLandingLeg({ env, lander, guidance, mode, massDryKg: mDry, state, t0, t1: t + duration, maxStepSeconds, stopWhen });
    append(run); state = run.state; t = run.time;
    segments.push({ id, label, mode, startSeconds: t0, endSeconds: t, massStartKg: knots.find(k => k.elapsedSeconds >= t0)?.massKg ?? m0, massEndKg: state[6] });
    if (run.stop === 'contact') contact = { elapsedSeconds: t, bracketSeconds: run.bracketSeconds ?? null };
    if (run.stop === 'depleted' && lander.propellantMassKg > 0) { state = Float64Array.from(state); state[6] = mDry; knots.at(-1).massKg = mDry; depletedAt ??= t; event('depletion', 'depletion', 'Propelente del módulo agotado (motor apagado)'); }
    return run.stop;
  }

  const periapsisReached = () => { let seen = false; return s => { const rd = s[0] * s[3] + s[1] * s[4] + s[2] * s[5]; if (rd < 0) seen = true; return seen && rd >= 0; }; };
  let failure = null, stop = null;
  try {
    event('orbit-start', 'initial', `Órbita inicial: periapsis ${options.orbit.periapsisAltitudeKm} km · apoapsis ${options.orbit.apoapsisAltitudeKm ?? options.orbit.periapsisAltitudeKm} km`);
    knots.push({ elapsedSeconds: 0, positionKm: [...start.positionKm], velocityKmS: [...start.velocityKmS], massKg: m0, dvAccKmS: 0 });
    if (guidance.deorbitDelaySeconds > 0) stop = leg({ id: 'orbit', label: 'Órbita inicial', mode: 'off', duration: guidance.deorbitDelaySeconds });
    if (!stop) {
      const peri = orbitalSummary(env, [state[0], state[1], state[2]], [state[3], state[4], state[5]]).periapsisRadiusKm;
      if (peri > rpTarget + 1e-6) {
        event('deorbit-ignition', 'ignition', 'Salida de órbita: encendido retrógrado');
        const t2 = t;
        stop = leg({ id: 'deorbit', label: 'Salida de órbita', mode: 'retrograde', duration: (m0 - mDry) / flow, maxStepSeconds: 2,
          stopWhen: s => orbitalSummary(env, [s[0], s[1], s[2]], [s[3], s[4], s[5]]).periapsisRadiusKm <= rpTarget });
        if (stop === 'event') { stop = null; event('deorbit-cutoff', 'cutoff', `Apagado: periapsis ${guidance.descentPeriapsisAltitudeKm} km alcanzado`, { burnSeconds: t - t2 }); }
        else if (!stop) { failure = 'La salida de órbita terminó sin alcanzar el periapsis de descenso.'; }
      } else event('deorbit-skipped', 'skipped', 'La órbita inicial ya tiene el periapsis de descenso: sin encendido de salida');
    }
    if (!stop && !failure) {
      const summary = orbitalSummary(env, [state[0], state[1], state[2]], [state[3], state[4], state[5]]);
      stop = leg({ id: 'approach', label: 'Aproximación al periapsis', mode: 'off', duration: (summary.periodSeconds ?? 20000) * 1.2 + 10, stopWhen: periapsisReached() });
      if (stop === 'event') { stop = null; event('periapsis', 'periapsis', 'Periapsis: inicio del frenado principal (guiado en lazo cerrado)'); }
      else if (!stop) failure = 'No se alcanzó el periapsis durante la aproximación.';
    }
    if (!stop && !failure) {
      stop = leg({ id: 'descent', label: 'Descenso propulsado', mode: 'descent', duration: schedule.maxDescentSeconds, maxStepSeconds: 1 });
      if (stop === 'depleted') stop = leg({ id: 'ballistic', label: 'Vuelo balístico sin propelente', mode: 'off', duration: schedule.maxDescentSeconds, maxStepSeconds: 5 });
    } else if (stop === 'depleted' && !failure) {
      stop = leg({ id: 'ballistic', label: 'Vuelo balístico sin propelente', mode: 'off', duration: schedule.maxDescentSeconds, maxStepSeconds: 20 });
    }
    if (contact) event('contact', 'contact', 'Contacto con la superficie');
  } catch (error) {
    if (!(error instanceof LandingError)) throw error;
    failure = error.message; event('failure', 'failure', `Integración interrumpida: ${error.message}`);
  }
  event('end', 'end', 'Fin de la integración');
  stats.minStepSeconds = Number.isFinite(stats.minStepSeconds) ? stats.minStepSeconds : 0;

  // ---- Eventos derivados de la trayectoria integrada (transiciones de fase) -----------------------------------------------
  const sample = time => sampleIntegratedState(knots, time);
  const descent = segments.find(s => s.id === 'descent');
  const phaseAt = time => { const k = surfaceKinematics(env, sample(time).positionKm, sample(time).velocityKmS); return descentPhaseOf(guidance, k.horizontalMS); };
  if (descent && descent.endSeconds > descent.startSeconds) {
    let previous = phaseAt(descent.startSeconds);
    const titles = { 'horizontal-reduction': 'Reducción de velocidad horizontal', terminal: 'Descenso terminal' };
    for (const k of knots.filter(kn => kn.elapsedSeconds > descent.startSeconds && kn.elapsedSeconds <= descent.endSeconds)) {
      const phase = phaseAt(k.elapsedSeconds);
      if (phase !== previous && titles[phase]) {
        let lo = knots[Math.max(0, knots.indexOf(k) - 1)].elapsedSeconds, hi = k.elapsedSeconds;
        for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (phaseAt(mid) === previous) lo = mid; else hi = mid; }
        events.push({ id: `phase-${phase}`, kind: 'phase', title: titles[phase], elapsedSeconds: hi });
      }
      previous = phase;
    }
  }
  events.sort((a, b) => a.elapsedSeconds - b.elapsedSeconds);

  // ---- Resultado -------------------------------------------------------------------------------------------------------------
  const last = knots.at(-1);
  const final = { elapsedSeconds: last.elapsedSeconds, positionKm: last.positionKm, velocityKmS: last.velocityKmS, massKg: last.massKg, dvAccKmS: last.dvAccKmS, fuelKg: Math.max(0, last.massKg - mDry) };
  const finite = knots.every(k => k.positionKm.every(Number.isFinite) && k.velocityKmS.every(Number.isFinite) && Number.isFinite(k.massKg));
  // Empuje/peso al inicio del frenado y saturación del guiado durante el descenso.
  const pdiKnot = descent ? knots.find(k => k.elapsedSeconds >= descent.startSeconds) : null;
  const gPdi = pdiKnot ? surfaceKinematics(env, pdiKnot.positionKm, pdiKnot.velocityKmS).gravityMS2 : surfaceGravityMS2(env);
  const thrustToWeightPdi = pdiKnot ? lander.engine.thrustMaxN / (pdiKnot.massKg * gPdi) : null;
  let saturatedLate = false, maxThrottle = 0;
  if (descent) for (const k of knots) {
    if (k.elapsedSeconds < descent.startSeconds || k.elapsedSeconds > descent.endSeconds) continue;
    const c = landingCommand(env, lander, guidance, 'descent', [...k.positionKm, ...k.velocityKmS, k.massKg, 0], mDry);
    maxThrottle = Math.max(maxThrottle, c.throttle);
    if (c.saturated && k.elapsedSeconds >= descent.endSeconds - 120) saturatedLate = true;
  }
  let contactInfo = null, outcome, reasons = [], contactClass = null;
  if (contact && finite) {
    const k = surfaceKinematics(env, last.positionKm, last.velocityKmS), cmd = landingCommand(env, lander, guidance, 'descent', [...last.positionKm, ...last.velocityKmS, last.massKg, 0], mDry);
    contactClass = classifyContact(limits, k.verticalMS, k.horizontalMS);
    const u = k.up;
    contactInfo = { elapsedSeconds: last.elapsedSeconds, positionKm: last.positionKm, velocityKmS: last.velocityKmS, altitudeKm: k.altitudeKm, verticalMS: k.verticalMS, horizontalMS: k.horizontalMS,
      relativeSpeedMS: k.relativeSpeedMS, massKg: last.massKg, fuelKg: final.fuelKg, engineOn: cmd.engineOn, throttle: cmd.throttle, bodyId: profile.id, bodyName: profile.name, class: contactClass,
      surfaceCoordinates: { frame: 'marco local arbitrario (no conectado con el marco IAU del cuerpo)', latitudeDeg: Math.asin(u[2]) * DEG, longitudeDeg: Math.atan2(u[1], u[0]) * DEG,
        bodyFixed: profile.rotation ? 'requiere el ángulo de rotación en la época; no disponible' : 'no disponible: rotación y orientación no definidas' } };
    const speeds = `v vertical ${Math.abs(k.verticalMS).toFixed(2)} m/s, v horizontal ${k.horizontalMS.toFixed(2)} m/s respecto al suelo`;
    if (contactClass === 'soft') { outcome = LANDING_OUTCOMES.soft; reasons.push(`Contacto dentro de los límites suaves (${limits.softVerticalMS} m/s vertical, ${limits.softHorizontalMS} m/s horizontal): ${speeds}.`); if (depletedAt != null) reasons.push('El propelente se agotó antes del contacto.'); }
    else if (thrustToWeightPdi != null && thrustToWeightPdi <= 1) { outcome = LANDING_OUTCOMES.thrust; reasons.push(`Empuje insuficiente: empuje/peso local al inicio del frenado = ${thrustToWeightPdi.toFixed(2)} ≤ 1; el módulo no puede frenar ni sostenerse. Contacto: ${contactClass === 'hard' ? 'brusco' : 'impacto'} (${speeds}).`); }
    else if (depletedAt != null) { outcome = LANDING_OUTCOMES.fuel; reasons.push(`El propelente se agotó en T+${depletedAt.toFixed(1)} s, antes del contacto; evaluación del vuelo balístico restante: ${contactClass === 'hard' ? 'aterrizaje brusco' : 'impacto'} (${speeds}).`); }
    else if (saturatedLate || (thrustToWeightPdi != null && thrustToWeightPdi <= 1)) { outcome = LANDING_OUTCOMES.thrust; reasons.push(`El guiado pidió más empuje del disponible (empuje/peso al inicio del frenado ${thrustToWeightPdi?.toFixed(2)}); contacto: ${contactClass === 'hard' ? 'brusco' : 'impacto'} (${speeds}).`); }
    else if (contactClass === 'hard') { outcome = LANDING_OUTCOMES.hard; reasons.push(`Contacto fuera del límite suave pero dentro del límite brusco (${speeds}).`); }
    else { outcome = LANDING_OUTCOMES.impact; reasons.push(`Contacto con velocidad excesiva (${speeds}).`); }
  } else if (!finite) { outcome = LANDING_OUTCOMES.unverifiable; reasons.push('La integración produjo valores no finitos.'); }
  else if (failure && /iteraciones|DOPRI/.test(failure)) { outcome = LANDING_OUTCOMES.unverifiable; reasons.push(`${failure} Causa probable: conmutación del motor en el umbral de acelerador mínimo (el módulo no puede sostener el vuelo estacionario con su empuje mínimo en este cuerpo). No hay dictamen confiable.`); }
  else if (failure) { outcome = depletedAt != null ? LANDING_OUTCOMES.fuel : LANDING_OUTCOMES.incomplete; reasons.push(failure); }
  else { outcome = depletedAt != null ? LANDING_OUTCOMES.fuel : LANDING_OUTCOMES.incomplete; reasons.push('No se alcanzó el contacto con la superficie durante la simulación.'); }
  reasons.push('Umbrales de contacto: aproximaciones del simulador; no hay modelo de patas, materiales, cargas ni impacto, así que no se declara supervivencia estructural.');

  return { kind: 'landing', status: contact ? 'CONTACTO' : failure ? 'INTERRUMPIDO' : 'SIN CONTACTO', model: LANDING_MODEL_VERSION, bodyId: profile.id, bodyName: profile.name,
    environment: { mu: env.mu, radiusKm: env.radiusKm, rotates: env.rotates, omegaVectorRadS: env.omegaVectorRadS }, frame: localFrameDescriptor(profile, { epochUtc: options.epochUtc ?? null }),
    lander, payloadMassKg, options: { ...options, guidance, limits, schedule }, initialOrbit: initial, knots, segments, events, final, endSeconds: last.elapsedSeconds, depletedAt,
    outcome, contactClass, reasons, contact: contactInfo, failure, capability,
    masses: { wetKg: m0, dryKg: mDry, propellantKg: m0 - mDry, structuralKg: landerStructuralMassKg(lander) },
    totals: { propulsiveDeltaVMS: last.dvAccKmS * 1000, propellantConsumedKg: m0 - last.massKg },
    diagnostics: { ...stats, thrustToWeightPdi, saturatedLate, maxThrottle, absTol: [1e-7, 1e-7, 1e-7, 1e-10, 1e-10, 1e-10, 1e-6, 1e-12], relTol: 1e-10, contactTolerances: contactToleranceReport(contact, contactInfo, env) } };
}
