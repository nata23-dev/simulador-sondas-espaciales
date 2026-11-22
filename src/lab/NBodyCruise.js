// Etapa 22 — crucero realista: propagación de n cuerpos EN PARALELO a la cónica heliocéntrica del crucero, con su diferencia y la
// corrección de trayectoria (TCM) que devuelve la nave al punto de llegada de la cónica.
//
// Sin DOM ni Three.js. La cadena de la misión (tramos, masas, reproducción) NO cambia: sigue siendo la de cónicas parcheadas.
// Este módulo mide cuánto se aparta un modelo más completo y cuánto costaría corregirlo.
//
// Ecuación del movimiento heliocéntrica (las efemérides de Horizons están centradas en el Sol, que no es un marco inercial):
//   a = −μ☉ r/|r|³ + Σ_k μ_k [ (r_k − r)/|r_k − r|³ − r_k/|r_k|³ ]
// El segundo término de la suma es la aceleración indirecta (la que los planetas imprimen al Sol). Integración con DOPRI54.
// Perturbadores: los ocho planetas de las efemérides cargadas, con los GM del catálogo del proyecto. Los gigantes usan el baricentro
// de su sistema (NAIF 5–8) con el GM del sistema; Marte, su GM de sistema en el centro del planeta. La Luna no está en estas
// efemérides heliocéntricas: su GM se suma al de la Tierra en el centro de la Tierra (aproximación declarada). Si el crucero empieza
// en el centro de un planeta (salida sin «Empezar en la plataforma»), ese planeta se excluye: su potencial es singular ahí.
// Sin presión de radiación, relatividad, asteroides ni empujes residuales.
import { integrateDopri54, IntegrationError } from '../science/NumericalIntegrator.js';
import { SOLAR_SYSTEM_GM_CATALOG } from '../science/GravitationalParameters.js';
import { propagateKepler } from '../science/KeplerPropagator.js';

export const NBODY_CRUISE_VERSION = '22-nbody-cruise-1';
const gm = id => SOLAR_SYSTEM_GM_CATALOG.getMu(id);
export const MU_SUN_NBODY = gm('10');
const perturber = (id, ephemerisId, name, mu, note) => Object.freeze({ id, ephemerisId, name, muKm3S2: mu, note });
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
// Tolerancias: posiciones ~10⁸ km → relTol 10⁻¹² ≈ 0,1 m por paso. La corrección se da por buena con 0,1 km en la llegada.
export const NBODY_SETTINGS = Object.freeze({ absTol: 1e-9, relTol: 1e-12, maxStepSeconds: 2 * 86400, tcmDaysAfterStart: 10, tcmMaxFraction: 0.25,
  tcmToleranceKm: 0.1, tcmMaxIterations: 8, jacobianStepKmS: 1e-5, maxSamples: 120 });

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = a => Math.hypot(a[0], a[1], a[2]);

export class NBodyDataError extends Error {
  constructor(bodyId, jdTdb) { super(`Efemérides de ${bodyId} no disponibles en JD ${jdTdb.toFixed(4)} TDB: no se extrapola.`); this.name = 'NBodyDataError'; this.bodyId = bodyId; this.jdTdb = jdTdb; }
}

/** Aceleración heliocéntrica (km/s²) en `r` con los perturbadores en sus posiciones `rk` (exportada para las pruebas). */
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
 * Propaga un estado heliocéntrico con el Sol y los perturbadores entre dos épocas TDB.
 * `stateAt(ephemerisId, jdTdb)` → { positionKm } | null (sin extrapolar: null lanza NBodyDataError).
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

function solve3(J, b) {
  const det = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(J); if (!(Math.abs(D) > 0)) return null;
  return [0, 1, 2].map(k => det(J.map((row, i) => row.map((v, j) => (j === k ? b[i] : v)))) / D);
}

/**
 * Compara el crucero cónico con el de n cuerpos y diseña una corrección de trayectoria (TCM-1).
 * input = { stateAt, initial: { positionKm, velocityKmS }, startJdTdb, arrivalJdTdb, muSun, exclude: [{ id, reason }],
 *   isolate: [{ id, reason }], massKg (en la TCM), ispS (motor de la sonda) }
 * La cónica de referencia es Kepler con μ☉ desde el mismo estado inicial; la llegada es su punto en `arrivalJdTdb` (entrada en la SOI).
 *
 * Tres resultados:
 * 1. Modelo completo (todos los perturbadores no excluidos): desviación en la llegada y a lo largo del crucero.
 * 2. Efecto de cada perturbador de `isolate` (la Tierra o el destino FUERA de su esfera de influencia): la misma propagación sin él.
 *    No es una perturbación que una misión real «corrija»: es la aproximación de las cónicas parcheadas, que tratan la frontera de
 *    la SOI como si la gravedad del planeta acabara allí. Un diseño real la incluiría desde el principio.
 * 3. Solo los otros planetas (sin los de `isolate`): la perturbación del crucero propiamente dicha. La TCM-1 corrige ESTA: Δv en
 *    `tcmJdTdb` para llegar al punto de la cónica en el mismo instante. Newton con el jacobiano de la cónica (∂r_llegada/∂v por
 *    diferencias finitas sobre Kepler, barato) y el residuo de n cuerpos (cuasi-Newton: vale mientras la perturbación sea pequeña).
 */
export function compareNBodyCruise({ stateAt, initial, startJdTdb, arrivalJdTdb, muSun = MU_SUN_NBODY, exclude = [], isolate = [], massKg, ispS, settings = NBODY_SETTINGS }) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const excludedIds = new Set(exclude.map(e => e.id));
  const perturbers = NBODY_PERTURBERS.filter(p => !excludedIds.has(p.id));
  const active = isolate.filter(iso => !excludedIds.has(iso.id) && perturbers.some(p => p.id === iso.id));
  const activeIds = active.map(i => i.id), thirdPerturbers = perturbers.filter(p => !activeIds.includes(p.id));
  const base = { model: NBODY_CRUISE_VERSION, startJdTdb, arrivalJdTdb, perturbers: perturbers.map(p => ({ id: p.id, name: p.name, muKm3S2: p.muKm3S2, note: p.note })),
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

  // 1. Modelo completo, con la desviación frente a la cónica en los nudos del integrador.
  let full;
  try { full = run(perturbers, initial, startJdTdb, arrivalJdTdb, true); } catch (error) { return fail(error); }
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

  // 2 y 3. Efectos aislados y modelo «solo otros planetas» (partido en la TCM para tener su estado allí).
  const isolated = [];
  let third, atTcm;
  try {
    const toTcm = run(thirdPerturbers, initial, startJdTdb, tcmJdTdb);
    atTcm = { positionKm: toTcm.positionKm, velocityKmS: toTcm.velocityKmS };
    third = run(thirdPerturbers, atTcm, tcmJdTdb, arrivalJdTdb);
    for (const iso of active) {
      const e = active.length === 1 ? errorsAt(third) : errorsAt(run(perturbers.filter(p => p.id !== iso.id), initial, startJdTdb, arrivalJdTdb));
      isolated.push({ id: iso.id, reason: iso.reason, name: NBODY_PERTURBERS.find(p => p.id === iso.id)?.name ?? iso.id,
        withoutArrivalPositionErrorKm: e.arrivalPositionErrorKm, withoutArrivalVelocityErrorKmS: e.arrivalVelocityErrorKmS });
    }
  } catch (error) { return fail(error, { uncorrected, samples }); }
  const thirdBodies = { without: activeIds, perturbers: thirdPerturbers.map(p => p.name), ...errorsAt(third) };

  // TCM-1 sobre la perturbación de los otros planetas.
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
 * Prepara la comparación para una misión integrada calculada (13–21): tramo `cruise`, salida con o sin plataforma y destino.
 * Sin la plataforma, el crucero empieza en el centro de la Tierra y la Tierra se excluye. Se aíslan el destino fuera de su SOI y,
 * con la plataforma, la Tierra fuera de la suya (el empalme de la etapa 21 iguala la velocidad en la SOI).
 */
export function compareMissionCruise(mission, stateAt, settings = NBODY_SETTINGS) {
  const cruise = mission?.segments?.find(s => s.id === 'cruise');
  if (!cruise) return Object.freeze({ model: NBODY_CRUISE_VERSION, status: 'sin crucero', ok: false, reason: 'La misión calculada no tiene tramo de crucero heliocéntrico.' });
  const fromPad = Boolean(mission.launch?.ok), dest = NBODY_PERTURBERS.find(p => p.id === mission.destinationId);
  const exclude = fromPad ? [] : [{ id: '399', reason: 'el crucero empieza en el centro de la Tierra (salida sin «Empezar en la plataforma»)' }];
  const isolate = [...(dest ? [{ id: dest.id, reason: `gravedad de ${dest.name} fuera de su esfera de influencia` }] : []),
    ...(fromPad ? [{ id: '399', reason: 'gravedad terrestre fuera de su esfera de influencia (empalme de la etapa 21)' }] : [])];
  const engine = mission.vehicle?.probe?.engine;
  return compareNBodyCruise({ stateAt, initial: cruise.initial, startJdTdb: mission.departureJdTdb + cruise.startSeconds / 86400, arrivalJdTdb: mission.departureJdTdb + cruise.endSeconds / 86400,
    exclude, isolate, massKg: cruise.initial.massKg, ispS: engine?.ispS, settings });
}
