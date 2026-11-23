// En este módulo calculo la posición y el objetivo de cámara necesarios para encuadrar
// un conjunto de cuerpos celestes dentro del área libre del lienzo entre paneles, sin
// modificar jamás sus posiciones físicas ni la escala astronómica.
import * as THREE from 'three';
import { REGIONES_SISTEMA } from './ScaleModeConfig.js';

// Mantengo un ángulo oblicuo fijo para la vista general científica; la vista cinematográfica viaja al cuerpo.
const DIRECCION_CIENTIFICA = new THREE.Vector3(-0.32, 0.45, 0.83).normalize();
const HOLGURA_RADIO = 1.18;
const DISTANCIA_MAXIMA_ENCUADRE = 6000;
const PLANETAS_INTERIORES = new Set(['Mercurio', 'Venus', 'Tierra', 'Marte']);

// Reúno la lista de discos (posición y radio en unidades de escena) que debo abarcar en el encuadre actual.
function cuerposEnVista(objetos, { region = REGIONES_SISTEMA.COMPLETO, usarRadiosActuales = false, sonda = null, cuerpos = null } = {}) {
  const radioSol = usarRadiosActuales || cuerpos ? 0.5 : 5.8;
  const lista = [{ posicion: new THREE.Vector3(), radio: radioSol }];
  // Cuando recibo un conjunto explícito de cuerpos de misión, combino el Sol con esos discos.
  if (cuerpos) return lista.concat(cuerpos);

  for (const [nombre, objeto] of objetos.entries()) {
    if (region === REGIONES_SISTEMA.INTERIOR && !PLANETAS_INTERIORES.has(nombre)) {
      continue;
    }
    const escalaNodo = usarRadiosActuales && objeto.posicion?.scale
      ? objeto.posicion.scale.x
      : 1;
    const radioBase = objeto.planeta.radio * escalaNodo * (nombre === 'Saturno' ? 2.02 : 1.055);
    lista.push({
      posicion: objeto.posicion.position,
      radio: Math.max(radioBase, 0.02)
    });
  }

  if (region === REGIONES_SISTEMA.INTERIOR && sonda?.posicion?.visible) {
    lista.push({
      posicion: sonda.posicion.position,
      radio: 0.4
    });
  }

  return lista;
}

/**
 * Resuelvo la distancia mínima y el desplazamiento lateral y vertical del objetivo para encuadrar
 * todos los discos seleccionados dentro del área libre `zona` usando el FOV efectivo de la cámara.
 */
export function calcularEncuadreVista(camera, objetos, zona, opciones = null) {
  const direccion = DIRECCION_CIENTIFICA;

  const derecha = new THREE.Vector3().crossVectors(camera.up, direccion).normalize();
  const arriba = new THREE.Vector3().crossVectors(direccion, derecha).normalize();
  const tanVertical = Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()) / 2);
  const tanHorizontal = tanVertical * camera.aspect;
  const izquierda = 2 * zona.left / zona.width - 1;
  const derechaNDC = 2 * zona.right / zona.width - 1;
  const superior = 1 - 2 * zona.top / zona.height;
  const inferior = 1 - 2 * zona.bottom / zona.height;
  const cuerpos = cuerposEnVista(objetos, opciones ?? {});

  function limites(distancia) {
    let minimoX = -Infinity;
    let maximoX = Infinity;
    let minimoY = -Infinity;
    let maximoY = Infinity;

    for (const cuerpo of cuerpos) {
      const radio = cuerpo.radio * HOLGURA_RADIO;
      const profundidad = distancia - cuerpo.posicion.dot(direccion);
      if (profundidad <= radio) return null;

      const x = cuerpo.posicion.dot(derecha);
      const y = cuerpo.posicion.dot(arriba);
      minimoX = Math.max(minimoX, x + radio - derechaNDC * profundidad * tanHorizontal);
      maximoX = Math.min(maximoX, x - radio - izquierda * profundidad * tanHorizontal);
      minimoY = Math.max(minimoY, y + radio - superior * profundidad * tanVertical);
      maximoY = Math.min(maximoY, y - radio - inferior * profundidad * tanVertical);
    }

    return minimoX <= maximoX && minimoY <= maximoY
      ? { minimoX, maximoX, minimoY, maximoY }
      : null;
  }

  const ajustado = opciones?.region === REGIONES_SISTEMA.INTERIOR || Boolean(opciones?.cuerpos);
  let inferiorDistancia = ajustado ? 2 : 8;
  let superiorDistancia = DISTANCIA_MAXIMA_ENCUADRE;
  if (!limites(superiorDistancia)) {
    throw new Error('No se pudo encuadrar la vista con el tamaño actual del lienzo.');
  }
  // Busco por bisección la distancia mínima que mantiene todos los discos dentro del área libre.
  for (let i = 0; i < 42; i++) {
    const medio = (inferiorDistancia + superiorDistancia) / 2;
    if (limites(medio)) superiorDistancia = medio;
    else inferiorDistancia = medio;
  }

  // Reservo holgura adicional para las etiquetas en pantalla, el movimiento orbital y la perspectiva.
  const usarOpcionesRegion = Boolean(opciones);
  const margenMultiplicador = ajustado ? 1.24 : 1.10;
  const radioSolarMaximo = 75;
  const distanciaSolar = usarOpcionesRegion
    ? 18
    : 5.8 * zona.height / (2 * tanVertical * radioSolarMaximo);
  const distancia = Math.min(DISTANCIA_MAXIMA_ENCUADRE, Math.max(
    superiorDistancia * margenMultiplicador + 1,
    distanciaSolar
  ));
  const rango = limites(distancia);
  const xPreferido = 0.10 * distancia * tanHorizontal;
  const yPreferido = 0.12 * distancia * tanVertical;
  const xObjetivo = THREE.MathUtils.clamp(xPreferido, rango.minimoX, rango.maximoX);
  const yObjetivo = THREE.MathUtils.clamp(yPreferido, rango.minimoY, rango.maximoY);
  const objetivo = derecha.multiplyScalar(xObjetivo).add(arriba.multiplyScalar(yObjetivo));
  const posicion = objetivo.clone().addScaledVector(direccion, distancia);

  return { posicion, objetivo };
}
