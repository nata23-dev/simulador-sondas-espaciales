/**
 * En este módulo defino los marcos de referencia científicos y las rotaciones
 * ortogonales puras entre ejes eclípticos J2000, ecuatoriales ICRF y ejes de escena 3D.
 *
 * - Unidades: todas las transformaciones aquí son rotaciones puras adimensionales que
 *   preservan intactas las unidades de entrada (km o km/s); la oblicuidad J2000 se
 *   declara en segundos de arco y se convierte a radianes.
 * - Marco de referencia: defino `HORIZONS_FRAME` como el marco heliocéntrico
 *   `SUN_CENTER` (`500@10`) en `ICRF_ECLIPTIC_J2000` con vectores geométricos
 *   (`VEC_CORR=NONE`), tal como los entrega NASA/JPL Horizons.
 * - Límites: no aplico traslaciones de origen ni escalados visuales; rechazo cualquier
 *   vector con componentes no finitas.
 */
import { requireFiniteNumber } from './Units.js';

export const HORIZONS_FRAME = Object.freeze({
  origin: 'SUN_CENTER',
  originCode: '500@10',
  id: 'ICRF_ECLIPTIC_J2000',
  referenceSystem: 'ICRF',
  referencePlane: 'ECLIPTIC_J2000',
  axes: '+X along ICRF X; +Z ecliptic north; +Y completes a right-handed system',
  correction: 'NONE'
});

export const SCENE_AXES = 'scene X = ecliptic X; scene Y = ecliptic Z; scene Z = -ecliptic Y';

/** Valido que `vector` sea un objeto con componentes numéricas finitas `x`, `y` y `z`. */
export function requireVector3(vector, name) {
  if (vector === null || typeof vector !== 'object' || Array.isArray(vector)) {
    throw new TypeError(`${name} debe tener componentes x, y, z.`);
  }
  for (const axis of ['x', 'y', 'z']) requireFiniteNumber(vector[axis], `${name}.${axis}`);
  return vector;
}

/** Aquí roto un vector de ejes eclípticos científicos a ejes de escena Three.js sin alterar sus unidades. */
export function eclipticToSceneAxes(vector) {
  requireVector3(vector, 'vector');
  return { x: vector.x, y: vector.z, z: -vector.y };
}

/** Aquí aplico la rotación inversa de ejes de escena Three.js hacia ejes eclípticos científicos sin alterar unidades. */
export function sceneToEclipticAxes(vector) {
  requireVector3(vector, 'vector');
  return { x: vector.x, y: -vector.z, z: vector.y };
}

// Adopto la oblicuidad de la eclíptica J2000 (IAU 1976, ε = 84 381,448″) que utiliza NASA/JPL Horizons
// para REF_PLANE=ECLIPTIC, de modo que pueda contrastar vectores eclípticos con vectores ecuatoriales ICRF (REF_PLANE=FRAME).
export const J2000_OBLIQUITY_ARCSEC = 84381.448;
const OBLIQUITY_RAD = J2000_OBLIQUITY_ARCSEC / 3600 * Math.PI / 180;

/** Aquí roto una terna `[x, y, z]` desde ejes eclípticos J2000 hacia ejes ecuatoriales ICRF (giro +ε alrededor de +X). */
export function eclipticJ2000ToIcrfEquatorial(vector) {
  if (!Array.isArray(vector) || vector.length !== 3 || !vector.every(Number.isFinite)) throw new TypeError('Se requiere un vector [x, y, z] finito.');
  const c = Math.cos(OBLIQUITY_RAD), s = Math.sin(OBLIQUITY_RAD);
  return [vector[0], c * vector[1] - s * vector[2], s * vector[1] + c * vector[2]];
}

/** Aquí aplico la rotación inversa desde ejes ecuatoriales ICRF hacia ejes eclípticos J2000 (giro −ε alrededor de +X). */
export function icrfEquatorialToEclipticJ2000(vector) {
  if (!Array.isArray(vector) || vector.length !== 3 || !vector.every(Number.isFinite)) throw new TypeError('Se requiere un vector [x, y, z] finito.');
  const c = Math.cos(OBLIQUITY_RAD), s = Math.sin(OBLIQUITY_RAD);
  return [vector[0], c * vector[1] + s * vector[2], -s * vector[1] + c * vector[2]];
}
