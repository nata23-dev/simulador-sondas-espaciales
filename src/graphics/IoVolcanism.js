// En este módulo construyo el penacho volcánico ilustrativo de Pele sobre la malla unitaria de Ío.
// Anclo el origen con las coordenadas del catálogo USGS (-18,71° de latitud, 255,28° de longitud oeste)
// usando la convención del mapa sin validar la orientación absoluta IAU/CK; es un recurso ilustrativo
// que no afirma una erupción fechada en el instante histórico seleccionado.
import * as THREE from 'three';

const P_RADIUS = 1;
// Mantengo la altura deliberadamente discreta frente a los >240 km registrados en NASA PIA00379.
const PLUME_HEIGHT = 160 / 1821.49;
const latitude = THREE.MathUtils.degToRad(-18.71);
const phi = THREE.MathUtils.degToRad(255.28);
const normal = new THREE.Vector3(
  -Math.cos(latitude) * Math.sin(phi),
  Math.sin(latitude),
  Math.cos(latitude) * Math.cos(phi)
);
const tangent = new THREE.Vector3().crossVectors(normal, new THREE.Vector3(0, 1, 0)).normalize();
const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();

/** Creo la malla instanciada del penacho de Pele y su función de animación periódica por fotograma. */
export function crearPenachoIo() {
  const count = 20;
  const mesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshBasicMaterial({ color: 0xd6c5a2, transparent: true, opacity: 0.32, depthWrite: false }),
    count
  );
  mesh.name = 'Penacho ilustrativo de Pele (sin cronología eruptiva)';
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  const anchor = new THREE.Object3D();
  function actualizar(timeSeconds) {
    for (let i = 0; i < count; i++) {
      const phase = (i * 0.61803398875 + timeSeconds * 0.035) % 1;
      const spread = 0.004 + phase * 0.022;
      const azimuth = i * 2.39996322973;
      anchor.position.copy(normal).multiplyScalar(P_RADIUS + 0.006 + phase * PLUME_HEIGHT)
        .addScaledVector(tangent, Math.cos(azimuth) * spread)
        .addScaledVector(bitangent, Math.sin(azimuth) * spread);
      anchor.scale.setScalar((0.005 + 0.007 * phase) * (1 - 0.55 * phase));
      anchor.updateMatrix();
      mesh.setMatrixAt(i, anchor.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  actualizar(0);
  return { mesh, actualizar };
}
