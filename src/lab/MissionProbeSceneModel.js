// 17.1 — Modelo 3D de la sonda de una misión del laboratorio para el Sistema Solar principal. Solo presentación.
// Reutiliza el mismo ensamblaje que el Hangar y el Centro de Misión (createProbeAssemblyModel) y, para la flota, el modelo
// oficial de NASA sin modificar (attachNasaModel). SpaceProbeVisual espera un objeto de radio envolvente ~1 con el eje que
// apunta a la Tierra en +Z; los modelos del Hangar llevan la antena de alta ganancia en +Y, de ahí el giro de 90° sobre X.
import * as THREE from 'three';
import { createProbeAssemblyModel, disposeProbeAssemblyModel } from './ProbeAssemblyView.js';
import { attachNasaModel, localBounds } from '../graphics/NasaProbeModels.js';

export const MISSION_PROBE_MODEL_RADIUS = 0.95;

/** Devuelve `{ object, ready, dispose }`; `ready` se resuelve con 'nasa', 'procedural' o 'sin-sonda'. */
export function createMissionProbeSceneModel(design) {
  const root = new THREE.Group();
  root.name = design?.name ? `modelo-${design.name}` : 'modelo-sonda';
  root.rotation.x = Math.PI / 2; // +Y del Hangar (antena) → +Z (dirección que SpaceProbeVisual orienta hacia la Tierra)
  const assembly = createProbeAssemblyModel(design);
  root.add(assembly);
  function fit() {
    assembly.position.set(0, 0, 0); assembly.scale.setScalar(1);
    const sphere = localBounds(assembly).getBoundingSphere(new THREE.Sphere());
    const scale = sphere.radius > 0 && Number.isFinite(sphere.radius) ? MISSION_PROBE_MODEL_RADIUS / sphere.radius : 1;
    assembly.scale.setScalar(scale);
    assembly.position.copy(sphere.center).multiplyScalar(-scale);
  }
  fit();
  let disposed = false;
  // Un ensamblaje experimental no usa el modelo de NASA de su bus (no lo representaría): se queda con la reconstrucción.
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
