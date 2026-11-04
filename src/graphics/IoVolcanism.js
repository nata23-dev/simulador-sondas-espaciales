import * as THREE from 'three';

// Pele: USGS Gazetteer, -18.71° latitude, 255.28° west longitude.
// https://planetarynames.wr.usgs.gov/Feature/4638
// The map longitude convention is used for the local anchor; the globe's
// absolute IAU/CK orientation is not validated. This plume is illustrative,
// never an assertion of an eruption at the selected historical instant.
const P_RADIUS = 1;
const PLUME_HEIGHT = 160 / 1821.49; // NASA PIA00379 shows a plume above 150 miles; understated here.
const latitude = THREE.MathUtils.degToRad(-18.71);
const phi = THREE.MathUtils.degToRad(255.28);
const normal = new THREE.Vector3(
  -Math.cos(latitude) * Math.sin(phi),
  Math.sin(latitude),
  Math.cos(latitude) * Math.cos(phi)
);
const tangent = new THREE.Vector3().crossVectors(normal, new THREE.Vector3(0, 1, 0)).normalize();
const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();

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
