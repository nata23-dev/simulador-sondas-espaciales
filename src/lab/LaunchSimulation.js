// Aquí orquesto la simulación completa de un lanzamiento terrestre: secuencia de encendidos, separación
// de etapas, detección de eventos clave (Max-Q, apogeo, impacto) y evaluación orbital final.
// Toda la trayectoria proviene exclusivamente de la integración numérica de LaunchDynamics.js.
import { FiniteThrustError } from './FiniteThrustDynamics.js';
import { DEFAULT_TARGET_ORBIT, classifyOrbit, orbitalElements, osculatingPerigeeAltitudeKm, ORBIT_CLASSES } from './LaunchOrbit.js';
import { EARTH_GM_KM3_S2, STANDARD_GRAVITY_M_S2, geodeticFromPosition, dot3, launchSiteState, norm3, localFrame } from './LaunchEarth.js';
import { createEnvironment, evaluateForces, runSegment } from './LaunchDynamics.js';
import { liftoffThrustToWeight, massFlowKgS, stackMassKg, validateLauncher } from './LaunchVehicle.js';
import { sampleIntegratedState } from './MissionPlayback.js';

// Añado un margen de seguridad sobre el perigeo mínimo para cortar la circularización sin quedar justo en el umbral.
export const PERIGEE_MARGIN_KM = 10;
export const LAUNCH_MODEL_VERSION = 'earth-launch-point-mass-v1';
const DEG = 180 / Math.PI;

// Defino los valores por defecto del programa de guiado y de la secuencia temporal de encendidos.
export const DEFAULT_GUIDANCE = Object.freeze({ verticalRiseSeconds: 10, kickDeg: 2, kickSeconds: 4,
  stage2: Object.freeze({ startElevationDeg: 'auto', endElevationDeg: 0, rampSeconds: 100 }) });
export const DEFAULT_SCHEDULE = Object.freeze({ ascentBurnSeconds: 190, postCoastSeconds: 1200,
  circularization: Object.freeze({ enabled: true, elevationDeg: 0, maxCoastToApogeeSeconds: 7200, cutoff: 'target-perigee', maxBurnSeconds: null }) });

// Valido las coordenadas de la rampa, acimut, programa de guiado, secuencia de encendidos y criterios orbitales.
export function validateLaunchOptions(options) {
  const issues = [];
  const site = options?.site;
  if (!site || !Number.isFinite(site.latDeg) || Math.abs(site.latDeg) > 90) issues.push('Latitud de lanzamiento inválida (−90° a 90°).');
  if (!site || !Number.isFinite(site.lonDeg) || Math.abs(site.lonDeg) > 180) issues.push('Longitud de lanzamiento inválida (−180° a 180°).');
  if (!site || !Number.isFinite(site.altitudeM) || site.altitudeM < -100 || site.altitudeM > 5000) issues.push('Altitud inicial fuera de −100–5000 m.');
  if (!Number.isFinite(options?.azimuthDeg) || options.azimuthDeg < 0 || options.azimuthDeg >= 360) issues.push('El acimut de ascenso debe estar en [0°, 360°).');
  if (!Number.isFinite(options?.earthRotationAngleDeg) || Math.abs(options.earthRotationAngleDeg) > 360) issues.push('Ángulo de rotación terrestre inicial inválido.');
  if (typeof options?.launchDateUtc !== 'string' || Number.isNaN(Date.parse(options.launchDateUtc))) issues.push('Fecha de lanzamiento UTC inválida (solo se registra como etiqueta).');
  const g = options?.guidance;
  if (!g || !(g.verticalRiseSeconds >= 0 && g.verticalRiseSeconds <= 120)) issues.push('Ascenso vertical fuera de 0–120 s.');
  if (!g || !(g.kickDeg >= 0 && g.kickDeg <= 45) || !(g.kickSeconds >= 0 && g.kickSeconds <= 60)) issues.push('Inclinación inicial (0–45°) o su duración (0–60 s) inválidas.');
  const s2 = g?.stage2;
  if (!s2 || !(s2.startElevationDeg === 'auto' || (Number.isFinite(s2.startElevationDeg) && s2.startElevationDeg >= -10 && s2.startElevationDeg <= 90))
    || !Number.isFinite(s2.endElevationDeg) || s2.endElevationDeg < -30 || s2.endElevationDeg > 90 || !(s2.rampSeconds >= 0 && s2.rampSeconds <= 3000)) issues.push('Programa de cabeceo de la etapa 2 inválido.');
  const sc = options?.schedule;
  if (!sc || !(sc.ascentBurnSeconds === null || (Number.isFinite(sc.ascentBurnSeconds) && sc.ascentBurnSeconds > 0))) issues.push('Duración del primer encendido de la etapa 2 inválida.');
  if (!sc || !(sc.postCoastSeconds >= 0 && sc.postCoastSeconds <= 20000)) issues.push('Tramo balístico final fuera de 0–20 000 s.');
  const t = options?.target;
  if (!t || !Number.isFinite(t.minPerigeeAltitudeKm) || t.minPerigeeAltitudeKm < 0 || !Number.isFinite(t.targetAltitudeKm) || t.targetAltitudeKm <= 0) issues.push('Órbita objetivo inválida.');
  return issues;
}
// Normalizo y completo con valores predeterminados el objeto de opciones antes de iniciar la simulación.
export const normalizeLaunchOptions = options => ({
  site: { latDeg: options.site.latDeg, lonDeg: options.site.lonDeg, altitudeM: options.site.altitudeM },
  launchDateUtc: options.launchDateUtc, earthRotationAngleDeg: options.earthRotationAngleDeg, azimuthDeg: options.azimuthDeg,
  guidance: { verticalRiseSeconds: options.guidance.verticalRiseSeconds, kickDeg: options.guidance.kickDeg, kickSeconds: options.guidance.kickSeconds,
    stage2: { startElevationDeg: options.guidance.stage2.startElevationDeg, endElevationDeg: options.guidance.stage2.endElevationDeg, rampSeconds: options.guidance.stage2.rampSeconds } },
  schedule: { ascentBurnSeconds: options.schedule.ascentBurnSeconds ?? null, postCoastSeconds: options.schedule.postCoastSeconds,
    circularization: { enabled: Boolean(options.schedule.circularization?.enabled), maxCoastToApogeeSeconds: options.schedule.circularization?.maxCoastToApogeeSeconds ?? 7200,
      elevationDeg: options.schedule.circularization?.elevationDeg ?? 5, cutoff: 'target-perigee', maxBurnSeconds: options.schedule.circularization?.maxBurnSeconds ?? null } },
  target: { minPerigeeAltitudeKm: options.target.minPerigeeAltitudeKm, maxApogeeAltitudeKm: options.target.maxApogeeAltitudeKm ?? null,
    inclinationDeg: options.target.inclinationDeg ?? null, inclinationToleranceDeg: options.target.inclinationToleranceDeg ?? 1, targetAltitudeKm: options.target.targetAltitudeKm }
});

// Resumo la pila completa del lanzador con la carga útil: masa inicial, relación empuje/peso, duración y Δv ideal por etapa.
export function describeStack(launcher, payloadMassKg) {
  const radius = 6378.137;
  const stages = launcher.stages.map((stage, i) => {
    const m0 = stackMassKg(launcher, payloadMassKg, i), mf = m0 - stage.propellantMassKg;
    return { id: stage.id, name: stage.name, initialMassKg: m0, finalMassKg: mf, idealDeltaVMS: stage.ispVacuumS * STANDARD_GRAVITY_M_S2 * Math.log(m0 / mf),
      burnSeconds: stage.propellantMassKg / massFlowKgS(stage), massFlowKgS: massFlowKgS(stage) };
  });
  return { liftoffMassKg: stackMassKg(launcher, payloadMassKg), liftoffThrustToWeight: liftoffThrustToWeight(launcher, payloadMassKg, radius),
    stages, idealDeltaVMS: stages.reduce((n, s) => n + s.idealDeltaVMS, 0) };
}

// Calculo el ángulo de elevación (°) del vector velocidad respecto al horizonte local geocéntrico.
const elevationOfVelocityDeg = (position, velocity) => {
  const n = norm3(velocity); if (!(n > 1e-9)) return 90;
  const up = localFrame(position).up; return Math.asin(Math.max(-1, Math.min(1, dot3(velocity, up) / n))) * DEG;
};

// Ejecuto la simulación completa del ascenso encadenando etapas, costas, circularización y evaluación orbital.
export function simulateLaunch({ launcher, payloadMassKg, options, environment = {} }) {
  const launcherIssues = validateLauncher(launcher);
  if (launcherIssues.length) throw new FiniteThrustError('INVALID_LAUNCHER', launcherIssues.join(' '), { issues: launcherIssues });
  if (!Number.isFinite(payloadMassKg) || payloadMassKg <= 0) throw new FiniteThrustError('INVALID_MASS', 'La masa de la carga útil debe ser finita y positiva.');
  const optionIssues = validateLaunchOptions(options);
  if (optionIssues.length) throw new FiniteThrustError('INVALID_OPTIONS', optionIssues.join(' '), { issues: optionIssues });
  const opts = normalizeLaunchOptions(options);
  const env = createEnvironment(environment);
  const site = launchSiteState({ ...opts.site, earthRotationAngleDeg: opts.earthRotationAngleDeg });
  const m0 = stackMassKg(launcher, payloadMassKg);
  const [s1, s2] = launcher.stages;
  const stack = describeStack(launcher, payloadMassKg);
  const knots = [], segments = [], events = [], stageLog = launcher.stages.map(stage => ({ stageId: stage.id, name: stage.name, structuralMassKg: stage.structuralMassKg,
    propellantLoadedKg: stage.propellantMassKg, ignitionSeconds: null, cutoffSeconds: null, burnSeconds: 0, propellantConsumedKg: 0, propellantRemainingKg: stage.propellantMassKg,
    separationSeconds: null, jettisonedMassKg: 0, cutoffReason: 'sin encender' }));
  const stats = { acceptedSteps: 0, rejectedSteps: 0, functionEvaluations: 0, minStepSeconds: Infinity, maxStepSeconds: 0 };
  const base = { launcherStages: launcher.stages, launcherId: launcher.id, launcherName: launcher.name, payloadMassKg, options: opts, environment: { atmosphere: env.atmosphere, rotation: env.rotation },
    stack, site: { ...site }, mu: env.mu, model: LAUNCH_MODEL_VERSION };

  // Coloco el vehículo en la plataforma y verifico si la relación empuje/peso permite despegar.
  const initialState = Float64Array.from([...site.positionKm, ...site.velocityKmS, m0, 0]);
  const thrustToWeight = stack.liftoffThrustToWeight;
  if (!(thrustToWeight >= 1)) {
    // Si el empuje inicial no supera el peso, mantengo el vehículo en rampa corrotando con la Tierra sin encender motores.
    const frame = [0, 30, 60].map(t => { const c = Math.cos(env.omega * t), s = Math.sin(env.omega * t); const p = site.positionKm;
      const pos = [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]]; return { elapsedSeconds: t, positionKm: pos, velocityKmS: [-env.omega * pos[1], env.omega * pos[0], 0], massKg: m0, dvAccKmS: 0 }; });
    return { ...base, status: 'NO DESPEGA', knots: frame, segments: [{ id: 'hold', kind: 'hold', stageIndex: null, label: 'En plataforma', startSeconds: 0, endSeconds: 60, massStartKg: m0, massEndKg: m0, massFlowKgS: 0, guidance: null, aero: null, stageId: null }],
      events: [{ id: 'prelaunch', kind: 'abort', title: `Verificación previa: empuje/peso ${thrustToWeight.toFixed(3)} < 1`, elapsedSeconds: 0 }], stages: stageLog,
      final: { elapsedSeconds: 60, ...frame.at(-1), fuelKg: null }, burnout: null, endSeconds: 60,
      orbit: { classification: ORBIT_CLASSES.notReached, reasons: [`Despegue imposible: el empuje al nivel del mar (${(s1.thrustSeaLevelN / 1000).toFixed(0)} kN) no supera el peso (${(m0 * EARTH_GM_KM3_S2 / 6378.137 ** 2 / 1000 * 1000).toFixed(0)} N aprox.). No se ejecutó ningún encendido.`], elements: null, minimumAltitudeKm: null, altitudeKm: site.positionKm ? geodeticFromPosition(site.positionKm).altitudeKm : null },
      totals: { propulsiveDeltaVMS: 0, propellantConsumedKg: 0 }, diagnostics: { ...stats, minStepSeconds: 0, thrustToWeight }, maxQ: null, impact: null };
  }

  let state = initialState, t = 0, impact = null, failure = null, burn2End = null;
  const stageCfg = (index, guidance) => ({ stage: guidance ? launcher.stages[index] : null, guidance, aero: { areaM2: launcher.stages[index].referenceAreaM2, cd: launcher.stages[index].dragCoefficient } });
  const append = run => {
    const first = knots.length ? 1 : 0;
    for (let i = first; i < run.knots.length; i++) { const k = run.knots[i];
      knots.push({ elapsedSeconds: k.elapsedSeconds, positionKm: Array.from(k.state.slice(0, 3)), velocityKmS: Array.from(k.state.slice(3, 6)), massKg: k.state[6], dvAccKmS: k.state[7] }); }
    stats.acceptedSteps += run.stats.acceptedSteps; stats.rejectedSteps += run.stats.rejectedSteps; stats.functionEvaluations += run.stats.functionEvaluations;
    if (run.stats.maxStepSeconds) { stats.minStepSeconds = Math.min(stats.minStepSeconds, run.stats.minStepSeconds); stats.maxStepSeconds = Math.max(stats.maxStepSeconds, run.stats.maxStepSeconds); }
  };
  // Integro un tramo consecutivo, registro su segmento y actualizo el estado y el tiempo global.
  function leg({ kind, stageIndex, label, guidance = null, duration, maxStepSeconds, stopWhen = null }) {
    const t0 = t, t1 = t + duration;
    const cfg = stageCfg(stageIndex, guidance);
    const run = runSegment({ env, cfg, state, t0, t1, maxStepSeconds, stopWhen });
    append(run);
    const massStart = state[6];
    state = run.state; t = run.time;
    segments.push({ id: `seg-${segments.length + 1}`, kind, stageIndex, label, startSeconds: t0, endSeconds: t, massStartKg: massStart, massEndKg: state[6],
      massFlowKgS: guidance ? massFlowKgS(launcher.stages[stageIndex]) : 0, guidance, aero: cfg.aero, stageId: guidance ? launcher.stages[stageIndex].id : null });
    if (run.stop === 'impact') { impact = { elapsedSeconds: t, positionKm: Array.from(state.slice(0, 3)), velocityKmS: Array.from(state.slice(3, 6)) }; }
    return run.stop;
  }
  const event = (id, kind, title, extra = {}) => events.push({ id, kind, title, elapsedSeconds: t, ...extra });

  try {
    // Enciendo la etapa 1 y ejecuto ascenso vertical, inclinación inicial y giro gravitatorio hasta agotar su propelente.
    event('ignition-1', 'ignition', 'Encendido de la etapa 1'); event('liftoff', 'liftoff', 'Despegue: empuje/peso ' + thrustToWeight.toFixed(2));
    stageLog[0].ignitionSeconds = 0;
    const flow1 = massFlowKgS(s1), burn1 = s1.propellantMassKg / flow1, g = opts.guidance;
    const breaks = [Math.min(burn1, g.verticalRiseSeconds), Math.min(burn1, g.verticalRiseSeconds + g.kickSeconds), burn1];
    const pieces = [[0, breaks[0], { mode: 'vertical' }],
      [breaks[0], breaks[1], { mode: 'fixed-elevation', elevationDeg: 90 - g.kickDeg, azimuthDeg: opts.azimuthDeg }],
      [breaks[1], breaks[2], { mode: 'gravity-turn', fallbackElevationDeg: 90 - g.kickDeg, fallbackAzimuthDeg: opts.azimuthDeg }]].filter(p => p[1] > p[0]);
    let stop = null;
    for (const [a, b, spec] of pieces) {
      stop = leg({ kind: 'burn', stageIndex: 0, label: 'Etapa 1', guidance: spec, duration: b - a, maxStepSeconds: 2 });
      if (stop) break;
    }
    if (!stop) {
      // Verifico la coherencia de masa al agotarse la etapa 1 (MECO) y preparo la costa previa a la separación.
      const expected = m0 - s1.propellantMassKg;
      if (Math.abs(state[6] - expected) > 1e-3) throw new FiniteThrustError('MASS_INCONSISTENT', 'La masa integrada no coincide con el consumo de la etapa 1.');
      state[6] = expected; knots.at(-1).massKg = expected;
      Object.assign(stageLog[0], { cutoffSeconds: t, burnSeconds: t, propellantConsumedKg: s1.propellantMassKg, propellantRemainingKg: 0, cutoffReason: 'propelente agotado' });
      event('meco', 'depletion', 'Etapa 1: propelente agotado (MECO)');
      // Descarto de forma discreta la estructura y cualquier propelente residual de la etapa 1 tras la costa inicial.
      if (launcher.separation.coastAfterCutoffSeconds > 0) stop = leg({ kind: 'coast', stageIndex: 0, label: 'Balístico previo a la separación', duration: launcher.separation.coastAfterCutoffSeconds, maxStepSeconds: 5 });
    }
    if (!stop) {
      const jettison = s1.structuralMassKg + stageLog[0].propellantRemainingKg;
      state = Float64Array.from(state); state[6] -= jettison;
      if (launcher.separation.separationImpulseMS !== 0) { const v = state.slice(3, 6), n = norm3(v); for (let i = 0; i < 3; i++) state[3 + i] += launcher.separation.separationImpulseMS / 1000 * v[i] / n; }
      Object.assign(stageLog[0], { separationSeconds: t, jettisonedMassKg: jettison });
      event('separation', 'separation', 'Separación de la etapa 1', { jettisonedMassKg: jettison, massAfterKg: state[6] });
      if (launcher.separation.ignitionDelaySeconds > 0) stop = leg({ kind: 'coast', stageIndex: 1, label: 'Balístico previo al encendido de la etapa 2', duration: launcher.separation.ignitionDelaySeconds, maxStepSeconds: 5 });
    }

    if (!stop) {
      // Enciendo la etapa 2 con su rampa de cabeceo respecto al horizonte local.
      const flow2 = massFlowKgS(s2), full2 = s2.propellantMassKg / flow2;
      const ascent = Math.min(full2, opts.schedule.ascentBurnSeconds ?? Infinity);
      event('ignition-2', 'ignition', 'Inicio de la etapa 2 (encendido)'); stageLog[1].ignitionSeconds = t;
      const startElev = g.stage2.startElevationDeg === 'auto' ? elevationOfVelocityDeg(state.slice(0, 3), state.slice(3, 6)) : g.stage2.startElevationDeg;
      const program = { mode: 'pitch-program', startElevationDeg: startElev, endElevationDeg: g.stage2.endElevationDeg, rampSeconds: g.stage2.rampSeconds, startSeconds: t, azimuthDeg: opts.azimuthDeg };
      const tIgn = t, ramp = Math.min(ascent, g.stage2.rampSeconds);
      for (const [a, b] of [[0, ramp], [ramp, ascent]].filter(p => p[1] > p[0])) { stop = leg({ kind: 'burn', stageIndex: 1, label: 'Etapa 2 · ascenso', guidance: program, duration: b - a, maxStepSeconds: 2 }); if (stop) break; }
      if (!stop) {
        const used = t - tIgn, depleted = used >= full2 - 1e-9;
        if (depleted) { state[6] = stackMassKg(launcher, payloadMassKg, 1) - s2.propellantMassKg; knots.at(-1).massKg = state[6]; }
        Object.assign(stageLog[1], { cutoffSeconds: t, burnSeconds: used, propellantConsumedKg: used * flow2, propellantRemainingKg: Math.max(0, s2.propellantMassKg - used * flow2), cutoffReason: depleted ? 'propelente agotado' : 'apagado programado' });
        event(depleted ? 'depletion-2' : 'seco-1', depleted ? 'depletion' : 'cutoff', depleted ? 'Etapa 2: propelente agotado' : 'Apagado programado de la etapa 2 (SECO)');
        burn2End = t;
        // Si está activada la circularización y queda propelente, espero al apogeo y reenciendo la etapa 2.
        const circ = opts.schedule.circularization;
        if (circ.enabled && !depleted) {
          stop = leg({ kind: 'coast', stageIndex: 1, label: 'Balístico hacia el apogeo', duration: circ.maxCoastToApogeeSeconds, maxStepSeconds: 20,
            stopWhen: s => dot3([s[0], s[1], s[2]], [s[3], s[4], s[5]]) < 0 });
          if (!stop) { failure = 'No se alcanzó el apogeo dentro del tramo balístico máximo; no se ejecutó la circularización.'; }
          else if (stop === 'event') {
            stop = null;
            const remaining = s2.propellantMassKg - stageLog[1].propellantConsumedKg, limit = Math.min(remaining / flow2, circ.maxBurnSeconds ?? Infinity);
            event('circularization', 'ignition', 'Encendido de circularización en el apogeo'); const t2 = t;
            const stopWhen = s => osculatingPerigeeAltitudeKm([s[0], s[1], s[2]], [s[3], s[4], s[5]]) >= opts.target.minPerigeeAltitudeKm + PERIGEE_MARGIN_KM;
            stop = leg({ kind: 'burn', stageIndex: 1, label: 'Etapa 2 · circularización', guidance: { mode: 'pitch-program', startElevationDeg: circ.elevationDeg, endElevationDeg: circ.elevationDeg, rampSeconds: 0, startSeconds: t, azimuthDeg: opts.azimuthDeg }, duration: limit, maxStepSeconds: 2, stopWhen });
            const used2 = t - t2; const byTarget = stop === 'event'; if (byTarget) stop = null;
            if (!stop) {
              const total = stageLog[1].propellantConsumedKg + used2 * flow2, empty = total >= s2.propellantMassKg - 1e-6;
              if (empty) { state[6] = stackMassKg(launcher, payloadMassKg, 1) - s2.propellantMassKg; knots.at(-1).massKg = state[6]; }
              Object.assign(stageLog[1], { cutoffSeconds: t, burnSeconds: stageLog[1].burnSeconds + used2, propellantConsumedKg: total, propellantRemainingKg: Math.max(0, s2.propellantMassKg - total),
                cutoffReason: byTarget ? 'perigeo objetivo alcanzado' : empty ? 'propelente agotado' : 'duración máxima' });
              event('seco-2', byTarget ? 'cutoff' : 'depletion', byTarget ? 'Apagado: perigeo objetivo alcanzado' : empty ? 'Etapa 2: propelente agotado en circularización' : 'Fin de la circularización por duración máxima');
              burn2End = t;
            }
          }
        }
      }
    }
    // Propago un tramo balístico final para verificar que la trayectoria no intersecta la Tierra en la ventana configurada.
    if (!stop && !failure && opts.schedule.postCoastSeconds > 0) {
      stop = leg({ kind: 'coast', stageIndex: 1, label: 'Balístico final', duration: opts.schedule.postCoastSeconds, maxStepSeconds: 20 });
    }
    // Si la ventana termina por debajo de 150 km en descenso y sin impacto aún, prolongo la costa balística para localizar el contacto.
    if (!stop && !failure) {
      const lastK = knots.at(-1), altEnd = geodeticFromPosition(lastK.positionKm).altitudeKm;
      if (altEnd < 150 && dot3(lastK.positionKm, lastK.velocityKmS) < 0) {
        stop = leg({ kind: 'coast', stageIndex: 1, label: 'Costa hasta contacto', duration: opts.schedule.impactSearchSeconds ?? 7200, maxStepSeconds: 20 });
        if (stop !== 'impact') events.push({ id: 'coast-extended', kind: 'note', title: 'Costa extendida sin localizar contacto', elapsedSeconds: t });
      }
    }
    if (stop === 'impact') event('impact', 'impact', 'Impacto contra la superficie', { altitudeKm: 0 });
  } catch (error) {
    if (!(error instanceof FiniteThrustError)) throw error;
    failure = error.message; events.push({ id: 'failure', kind: 'failure', title: `Integración interrumpida: ${error.message}`, elapsedSeconds: t });
  }
  event('end', 'end', 'Fin de la integración');
  stats.minStepSeconds = Number.isFinite(stats.minStepSeconds) ? stats.minStepSeconds : 0;

  // Extraigo eventos derivados directamente de la trayectoria integrada: Max-Q, cruce de altitud objetivo y apogeo.
  const sample = time => sampleIntegratedState(knots, time);
  const altitudeAt = time => geodeticFromPosition(sample(time).positionKm).altitudeKm;
  const qAt = time => { const s = sample(time); return evaluateForces(env, { stage: null, aero: null }, time, [...s.positionKm, ...s.velocityKmS, 1, 0]).dynamicPressurePa; };
  let maxQ = null;
  if (env.atmosphere && knots.length > 2) {
    let best = 0, bestQ = -1;
    for (let i = 0; i < knots.length; i++) { const q = evaluateForces(env, { stage: null, aero: null }, knots[i].elapsedSeconds, [...knots[i].positionKm, ...knots[i].velocityKmS, 1, 0]).dynamicPressurePa; if (q > bestQ) { bestQ = q; best = i; } }
    let lo = knots[Math.max(0, best - 1)].elapsedSeconds, hi = knots[Math.min(knots.length - 1, best + 1)].elapsedSeconds;
    for (let i = 0; i < 60; i++) { const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3; if (qAt(a) < qAt(b)) lo = a; else hi = b; }
    const tq = (lo + hi) / 2, s = sample(tq);
    maxQ = { elapsedSeconds: tq, dynamicPressurePa: qAt(tq), altitudeKm: geodeticFromPosition(s.positionKm).altitudeKm, speedKmS: norm3(s.velocityKmS) };
    if (maxQ.dynamicPressurePa > 0) events.push({ id: 'max-q', kind: 'max-q', title: `Presión dinámica máxima (Max-Q): ${(maxQ.dynamicPressurePa / 1000).toFixed(1)} kPa`, elapsedSeconds: tq });
  }
  const targetAlt = opts.target.targetAltitudeKm;
  for (let i = 1; i < knots.length; i++) {
    const a = geodeticFromPosition(knots[i - 1].positionKm).altitudeKm, b = geodeticFromPosition(knots[i].positionKm).altitudeKm;
    if (a < targetAlt && b >= targetAlt) {
      let lo = knots[i - 1].elapsedSeconds, hi = knots[i].elapsedSeconds;
      for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (altitudeAt(mid) < targetAlt) lo = mid; else hi = mid; }
      events.push({ id: 'target-altitude', kind: 'altitude', title: `Altitud objetivo alcanzada: ${targetAlt} km`, elapsedSeconds: hi }); break;
    }
  }
  const radialSpeed = k => dot3(k.positionKm, k.velocityKmS);
  for (let i = 1; i < knots.length; i++) {
    if (knots[i - 1].elapsedSeconds > 5 && radialSpeed(knots[i - 1]) > 0 && radialSpeed(knots[i]) <= 0) {
      let lo = knots[i - 1].elapsedSeconds, hi = knots[i].elapsedSeconds;
      const rdot = time => { const s = sample(time); return dot3(s.positionKm, s.velocityKmS); };
      for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (rdot(mid) > 0) lo = mid; else hi = mid; }
      events.push({ id: 'apogee', kind: 'apogee', title: `Apogeo osculante: ${altitudeAt(hi).toFixed(1)} km`, elapsedSeconds: hi, altitudeKm: altitudeAt(hi) }); break;
    }
  }
  events.sort((a, b) => a.elapsedSeconds - b.elapsedSeconds);

  // Clasifico la órbita alcanzada al término de la propagación y al apagado principal.
  const last = knots.at(-1);
  const finalState = { elapsedSeconds: last.elapsedSeconds, positionKm: last.positionKm, velocityKmS: last.velocityKmS, massKg: segments.at(-1)?.massEndKg ?? last.massKg, dvAccKmS: last.dvAccKmS };
  const burnoutKnot = burn2End != null ? knots.find(k => Math.abs(k.elapsedSeconds - burn2End) < 1e-6) : null;
  const target = { ...DEFAULT_TARGET_ORBIT, ...opts.target };
  let orbit;
  if (failure && !impact) orbit = { classification: ORBIT_CLASSES.unverifiable, reasons: [failure], elements: null, minimumAltitudeKm: null, altitudeKm: null };
  else orbit = classifyOrbit(last.positionKm, last.velocityKmS, target, { impact: Boolean(impact) });
  if (impact) { try { orbit.elements = orbitalElements(burnoutKnot?.positionKm ?? last.positionKm, burnoutKnot?.velocityKmS ?? last.velocityKmS); } catch { /* Si no puedo derivar elementos osculadores tras el impacto, los dejo nulos. */ } }
  const burnout = burnoutKnot ? { elapsedSeconds: burnoutKnot.elapsedSeconds, ...classifyOrbit(burnoutKnot.positionKm, burnoutKnot.velocityKmS, target) } : null;
  const consumed = stageLog.reduce((n, s) => n + s.propellantConsumedKg, 0);
  return { ...base, status: impact ? 'IMPACTO' : failure ? 'FALLO DE INTEGRACIÓN' : 'LANZAMIENTO COMPLETADO', knots, segments, events, stages: stageLog,
    final: { ...finalState, fuelKg: stageLog[1].propellantRemainingKg }, burnout, endSeconds: last.elapsedSeconds, orbit, maxQ, impact, failure,
    totals: { propulsiveDeltaVMS: last.dvAccKmS * 1000, propellantConsumedKg: consumed },
    diagnostics: { ...stats, thrustToWeight, absTol: [...[1e-6, 1e-6, 1e-6, 1e-9, 1e-9, 1e-9, 1e-6, 1e-12]], relTol: 1e-10 } };
}
