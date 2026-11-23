// Aquí preparo el modelo 3D de una sonda del laboratorio para mostrarlo dentro de la escena principal del Sistema Solar.
// Reutilizo el mismo ensamblaje del Hangar (createProbeAssemblyModel) y, para sondas históricas sin modificar,
// cargo el modelo oficial de NASA (attachNasaModel). Como SpaceProbeVisual espera radio envolvente ~1 con la antena
// apuntando en +Z hacia la Tierra y en el Hangar la antena está en +Y, aplico un giro de 90° alrededor del eje X.
import * as THREE from 'three';
import { createProbeAssemblyModel, disposeProbeAssemblyModel } from './ProbeAssemblyView.js';
import { attachNasaModel, localBounds } from '../graphics/NasaProbeModels.js';

export const MISSION_PROBE_MODEL_RADIUS = 0.95;

/** Creo el grupo Three.js centrado y normalizado; devuelvo `{ object, ready, dispose }`, resolviendo `ready` con 'nasa', 'procedural' o 'sin-sonda'. */
export function createMissionProbeSceneModel(design) {
  const root = new THREE.Group();
  root.name = design?.name ? `modelo-${design.name}` : 'modelo-sonda';
  root.rotation.x = Math.PI / 2; // Roto +Y del Hangar (antena) hacia +Z para que SpaceProbeVisual apunte a la Tierra.
  const assembly = createProbeAssemblyModel(design);
  root.add(assembly);
  // Centro y escalo el ensamblaje para que su esfera envolvente ajuste a MISSION_PROBE_MODEL_RADIUS.
  function fit() {
    assembly.position.set(0, 0, 0); assembly.scale.setScalar(1);
    const sphere = localBounds(assembly).getBoundingSphere(new THREE.Sphere());
    const scale = sphere.radius > 0 && Number.isFinite(sphere.radius) ? MISSION_PROBE_MODEL_RADIUS / sphere.radius : 1;
    assembly.scale.setScalar(scale);
    assembly.position.copy(sphere.center).multiplyScalar(-scale);
  }
  fit();
  let disposed = false;
  // Si el ensamblaje es experimental mantengo la reconstrucción modular porque el modelo cerrado de NASA no refleja los cambios.
  const core = design && !design.experimental ? design.coreId : null;
  const ready = attachNasaModel(assembly, core, { isCurrent: () => !disposed })
    .then(result => {
      if (result.status === 'nasa' && !disposed) { fit(); return 'nasa'; }
      return design ? 'procedural' : 'sin-sonda';
    })
    .catch(() => (design ? 'procedural' : 'sin-sonda'));
  return {
    object: root,
    ready,
    dispose() { disposed = true; disposeProbeAssemblyModel(assembly); root.removeFromParent(); }
  };
}
