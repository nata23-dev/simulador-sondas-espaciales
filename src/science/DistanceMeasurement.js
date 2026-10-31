import { HORIZONS_FRAME, requireVector3 } from './Frames.js';
import { KM_PER_AU, requireFiniteNumber } from './Units.js';

export const SPEED_OF_LIGHT_KM_PER_S = 299792.458;
const MAX_EPOCH_DRIFT_DAYS = 1e-6 / 86400; // 1 microsegundo en días julianos

/**
 * Construye un descriptor de estado científico homogéneo en km para medición
 * tridimensional de distancias en el marco heliocéntrico J2000/ICRF.
 */
export function createMeasurableBodyEndpoint({
  id,
  name,
  positionKm,
  jdTdb,
  epochLabelTdb,
  origin = HORIZONS_FRAME.origin,
  frameId = HORIZONS_FRAME.id,
  source
}) {
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new TypeError('El identificador del cuerpo medible es obligatorio.');
  }
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new TypeError('El nombre del cuerpo medible es obligatorio.');
  }
  requireVector3(positionKm, 'positionKm');
  requireFiniteNumber(jdTdb, 'jdTdb');
  if (typeof epochLabelTdb !== 'string' || epochLabelTdb.trim().length === 0) {
    throw new TypeError('epochLabelTdb es obligatorio.');
  }
  if (typeof source !== 'string' || source.trim().length === 0) {
    throw new TypeError('source es obligatorio.');
  }

  return Object.freeze({
    id,
    name,
    positionKm: Object.freeze({
      x: positionKm.x,
      y: positionKm.y,
      z: positionKm.z,
      unit: 'km'
    }),
    jdTdb,
    epochLabelTdb,
    origin,
    frameId,
    source
  });
}

/**
 * Calcula la distancia euclidiana tridimensional entre dos estados científicos
 * verificando identidad distinta, disponibilidad, mismo origen, mismo marco
 * y mismo instante JD TDB. Nunca utiliza coordenadas visuales ni extrapola fechas.
 */
export function computeScientificDistance(endpointA, endpointB) {
  if (!endpointA || !endpointB) {
    return Object.freeze({
      status: 'unavailable',
      reason: 'Uno o ambos cuerpos no disponen de estado científico en el instante seleccionado.'
    });
  }

  if (endpointA.id === endpointB.id) {
    return Object.freeze({
      status: 'same_body',
      reason: 'Selecciona dos cuerpos distintos para medir su separación espacial.'
    });
  }

  if (endpointA.origin !== endpointB.origin || endpointA.frameId !== endpointB.frameId) {
    return Object.freeze({
      status: 'incompatible_reference',
      reason: `Marcos u orígenes incompatibles (${endpointA.frameId}/${endpointA.origin} vs ${endpointB.frameId}/${endpointB.origin}).`
    });
  }

  if (Math.abs(endpointA.jdTdb - endpointB.jdTdb) > MAX_EPOCH_DRIFT_DAYS) {
    return Object.freeze({
      status: 'epoch_mismatch',
      reason: `Conflicto temporal entre estados: JD ${endpointA.jdTdb} TDB vs JD ${endpointB.jdTdb} TDB.`
    });
  }

  const dx = endpointB.positionKm.x - endpointA.positionKm.x;
  const dy = endpointB.positionKm.y - endpointA.positionKm.y;
  const dz = endpointB.positionKm.z - endpointA.positionKm.z;
  const distanceKm = Math.hypot(dx, dy, dz);
  if (!Number.isFinite(distanceKm)) {
    return Object.freeze({
      status: 'invalid_numeric',
      reason: 'Las coordenadas científicas produjeron una distancia no finita.'
    });
  }

  const distanceAu = distanceKm / KM_PER_AU;
  const lightTimeSeconds = distanceKm / SPEED_OF_LIGHT_KM_PER_S;
  const sameSource = endpointA.source === endpointB.source;

  return Object.freeze({
    status: 'valid',
    bodyA: endpointA,
    bodyB: endpointB,
    deltaKm: Object.freeze({ x: dx, y: dy, z: dz, unit: 'km' }),
    distanceKm,
    distanceAu,
    lightTimeSeconds,
    jdTdb: endpointA.jdTdb,
    epochLabelTdb: endpointA.epochLabelTdb,
    origin: endpointA.origin,
    frameId: endpointA.frameId,
    sourceSummary: sameSource
      ? endpointA.source
      : `${endpointA.source} + ${endpointB.source}`
  });
}

/**
 * Formatea el tiempo de viaje de la luz en el vacío para referencia astronómica.
 */
export function formatLightTime(seconds) {
  requireFiniteNumber(seconds, 'seconds');
  if (seconds < 60) {
    return `${seconds.toFixed(1).replace('.', ',')} s luz`;
  }
  const totalMinutes = Math.floor(seconds / 60);
  const remSeconds = seconds - totalMinutes * 60;
  if (totalMinutes < 60) {
    return `${totalMinutes} min ${remSeconds.toFixed(1).replace('.', ',')} s luz`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} h ${minutes} min luz`;
}
