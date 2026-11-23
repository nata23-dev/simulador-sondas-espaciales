// Aquí propago la nave durante el crucero heliocéntrico bajo la gravedad de los ocho planetas como comparación
// paralela frente a la cónica parcheada, y diseño la maniobra de corrección de trayectoria (TCM-1) para regresar
// al punto de llegada nominal. No altero los tramos ni la reproducción de la misión: solo mido la desviación y su coste.
//
// Integro con DOPRI54 la ecuación de movimiento heliocéntrica (marco centrado en el Sol, no inercial; km, km/s, s, JD TDB):
//   a = −μ☉ r/|r|³ + Σ_k μ_k [ (r_k − r)/|r_k − r|³ − r_k/|r_k|³ ]
// donde el segundo término representa la aceleración indirecta que los planetas imprimen al Sol.
// Uso los GM del catálogo gravitacional: baricentro y GM de sistema para los planetas gigantes (NAIF 5–8), GM de sistema
// en el centro de Marte y GM de Tierra+Luna sumado en el centro terrestre (aproximación declarada al no tener la Luna
// en las efemérides heliocéntricas). Si el crucero parte del centro de un planeta excluyo ese cuerpo para evitar singularidad.
// Omito presión de radiación solar, correcciones relativistas, asteroides y empujes residuales.
import { integrateDopri54, IntegrationError } from '../science/NumericalIntegrator.js';
import { SOLAR_SYSTEM_GM_CATALOG } from '../science/GravitationalParameters.js';
import { propagateKepler } from '../science/KeplerPropagator.js';

export const NBODY_CRUISE_VERSION = '28-nbody-cruise-2';
const gm = id => SOLAR_SYSTEM_GM_CATALOG.getMu(id);
export const MU_SUN_NBODY = gm('10');
const perturber = (id, ephemerisId, name, mu, note) => Object.freeze({ id, ephemerisId, name, muKm3S2: mu, note });
// Defino la lista de los ocho perturbadores planetarios con su identificador efemérico y su GM en km³/s².
export const NBODY_PERTURBERS = Object.freeze([
  perturber('199', '199', 'Mercurio', gm('199'), 'centro del planeta'),
  perturber('299', '299', 'Venus', gm('299'), 'centro del planeta'),
  perturber('399', '399', 'Tierra + Luna', gm('399') + gm('301'), 'GM de la Luna sumado en el centro de la Tierra (aproximación)'),
  perturber('499', '499', 'Marte', gm('499'), 'GM del sistema en el centro del planeta'),
  perturber('599', '5', 'Júpiter', gm('599'), 'baricentro y GM del sistema'),
  perturber('699', '6', 'Saturno', gm('699'), 'baricentro y GM del sistema'),
  perturber('799', '7', 'Urano', gm('799'), 'baricentro y GM del sistema'),
  perturber('899', '8', 'Neptuno', gm('899'), 'baricentro y GM del sistema')
]);
export const NBODY_EPHEMERIS_IDS = Object.freeze(NBODY_PERTURBERS.map(p => p.ephemerisId));
export const NBODY_STATUS = Object.freeze({ computed: 'calculada', noData: 'sin efemérides', noConvergence: 'corrección sin convergencia', integration: 'fallo de integración' });
// Fijo tolerancias estrictas (para posiciones ~10⁸ km, relTol 10⁻¹² equivale a ~0,1 m por paso) y un umbral de 0,1 km para la TCM.
export const NBODY_SETTINGS = Object.freeze({ absTol: 1e-9, relTol: 1e-12, maxStepSeconds: 2 * 86400, tcmDaysAfterStart: 10, tcmMaxFraction: 0.25,
  tcmToleranceKm: 0.1, tcmMaxIterations: 8, jacobianStepKmS: 1e-5, maxSamples: 120 });

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = a => Math.hypot(a[0], a[1], a[2]);

export class NBodyDataError extends Error {
  constructor(bodyId, jdTdb) { super(`Efemérides de ${bodyId} no disponibles en JD ${jdTdb.toFixed(4)} TDB: no se extrapola.`); this.name = 'NBodyDataError'; this.bodyId = bodyId; this.jdTdb = jdTdb; }
}

/** Calculo la aceleración heliocéntrica total (km/s²) en `r` sumando el Sol y las contribuciones directa e indirecta de cada perturbador. */
export function heliocentricAcceleration(r, bodies, muSun = MU_SUN_NBODY) {
  const r2 = r[0] * r[0] + r[1] * r[1] + r[2] * r[2], k0 = -muSun / (r2 * Math.sqrt(r2));
  const a = [k0 * r[0], k0 * r[1], k0 * r[2]];
  for (const { positionKm: p, muKm3S2: mu } of bodies) {
    const dx = p[0] - r[0], dy = p[1] - r[1], dz = p[2] - r[2], d2 = dx * dx + dy * dy + dz * dz, kd = mu / (d2 * Math.sqrt(d2));
    const p2 = p[0] * p[0] + p[1] * p[1] + p[2] * p[2], kp = mu / (p2 * Math.sqrt(p2));
    a[0] += kd * dx - kp * p[0]; a[1] += kd * dy - kp * p[1]; a[2] += kd * dz - kp * p[2];
  }
  return a;
}

/**
 * Propago un estado heliocéntrico [r, v] (km, km/s) bajo el Sol y los perturbadores entre dos épocas JD TDB.
 * Si `stateAt(ephemerisId, jdTdb)` devuelve null, lanzo NBodyDataError en lugar de extrapolar efemérides.
 */
export function propagateNBody({ stateAt, positionKm, velocityKmS, startJdTdb, endJdTdb, perturbers = NBODY_PERTURBERS, record = false, settings = NBODY_SETTINGS }) {
  const bodies = perturbers.map(p => ({ ...p, positionKm: null }));
  const derivative = (t, y, out) => {
    const jd = startJdTdb + t / 86400;
    for (const b of bodies) { const s = stateAt(b.ephemerisId, jd); if (!s) throw new NBodyDataError(b.ephemerisId, jd); b.positionKm = s.positionKm; }
    const a = heliocentricAcceleration([y[0], y[1], y[2]], bodies);
    out[0] = y[3]; out[1] = y[4]; out[2] = y[5]; out[3] = a[0]; out[4] = a[1]; out[5] = a[2];
  };
  const span = (endJdTdb - startJdTdb) * 86400;
  const result = integrateDopri54({ derivative, initialState: [...positionKm, ...velocityKmS], startSeconds: 0, targetSeconds: span, initialStepSeconds: Math.min(600, span),
    minStepSeconds: 1e-3, maxStepSeconds: Math.min(settings.maxStepSeconds, Math.max(span, 1)), absTol: settings.absTol, relTol: settings.relTol, recordSteps: record });
  const y = result.finalState;
  return { positionKm: [y[0], y[1], y[2]], velocityKmS: [y[3], y[4], y[5]], steps: result.acceptedSteps, rejected: result.rejectedSteps, evaluations: result.functionEvaluations,
    knots: record ? result.knots : null };
}

// Resuelvo el sistema lineal 3×3 del paso de cuasi-Newton aplicando la regla de Cramer.
function solve3(J, b) {
  const det = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(J); if (!(Math.abs(D) > 0)) return null;
  return [0, 1, 2].map(k => det(J.map((row, i) => row.map((v, j) => (j === k ? b[i] : v)))) / D);
}

/**
 * Comparo el crucero kepleriano de referencia con la propagación de n cuerpos y calculo la corrección TCM-1.
 * Cuando existe `boundaryState` = { bodyId, positionKm, velocityKmS } (el estado real en la frontera de la SOI
 * en un empalme por asíntota), parto desde ese estado en las propagaciones donde actúa `bodyId` y desde `initial` en las demás.
 *
 * Devuelvo tres análisis complementarios:
 * 1. Modelo completo (todos los perturbadores activos): desviación máxima y en la llegada respecto a la cónica.
 * 2. Efecto aislado de cada cuerpo en `isolate` (gravedad de Tierra o destino fuera de su SOI), que cuantifica el corte
 *    propio de la aproximación de cónicas parcheadas.
 * 3. Perturbación del resto de planetas y corrección TCM-1 en `tcmJdTdb` resuelta por cuasi-Newton (jacobiano kepleriano
 *    por diferencias finitas y residuo evaluado con el propagador de n cuerpos).
 */
export function compareNBodyCruise({ stateAt, initial, startJdTdb, arrivalJdTdb, muSun = MU_SUN_NBODY, exclude = [], isolate = [], massKg, ispS, boundaryState = null, settings = NBODY_SETTINGS }) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const excludedIds = new Set(exclude.map(e => e.id));
  const perturbers = NBODY_PERTURBERS.filter(p => !excludedIds.has(p.id));
  const active = isolate.filter(iso => !excludedIds.has(iso.id) && perturbers.some(p => p.id === iso.id));
  const activeIds = active.map(i => i.id), thirdPerturbers = perturbers.filter(p => !activeIds.includes(p.id));
  const base = { model: NBODY_CRUISE_VERSION, startJdTdb, arrivalJdTdb, perturbers: perturbers.map(p => ({ id: p.id, name: p.name, muKm3S2: p.muKm3S2, note: p.note })),
    boundaryState: boundaryState ? { bodyId: boundaryState.bodyId, velocityDifferenceKmS: norm(sub(boundaryState.velocityKmS, initial.velocityKmS)),
      positionDifferenceKm: norm(sub(boundaryState.positionKm, initial.positionKm)) } : null,
    excluded: exclude.map(e => ({ ...e })), settings: { absTol: settings.absTol, relTol: settings.relTol, tcmToleranceKm: settings.tcmToleranceKm, tcmDaysAfterStart: settings.tcmDaysAfterStart } };
  const done = extra => Object.freeze({ ...base, ...extra, computeMs: (typeof performance !== 'undefined' ? performance.now() : 0) - t0 });
  const fail = (error, extra = {}) => {
    if (error instanceof NBodyDataError) return done({ status: NBODY_STATUS.noData, ok: false, reason: error.message, ...extra });
    if (error instanceof IntegrationError) return done({ status: NBODY_STATUS.integration, ok: false, reason: error.message, ...extra });
    throw error;
  };
  const cruiseSeconds = (arrivalJdTdb - startJdTdb) * 86400;
  const conicAt = jd => propagateKepler(initial.positionKm, initial.velocityKmS, (jd - startJdTdb) * 86400, muSun);
  const conicArrival = conicAt(arrivalJdTdb);
  const errorsAt = s => ({ arrivalPositionErrorKm: norm(sub(s.positionKm, conicArrival.positionKm)), arrivalVelocityErrorKmS: norm(sub(s.velocityKmS, conicArrival.velocityKmS)) });
  const tcmJdTdb = startJdTdb + Math.min(settings.tcmDaysAfterStart, settings.tcmMaxFraction * cruiseSeconds / 86400);
  const run = (set, from, jd0, jd1, record = false) => propagateNBody({ stateAt, positionKm: from.positionKm, velocityKmS: from.velocityKmS, startJdTdb: jd0, endJdTdb: jd1, perturbers: set, record, settings });
  // Elijo el estado inicial apropiado según si el cuerpo de frontera interviene en este conjunto de perturbadores.
  const startFor = set => (boundaryState && set.some(p => p.id === boundaryState.bodyId) ? boundaryState : initial);

  // 1. Propago el modelo completo y registro la desviación respecto a la cónica en los nudos del integrador.
  let full;
  try { full = run(perturbers, startFor(perturbers), startJdTdb, arrivalJdTdb, true); } catch (error) { return fail(error); }
  let maxDev = 0, maxJd = startJdTdb;
  const { times, states } = full.knots;
  const deviations = Array.from(times, (t, i) => {
    const jd = startJdTdb + t / 86400, d = norm(sub([states[i][0], states[i][1], states[i][2]], conicAt(jd).positionKm));
    if (d > maxDev) { maxDev = d; maxJd = jd; }
    return { jdTdb: jd, deviationKm: d };
  });
  const stride = Math.max(1, Math.ceil(deviations.length / settings.maxSamples));
  const samples = deviations.filter((_, i) => i % stride === 0 || i === deviations.length - 1);
  const uncorrected = { ...errorsAt(full), maxDeviationKm: maxDev, maxDeviationJdTdb: maxJd, steps: full.steps };

  // 2 y 3. Separo los efectos aislados y propago el modelo con el resto de planetas dividiendo en el instante de TCM-1.
  const isolated = [];
  let third, atTcm;
  try {
    const toTcm = run(thirdPerturbers, startFor(thirdPerturbers), startJdTdb, tcmJdTdb);
    atTcm = { positionKm: toTcm.positionKm, velocityKmS: toTcm.velocityKmS };
    third = run(thirdPerturbers, atTcm, tcmJdTdb, arrivalJdTdb);
    for (const iso of active) {
      const without = perturbers.filter(p => p.id !== iso.id);
      const e = active.length === 1 && startFor(thirdPerturbers) === initial ? errorsAt(third) : errorsAt(run(without, startFor(without), startJdTdb, arrivalJdTdb));
      isolated.push({ id: iso.id, reason: iso.reason, name: NBODY_PERTURBERS.find(p => p.id === iso.id)?.name ?? iso.id,
        withoutArrivalPositionErrorKm: e.arrivalPositionErrorKm, withoutArrivalVelocityErrorKmS: e.arrivalVelocityErrorKmS });
    }
  } catch (error) { return fail(error, { uncorrected, samples }); }
  const thirdBodies = { without: activeIds, perturbers: thirdPerturbers.map(p => p.name), ...errorsAt(third) };

  // Resuelvo la maniobra TCM-1 por cuasi-Newton para compensar la perturbación de los otros planetas.
  const shoot = dv => run(thirdPerturbers, { positionKm: atTcm.positionKm, velocityKmS: atTcm.velocityKmS.map((v, i) => v + dv[i]) }, tcmJdTdb, arrivalJdTdb);
  const dtArr = (arrivalJdTdb - tcmJdTdb) * 86400, h = settings.jacobianStepKmS;
  const keplerEnd = v => propagateKepler(atTcm.positionKm, v, dtArr, muSun).positionKm;
  let dv = [0, 0, 0], cur = third, F = sub(cur.positionKm, conicArrival.positionKm), it = 0, propagations = 3 + (active.length > 1 ? active.length : 0);
  try {
    while (norm(F) > settings.tcmToleranceKm && it < settings.tcmMaxIterations) {
      it++;
      const v0 = atTcm.velocityKmS.map((v, i) => v + dv[i]), base0 = keplerEnd(v0), J = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      for (let k = 0; k < 3; k++) {
        const v = v0.slice(); v[k] += h; const r = keplerEnd(v);
        for (let i = 0; i < 3; i++) J[i][k] = (r[i] - base0[i]) / h;
      }
      const step = solve3(J, F.map(x => -x)); if (!step) break;
      dv = dv.map((x, i) => x + step[i]); cur = shoot(dv); propagations++;
      F = sub(cur.positionKm, conicArrival.positionKm);
    }
  } catch (error) { return fail(error, { uncorrected, samples, isolated, thirdBodies }); }
  const dvKmS = norm(dv), converged = norm(F) <= settings.tcmToleranceKm;
  const propellantKg = massKg > 0 && ispS > 0 ? massKg * (1 - Math.exp(-dvKmS * 1000 / (ispS * 9.80665))) : null;
  const tcm = { jdTdb: tcmJdTdb, daysAfterStart: tcmJdTdb - startJdTdb, corrects: 'otros planetas', deltaVKmS: dv, deltaVMS: dvKmS * 1000, propellantKg, massKg, ispS, iterations: it, propagations,
    residualKm: norm(F), arrivalVelocityErrorKmS: norm(sub(cur.velocityKmS, conicArrival.velocityKmS)) };
  return done({ status: converged ? NBODY_STATUS.computed : NBODY_STATUS.noConvergence, ok: converged,
    reason: converged ? null : `La corrección no baja de ${settings.tcmToleranceKm} km en ${settings.tcmMaxIterations} iteraciones (residuo ${norm(F).toFixed(3)} km).`,
    conicArrival: { positionKm: conicArrival.positionKm, velocityKmS: conicArrival.velocityKmS }, uncorrected, isolated, thirdBodies, tcm, samples });
}

/**
 * Configuro automáticamente la comparación de n cuerpos para una misión integrada ya calculada:
 * sin lanzamiento desde plataforma excluyo la Tierra porque el crucero nace en su centro; con plataforma
 * uso el estado real en la frontera de la SOI y solo aíslo la Tierra si no fue incluida al apuntar la salida.
 */
export function compareMissionCruise(mission, stateAt, settings = NBODY_SETTINGS) {
  const cruise = mission?.segments?.find(s => s.id === 'cruise');
  if (!cruise) return Object.freeze({ model: NBODY_CRUISE_VERSION, status: 'sin crucero', ok: false, reason: 'La misión calculada no tiene tramo de crucero heliocéntrico.' });
  const fromPad = Boolean(mission.launch?.ok), dest = NBODY_PERTURBERS.find(p => p.id === mission.destinationId);
  // Si la salida ya incorporó la gravedad terrestre más allá de la SOI, dejo la Tierra dentro del diseño y de la TCM-1.
  const earthDesigned = fromPad && mission.launch.earthBeyondSoi?.applied === true;
  const exclude = fromPad ? [] : [{ id: '399', reason: 'el crucero empieza en el centro de la Tierra (salida sin «Empezar en la plataforma»)' }];
  const isolate = [...(dest ? [{ id: dest.id, reason: `gravedad de ${dest.name} fuera de su esfera de influencia` }] : []),
    ...(fromPad && !earthDesigned ? [{ id: '399', reason: 'gravedad terrestre fuera de su esfera de influencia' }] : [])];
  const engine = mission.vehicle?.probe?.engine, exitState = fromPad ? mission.launch.soiExitHelioState : null;
  return compareNBodyCruise({ stateAt, initial: cruise.initial, startJdTdb: mission.departureJdTdb + cruise.startSeconds / 86400, arrivalJdTdb: mission.departureJdTdb + cruise.endSeconds / 86400,
    exclude, isolate, massKg: cruise.initial.massKg, ispS: engine?.ispS, settings,
    boundaryState: exitState ? { bodyId: '399', positionKm: exitState.positionKm, velocityKmS: exitState.velocityKmS } : null });
}
