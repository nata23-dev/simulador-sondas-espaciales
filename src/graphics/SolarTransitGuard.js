import * as THREE from 'three';
import {
  calcularEscalaObjetivoPlaneta,
  factorEscalaCientificaCuerpo
} from './ScaleModeConfig.js';

const RADIO_SOL = 5;

function suavizar(inicio, fin, valor) {
  const t = THREE.MathUtils.clamp((valor - inicio) / (fin - inicio), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Ajusta el tamaño visible de los cuerpos según el modo de escala activo y la cercanía de observación.
 * Solo ajusta su escala visual: conserva los centros heliocéntricos y los datos científicos.
 * También atenúa las ocultaciones artificiales del Sol por cuerpos ampliados.
 */
export function crearProteccionTransitosSolares({
  camera,
  objetos,
  nombreSeleccionado,
  obtenerModoEscala = null,
  obtenerRadioSol = null,
  sondasHistoricas = null
}) {
  const haciaSol = new THREE.Vector3();
  const haciaPlaneta = new THREE.Vector3();

  function actualizar(segundos) {
    const modoEscala = obtenerModoEscala ? obtenerModoEscala() : null;
    const seleccionado = nombreSeleccionado();
    const objetoSeleccionado = objetos.get(seleccionado);
    const distanciaSol = Math.max(camera.position.length(), 1e-6);
    const radioSolActual = obtenerRadioSol ? obtenerRadioSol() : RADIO_SOL;

    const cercania = objetoSeleccionado
      ? 1 - suavizar(6, 14,
        camera.position.distanceTo(objetoSeleccionado.posicion.position) /
        objetoSeleccionado.planeta.radio)
      : 0;

    // Si no se inyecta `obtenerModoEscala`, conserva exactamente la política heredada para compatibilidad de pruebas.
    const panorama = suavizar(180, 650, distanciaSol);
    const ampliacionGeneral = 1 + 1.5 * panorama;

    haciaSol.copy(camera.position).negate().normalize();
    const radioAngularSol = Math.asin(Math.min(radioSolActual / distanciaSol, 1));

    for (const [nombre, objeto] of objetos) {
      const distanciaCamaraCuerpo = camera.position.distanceTo(objeto.posicion.position);
      let escala;
      if (modoEscala) {
        escala = calcularEscalaObjetivoPlaneta({
          nombre,
          radioBaseEscena: objeto.planeta.radio,
          modoEscala,
          distanciaCamaraCuerpo,
          esSeleccionado: nombre === seleccionado,
          cercaniaSeleccionado: cercania
        });
      } else {
        escala = nombre === seleccionado
          ? 1 + (ampliacionGeneral - 1) * (1 - cercania)
          : Math.max(0.18, ampliacionGeneral * (1 - 0.92 * cercania));
      }

      if (modoEscala !== 'cientifica' && cercania > 0 && nombre !== seleccionado) {
        haciaPlaneta.copy(objeto.posicion.position).sub(camera.position);
        const distancia = haciaPlaneta.length();
        const radio = objeto.planeta.radio * (nombre === 'Saturno' ? 2.02 : 1.055);
        const delante = suavizar(0, radio * 2, distanciaSol - distancia - radio * escala);

        if (delante > 0 && distancia > 0) {
          // Compara los tamaños angulares antes de reducir una ocultación visual del Sol.
          const separacion = Math.acos(THREE.MathUtils.clamp(
            haciaSol.dot(haciaPlaneta.multiplyScalar(1 / distancia)), -1, 1
          ));
          const radioAngularPlaneta = Math.asin(Math.min(radio * escala / distancia, 1));
          const bordeLibre = separacion - radioAngularSol - radioAngularPlaneta;
          const conserva = suavizar(-0.005, 0.055, bordeLibre);
          escala *= 1 - delante * (1 - conserva);
        }
      }

      // En Modo Exploratorio, evita que una esfera planetaria ampliada o los anillos de Saturno
      // engullan visualmente una sonda histórica durante un sobrevuelo cercano real.
      if (modoEscala && modoEscala !== 'cientifica' && sondasHistoricas) {
        let menorDistSonda = Infinity;
        for (const sHist of sondasHistoricas.values()) {
          if (!sHist.posicion.visible) continue;
          const d = objeto.posicion.position.distanceTo(sHist.posicion.position);
          if (d < menorDistSonda) menorDistSonda = d;
        }
        if (Number.isFinite(menorDistSonda)) {
          const factorAnillos = nombre === 'Saturno' ? 2.38 : 1.18;
          const escalaMaxSinSolape = menorDistSonda / (objeto.planeta.radio * factorAnillos);
          if (escala > escalaMaxSinSolape) {
            const escalaFisica = factorEscalaCientificaCuerpo(nombre, objeto.planeta.radio);
            escala = Math.max(escalaFisica, escalaMaxSinSolape);
          }
        }
      }

      // La transición exponencial mantiene la escala estable a cualquier frecuencia de fotogramas.
      const anterior = objeto.posicion.scale.x;
      const mezcla = 1 - Math.exp(-6 * Math.max(segundos, 0.001));
      objeto.posicion.scale.setScalar(anterior + (escala - anterior) * mezcla);
    }
  }

  return { actualizar };
}
