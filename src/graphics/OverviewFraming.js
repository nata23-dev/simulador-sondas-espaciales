import * as THREE from 'three';

// Oblique scientific overview; the cinematic view travels to a planet.
const DIRECCION_CIENTIFICA = new THREE.Vector3(-0.32, 0.45, 0.83).normalize();
const HOLGURA_RADIO = 1.18;
const DISTANCIA_MAXIMA_ENCUADRE = 6000;

function cuerposEnVista(objetos) {
  return [
    { posicion: new THREE.Vector3(), radio: 5.8 },
    ...[...objetos.keys()].map(nombre => ({
      posicion: objetos.get(nombre).posicion.position,
      radio: objetos.get(nombre).planeta.radio * (nombre === 'Saturno' ? 2.02 : 1.055)
    }))
  ];
}

/**
 * Encuadra discos visuales dentro del área que queda libre entre los paneles.
 * Resuelve la distancia mínima y los desplazamientos lateral y vertical del
 * objetivo con el FOV real; nunca modifica posiciones ni escala astronómica.
 */
export function calcularEncuadreVista(camera, objetos, zona) {
  const direccion = DIRECCION_CIENTIFICA;

  const derecha = new THREE.Vector3().crossVectors(camera.up, direccion).normalize();
  const arriba = new THREE.Vector3().crossVectors(direccion, derecha).normalize();
  const tanVertical = Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()) / 2);
  const tanHorizontal = tanVertical * camera.aspect;
  const izquierda = 2 * zona.left / zona.width - 1;
  const derechaNDC = 2 * zona.right / zona.width - 1;
  const superior = 1 - 2 * zona.top / zona.height;
  const inferior = 1 - 2 * zona.bottom / zona.height;
  const cuerpos = cuerposEnVista(objetos);

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

  let inferiorDistancia = 8;
  let superiorDistancia = DISTANCIA_MAXIMA_ENCUADRE;
  if (!limites(superiorDistancia)) {
    throw new Error('No se pudo encuadrar la vista con el tamaño actual del lienzo.');
  }
  for (let i = 0; i < 42; i++) {
    const medio = (inferiorDistancia + superiorDistancia) / 2;
    if (limites(medio)) superiorDistancia = medio;
    else inferiorDistancia = medio;
  }

  // Reserva espacio adicional para etiquetas, movimiento orbital y perspectiva.
  const radioSolarMaximo = 75;
  const distanciaSolar = 5.8 * zona.height / (2 * tanVertical * radioSolarMaximo);
  const distancia = Math.min(DISTANCIA_MAXIMA_ENCUADRE, Math.max(
    superiorDistancia * 1.10 + 1,
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
