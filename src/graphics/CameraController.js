import * as THREE from 'three';
import { calcularEncuadreVista } from './OverviewFraming.js';

const DISTANCIA_MAXIMA = 6000;
const FRACCION_ENCUADRE = 0.64;

function suavizar(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function crearControladorCamara({
  camera, controls, canvas, objetos, orbitas, obtenerZonaEncuadre, alSeleccionar
}) {
  const raycaster = new THREE.Raycaster();
  const puntero = new THREE.Vector2();
  const mallas = [];

  for (const [nombre, objeto] of objetos) {
    objeto.posicion.traverse(nodo => {
      if (!nodo.isMesh) return;
      nodo.userData.nombrePlaneta = nombre;
      mallas.push(nodo);
    });
  }

  let seleccionado = null;
  let transicion = null;
  let gesto = null;
  let ultimoClic = null;
  let modoVista = 'cientifica';
  let posicionesListas = false;

  function encuadreActual() {
    return calcularEncuadreVista(camera, objetos, obtenerZonaEncuadre());
  }

  function aplicarEncuadre() {
    const { posicion, objetivo } = encuadreActual();
    camera.position.copy(posicion);
    controls.target.copy(objetivo);
    camera.lookAt(objetivo);
    controls.update();
  }

  function radioEncuadre(nombre) {
    const objeto = objetos.get(nombre);
    const radio = objeto.planeta.radio * Math.max(1, objeto.posicion.scale.x);
    // Incluye nubes/atmósfera y, para Saturno, el borde exterior de los anillos.
    return radio * (nombre === 'Saturno' ? 2.02 : 1.014);
  }

  function distanciaObservacion(direccion) {
    const mitadVertical = THREE.MathUtils.degToRad(camera.getEffectiveFOV()) / 2;
    const mitadHorizontal = Math.atan(Math.tan(mitadVertical) * camera.aspect);
    const planeta = objetos.get(seleccionado).planeta;
    let radioVertical = planeta.radio * 1.014;
    let radioHorizontal = radioVertical;

    if (seleccionado === 'Saturno') {
      const anillo = objetos.get(seleccionado).posicion.children[0].children
        .find(nodo => nodo.geometry?.type === 'RingGeometry');
      anillo.updateWorldMatrix(true, false);
      const giro = anillo.getWorldQuaternion(new THREE.Quaternion());
      const ejeX = new THREE.Vector3(1, 0, 0).applyQuaternion(giro);
      const ejeY = new THREE.Vector3(0, 1, 0).applyQuaternion(giro);
      const arriba = camera.up.clone().addScaledVector(direccion, -camera.up.dot(direccion));
      if (arriba.lengthSq() < 1e-6) arriba.set(0, 0, 1);
      arriba.normalize();
      const derecha = new THREE.Vector3().crossVectors(direccion, arriba).normalize();
      const radioAnillo = planeta.radio * 2.02;
      radioVertical = Math.max(radioVertical,
        radioAnillo * Math.hypot(ejeX.dot(arriba), ejeY.dot(arriba)));
      radioHorizontal = Math.max(radioHorizontal,
        radioAnillo * Math.hypot(ejeX.dot(derecha), ejeY.dot(derecha)));
    }

    // Reserva un margen de perspectiva para el lado cercano del anillo.
    const encuadre = Math.max(
      radioVertical / Math.sin(mitadVertical * FRACCION_ENCUADRE),
      radioHorizontal / Math.sin(mitadHorizontal * FRACCION_ENCUADRE)
    ) * (seleccionado === 'Saturno' ? 1.2 : 1.1);
    return Math.max(encuadre, distanciaMinima() * 1.08);
  }

  function despejeRuta(inicio, fin, control) {
    const punto = new THREE.Vector3();
    const anterior = inicio.clone();
    const tramo = new THREE.Vector3();
    const haciaCentro = new THREE.Vector3();
    const masCerca = new THREE.Vector3();
    const centroSol = new THREE.Vector3();
    let despejeMinimo = Infinity;
    const longitud = control
      ? inicio.distanceTo(control) + control.distanceTo(fin)
      : inicio.distanceTo(fin);
    const muestras = Math.max(64, Math.min(1024, Math.ceil(longitud / 3)));

    function distanciaAlCentro(centro) {
      tramo.subVectors(punto, anterior);
      const longitudCuadrada = tramo.lengthSq();
      const t = longitudCuadrada > 0
        ? THREE.MathUtils.clamp(haciaCentro.subVectors(centro, anterior).dot(tramo) / longitudCuadrada, 0, 1)
        : 0;
      return masCerca.copy(anterior).addScaledVector(tramo, t).distanceTo(centro);
    }

    for (let i = 0; i <= muestras; i++) {
      const t = i / muestras;
      if (control) {
        punto.copy(inicio).multiplyScalar((1 - t) ** 2)
          .addScaledVector(control, 2 * (1 - t) * t)
          .addScaledVector(fin, t * t);
      } else {
        punto.lerpVectors(inicio, fin, t);
      }

      // Check the whole segment between samples, including narrow bodies.
      despejeMinimo = Math.min(despejeMinimo,
        distanciaAlCentro(centroSol) - 6.3);
      for (const [nombre, objeto] of objetos) {
        const margen = radioEncuadre(nombre) + 0.45;
        despejeMinimo = Math.min(
          despejeMinimo,
          distanciaAlCentro(objeto.posicion.position) - margen
        );
      }
      anterior.copy(punto);
    }
    return despejeMinimo;
  }

  function controlDeRuta(inicio, fin) {
    if (despejeRuta(inicio, fin, null) > 0) return null;

    const trayecto = fin.clone().sub(inicio).normalize();
    const lateral = new THREE.Vector3().crossVectors(trayecto, new THREE.Vector3(0, 1, 0));
    if (lateral.lengthSq() < 1e-6) lateral.set(1, 0, 0);
    lateral.normalize();
    const vertical = new THREE.Vector3().crossVectors(lateral, trayecto).normalize();
    const mitad = inicio.clone().add(fin).multiplyScalar(0.5);

    for (const amplitud of [15, 30, 60, 120, 240, 480, 960, 1920]) {
      for (const direccion of [vertical, lateral, vertical.clone().negate(), lateral.clone().negate()]) {
        const control = mitad.clone().addScaledVector(direccion, amplitud);
        if (despejeRuta(inicio, fin, control) > 0) return control;
      }
    }
    return false;
  }

  function actualizarOrbitas() {
    let relacionMinima = Infinity;
    for (const [nombre, objeto] of objetos) {
      const relacion = camera.position.distanceTo(objeto.posicion.position) / radioEncuadre(nombre);
      relacionMinima = Math.min(relacionMinima, relacion);
    }
    const relacionSeleccionado = seleccionado
      ? camera.position.distanceTo(centroSeleccionado()) / radioEncuadre(seleccionado)
      : Infinity;
    const cercania = THREE.MathUtils.clamp((relacionSeleccionado - 5) / 5, 0, 1);
    const atenuacion = THREE.MathUtils.clamp((relacionMinima - 3.5) / 4.5, 0, 1)
      * cercania * cercania * (3 - 2 * cercania);
    for (const orbita of orbitas) {
      orbita.material.opacity = orbita.userData.opacidadBase * atenuacion;
      orbita.visible = orbita.material.opacity > 0.005;
    }
  }

  function centroSeleccionado() {
    return objetos.get(seleccionado)?.posicion.position;
  }

  function distanciaMinima() {
    if (!seleccionado) return 8;
    const planeta = objetos.get(seleccionado).planeta;
    // El borde exterior de los anillos está a 2.02 radios de Saturno.
    return planeta.radio * (seleccionado === 'Saturno' ? 2.65 : 2.35);
  }

  function iniciarTransicion(tipo, duracion, direccion = null, control = null) {
    transicion = {
      tipo,
      duracion,
      transcurrido: 0,
      inicioPosicion: camera.position.clone(),
      inicioObjetivo: controls.target.clone(),
      direccion,
      control
    };
    controls.enabled = false;
  }

  function seleccionar(nombre) {
    if (seleccionado === nombre) return;
    seleccionado = nombre;
    controls.enablePan = false;
    controls.minDistance = distanciaMinima();
    controls.maxDistance = DISTANCIA_MAXIMA;
    iniciarTransicion('centrar', 0.75);
    alSeleccionar?.(nombre);
  }

  function explorarSeleccionado() {
    if (!seleccionado) return false;

    const centro = centroSeleccionado();
    const direccion = camera.position.clone().sub(centro);
    if (direccion.lengthSq() < 1e-6) direccion.set(0, 0.5, 1);
    direccion.normalize();

    // Observe from the sunlit side with a lateral offset. This keeps a visible
    // terminator even when the trip starts on the planet's night side.
    const haciaSol = centro.clone().negate().normalize();
    const tangente = new THREE.Vector3(-haciaSol.z, 0, haciaSol.x).normalize();
    if (tangente.dot(direccion) < 0) tangente.negate();
    const pesoSolar = seleccionado === 'Jupiter' ? 0.64 : 0.76;
    const elevacion = seleccionado === 'Saturno' ? 0.32 : 0.16;
    direccion.copy(haciaSol).multiplyScalar(pesoSolar)
      .addScaledVector(tangente, Math.sqrt(1 - pesoSolar * pesoSolar))
      .addScaledVector(camera.up, elevacion).normalize();

    const destino = centro.clone().addScaledVector(direccion, distanciaObservacion(direccion));
    const control = controlDeRuta(camera.position, destino);
    if (control === false) return false;
    const duracion = THREE.MathUtils.clamp(
      2 + camera.position.distanceTo(destino) / 450, 2, 6
    );
    iniciarTransicion('explorar', duracion, direccion, control);
    return true;
  }

  function vistaGeneral() {
    cambiarVista('cientifica');
  }

  function vistaCinematografica() {
    modoVista = 'cinematografica';
    if (!seleccionado) seleccionar('Saturno');
    explorarSeleccionado();
  }

  function cambiarVista(modo) {
    seleccionado = null;
    ultimoClic = null;
    modoVista = modo;
    controls.enablePan = true;
    controls.minDistance = 8;
    controls.maxDistance = DISTANCIA_MAXIMA;
    const destino = encuadreActual();
    const control = controlDeRuta(camera.position, destino.posicion);
    iniciarTransicion('vista', modo === 'cientifica' ? 1.45 : 1.7, null,
      control === false ? null : control);
    alSeleccionar?.(null);
  }

  function actualizar(segundos) {
    if (!transicion) {
      controls.update();
      actualizarOrbitas();
      return;
    }

    transicion.transcurrido += segundos;
    const t = Math.min(transicion.transcurrido / transicion.duracion, 1);
    const mezcla = suavizar(t);
    const vista = transicion.tipo === 'vista' ? encuadreActual() : null;
    const destinoObjetivo = vista?.objetivo ?? centroSeleccionado();
    const destinoPosicion = vista?.posicion ??
      (transicion.tipo === 'centrar'
        ? transicion.inicioPosicion
        : destinoObjetivo.clone().addScaledVector(transicion.direccion, distanciaObservacion(transicion.direccion)));

    if (transicion.control) {
      camera.position.copy(transicion.inicioPosicion).multiplyScalar((1 - mezcla) ** 2)
        .addScaledVector(transicion.control, 2 * (1 - mezcla) * mezcla)
        .addScaledVector(destinoPosicion, mezcla * mezcla);
    } else {
      camera.position.lerpVectors(transicion.inicioPosicion, destinoPosicion, mezcla);
    }
    controls.target.lerpVectors(transicion.inicioObjetivo, destinoObjetivo, mezcla);
    camera.lookAt(controls.target);
    actualizarOrbitas();

    if (t === 1) {
      transicion = null;
      controls.enabled = true;
      controls.update();
    }
  }

  function alActualizarPosiciones(centroAnterior) {
    if (!seleccionado) {
      if (!posicionesListas) {
        posicionesListas = true;
        aplicarEncuadre();
      } else if (!transicion) {
        iniciarTransicion('vista', 0.9);
      }
      return;
    }
    if (!centroAnterior) return;
    const desplazamiento = centroSeleccionado().clone().sub(centroAnterior);
    if (transicion) {
      // El destino se lee de la posición nueva en cada fotograma.
      // Durante el viaje mantenemos el tramo inicial relativo al planeta.
      if (transicion.tipo === 'explorar') {
        transicion.inicioPosicion.add(desplazamiento);
        transicion.inicioObjetivo.add(desplazamiento);
        transicion.control?.add(desplazamiento);
      }
      return;
    }

    camera.position.add(desplazamiento);
    controls.target.add(desplazamiento);
    controls.update();
  }

  function alCambiarTamano() {
    if (posicionesListas && !seleccionado && !transicion) aplicarEncuadre();
  }

  function planetaEn(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    puntero.set(
      (clientX - rect.left) / rect.width * 2 - 1,
      -(clientY - rect.top) / rect.height * 2 + 1
    );
    camera.updateMatrixWorld();
    raycaster.setFromCamera(puntero, camera);
    return raycaster.intersectObjects(mallas, false)[0]?.object.userData.nombrePlaneta ?? null;
  }

  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    gesto = { id: event.pointerId, x: event.clientX, y: event.clientY, arrastre: false };
  });

  canvas.addEventListener('pointermove', event => {
    if (!gesto || event.pointerId !== gesto.id) return;
    if (Math.hypot(event.clientX - gesto.x, event.clientY - gesto.y) > 6) {
      gesto.arrastre = true;
    }
  });

  canvas.addEventListener('pointerup', event => {
    if (!gesto || event.pointerId !== gesto.id) return;
    const fueArrastre = gesto.arrastre ||
      Math.hypot(event.clientX - gesto.x, event.clientY - gesto.y) > 6;
    gesto = null;
    if (fueArrastre) {
      ultimoClic = null;
      return;
    }

    const dobleClicCercano = ultimoClic &&
      event.timeStamp - ultimoClic.tiempo < 380 &&
      Math.hypot(event.clientX - ultimoClic.x, event.clientY - ultimoClic.y) < 10;
    const nombre = planetaEn(event.clientX, event.clientY);
    // El primer clic ya puede estar girando la cámara; el segundo puede caer
    // fuera de la malla aunque el puntero no se haya movido.
    if (dobleClicCercano && (!nombre || nombre === ultimoClic.nombre)) {
      explorarSeleccionado();
      ultimoClic = null;
      return;
    }
    if (!nombre) {
      ultimoClic = null;
      return;
    }

    seleccionar(nombre);
    ultimoClic = { nombre, x: event.clientX, y: event.clientY, tiempo: event.timeStamp };
  });

  canvas.addEventListener('pointercancel', () => { gesto = null; });

  return {
    actualizar,
    alActualizarPosiciones,
    alCambiarTamano,
    seleccionar,
    explorarSeleccionado,
    vistaGeneral,
    vistaCinematografica,
    modoVistaActual: () => modoVista,
    nombreSeleccionado: () => seleccionado
  };
}
