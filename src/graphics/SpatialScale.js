// En este módulo transformo posiciones heliocéntricas en AU al espacio 3D de Three.js
// usando el factor lineal de 32 unidades/AU y la rotación de ejes (x, y, z) → (x, z, -y).
import * as THREE from 'three';
import { UNIDADES_POR_AU } from './SceneScale.js';

// Reexporto el factor lineal (32 unidades/AU) que ubica los centros; los radios usan su propia escala visual.
export { UNIDADES_POR_AU } from './SceneScale.js';

/** Convierto un vector eclíptico en AU al sistema de ejes de escena (x, z, -y) preservando longitudes y ángulos. */
export function posicionEscenaProporcional(posicionAU, destino = new THREE.Vector3()) {
  return destino.set(
    posicionAU.x * UNIDADES_POR_AU,
    posicionAU.z * UNIDADES_POR_AU,
    -posicionAU.y * UNIDADES_POR_AU
  );
}
