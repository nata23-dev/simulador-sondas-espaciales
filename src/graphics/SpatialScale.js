import * as THREE from 'three';
import { UNIDADES_POR_AU } from './SceneScale.js';

// Un factor lineal ubica los centros; los radios tienen una escala visual propia.
export { UNIDADES_POR_AU } from './SceneScale.js';

export function posicionEscenaProporcional(posicionAU, destino = new THREE.Vector3()) {
  // El cambio de ejes conserva longitudes y ángulos sin modificar Horizons.
  return destino.set(
    posicionAU.x * UNIDADES_POR_AU,
    posicionAU.z * UNIDADES_POR_AU,
    -posicionAU.y * UNIDADES_POR_AU
  );
}
