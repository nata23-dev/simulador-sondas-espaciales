import * as THREE from 'three';

const RADIO_SOL = 5;

function suavizar(inicio, fin, valor) {
  const t = THREE.MathUtils.clamp((valor - inicio) / (fin - inicio), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Close observation policy for visually enlarged bodies. It only scales the
 * rendered meshes, never their heliocentric centers or scientific data.
 * The existing solar-transit suppression remains a stricter case of the policy.
 */
export function crearProteccionTransitosSolares({ camera, objetos, nombreSeleccionado }) {
  const haciaSol = new THREE.Vector3();
  const haciaPlaneta = new THREE.Vector3();

  function actualizar(segundos) {
    const seleccionado = nombreSeleccionado();
    const objetoSeleccionado = objetos.get(seleccionado);
    const distanciaSol = camera.position.length();
    const cercania = objetoSeleccionado
      ? 1 - suavizar(6, 14,
        camera.position.distanceTo(objetoSeleccionado.posicion.position) /
        objetoSeleccionado.planeta.radio)
      : 0;
    // At full-system distances, slightly larger disks remain legible even
    // though their heliocentric centers stay strictly proportional in AU.
    const distanciaCamaraSol = camera.position.length();
    const panorama = suavizar(180, 650, distanciaCamaraSol);
    const ampliacionGeneral = 1 + 1.5 * panorama;

    haciaSol.copy(camera.position).negate().normalize();
    const radioAngularSol = Math.asin(Math.min(RADIO_SOL / distanciaSol, 1));

    for (const [nombre, objeto] of objetos) {
      let escala = nombre === seleccionado
        ? 1 + (ampliacionGeneral - 1) * (1 - cercania)
        : Math.max(0.18, ampliacionGeneral * (1 - 0.92 * cercania));
      if (cercania > 0 && nombre !== seleccionado) {
        haciaPlaneta.copy(objeto.posicion.position).sub(camera.position);
        const distancia = haciaPlaneta.length();
        const radio = objeto.planeta.radio * (nombre === 'Saturno' ? 2.02 : 1.055);
        const delante = suavizar(0, radio * 2, distanciaSol - distancia - radio * escala);

        if (delante > 0 && distancia > 0) {
          const separacion = Math.acos(THREE.MathUtils.clamp(
            haciaSol.dot(haciaPlaneta.multiplyScalar(1 / distancia)), -1, 1
          ));
          const radioAngularPlaneta = Math.asin(Math.min(radio * escala / distancia, 1));
          const bordeLibre = separacion - radioAngularSol - radioAngularPlaneta;
          const conserva = suavizar(-0.005, 0.055, bordeLibre);
          escala *= 1 - delante * (1 - conserva);
        }
      }
      // Exponential damping is stable across frame rates and target switches.
      const anterior = objeto.posicion.scale.x;
      const mezcla = 1 - Math.exp(-6 * segundos);
      objeto.posicion.scale.setScalar(anterior + (escala - anterior) * mezcla);
    }
  }

  return { actualizar };
}
