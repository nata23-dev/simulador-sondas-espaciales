import * as THREE from 'three';

// One linear factor for rendered centers. Body radii are separate visual sizes.
export const UNIDADES_POR_AU = 32;

export function posicionEscenaProporcional(posicionAU, destino = new THREE.Vector3()) {
  // The axis mapping preserves lengths and angles. It does not alter Horizons.
  return destino.set(
    posicionAU.x * UNIDADES_POR_AU,
    posicionAU.z * UNIDADES_POR_AU,
    -posicionAU.y * UNIDADES_POR_AU
  );
}
