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

export function requireVector3(vector, name) {
  if (vector === null || typeof vector !== 'object' || Array.isArray(vector)) {
    throw new TypeError(`${name} debe tener componentes x, y, z.`);
  }
  for (const axis of ['x', 'y', 'z']) requireFiniteNumber(vector[axis], `${name}.${axis}`);
  return vector;
}

/** Rota ejes eclípticos científicos a ejes Three.js; no cambia unidades. */
export function eclipticToSceneAxes(vector) {
  requireVector3(vector, 'vector');
  return { x: vector.x, y: vector.z, z: -vector.y };
}

/** Transformación inversa de ejes; no cambia unidades. */
export function sceneToEclipticAxes(vector) {
  requireVector3(vector, 'vector');
  return { x: vector.x, y: -vector.z, z: vector.y };
}

// Etapa 12G — oblicuidad de la eclíptica J2000 usada por NASA/JPL Horizons para REF_PLANE=ECLIPTIC (IAU 1976):
// ε = 84 381,448″. Permite comparar vectores eclípticos con vectores en ejes ecuatoriales ICRF (REF_PLANE=FRAME).
export const J2000_OBLIQUITY_ARCSEC = 84381.448;
const OBLIQUITY_RAD = J2000_OBLIQUITY_ARCSEC / 3600 * Math.PI / 180;

/** Rota un vector [x, y, z] de ejes eclípticos J2000 a ejes ecuatoriales ICRF (rotación +ε alrededor de X). */
export function eclipticJ2000ToIcrfEquatorial(vector) {
  if (!Array.isArray(vector) || vector.length !== 3 || !vector.every(Number.isFinite)) throw new TypeError('Se requiere un vector [x, y, z] finito.');
  const c = Math.cos(OBLIQUITY_RAD), s = Math.sin(OBLIQUITY_RAD);
  return [vector[0], c * vector[1] - s * vector[2], s * vector[1] + c * vector[2]];
}

/** Inversa: ejes ecuatoriales ICRF → ejes eclípticos J2000. */
export function icrfEquatorialToEclipticJ2000(vector) {
  if (!Array.isArray(vector) || vector.length !== 3 || !vector.every(Number.isFinite)) throw new TypeError('Se requiere un vector [x, y, z] finito.');
  const c = Math.cos(OBLIQUITY_RAD), s = Math.sin(OBLIQUITY_RAD);
  return [vector[0], c * vector[1] + s * vector[2], -s * vector[1] + c * vector[2]];
}
