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
