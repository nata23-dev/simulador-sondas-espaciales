import { HORIZONS_FRAME, requireVector3 } from './Frames.js';
import { SUN_BODY_ID } from './GravitationalParameters.js';
import { requireJdTdb, secondsBetweenJdTdb } from './Time.js';
import { requireFiniteNumber, SECONDS_PER_DAY } from './Units.js';

export const ACCELERATION_UNIT = 'km/s^2';

export const DYNAMICAL_MODELS = Object.freeze({
  TWO_BODY_CENTRAL: 'two-body-central',
  PRESCRIBED_EPHEMERIS_HELIOCENTRIC_PROBE: 'prescribed-ephemeris-heliocentric-probe',
  MUTUAL_NBODY_INERTIAL: 'mutual-nbody-inertial'
});

export class DynamicsError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'DynamicsError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

function requirePositiveParam(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new DynamicsError(
      'INVALID_PARAMETER',
      `${name} debe ser un número finito estrictamente positivo.`,
      { parameter: name, value }
    );
  }
  return value;
}

function requireFiniteVectorComponents(vector, name) {
  if (vector === null || typeof vector !== 'object' || Array.isArray(vector)) {
    throw new DynamicsError(
      'NON_FINITE_VECTOR',
      `${name} debe ser un objeto vectorial con componentes x, y, z.`,
      { vector: name }
    );
  }
  const { x, y, z } = vector;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number'
    || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    throw new DynamicsError(
      'NON_FINITE_VECTOR',
      `${name} contiene componentes no finitas.`,
      { vector: name, x, y, z }
    );
  }
  return vector;
}

function checkDistanceSafety(distanceKm, minDistanceKm, bodyId, context) {
  if (!Number.isFinite(distanceKm)) {
    throw new DynamicsError(
      'NON_FINITE_VECTOR',
      `Distancia no finita al evaluar ${context} respecto al cuerpo ${bodyId}.`,
      { bodyId, context, distanceKm }
    );
  }
  if (distanceKm === 0) {
    throw new DynamicsError(
      'SINGULARITY',
      `Singularidad gravitacional: distancia nula respecto al cuerpo ${bodyId} (${context}).`,
      { bodyId, context, distanceKm }
    );
  }
  if (distanceKm <= minDistanceKm) {
    throw new DynamicsError(
      'CLOSE_APPROACH_LIMIT',
      `Aproximación excesiva al cuerpo ${bodyId}: distancia ${distanceKm} km <= umbral mínimo ${minDistanceKm} km.`,
      { bodyId, context, distanceKm, minDistanceKm }
    );
  }
}

/**
 * Aceleración gravitacional del problema aislado de dos cuerpos:
 *   a = -mu * r / |r|^3
 * Posición en km, velocidad opcional validada en km/s, aceleración en km/s^2.
 */
export function computeTwoBodyAcceleration({
  positionKm,
  velocityKmPerS = null,
  muKm3PerS2,
  minDistanceKm = 1e-9,
  centralBodyId = 'central'
}) {
  requireFiniteVectorComponents(positionKm, 'positionKm');
  if (velocityKmPerS !== null) {
    requireFiniteVectorComponents(velocityKmPerS, 'velocityKmPerS');
  }
  requirePositiveParam(muKm3PerS2, 'muKm3PerS2');
  requirePositiveParam(minDistanceKm, 'minDistanceKm');

  const rx = positionKm.x;
  const ry = positionKm.y;
  const rz = positionKm.z;
  const r2 = rx * rx + ry * ry + rz * rz;
  const r = Math.hypot(rx, ry, rz);
  checkDistanceSafety(r, minDistanceKm, centralBodyId, 'problema de dos cuerpos');

  const factor = -muKm3PerS2 / (r2 * r);
  const ax = factor * rx;
  const ay = factor * ry;
  const az = factor * rz;
  if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(az)) {
    throw new DynamicsError(
      'SINGULARITY',
      `Desbordamiento numérico al calcular aceleración respecto a ${centralBodyId}.`,
      { centralBodyId, r }
    );
  }

  return Object.freeze({ x: ax, y: ay, z: az, unit: ACCELERATION_UNIT });
}

/**
 * Energía mecánica específica del problema aislado de dos cuerpos:
 *   epsilon = |v|^2 / 2 - mu / |r|   [km^2 / s^2]
 */
export function computeSpecificMechanicalEnergy({ positionKm, velocityKmPerS, muKm3PerS2 }) {
  requireFiniteVectorComponents(positionKm, 'positionKm');
  requireFiniteVectorComponents(velocityKmPerS, 'velocityKmPerS');
  requirePositiveParam(muKm3PerS2, 'muKm3PerS2');
  const r = Math.hypot(positionKm.x, positionKm.y, positionKm.z);
  checkDistanceSafety(r, 0, 'central', 'energía mecánica específica');
  const v2 = velocityKmPerS.x * velocityKmPerS.x
    + velocityKmPerS.y * velocityKmPerS.y
    + velocityKmPerS.z * velocityKmPerS.z;
  return 0.5 * v2 - muKm3PerS2 / r;
}

/**
 * Momento angular específico del problema aislado de dos cuerpos:
 *   h = r x v   [km^2 / s]
 */
export function computeSpecificAngularMomentum({ positionKm, velocityKmPerS }) {
  requireFiniteVectorComponents(positionKm, 'positionKm');
  requireFiniteVectorComponents(velocityKmPerS, 'velocityKmPerS');
  const hx = positionKm.y * velocityKmPerS.z - positionKm.z * velocityKmPerS.y;
  const hy = positionKm.z * velocityKmPerS.x - positionKm.x * velocityKmPerS.z;
  const hz = positionKm.x * velocityKmPerS.y - positionKm.y * velocityKmPerS.x;
  return Object.freeze({
    x: hx,
    y: hy,
    z: hz,
    magnitude: Math.hypot(hx, hy, hz),
    unit: 'km^2/s'
  });
}

/**
 * Crea la función derivada de estado de 6 componentes `[x, y, z, vx, vy, vz]`
 * para el problema de dos cuerpos usando `Float64Array`.
 */
export function createTwoBodyDerivative({
  muKm3PerS2,
  minDistanceKm = 1e-9,
  centralBodyId = 'central'
}) {
  requirePositiveParam(muKm3PerS2, 'muKm3PerS2');
  requirePositiveParam(minDistanceKm, 'minDistanceKm');

  return function twoBodyDerivative(elapsedSeconds, state, outDerivative) {
    if (!Number.isFinite(elapsedSeconds)) {
      throw new DynamicsError('INVALID_PARAMETER', 'elapsedSeconds debe ser finito.', { elapsedSeconds });
    }
    const rx = state[0];
    const ry = state[1];
    const rz = state[2];
    const vx = state[3];
    const vy = state[4];
    const vz = state[5];
    if (!Number.isFinite(rx) || !Number.isFinite(ry) || !Number.isFinite(rz)
      || !Number.isFinite(vx) || !Number.isFinite(vy) || !Number.isFinite(vz)) {
      throw new DynamicsError('NON_FINITE_VECTOR', 'El vector de estado contiene valores no finitos.');
    }
    const r2 = rx * rx + ry * ry + rz * rz;
    const r = Math.hypot(rx, ry, rz);
    checkDistanceSafety(r, minDistanceKm, centralBodyId, 'derivada de dos cuerpos');
    const factor = -muKm3PerS2 / (r2 * r);
    const ax = factor * rx;
    const ay = factor * ry;
    const az = factor * rz;
    if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(az)) {
      throw new DynamicsError('SINGULARITY', 'Aceleración no finita en dos cuerpos.', { r });
    }
    outDerivative[0] = vx;
    outDerivative[1] = vy;
    outDerivative[2] = vz;
    outDerivative[3] = ax;
    outDerivative[4] = ay;
    outDerivative[5] = az;
    return outDerivative;
  };
}

/**
 * Identidad exacta de Battin f(q) = ((1 + q)^(3/2) - 1) para evitar cancelación
 * catastrófica entre el término directo y el término indirecto cuando |q| <= 0.5:
 *   (1 + q)^(3/2) - 1 = q * (3 + 3q + q^2) / (1 + (1 + q)^(3/2))
 */
function battinDeltaFactor(q) {
  const onePlusQ = 1 + q;
  const a = onePlusQ * Math.sqrt(onePlusQ);
  return q * (3 + q * (3 + q)) / (1 + a);
}

/**
 * Valida que un estado u opciones sean coherentes con el marco heliocéntrico
 * `SUN_CENTER` / `ICRF_ECLIPTIC_J2000`. Impide usar coordenadas baricéntricas o
 * desconocidas haciéndolas pasar por heliocéntricas.
 */
export function assertHeliocentricFrameCompatibility({
  origin = HORIZONS_FRAME.origin,
  frameId = HORIZONS_FRAME.id
} = {}) {
  if (origin !== HORIZONS_FRAME.origin || frameId !== HORIZONS_FRAME.id) {
    throw new DynamicsError(
      'INCOMPATIBLE_STATE',
      `Marco u origen incompatible con la formulación heliocéntrica: origin=${origin}, frameId=${frameId}.`,
      { origin, frameId, expectedOrigin: HORIZONS_FRAME.origin, expectedFrameId: HORIZONS_FRAME.id }
    );
  }
}

/**
 * Modelo A: Aceleración gravitacional sobre una sonda de masa despreciable en el
 * marco heliocéntrico no rotante (`SUN_CENTER`, `ICRF_ECLIPTIC_J2000`) bajo el Sol
 * y perturbadores con efemérides prescritas:
 *
 *   r'' = -mu_sun * r / |r|^3 + sum_j mu_j * [ (r_j - r) / |r_j - r|^3 - r_j / |r_j|^3 ]
 *
 * El segundo término dentro de la suma (`-mu_j * r_j / |r_j|^3`) es la aceleración
 * indirecta debida a la aceleración gravitacional del origen solar provocada por los
 * cuerpos perturbadores.
 */
export function evaluateHeliocentricProbeAcceleration({
  positionKm,
  velocityKmPerS = null,
  elapsedSeconds = 0,
  origin = HORIZONS_FRAME.origin,
  frameId = HORIZONS_FRAME.id,
  centralBodyId = SUN_BODY_ID,
  perturbingBodyIds = [],
  catalog,
  getBodyPositionKm,
  includeIndirectTerms = true,
  minDistanceOverridesKm = null,
  includeBreakdown = false
}) {
  assertHeliocentricFrameCompatibility({ origin, frameId });
  if (centralBodyId !== SUN_BODY_ID) {
    throw new DynamicsError(
      'INCOMPATIBLE_STATE',
      `El modelo heliocéntrico centrado en SUN_CENTER requiere centralBodyId='${SUN_BODY_ID}'; recibido '${centralBodyId}'.`,
      { centralBodyId }
    );
  }
  requireFiniteVectorComponents(positionKm, 'positionKm');
  if (velocityKmPerS !== null) {
    requireFiniteVectorComponents(velocityKmPerS, 'velocityKmPerS');
  }
  if (typeof elapsedSeconds !== 'number' || !Number.isFinite(elapsedSeconds)) {
    throw new DynamicsError('INVALID_PARAMETER', 'elapsedSeconds debe ser un número finito.', { elapsedSeconds });
  }
  if (!catalog || typeof catalog.getParameter !== 'function') {
    throw new DynamicsError('INVALID_PARAMETER', 'Se requiere un catálogo de parámetros gravitacionales válido.');
  }
  if (!Array.isArray(perturbingBodyIds)) {
    throw new DynamicsError('INVALID_PARAMETER', 'perturbingBodyIds debe ser un arreglo.');
  }
  if (perturbingBodyIds.length > 0 && typeof getBodyPositionKm !== 'function') {
    throw new DynamicsError('MISSING_EPHEMERIS', 'Se requiere getBodyPositionKm para evaluar cuerpos perturbadores.');
  }

  let sunParam;
  try {
    sunParam = catalog.getParameter(SUN_BODY_ID);
  } catch (cause) {
    throw new DynamicsError('INVALID_PARAMETER', cause.message, { bodyId: SUN_BODY_ID });
  }
  const minSunKm = minDistanceOverridesKm?.[SUN_BODY_ID] !== undefined
    ? requirePositiveParam(minDistanceOverridesKm[SUN_BODY_ID], `minDistanceOverridesKm.${SUN_BODY_ID}`)
    : sunParam.minSafeDistanceKm;

  const rx = positionKm.x;
  const ry = positionKm.y;
  const rz = positionKm.z;
  const r2 = rx * rx + ry * ry + rz * rz;
  const r = Math.hypot(rx, ry, rz);
  checkDistanceSafety(r, minSunKm, SUN_BODY_ID, 'atracción solar central');

  const sunFactor = -sunParam.muKm3PerS2 / (r2 * r);
  const centralX = sunFactor * rx;
  const centralY = sunFactor * ry;
  const centralZ = sunFactor * rz;

  let directTotalX = 0;
  let directTotalY = 0;
  let directTotalZ = 0;
  let indirectTotalX = 0;
  let indirectTotalY = 0;
  let indirectTotalZ = 0;
  let perturbTotalX = 0;
  let perturbTotalY = 0;
  let perturbTotalZ = 0;
  const perBody = includeBreakdown ? {} : null;
  const seen = new Set();

  for (const bodyId of perturbingBodyIds) {
    if (bodyId === SUN_BODY_ID) {
      throw new DynamicsError('INVALID_PARAMETER', 'El Sol no debe duplicarse en perturbingBodyIds.', { bodyId });
    }
    if (seen.has(bodyId)) {
      throw new DynamicsError('INVALID_PARAMETER', `Cuerpo perturbador duplicado: ${bodyId}.`, { bodyId });
    }
    seen.add(bodyId);

    let bodyParam;
    try {
      bodyParam = catalog.getParameter(bodyId);
    } catch (cause) {
      throw new DynamicsError('INVALID_PARAMETER', cause.message, { bodyId });
    }
    const minBodyKm = minDistanceOverridesKm?.[bodyId] !== undefined
      ? requirePositiveParam(minDistanceOverridesKm[bodyId], `minDistanceOverridesKm.${bodyId}`)
      : bodyParam.minSafeDistanceKm;

    const bodyPos = getBodyPositionKm(bodyId, elapsedSeconds);
    if (!bodyPos) {
      throw new DynamicsError(
        'MISSING_EPHEMERIS',
        `Falta posición de efemérides para el cuerpo ${bodyId} en t=${elapsedSeconds} s.`,
        { bodyId, elapsedSeconds }
      );
    }
    if (bodyPos.origin !== undefined && bodyPos.origin !== HORIZONS_FRAME.origin) {
      throw new DynamicsError(
        'INCOMPATIBLE_STATE',
        `La efeméride de ${bodyId} tiene origen incompatible: ${bodyPos.origin}.`,
        { bodyId, origin: bodyPos.origin }
      );
    }
    if (bodyPos.frameId !== undefined && bodyPos.frameId !== HORIZONS_FRAME.id) {
      throw new DynamicsError(
        'INCOMPATIBLE_STATE',
        `La efeméride de ${bodyId} tiene marco incompatible: ${bodyPos.frameId}.`,
        { bodyId, frameId: bodyPos.frameId }
      );
    }
    requireFiniteVectorComponents(bodyPos, `ephemeris(${bodyId})`);

    const rjx = bodyPos.x;
    const rjy = bodyPos.y;
    const rjz = bodyPos.z;
    const rj2 = rjx * rjx + rjy * rjy + rjz * rjz;
    const rj = Math.hypot(rjx, rjy, rjz);
    checkDistanceSafety(rj, minSunKm, bodyId, 'distancia heliocéntrica del cuerpo perturbador');

    // Vector desde el planeta j hacia la sonda: d_j = r - r_j
    const dx = rx - rjx;
    const dy = ry - rjy;
    const dz = rz - rjz;
    const d2 = dx * dx + dy * dy + dz * dz;
    const d = Math.hypot(dx, dy, dz);
    checkDistanceSafety(d, minBodyKm, bodyId, 'aproximación sonda-planeta');

    const mu = bodyParam.muKm3PerS2;
    const invD3 = 1 / (d2 * d);
    const invRj3 = 1 / (rj2 * rj);

    const directX = -mu * dx * invD3;
    const directY = -mu * dy * invD3;
    const directZ = -mu * dz * invD3;

    const indirectX = includeIndirectTerms ? -mu * rjx * invRj3 : 0;
    const indirectY = includeIndirectTerms ? -mu * rjy * invRj3 : 0;
    const indirectZ = includeIndirectTerms ? -mu * rjz * invRj3 : 0;

    let bodyPertX;
    let bodyPertY;
    let bodyPertZ;
    if (includeIndirectTerms) {
      const q = (rx * (rx - 2 * rjx) + ry * (ry - 2 * rjy) + rz * (rz - 2 * rjz)) / rj2;
      if (Math.abs(q) <= 0.5 && 1 + q > 0) {
        const fq = battinDeltaFactor(q);
        const coeff = -mu * invD3;
        bodyPertX = coeff * (rx + fq * rjx);
        bodyPertY = coeff * (ry + fq * rjy);
        bodyPertZ = coeff * (rz + fq * rjz);
      } else {
        bodyPertX = directX + indirectX;
        bodyPertY = directY + indirectY;
        bodyPertZ = directZ + indirectZ;
      }
    } else {
      bodyPertX = directX;
      bodyPertY = directY;
      bodyPertZ = directZ;
    }

    directTotalX += directX;
    directTotalY += directY;
    directTotalZ += directZ;
    indirectTotalX += indirectX;
    indirectTotalY += indirectY;
    indirectTotalZ += indirectZ;
    perturbTotalX += bodyPertX;
    perturbTotalY += bodyPertY;
    perturbTotalZ += bodyPertZ;

    if (includeBreakdown) {
      perBody[bodyId] = Object.freeze({
        direct: Object.freeze({ x: directX, y: directY, z: directZ, unit: ACCELERATION_UNIT }),
        indirect: Object.freeze({ x: indirectX, y: indirectY, z: indirectZ, unit: ACCELERATION_UNIT }),
        total: Object.freeze({ x: bodyPertX, y: bodyPertY, z: bodyPertZ, unit: ACCELERATION_UNIT }),
        distanceToProbeKm: d,
        distanceToSunKm: rj
      });
    }
  }

  const totalX = centralX + perturbTotalX;
  const totalY = centralY + perturbTotalY;
  const totalZ = centralZ + perturbTotalZ;
  if (!Number.isFinite(totalX) || !Number.isFinite(totalY) || !Number.isFinite(totalZ)) {
    throw new DynamicsError('NON_FINITE_VECTOR', 'La aceleración total calculada no es finita.');
  }

  const total = Object.freeze({ x: totalX, y: totalY, z: totalZ, unit: ACCELERATION_UNIT });
  if (!includeBreakdown) return total;

  return Object.freeze({
    total,
    central: Object.freeze({ x: centralX, y: centralY, z: centralZ, unit: ACCELERATION_UNIT }),
    directPerturbation: Object.freeze({ x: directTotalX, y: directTotalY, z: directTotalZ, unit: ACCELERATION_UNIT }),
    indirectPerturbation: Object.freeze({ x: indirectTotalX, y: indirectTotalY, z: indirectTotalZ, unit: ACCELERATION_UNIT }),
    totalPerturbation: Object.freeze({ x: perturbTotalX, y: perturbTotalY, z: perturbTotalZ, unit: ACCELERATION_UNIT }),
    perBody: Object.freeze(perBody),
    includeIndirectTerms: Boolean(includeIndirectTerms)
  });
}

/**
 * Modelo B (extensibilidad arquitectónica): evaluación de aceleraciones mutuas
 * para un sistema de N cuerpos masivos en un marco INERCIAL / BARICÉNTRICO (`SSB`).
 * Rechaza explícitamente vectores heliocéntricos (`SUN_CENTER`) para impedir que
 * un estado con origen acelerado se evalúe con una ecuación baricéntrica.
 */
export function evaluateInertialMutualAccelerations({
  origin,
  frameId = HORIZONS_FRAME.id,
  bodies,
  catalog,
  minDistanceOverridesKm = null
}) {
  if (origin === HORIZONS_FRAME.origin) {
    throw new DynamicsError(
      'INCOMPATIBLE_STATE',
      'No se puede usar la formulación baricéntrica mutua (Modelo B) directamente en coordenadas heliocéntricas SUN_CENTER.',
      { origin }
    );
  }
  if (origin !== 'SOLAR_SYSTEM_BARYCENTER' && origin !== 'INERTIAL_ORIGIN') {
    throw new DynamicsError(
      'INCOMPATIBLE_STATE',
      `Origen no inercial o desconocido para Modelo B: ${origin}.`,
      { origin }
    );
  }
  if (frameId !== HORIZONS_FRAME.id) {
    throw new DynamicsError('INCOMPATIBLE_STATE', `Marco incompatible: ${frameId}.`, { frameId });
  }
  if (!Array.isArray(bodies) || bodies.length < 2) {
    throw new DynamicsError('INVALID_PARAMETER', 'El Modelo B mutuo requiere al menos 2 cuerpos.');
  }

  const count = bodies.length;
  const mus = new Float64Array(count);
  const mins = new Float64Array(count);
  const acc = new Float64Array(count * 3);

  for (let i = 0; i < count; i++) {
    const body = bodies[i];
    if (!body || typeof body.bodyId !== 'string') {
      throw new DynamicsError('INVALID_PARAMETER', `bodies[${i}] requiere bodyId.`);
    }
    requireFiniteVectorComponents(body.positionKm, `bodies[${i}].positionKm`);
    const param = catalog.getParameter(body.bodyId);
    mus[i] = param.muKm3PerS2;
    mins[i] = minDistanceOverridesKm?.[body.bodyId] ?? param.minSafeDistanceKm;
  }

  for (let i = 0; i < count; i++) {
    const pi = bodies[i].positionKm;
    for (let j = i + 1; j < count; j++) {
      const pj = bodies[j].positionKm;
      const dx = pj.x - pi.x;
      const dy = pj.y - pi.y;
      const dz = pj.z - pi.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      const d = Math.hypot(dx, dy, dz);
      checkDistanceSafety(d, Math.max(mins[i], mins[j]), `${bodies[i].bodyId}-${bodies[j].bodyId}`, 'interacción mutua');
      const invD3 = 1 / (d2 * d);
      const fi = mus[j] * invD3;
      const fj = mus[i] * invD3;
      acc[i * 3] += fi * dx;
      acc[i * 3 + 1] += fi * dy;
      acc[i * 3 + 2] += fi * dz;
      acc[j * 3] -= fj * dx;
      acc[j * 3 + 1] -= fj * dy;
      acc[j * 3 + 2] -= fj * dz;
    }
  }

  return Object.freeze(bodies.map((body, i) => Object.freeze({
    bodyId: body.bodyId,
    acceleration: Object.freeze({
      x: acc[i * 3],
      y: acc[i * 3 + 1],
      z: acc[i * 3 + 2],
      unit: ACCELERATION_UNIT
    })
  })));
}

function binarySearchInterval(times, t, hintIndex) {
  const last = times.length - 1;
  if (hintIndex >= 0 && hintIndex < last && t >= times[hintIndex] && t <= times[hintIndex + 1]) {
    return hintIndex;
  }
  let low = 0;
  let high = last;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (times[mid] <= t) low = mid;
    else high = mid;
  }
  return low;
}

/**
 * Construye una ventana síncrona e inmutable de efemérides prescritas en
 * `Float64Array` indexada por segundos relativos a `epochJdTdb`.
 *
 * - Verifica cobertura, conflictos, huecos, origen (`SUN_CENTER`) y marco (`ICRF_ECLIPTIC_J2000`).
 * - Utiliza exactamente la misma formulación cúbica de Hermite que `HermiteInterpolation.js`.
 * - No extrapola jamás: cualquier consulta fuera de cobertura lanza `OUTSIDE_EPHEMERIS_COVERAGE`.
 * - No muta los estados del proveedor.
 */
export async function preparePrescribedEphemerisField({
  provider,
  bodyIds,
  epochJdTdb,
  startJdTdb,
  endJdTdb,
  maxIntervalSeconds = SECONDS_PER_DAY
}) {
  if (!provider || typeof provider.getCoverage !== 'function' || typeof provider.getRange !== 'function') {
    throw new DynamicsError('MISSING_EPHEMERIS', 'Se requiere un EphemerisProvider válido.');
  }
  if (!Array.isArray(bodyIds) || bodyIds.length === 0) {
    throw new DynamicsError('INVALID_PARAMETER', 'bodyIds debe ser una lista no vacía.');
  }
  requireJdTdb(epochJdTdb);
  requireJdTdb(startJdTdb);
  requireJdTdb(endJdTdb);
  requirePositiveParam(maxIntervalSeconds, 'maxIntervalSeconds');
  if (endJdTdb < startJdTdb) {
    throw new DynamicsError('INVALID_PARAMETER', 'endJdTdb debe ser mayor o igual que startJdTdb.', {
      startJdTdb,
      endJdTdb
    });
  }

  const uniqueBodyIds = [...new Set(bodyIds)];
  if (uniqueBodyIds.length !== bodyIds.length) {
    throw new DynamicsError('INVALID_PARAMETER', 'bodyIds no debe contener duplicados.');
  }

  const padDays = maxIntervalSeconds / SECONDS_PER_DAY + 1e-6;
  const bodyTables = [];
  const tableByBodyId = new Map();
  let effectiveStartJd = -Infinity;
  let effectiveEndJd = Infinity;

  for (const bodyId of uniqueBodyIds) {
    const coverage = await provider.getCoverage(bodyId);
    if (coverage.conflicts.length > 0) {
      throw new DynamicsError(
        'EPHEMERIS_CONFLICT',
        `Existen efemérides contradictorias para el cuerpo ${bodyId}.`,
        { bodyId, conflictCount: coverage.conflicts.length }
      );
    }
    if (coverage.segments.length === 0) {
      throw new DynamicsError(
        'MISSING_EPHEMERIS',
        `No existen muestras de efemérides para el cuerpo ${bodyId}.`,
        { bodyId }
      );
    }

    const coveringSegment = coverage.segments.find(
      segment => segment.startJdTdb <= startJdTdb && segment.endJdTdb >= endJdTdb
    );
    if (!coveringSegment) {
      const minAvailable = coverage.segments[0].startJdTdb;
      const maxAvailable = coverage.segments.at(-1).endJdTdb;
      const isGap = startJdTdb >= minAvailable && endJdTdb <= maxAvailable;
      throw new DynamicsError(
        isGap ? 'EPHEMERIS_GAP' : 'OUTSIDE_EPHEMERIS_COVERAGE',
        isGap
          ? `Hueco de cobertura en las efemérides de ${bodyId} dentro de [${startJdTdb}, ${endJdTdb}] JD TDB.`
          : `Instante fuera de cobertura de efemérides para ${bodyId}: solicitado [${startJdTdb}, ${endJdTdb}], disponible [${minAvailable}, ${maxAvailable}] JD TDB.`,
        { bodyId, requestedStartJdTdb: startJdTdb, requestedEndJdTdb: endJdTdb, minAvailable, maxAvailable }
      );
    }

    const queryStart = Math.max(coveringSegment.startJdTdb, startJdTdb - padDays);
    const queryEnd = Math.min(coveringSegment.endJdTdb, endJdTdb + padDays);
    const rangeResults = await provider.getRange(bodyId, queryStart, queryEnd);

    const states = rangeResults.map(item => {
      if (item.status === 'conflict') {
        throw new DynamicsError('EPHEMERIS_CONFLICT', `Conflicto de efemérides para ${bodyId} en JD ${item.jdTdb}.`, {
          bodyId,
          jdTdb: item.jdTdb
        });
      }
      if (item.status !== 'found') {
        throw new DynamicsError('MISSING_EPHEMERIS', `Muestra faltante para ${bodyId} en JD ${item.jdTdb}.`, {
          bodyId,
          jdTdb: item.jdTdb
        });
      }
      const st = item.state;
      assertHeliocentricFrameCompatibility({ origin: st.identity.origin, frameId: st.reference.id });
      return st;
    });

    if (states.length === 0) {
      throw new DynamicsError('MISSING_EPHEMERIS', `Sin estados de efemérides para ${bodyId}.`, { bodyId });
    }
    const firstSampleJd = states[0].time.jdTdb;
    const lastSampleJd = states.at(-1).time.jdTdb;
    if (startJdTdb < firstSampleJd || endJdTdb > lastSampleJd) {
      throw new DynamicsError(
        'OUTSIDE_EPHEMERIS_COVERAGE',
        `Las muestras cargadas para ${bodyId} ([${firstSampleJd}, ${lastSampleJd}]) no cubren [${startJdTdb}, ${endJdTdb}].`,
        { bodyId, firstSampleJd, lastSampleJd, startJdTdb, endJdTdb }
      );
    }

    const count = states.length;
    const timesSeconds = new Float64Array(count);
    const jds = new Float64Array(count);
    const positionsKm = new Float64Array(count * 3);
    const velocitiesKmPerS = new Float64Array(count * 3);

    for (let i = 0; i < count; i++) {
      const st = states[i];
      jds[i] = st.time.jdTdb;
      timesSeconds[i] = secondsBetweenJdTdb(epochJdTdb, st.time.jdTdb);
      if (i > 0) {
        const dt = timesSeconds[i] - timesSeconds[i - 1];
        if (dt <= 0) {
          throw new DynamicsError('INCOMPATIBLE_STATE', `Muestras no crecientes para ${bodyId}.`, { bodyId });
        }
        if (dt > maxIntervalSeconds + 1e-3) {
          throw new DynamicsError(
            'EPHEMERIS_GAP',
            `El intervalo entre muestras de ${bodyId} (${dt} s) excede maxIntervalSeconds (${maxIntervalSeconds} s).`,
            { bodyId, intervalSeconds: dt, maxIntervalSeconds }
          );
        }
      }
      positionsKm[i * 3] = st.position.x;
      positionsKm[i * 3 + 1] = st.position.y;
      positionsKm[i * 3 + 2] = st.position.z;
      velocitiesKmPerS[i * 3] = st.velocity.x;
      velocitiesKmPerS[i * 3 + 1] = st.velocity.y;
      velocitiesKmPerS[i * 3 + 2] = st.velocity.z;
    }

    effectiveStartJd = Math.max(effectiveStartJd, firstSampleJd);
    effectiveEndJd = Math.min(effectiveEndJd, lastSampleJd);

    const table = {
      bodyId,
      sampleCount: count,
      jds,
      timesSeconds,
      positionsKm,
      velocitiesKmPerS,
      startSeconds: timesSeconds[0],
      endSeconds: timesSeconds[count - 1],
      startJdTdb: firstSampleJd,
      endJdTdb: lastSampleJd,
      source: states[0].provenance.source,
      datasetId: states[0].provenance.sourceMetadata.ephemerisDatasetId ?? coveringSegment.datasetId,
      lastHintIndex: 0
    };
    bodyTables.push(table);
    tableByBodyId.set(bodyId, table);
  }

  const coverageStartSeconds = secondsBetweenJdTdb(epochJdTdb, effectiveStartJd);
  const coverageEndSeconds = secondsBetweenJdTdb(epochJdTdb, effectiveEndJd);

  function evaluateTableInto(table, elapsedSeconds, outPos3, outVel3 = null) {
    if (typeof elapsedSeconds !== 'number' || !Number.isFinite(elapsedSeconds)) {
      throw new DynamicsError('INVALID_PARAMETER', 'elapsedSeconds debe ser un número finito.', { elapsedSeconds });
    }
    if (elapsedSeconds < table.startSeconds || elapsedSeconds > table.endSeconds) {
      throw new DynamicsError(
        'OUTSIDE_EPHEMERIS_COVERAGE',
        `Consulta fuera de cobertura para ${table.bodyId}: t=${elapsedSeconds} s no pertenece a [${table.startSeconds}, ${table.endSeconds}] s.`,
        {
          bodyId: table.bodyId,
          elapsedSeconds,
          minSeconds: table.startSeconds,
          maxSeconds: table.endSeconds
        }
      );
    }
    const { timesSeconds, positionsKm, velocitiesKmPerS, sampleCount } = table;
    if (sampleCount === 1) {
      outPos3[0] = positionsKm[0];
      outPos3[1] = positionsKm[1];
      outPos3[2] = positionsKm[2];
      if (outVel3) {
        outVel3[0] = velocitiesKmPerS[0];
        outVel3[1] = velocitiesKmPerS[1];
        outVel3[2] = velocitiesKmPerS[2];
      }
      return true;
    }

    const idx = binarySearchInterval(timesSeconds, elapsedSeconds, table.lastHintIndex);
    table.lastHintIndex = idx;
    const t0 = timesSeconds[idx];
    const t1 = timesSeconds[idx + 1];
    const i0 = idx * 3;
    const i1 = (idx + 1) * 3;

    if (elapsedSeconds === t0) {
      outPos3[0] = positionsKm[i0];
      outPos3[1] = positionsKm[i0 + 1];
      outPos3[2] = positionsKm[i0 + 2];
      if (outVel3) {
        outVel3[0] = velocitiesKmPerS[i0];
        outVel3[1] = velocitiesKmPerS[i0 + 1];
        outVel3[2] = velocitiesKmPerS[i0 + 2];
      }
      return true;
    }
    if (elapsedSeconds === t1) {
      outPos3[0] = positionsKm[i1];
      outPos3[1] = positionsKm[i1 + 1];
      outPos3[2] = positionsKm[i1 + 2];
      if (outVel3) {
        outVel3[0] = velocitiesKmPerS[i1];
        outVel3[1] = velocitiesKmPerS[i1 + 1];
        outVel3[2] = velocitiesKmPerS[i1 + 2];
      }
      return true;
    }

    const duration = t1 - t0;
    const u = (elapsedSeconds - t0) / duration;
    const u2 = u * u;
    const oneMinusU = 1 - u;
    const h01 = u2 * (3 - 2 * u);
    const h10 = u * oneMinusU * oneMinusU;
    const h11 = -u2 * oneMinusU;

    for (let axis = 0; axis < 3; axis++) {
      const p0 = positionsKm[i0 + axis];
      const p1 = positionsKm[i1 + axis];
      const v0 = velocitiesKmPerS[i0 + axis];
      const v1 = velocitiesKmPerS[i1 + axis];
      outPos3[axis] = p0 + h01 * (p1 - p0) + duration * (h10 * v0 + h11 * v1);
    }

    if (outVel3) {
      const d00 = 6 * u * (u - 1);
      const d10 = oneMinusU * (1 - 3 * u);
      const d11 = u * (3 * u - 2);
      for (let axis = 0; axis < 3; axis++) {
        const p0 = positionsKm[i0 + axis];
        const p1 = positionsKm[i1 + axis];
        const v0 = velocitiesKmPerS[i0 + axis];
        const v1 = velocitiesKmPerS[i1 + axis];
        outVel3[axis] = d00 * (p0 - p1) / duration + d10 * v0 + d11 * v1;
      }
    }
    return false;
  }

  return Object.freeze({
    epochJdTdb,
    origin: HORIZONS_FRAME.origin,
    frameId: HORIZONS_FRAME.id,
    bodyIds: Object.freeze([...uniqueBodyIds]),
    bodyCount: bodyTables.length,
    coverage: Object.freeze({
      startJdTdb: effectiveStartJd,
      endJdTdb: effectiveEndJd,
      startSeconds: coverageStartSeconds,
      endSeconds: coverageEndSeconds
    }),
    isWithinCoverage(elapsedSeconds) {
      return typeof elapsedSeconds === 'number'
        && Number.isFinite(elapsedSeconds)
        && elapsedSeconds >= coverageStartSeconds
        && elapsedSeconds <= coverageEndSeconds;
    },
    writeBodyPositionByIndexKm(bodyIndex, elapsedSeconds, outPos3) {
      const table = bodyTables[bodyIndex];
      if (!table) {
        throw new DynamicsError('MISSING_EPHEMERIS', `Índice de cuerpo inválido: ${bodyIndex}.`, { bodyIndex });
      }
      evaluateTableInto(table, elapsedSeconds, outPos3, null);
      return outPos3;
    },
    getBodyPositionKm(bodyId, elapsedSeconds) {
      const table = tableByBodyId.get(bodyId);
      if (!table) {
        throw new DynamicsError('MISSING_EPHEMERIS', `Cuerpo no cargado en campo de efemérides: ${bodyId}.`, { bodyId });
      }
      const pos = new Float64Array(3);
      evaluateTableInto(table, elapsedSeconds, pos, null);
      return Object.freeze({
        x: pos[0],
        y: pos[1],
        z: pos[2],
        unit: 'km',
        origin: HORIZONS_FRAME.origin,
        frameId: HORIZONS_FRAME.id
      });
    },
    getBodyStateAtElapsedSeconds(bodyId, elapsedSeconds) {
      const table = tableByBodyId.get(bodyId);
      if (!table) {
        throw new DynamicsError('MISSING_EPHEMERIS', `Cuerpo no cargado en campo de efemérides: ${bodyId}.`, { bodyId });
      }
      const pos = new Float64Array(3);
      const vel = new Float64Array(3);
      const exactSample = evaluateTableInto(table, elapsedSeconds, pos, vel);
      return Object.freeze({
        bodyId,
        jdTdb: elapsedSeconds === 0 ? epochJdTdb : epochJdTdb + elapsedSeconds / SECONDS_PER_DAY,
        elapsedSeconds,
        exactSample,
        source: table.source,
        datasetId: table.datasetId,
        position: Object.freeze({ x: pos[0], y: pos[1], z: pos[2], unit: 'km' }),
        velocity: Object.freeze({ x: vel[0], y: vel[1], z: vel[2], unit: 'km/s' })
      });
    }
  });
}

/**
 * Crea la derivada ODE rápida de 6 componentes (`Float64Array`, cero asignaciones
 * en el bucle interno) para propagar una sonda heliocéntrica con efemérides prescritas.
 */
export function createHeliocentricProbeDerivative({
  catalog,
  ephemerisField = null,
  perturbingBodyIds = ephemerisField ? [...ephemerisField.bodyIds] : [],
  getBodyPositionKm = null,
  includeIndirectTerms = true,
  minDistanceOverridesKm = null
}) {
  if (!catalog || typeof catalog.getParameter !== 'function') {
    throw new DynamicsError('INVALID_PARAMETER', 'Se requiere un catálogo gravitacional válido.');
  }
  const sunParam = catalog.getParameter(SUN_BODY_ID);
  const minSunKm = minDistanceOverridesKm?.[SUN_BODY_ID] !== undefined
    ? requirePositiveParam(minDistanceOverridesKm[SUN_BODY_ID], `minDistanceOverridesKm.${SUN_BODY_ID}`)
    : sunParam.minSafeDistanceKm;
  const muSun = sunParam.muKm3PerS2;

  const count = perturbingBodyIds.length;
  const bodyMus = new Float64Array(count);
  const bodyMins = new Float64Array(count);
  const fieldIndices = ephemerisField ? new Int32Array(count) : null;
  const seen = new Set();

  for (let i = 0; i < count; i++) {
    const id = perturbingBodyIds[i];
    if (id === SUN_BODY_ID || seen.has(id)) {
      throw new DynamicsError('INVALID_PARAMETER', `perturbingBodyIds inválido o duplicado: ${id}.`, { bodyId: id });
    }
    seen.add(id);
    const param = catalog.getParameter(id);
    bodyMus[i] = param.muKm3PerS2;
    bodyMins[i] = minDistanceOverridesKm?.[id] !== undefined
      ? requirePositiveParam(minDistanceOverridesKm[id], `minDistanceOverridesKm.${id}`)
      : param.minSafeDistanceKm;
    if (ephemerisField) {
      const idx = ephemerisField.bodyIds.indexOf(id);
      if (idx < 0) {
        throw new DynamicsError('MISSING_EPHEMERIS', `El campo de efemérides no contiene el cuerpo ${id}.`, { bodyId: id });
      }
      fieldIndices[i] = idx;
    } else if (typeof getBodyPositionKm !== 'function') {
      throw new DynamicsError('MISSING_EPHEMERIS', 'Se requiere ephemerisField o getBodyPositionKm.');
    }
  }

  const scratchBodyPos = new Float64Array(3);

  return function heliocentricProbeDerivative(elapsedSeconds, state, outDerivative) {
    if (!Number.isFinite(elapsedSeconds)) {
      throw new DynamicsError('INVALID_PARAMETER', 'elapsedSeconds no finito.', { elapsedSeconds });
    }
    const rx = state[0];
    const ry = state[1];
    const rz = state[2];
    const vx = state[3];
    const vy = state[4];
    const vz = state[5];
    if (!Number.isFinite(rx) || !Number.isFinite(ry) || !Number.isFinite(rz)
      || !Number.isFinite(vx) || !Number.isFinite(vy) || !Number.isFinite(vz)) {
      throw new DynamicsError('NON_FINITE_VECTOR', 'Vector de estado no finito durante la integración.');
    }

    const r2 = rx * rx + ry * ry + rz * rz;
    const r = Math.hypot(rx, ry, rz);
    checkDistanceSafety(r, minSunKm, SUN_BODY_ID, 'atracción solar central');

    const sunFactor = -muSun / (r2 * r);
    let ax = sunFactor * rx;
    let ay = sunFactor * ry;
    let az = sunFactor * rz;

    for (let i = 0; i < count; i++) {
      const bodyId = perturbingBodyIds[i];
      let rjx;
      let rjy;
      let rjz;
      if (ephemerisField) {
        ephemerisField.writeBodyPositionByIndexKm(fieldIndices[i], elapsedSeconds, scratchBodyPos);
        rjx = scratchBodyPos[0];
        rjy = scratchBodyPos[1];
        rjz = scratchBodyPos[2];
      } else {
        const p = getBodyPositionKm(bodyId, elapsedSeconds);
        if (!p) {
          throw new DynamicsError('MISSING_EPHEMERIS', `Sin posición para ${bodyId} en t=${elapsedSeconds} s.`, {
            bodyId,
            elapsedSeconds
          });
        }
        requireFiniteVectorComponents(p, `ephemeris(${bodyId})`);
        rjx = p.x;
        rjy = p.y;
        rjz = p.z;
      }

      const rj2 = rjx * rjx + rjy * rjy + rjz * rjz;
      const rj = Math.hypot(rjx, rjy, rjz);
      checkDistanceSafety(rj, minSunKm, bodyId, 'distancia heliocéntrica del perturbador');

      const dx = rx - rjx;
      const dy = ry - rjy;
      const dz = rz - rjz;
      const d2 = dx * dx + dy * dy + dz * dz;
      const d = Math.hypot(dx, dy, dz);
      checkDistanceSafety(d, bodyMins[i], bodyId, 'aproximación sonda-planeta');

      const mu = bodyMus[i];
      const invD3 = 1 / (d2 * d);

      if (includeIndirectTerms) {
        const q = (rx * (rx - 2 * rjx) + ry * (ry - 2 * rjy) + rz * (rz - 2 * rjz)) / rj2;
        if (Math.abs(q) <= 0.5 && 1 + q > 0) {
          const fq = battinDeltaFactor(q);
          const coeff = -mu * invD3;
          ax += coeff * (rx + fq * rjx);
          ay += coeff * (ry + fq * rjy);
          az += coeff * (rz + fq * rjz);
        } else {
          const invRj3 = 1 / (rj2 * rj);
          ax += -mu * (dx * invD3 + rjx * invRj3);
          ay += -mu * (dy * invD3 + rjy * invRj3);
          az += -mu * (dz * invD3 + rjz * invRj3);
        }
      } else {
        ax += -mu * dx * invD3;
        ay += -mu * dy * invD3;
        az += -mu * dz * invD3;
      }
    }

    if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(az)) {
      throw new DynamicsError('NON_FINITE_VECTOR', 'Aceleración no finita durante la integración.');
    }

    outDerivative[0] = vx;
    outDerivative[1] = vy;
    outDerivative[2] = vz;
    outDerivative[3] = ax;
    outDerivative[4] = ay;
    outDerivative[5] = az;
    return outDerivative;
  };
}
