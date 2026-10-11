import * as THREE from 'three';

const NOMBRES = { Jupiter: 'Júpiter' };
const PRIORIDAD = ['Tierra', 'Jupiter', 'Saturno', 'Neptuno', 'Urano', 'Marte', 'Venus', 'Mercurio'];

export function crearEtiquetasPlanetas(container, camera, objetos) {
  const capa = document.createElement('div');
  capa.className = 'planet-labels';
  capa.setAttribute('aria-hidden', 'true');
  container.append(capa);

  const elementos = new Map();
  for (const nombre of objetos.keys()) {
    const etiqueta = document.createElement('span');
    etiqueta.className = 'planet-label';
    etiqueta.textContent = NOMBRES[nombre] ?? nombre;
    capa.append(etiqueta);
    elementos.set(nombre, etiqueta);
  }

  const proyectado = new THREE.Vector3();
  const haciaDelante = new THREE.Vector3();
  const rayo = new THREE.Vector3();
  const alDisco = new THREE.Vector3();
  const centroSol = new THREE.Vector3();
  let visible = false;

  function intersectaDisco(centro, radio, distancia) {
    alDisco.copy(centro).sub(camera.position);
    const avance = alDisco.dot(rayo);
    if (avance <= 0 || avance >= distancia) return false;
    const separacionCuadrada = alDisco.lengthSq() - avance * avance;
    return separacionCuadrada < radio * radio &&
      avance - Math.sqrt(Math.max(0, radio * radio - separacionCuadrada)) < distancia;
  }

  function ocultoPorDisco(nombre, centro, distancia) {
    rayo.copy(centro).sub(camera.position).multiplyScalar(1 / distancia);
    if (intersectaDisco(centroSol, 5.8, distancia)) return true;
    for (const [otroNombre, objeto] of objetos) {
      if (otroNombre === nombre) continue;
      const radio = objeto.planeta.radio * objeto.posicion.scale.x *
        (otroNombre === 'Saturno' ? 2.02 : 1.055);
      if (intersectaDisco(objeto.posicion.position, radio, distancia)) return true;
    }
    return false;
  }

  function actualizar(seleccionado) {
    if (!visible) return;
    const ancho = container.clientWidth;
    const alto = container.clientHeight;
    if (!ancho || !alto) return;

    camera.getWorldDirection(haciaDelante);
    const escala = alto / (2 * Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()) / 2));
    const candidatos = [];
    const objetoSeleccionado = objetos.get(seleccionado);
    const observacionCercana = objetoSeleccionado &&
      camera.position.distanceTo(objetoSeleccionado.posicion.position) <
      objetoSeleccionado.planeta.radio * 12;

    for (const [nombre, objeto] of objetos) {
      const elemento = elementos.get(nombre);
      const posicion = objeto.posicion.position;
      const distancia = camera.position.distanceTo(posicion);
      if (observacionCercana || ocultoPorDisco(nombre, posicion, distancia)) {
        elemento.hidden = true;
        continue;
      }
      proyectado.copy(posicion).sub(camera.position);
      if (proyectado.dot(haciaDelante) <= 0) {
        elemento.hidden = true;
        continue;
      }
      proyectado.copy(posicion).project(camera);
      const x = (proyectado.x + 1) * ancho / 2;
      const radioPx = escala * objeto.planeta.radio * objeto.posicion.scale.x / distancia;
      const y = (1 - proyectado.y) * alto / 2 - Math.min(radioPx, 32) - 7;
      if (x < 46 || x > ancho - 46 || y < 38 || y > alto - 42 || proyectado.z >= 1) {
        elemento.hidden = true;
        continue;
      }
      candidatos.push({ nombre, elemento, x, y, distancia, radioPx });
    }

    // Pocas etiquetas y sin placas opacas: el resto de destinos sigue disponible en el selector.
    candidatos.sort((a, b) => Number(b.nombre === seleccionado) - Number(a.nombre === seleccionado)
      || PRIORIDAD.indexOf(a.nombre) - PRIORIDAD.indexOf(b.nombre));
    const ocupados = [];
    const limite = ancho < 660 ? 3 : 5;
    for (const candidato of candidatos) {
      const solapa = ocupados.length >= limite || ocupados.some(posicion =>
        Math.abs(posicion.x - candidato.x) < 92 && Math.abs(posicion.y - candidato.y) < 25);
      candidato.elemento.hidden = solapa;
      if (solapa) continue;
      candidato.elemento.classList.toggle('is-selected', candidato.nombre === seleccionado);
      candidato.elemento.style.left = `${candidato.x}px`;
      candidato.elemento.style.top = `${candidato.y}px`;
      ocupados.push(candidato);
    }
  }

  function mostrar(valor) {
    visible = valor;
    capa.hidden = !valor;
  }

  mostrar(false);
  return { actualizar, mostrar };
}
