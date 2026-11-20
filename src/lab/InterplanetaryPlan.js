// Etapa 12G — planificación interplanetaria preliminar: búsqueda de ventanas Tierra → planeta con efemérides
// NASA/JPL Horizons, Lambert heliocéntrico de cero revoluciones y cónicas parcheadas para el coste de inyección.
//
// Modelo: dos cuerpos (Sol) entre la salida y la llegada; los planetas solo fijan las condiciones de contorno
// (posición y velocidad en sus épocas). Sin perturbaciones planetarias, sin esfera de influencia, sin asistencias
// gravitacionales, sin inserción orbital. La «mejor» oportunidad lo es SOLO dentro de la cuadrícula examinada.
import { solveLambert, LAMBERT_STATUS, LAMBERT_SOLVER_VERSION } from '../science/LambertSolver.js';
import { SOLAR_SYSTEM_GM_CATALOG } from '../science/GravitationalParameters.js';
import { eclipticJ2000ToIcrfEquatorial } from '../science/Frames.js';
import { utcToTimeScales, tdbToTimeScales } from '../science/AstrodynamicsTime.js';
import { PLANET_NAMES } from '../science/InterplanetaryEphemeris.js';
import { listBodyProfiles, landingCapability } from './CelestialBodyMissionRegistry.js';

export const INTERPLANETARY_MODEL_VERSION = '12G-heliocentric-lambert-0rev-1';
export const MU_SUN = SOLAR_SYSTEM_GM_CATALOG.getParameter('10').muKm3PerS2;
export const MU_EARTH = SOLAR_SYSTEM_GM_CATALOG.getParameter('399').muKm3PerS2;
export const EARTH_RADIUS_KM = SOLAR_SYSTEM_GM_CATALOG.getParameter('399').referenceRadiusKm;
export const ORIGINS = Object.freeze([Object.freeze({ id: '399', name: 'Tierra', validated: true })]);
export const PLANET_DESTINATION_IDS = Object.freeze(['199', '299', '499', '599', '699', '799', '899']);
export const CANDIDATE_STATUS = Object.freeze({
  best: 'MEJOR CANDIDATO DEL INTERVALO EXAMINADO', computed: 'CANDIDATO FÍSICAMENTE CALCULADO', noConvergence: 'SOLUCIÓN NO CONVERGENTE',
  noCoverage: 'FECHA SIN COBERTURA', illConditioned: 'GEOMETRÍA MAL CONDICIONADA', notEvaluated: 'MISIÓN NO EVALUADA COMPLETAMENTE'
});
// Códigos compactos de la cuadrícula (mapa de oportunidades).
export const CELL = Object.freeze({ ok: 1, noCoverage: 2, noConvergence: 3, illConditioned: 4 });
export const CRITERIA = Object.freeze({ c3: 'C3 de salida mínimo', arrival: 'v∞ de llegada mínima', total: '|v∞ salida| + |v∞ llegada| mínimo' });
export const MAX_GRID_CELLS = 120000;
// Cierre máximo aceptado (propagación kepleriana independiente desde la solución hasta la llegada).
export const CLOSURE_TOLERANCE_KM = 1;
export const MODEL_LIMITS = Object.freeze([
  'Transferencia cónica heliocéntrica idealizada (Lambert de cero revoluciones, solo gravedad solar).',
  'Sin perturbaciones planetarias, presión de radiación ni maniobras de corrección; no es alta fidelidad N-cuerpos.',
  'Sin asistencias gravitacionales, esfera de influencia, inserción orbital ni aterrizaje conectados.',
  'El C3 y el Δv de inyección son requisitos ideales; no prueban que un lanzador o la sonda puedan cumplirlos.',
  'El mejor candidato lo es solo dentro de la cuadrícula examinada; no es un óptimo global.'
]);

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = a => Math.hypot(a[0], a[1], a[2]);
const DEG = 180 / Math.PI;

export const DEFAULT_INTERPLANETARY_OPTIONS = Object.freeze({
  originId: '399', destinationId: '499', departureStartUtc: '2028-08-01', departureEndUtc: '2029-04-01', departureStepDays: 4,
  tofMinDays: 120, tofMaxDays: 400, tofStepDays: 4, criterion: 'c3', parkingAltitudeKm: 200
});
// Rangos de búsqueda sugeridos por destino (escala de tiempos de vuelo física: semiperiodo de Hohmann ± margen).
// Son puntos de partida editables, no fechas óptimas.
export const SUGGESTED_RANGES = Object.freeze({
  '199': { tofMinDays: 60, tofMaxDays: 200, tofStepDays: 2, departureStepDays: 2, spanDays: 240 },
  '299': { tofMinDays: 80, tofMaxDays: 220, tofStepDays: 2, departureStepDays: 2, spanDays: 600 },
  '499': { tofMinDays: 120, tofMaxDays: 400, tofStepDays: 4, departureStepDays: 4, spanDays: 800 },
  '599': { tofMinDays: 500, tofMaxDays: 1300, tofStepDays: 10, departureStepDays: 5, spanDays: 420 },
  '699': { tofMinDays: 1200, tofMaxDays: 2600, tofStepDays: 20, departureStepDays: 6, spanDays: 400 },
  '799': { tofMinDays: 2500, tofMaxDays: 6000, tofStepDays: 40, departureStepDays: 8, spanDays: 380 },
  '899': { tofMinDays: 3500, tofMaxDays: 6800, tofStepDays: 50, departureStepDays: 10, spanDays: 380 }
});

/** Valida y normaliza opciones; devuelve { issues, options } con épocas TDB derivadas de las fechas UTC. */
export function validateInterplanetaryOptions(input = {}) {
  const o = { ...DEFAULT_INTERPLANETARY_OPTIONS, ...input };
  const issues = [];
  if (!ORIGINS.some(item => item.id === o.originId)) issues.push('Origen no validado en esta etapa: solo la Tierra.');
  if (!PLANET_DESTINATION_IDS.includes(o.destinationId)) issues.push('Destino planetario no válido (los satélites requieren etapas futuras).');
  if (o.destinationId === o.originId) issues.push('Origen y destino deben ser distintos.');
  for (const key of ['departureStepDays', 'tofMinDays', 'tofMaxDays', 'tofStepDays', 'parkingAltitudeKm']) if (!Number.isFinite(o[key])) issues.push(`${key} debe ser un número finito.`);
  if (!CRITERIA[o.criterion]) issues.push('Criterio de comparación desconocido.');
  let depStart = null, depEnd = null;
  try { depStart = utcToTimeScales(o.departureStartUtc); depEnd = utcToTimeScales(o.departureEndUtc); }
  catch (error) { issues.push(`Fechas de salida inválidas: ${error.message}`); }
  if (issues.length) return { issues, options: o };
  if (depEnd.jdTdb < depStart.jdTdb) issues.push('La fecha final de salida es anterior a la inicial.');
  if (o.departureStepDays < 0.25 || o.tofStepDays < 0.25) issues.push('La resolución mínima es 0,25 días.');
  if (o.tofMinDays < 10) issues.push('El tiempo de vuelo mínimo es 10 días.');
  if (o.tofMaxDays < o.tofMinDays) issues.push('El tiempo de vuelo máximo es menor que el mínimo.');
  if (o.parkingAltitudeKm < 150 || o.parkingAltitudeKm > 100000) issues.push('La altitud de estacionamiento debe estar entre 150 y 100 000 km.');
  const nDep = Math.floor((depEnd.jdTdb - depStart.jdTdb) / o.departureStepDays + 1e-9) + 1;
  const nTof = Math.floor((o.tofMaxDays - o.tofMinDays) / o.tofStepDays + 1e-9) + 1;
  if (nDep * nTof > MAX_GRID_CELLS) issues.push(`La cuadrícula tendría ${nDep * nTof} combinaciones (máximo ${MAX_GRID_CELLS}). Reduce el intervalo o la resolución.`);
  return { issues, options: Object.freeze({ ...o, departureStartJdTdb: depStart.jdTdb, departureEndJdTdb: depEnd.jdTdb, departureCount: nDep, tofCount: nTof,
    timeScales: Object.freeze({ start: depStart, end: depEnd }) }) };
}

/** Firma determinista de las condiciones: cualquier cambio de fechas, destino o parámetros invalida resultados previos. */
export function interplanetarySignature(options) {
  const keys = ['originId', 'destinationId', 'departureStartUtc', 'departureEndUtc', 'departureStepDays', 'tofMinDays', 'tofMaxDays', 'tofStepDays', 'criterion', 'parkingAltitudeKm'];
  return JSON.stringify(keys.map(key => [key, options[key]]));
}
export function isInterplanetaryResultCurrent(result, options) { return Boolean(result) && result.signature === interplanetarySignature({ ...DEFAULT_INTERPLANETARY_OPTIONS, ...options }); }

/** Δv ideal (impulsivo) desde una órbita circular de estacionamiento: √(v∞² + 2μ/r) − √(μ/r). */
export function injectionDeltaV(vInfKmS, parkingAltitudeKm, { mu = MU_EARTH, bodyRadiusKm = EARTH_RADIUS_KM } = {}) {
  if (!Number.isFinite(vInfKmS) || vInfKmS < 0) throw new RangeError('v∞ debe ser finita y no negativa.');
  if (!Number.isFinite(parkingAltitudeKm) || parkingAltitudeKm <= 0) throw new RangeError('La altitud de estacionamiento debe ser positiva.');
  const r = bodyRadiusKm + parkingAltitudeKm, vCirc = Math.sqrt(mu / r), vPeri = Math.sqrt(vInfKmS * vInfKmS + 2 * mu / r);
  return { deltaVKmS: vPeri - vCirc, circularSpeedKmS: vCirc, periapsisSpeedKmS: vPeri, parkingRadiusKm: r, escapeSpeedKmS: Math.sqrt(2 * mu / r) };
}

/** Exceso hiperbólico, C3 y asíntota de salida (declinación/ascensión recta en ejes ecuatoriales ICRF). */
export function hyperbolicExcess(transferVelocityKmS, planetVelocityKmS) {
  const vInf = sub(transferVelocityKmS, planetVelocityKmS), magnitude = norm(vInf);
  const eq = eclipticJ2000ToIcrfEquatorial(vInf);
  return { vectorKmS: vInf, magnitudeKmS: magnitude, c3Km2S2: magnitude * magnitude,
    declinationDeg: magnitude > 0 ? Math.asin(eq[2] / magnitude) * DEG : null, rightAscensionDeg: magnitude > 0 ? ((Math.atan2(eq[1], eq[0]) * DEG) + 360) % 360 : null };
}

function solveCell(origin, destination, tofDays) {
  const lambert = solveLambert(origin.positionKm, destination.positionKm, tofDays * 86400, MU_SUN, { direction: 'prograde' });
  if (lambert.status !== LAMBERT_STATUS.converged) return { code: CELL.noConvergence, lambert };
  const closure = lambert.diagnostics.closurePositionKm;
  if (lambert.diagnostics.nearColinear || !(closure <= CLOSURE_TOLERANCE_KM)) return { code: CELL.illConditioned, lambert };
  const dep = hyperbolicExcess(lambert.departureVelocityKmS, origin.velocityKmS);
  const arr = hyperbolicExcess(lambert.arrivalVelocityKmS, destination.velocityKmS);
  return { code: CELL.ok, lambert, dep, arr };
}

function score(criterion, c3, vArr) { return criterion === 'c3' ? c3 : criterion === 'arrival' ? vArr : Math.sqrt(c3) + vArr; }

/**
 * Explora la cuadrícula (fecha de salida × tiempo de vuelo). `window` es el evaluador síncrono de
 * InterplanetaryEphemeris.loadWindow, que debe cubrir [salida inicial, salida final + TOF máximo].
 */
export function searchLaunchWindows(window, input) {
  const { issues, options } = validateInterplanetaryOptions(input);
  if (issues.length) throw new RangeError(issues.join(' '));
  const { departureStartJdTdb: d0, departureStepDays: dStep, tofMinDays, tofStepDays, departureCount: nDep, tofCount: nTof } = options;
  const departures = Float64Array.from({ length: nDep }, (_, i) => d0 + i * dStep);
  const tofs = Float64Array.from({ length: nTof }, (_, j) => tofMinDays + j * tofStepDays);
  const c3 = new Float64Array(nDep * nTof).fill(NaN), vArr = new Float64Array(nDep * nTof).fill(NaN), code = new Uint8Array(nDep * nTof);
  const destinationCache = new Map();
  const destinationAt = jd => { if (!destinationCache.has(jd)) destinationCache.set(jd, window.stateAt(options.destinationId, jd)); return destinationCache.get(jd); };
  const counts = { total: nDep * nTof, ok: 0, noCoverage: 0, noConvergence: 0, illConditioned: 0 };
  let bestIndex = -1, bestScore = Infinity;
  const candidates = [];
  for (let i = 0; i < nDep; i++) {
    const origin = window.stateAt(options.originId, departures[i]);
    for (let j = 0; j < nTof; j++) {
      const k = i * nTof + j;
      const destination = destinationAt(departures[i] + tofs[j]);
      if (origin.status !== 'available' || destination.status !== 'available') { code[k] = CELL.noCoverage; counts.noCoverage++; continue; }
      const cell = solveCell(origin, destination, tofs[j]);
      code[k] = cell.code;
      if (cell.code === CELL.noConvergence) { counts.noConvergence++; continue; }
      if (cell.code === CELL.illConditioned) { counts.illConditioned++; continue; }
      counts.ok++;
      c3[k] = cell.dep.c3Km2S2; vArr[k] = cell.arr.magnitudeKmS;
      const s = score(options.criterion, c3[k], vArr[k]);
      candidates.push({ index: k, atGridEdge: i === 0 || j === 0 || i === nDep - 1 || j === nTof - 1, departureJdTdb: departures[i], arrivalJdTdb: departures[i] + tofs[j], tofDays: tofs[j], c3Km2S2: c3[k], vInfDepartureKmS: cell.dep.magnitudeKmS,
        vInfArrivalKmS: vArr[k], score: s, transferType: cell.lambert.diagnostics.transferType, iterations: cell.lambert.diagnostics.iterations, closureKm: cell.lambert.diagnostics.closurePositionKm });
      if (s < bestScore) { bestScore = s; bestIndex = k; }
    }
  }
  candidates.sort((a, b) => a.score - b.score);
  // Mínimos locales de la cuadrícula (sin vecino válido con menor puntuación): oportunidades distintas, no solo celdas contiguas.
  const local = candidates.filter(c => {
    const i = Math.floor(c.index / nTof), j = c.index % nTof;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      if (!di && !dj) continue; const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= nDep || jj >= nTof) continue;
      const kk = ii * nTof + jj; if (code[kk] === CELL.ok && score(options.criterion, c3[kk], vArr[kk]) < c.score) return false;
    }
    return true;
  });
  return Object.freeze({ model: INTERPLANETARY_MODEL_VERSION, solver: LAMBERT_SOLVER_VERSION, signature: interplanetarySignature(options), options,
    grid: Object.freeze({ departures, tofs, c3, vInfArrival: vArr, code, nDep, nTof }), counts: Object.freeze(counts),
    candidates: Object.freeze(candidates), localMinima: Object.freeze(local.slice(0, 25)),
    best: bestIndex >= 0 ? candidates[0] : null,
    bestLabel: bestIndex >= 0 ? CANDIDATE_STATUS.best : null,
    note: 'El mejor candidato lo es solo dentro de la cuadrícula examinada (resolución finita); no es un óptimo global.'
      + (bestIndex >= 0 && candidates[0].atGridEdge ? ' Está en el BORDE de la cuadrícula: el mínimo podría estar fuera del intervalo examinado; amplía fechas o tiempos de vuelo.' : '') });
}

/** Cálculo completo de una oportunidad: estados de contorno con procedencia, Lambert, v∞, C3, asíntota, inyección y requisitos. */
export function evaluateTransfer(window, { originId = '399', destinationId, departureJdTdb, arrivalJdTdb, parkingAltitudeKm = 200, isBest = false } = {}) {
  const tofDays = arrivalJdTdb - departureJdTdb;
  const origin = window.stateAt(originId, departureJdTdb), destination = window.stateAt(destinationId, arrivalJdTdb);
  const base = { model: INTERPLANETARY_MODEL_VERSION, originId, destinationId, originName: PLANET_NAMES[originId], destinationName: PLANET_NAMES[destinationId],
    departureJdTdb, arrivalJdTdb, tofDays, departureTime: tdbToTimeScales(departureJdTdb), arrivalTime: tdbToTimeScales(arrivalJdTdb), originState: origin, destinationState: destination };
  if (origin.status !== 'available' || destination.status !== 'available') return Object.freeze({ ...base, status: CANDIDATE_STATUS.noCoverage, reason: (origin.status !== 'available' ? origin : destination).message });
  if (!(tofDays > 0)) return Object.freeze({ ...base, status: CANDIDATE_STATUS.noConvergence, reason: 'Tiempo de vuelo no positivo.' });
  const cell = solveCell(origin, destination, tofDays);
  if (cell.code !== CELL.ok) return Object.freeze({ ...base, lambert: cell.lambert,
    status: cell.code === CELL.noConvergence ? CANDIDATE_STATUS.noConvergence : CANDIDATE_STATUS.illConditioned,
    reason: cell.lambert.reason ?? cell.lambert.diagnostics?.warnings?.[0] ?? `Cierre ${cell.lambert.diagnostics?.closurePositionKm} km > ${CLOSURE_TOLERANCE_KM} km.` });
  const injection = injectionDeltaV(cell.dep.magnitudeKmS, parkingAltitudeKm);
  const requirements = Object.freeze({
    c3Km2S2: cell.dep.c3Km2S2, vInfDepartureKmS: cell.dep.magnitudeKmS, vInfArrivalKmS: cell.arr.magnitudeKmS, durationDays: tofDays,
    injectionDeltaVKmS: injection.deltaVKmS, parkingAltitudeKm, departureAsymptote: { declinationDeg: cell.dep.declinationDeg, rightAscensionDeg: cell.dep.rightAscensionDeg, frame: 'ecuatorial ICRF' },
    arrivalConditions: Object.freeze({ epochJdTdb: arrivalJdTdb, vInfKmS: cell.arr.magnitudeKmS, vInfVectorKmS: cell.arr.vectorKmS, note: 'Exceso hiperbólico relativo al centro del planeta; sin captura ni inserción calculadas.' }),
    maneuvers: Object.freeze([Object.freeze({ id: 'injection', kind: 'impulso ideal desde órbita circular de estacionamiento (cónicas parcheadas)', deltaVKmS: injection.deltaVKmS, propagated: false })]),
    notIncluded: Object.freeze(['lanzamiento desde la superficie', 'pérdidas gravitatorias y de dirección', 'correcciones de trayectoria', 'captura o inserción en el destino', 'margen de diseño'])
  });
  return Object.freeze({ ...base, status: isBest ? CANDIDATE_STATUS.best : CANDIDATE_STATUS.computed, completeness: CANDIDATE_STATUS.notEvaluated,
    lambert: cell.lambert, departureExcess: cell.dep, arrivalExcess: cell.arr, injection, requirements, limits: MODEL_LIMITS,
    initialState: Object.freeze({ positionKm: origin.positionKm, velocityKmS: cell.lambert.departureVelocityKmS }),
    finalState: Object.freeze({ positionKm: destination.positionKm, velocityKmS: cell.lambert.arrivalVelocityKmS }) });
}

/**
 * Comparación físicamente justificable con el Hangar: el Δv ideal del diseño (Tsiolkovsky, ProbeEngineering) frente al Δv
 * de inyección ideal. Es una condición NECESARIA, no suficiente: no verifica empuje, lanzador ni pérdidas.
 */
export function compareRequirementsWithDesign(requirements, engineering) {
  const available = engineering?.deltaVMS;
  if (!requirements) return { status: 'SIN REQUISITOS', message: 'Calcula y selecciona una oportunidad.' };
  if (!Number.isFinite(available)) return { status: 'NO VERIFICABLE', message: 'El diseño no tiene un Δv ideal calculable (revisa Ingeniería).' };
  const requiredMS = requirements.injectionDeltaVKmS * 1000;
  // Etapa 16: mismo criterio que el Planificador Tierra–Luna (MissionEngineering): con propulsión eléctrica el Δv de Tsiolkovsky
  // no sirve para una inyección impulsiva; el empuje de milinewtons tardaría meses y exige propagación de empuje finito y potencia.
  if (engineering.propulsionType === 'electric') return { status: 'NO VERIFICABLE CON PROPULSIÓN ELÉCTRICA', availableMS: available, requiredMS,
    message: 'El motor iónico tiene mucho Δv ideal pero muy poco empuje: no puede dar la inyección como un impulso desde la órbita de estacionamiento (tardaría meses en espiral). Esta comprobación no se aplica; la salida la daría el lanzador o una etapa superior (no evaluados).' };
  return available >= requiredMS
    ? { status: 'Δv IDEAL SUFICIENTE PARA LA INYECCIÓN (CONDICIÓN NECESARIA)', availableMS: available, requiredMS, message: 'El Δv ideal de la sonda cubre la inyección idealizada. No se verifica empuje finito, lanzamiento, pérdidas ni la llegada: la misión no queda declarada viable.' }
    : { status: 'Δv IDEAL INSUFICIENTE PARA LA INYECCIÓN', availableMS: available, requiredMS, message: 'La sonda sola no puede realizar la inyección idealizada; haría falta una etapa superior o un lanzador que entregue ese C3 (no evaluado).' };
}

/** Destinos de misión: planetas directos (transferencia preliminar operativa) y satélites (requieren etapas futuras). */
export function listMissionDestinations() {
  const profiles = listBodyProfiles();
  const planets = PLANET_DESTINATION_IDS.map(id => Object.freeze({ id, name: PLANET_NAMES[id], kind: 'planet', status: 'Transferencia heliocéntrica preliminar operativa (Lambert, cero revoluciones)' }));
  const satellites = profiles.filter(p => p.parentId && p.parentId !== '10').map(p => {
    const host = p.parentId, landing = landingCapability(p);
    const isMoon = p.id === '301';
    return Object.freeze({ id: p.id, name: p.name, kind: 'satellite', hostId: host, hostName: PLANET_NAMES[host] ?? host,
      heliocentricLeg: isMoon ? 'No aplica: la Luna se planifica en el Planificador Tierra–Luna (marco geocéntrico).' : `Transferencia preliminar calculable hasta el sistema de ${PLANET_NAMES[host]}.`,
      localOperations: `Descenso local: ${landing.state}${landing.reason ? ` (${landing.reason})` : ''}`,
      pendingStages: isMoon ? ['Conexión de la transferencia lunar con el descenso local'] : ['Llegada a la esfera de influencia y transición a dinámica planetocéntrica', 'Captura/inserción orbital en el planeta anfitrión', `Transferencia dentro del sistema de ${PLANET_NAMES[host]} hasta ${p.name}`, 'Aproximación, órbita y descenso conectados'] });
  });
  return Object.freeze({ planets: Object.freeze(planets), satellites: Object.freeze(satellites) });
}

// ---- Etapa 13 (OBS-12G-01): refinamiento local continuo de un candidato de la cuadrícula ------------------------------------
/**
 * Refina (salida, tiempo de vuelo) con Nelder–Mead acotado a ± media celda alrededor del candidato. El resultado sigue siendo el
 * mejor DENTRO del intervalo examinado (no un óptimo global); si el mínimo continuo cae en el límite de la caja de refinamiento
 * se marca `atRefinementBoundary` (el valle sigue fuera de la celda: conviene ampliar la búsqueda).
 */
export function refineTransferCandidate(window, { originId = '399', destinationId, departureJdTdb, tofDays, criterion = 'c3', halfSpanDepartureDays, halfSpanTofDays, maxEvaluations = 160 }) {
  if (!CRITERIA[criterion]) throw new RangeError('Criterio de comparación desconocido.');
  if (!(halfSpanDepartureDays > 0) || !(halfSpanTofDays > 0)) throw new RangeError('La caja de refinamiento debe tener semiamplitudes positivas.');
  const lo = [departureJdTdb - halfSpanDepartureDays, tofDays - halfSpanTofDays], hi = [departureJdTdb + halfSpanDepartureDays, tofDays + halfSpanTofDays];
  let evaluations = 0;
  const f = ([dep, tof]) => {
    evaluations++;
    const o = window.stateAt(originId, dep), d = window.stateAt(destinationId, dep + tof);
    if (o.status !== 'available' || d.status !== 'available' || !(tof > 1)) return Infinity;
    const cell = solveCell(o, d, tof);
    return cell.code === CELL.ok ? score(criterion, cell.dep.c3Km2S2, cell.arr.magnitudeKmS) : Infinity;
  };
  const clamp = p => p.map((x, i) => Math.min(hi[i], Math.max(lo[i], x)));
  let simplex = [[departureJdTdb, tofDays], [departureJdTdb + halfSpanDepartureDays / 2, tofDays], [departureJdTdb, tofDays + halfSpanTofDays / 2]].map(clamp).map(p => ({ p, v: f(p) }));
  const start = simplex[0].v;
  while (evaluations < maxEvaluations) {
    simplex.sort((a, b) => a.v - b.v);
    const [best, mid, worst] = simplex;
    if (Math.abs(worst.v - best.v) <= 1e-10 * Math.max(1, Math.abs(best.v)) && Math.hypot(worst.p[0] - best.p[0], worst.p[1] - best.p[1]) < 1e-6) break;
    const c = [(best.p[0] + mid.p[0]) / 2, (best.p[1] + mid.p[1]) / 2];
    const at = k => clamp([c[0] + k * (worst.p[0] - c[0]), c[1] + k * (worst.p[1] - c[1])]);
    const r = { p: at(-1) }; r.v = f(r.p);
    if (r.v < best.v) { const e = { p: at(-2) }; e.v = f(e.p); simplex[2] = e.v < r.v ? e : r; }
    else if (r.v < mid.v) simplex[2] = r;
    else { const k = { p: at(0.5) }; k.v = f(k.p); if (k.v < worst.v) simplex[2] = k; else simplex = [best, ...[mid, worst].map(s => { const p = [(s.p[0] + best.p[0]) / 2, (s.p[1] + best.p[1]) / 2]; return { p, v: f(p) }; })]; }
  }
  simplex.sort((a, b) => a.v - b.v);
  const [dep, tof] = simplex[0].p;
  const edge = (x, a, b, span) => Math.min(x - a, b - x) < 1e-3 * span;
  return Object.freeze({ departureJdTdb: dep, tofDays: tof, arrivalJdTdb: dep + tof, score: simplex[0].v, gridScore: start, evaluations, criterion,
    atRefinementBoundary: edge(dep, lo[0], hi[0], halfSpanDepartureDays) || edge(tof, lo[1], hi[1], halfSpanTofDays),
    note: 'Refinado localmente (Nelder–Mead) dentro de ± media celda del mejor candidato de la cuadrícula: sigue siendo el mejor del intervalo examinado, no un óptimo global.' });
}

/** OBS-12G-03: diagnóstico de bordes de un candidato respecto a la cuadrícula y a la cobertura de efemérides. */
export function candidateEdgeDiagnostics(search, candidate, coverage) {
  const o = search.options, i = Math.round((candidate.departureJdTdb - o.departureStartJdTdb) / o.departureStepDays), j = Math.round((candidate.tofDays - o.tofMinDays) / o.tofStepDays);
  const warnings = [];
  if (i === 0 || i === o.departureCount - 1) warnings.push('Mínimo en el borde del intervalo de salida examinado: el valle puede continuar fuera; amplía las fechas de salida.');
  if (j === 0 || j === o.tofCount - 1) warnings.push('Mínimo en el borde del intervalo de tiempos de vuelo: amplía el rango de duración.');
  const atCoverage = coverage && (candidate.arrivalJdTdb >= coverage.endJdTdb - Math.max(o.tofStepDays, o.departureStepDays) || candidate.departureJdTdb <= coverage.startJdTdb + o.departureStepDays);
  if (atCoverage) warnings.push('Mínimo junto al LÍMITE DE COBERTURA de las efemérides: no puede ampliarse la búsqueda sin adquirir datos nuevos (no se extrapola).');
  return { atDepartureEdge: i === 0 || i === o.departureCount - 1, atTofEdge: j === 0 || j === o.tofCount - 1, atCoverageLimit: Boolean(atCoverage), warnings };
}
