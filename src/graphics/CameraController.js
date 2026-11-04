import * as THREE from 'three';
import { calcularEncuadreVista } from './OverviewFraming.js';
import { horizontalFovFromVertical, verticalFovForSquareFootprint } from './InstrumentFov.js';
import {
  projectedRingHalfTangents,
  requiredVerticalFovDeg,
  sphereAngularDiameterDeg,
  sphereHalfTangent
} from './AngularGeometry.js';
import {
  MODOS_ESCALA_VISUAL,
  REGIONES_SISTEMA,
  obtenerRadioFisicoEscena
} from './ScaleModeConfig.js';

const DISTANCIA_MAXIMA = 24000;
const FOV_EXTERIOR_GRADOS = 48;
const FOV_MIN_PRIMERA_PERSONA = 0.35;
const FOV_MAX_PRIMERA_PERSONA = 150;
const FRACCION_ENCUADRE = 0.64;
const OBJETIVOS_CONTEXTO_VOYAGER = new Set(['Jupiter','Saturno','Urano','Neptuno']);

export const MODOS_CAMARA_HISTORICA = Object.freeze({
  EXTERIOR: 'exterior',
  PRIMERA_PERSONA: 'first_person',
  RECREACION_FOTOGRAFICA: 'photo_recreation'
});

function suavizar(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function crearControladorCamara({
  camera,
  controls,
  canvas,
  objetos,
  orbitas,
  obtenerZonaEncuadre,
  alSeleccionar,
  sonda = null,
  alSeleccionarSonda = null,
  sondasHistoricas = new Map(),
  satelites = new Map(),
  lunasPlanetarias = new Map(),
  alSeleccionarLuna = null,
  alSeleccionarSondaHistorica = null,
  alCambiarEstadoCamaraHistorica = null,
  obtenerModoEscala = () => MODOS_ESCALA_VISUAL.CIENTIFICA,
  obtenerEtiquetas = () => null
}) {
  const raycaster = new THREE.Raycaster();
  const puntero = new THREE.Vector2();
  const proyectadoScratch = new THREE.Vector3();
  const delanteScratch = new THREE.Vector3();
  const dirMiradaScratch = new THREE.Vector3();
  const puntoMiradaScratch = new THREE.Vector3();
  const centroSol = new THREE.Vector3(0, 0, 0);
  const mallasPlanetas = [];

  for (const [nombre, objeto] of objetos) {
    objeto.posicion.traverse(nodo => {
      if (!nodo.isMesh) return;
      nodo.userData.nombrePlaneta = nombre;
      mallasPlanetas.push(nodo);
    });
  }
  for (const [nombre, luna] of lunasPlanetarias) {
    luna.mesh.userData.nombreLuna = nombre;
    mallasPlanetas.push(luna.mesh);
  }
  for (const [nombre, luna] of satelites) {
    luna.malla.userData.nombreLuna = nombre;
    mallasPlanetas.push(luna.malla);
  }

  let seleccionado = null;
  let sondaEnfocada = false;
  let idSondaHistoricaEnfocada = null;
  let modoCamaraHistorica = MODOS_CAMARA_HISTORICA.EXTERIOR;
  let idSondaPrimeraPersona = null;
  let objetivoMirada = 'Tierra'; // 'Tierra' | 'Sol' | planeta | satelite | otra sonda | null (orientación libre)
  let yawPrimeraPersona = 0;
  let pitchPrimeraPersona = 0;
  let fovPrimeraPersona = 45;
  let fovTipo = 'contextual_vertical';
  let fovContextualAutomatico = false;
  let fotoUsaFovContexto = false;
  let transicionOrientacion = null;
  let fotoRecreacionActiva = null;
  let contextosLocales = Object.freeze({});

  let transicion = null;
  let gesto = null;
  let ultimoClic = null;
  let modoVista = 'cientifica';
  let regionSistema = REGIONES_SISTEMA.COMPLETO;
  let posicionesListas = false;

  function enPrimeraPersonaORecreacion() {
    return modoCamaraHistorica === MODOS_CAMARA_HISTORICA.PRIMERA_PERSONA
      || modoCamaraHistorica === MODOS_CAMARA_HISTORICA.RECREACION_FOTOGRAFICA;
  }

  function contextoLocal(idSonda, objetivo) {
    return contextosLocales?.[`${idSonda}:${objetivo}`] ?? null;
  }

  function posicionObservador(idSonda, objetivo) {
    const local=contextoLocal(idSonda,objetivo)?.observerPositionScene;
    return local
      ? new THREE.Vector3(local.x,local.y,local.z)
      : sondasHistoricas.get(idSonda)?.posicion.position ?? null;
  }

  function establecerContextosLocales(nuevos) {
    const anterior=enPrimeraPersonaORecreacion()
      ? contextoLocal(idSondaPrimeraPersona,objetivoMirada) : null;
    contextosLocales=nuevos ?? Object.freeze({});
    if(anterior&&!contextoLocal(idSondaPrimeraPersona,objetivoMirada)) {
      // La ventana local terminó: cambia explícitamente a la vista global.
      salirDePrimeraPersonaHaciaExterior();
    }
  }

  function notificarCamaraHistorica() {
    alCambiarEstadoCamaraHistorica?.(obtenerEstadoCamaraHistorica());
  }

  function obtenerEstadoCamaraHistorica() {
    const local=enPrimeraPersonaORecreacion()
      ? contextoLocal(idSondaPrimeraPersona,objetivoMirada) : null;
    let tipoOrientacion = 'orbita_exterior';
    if (modoCamaraHistorica === MODOS_CAMARA_HISTORICA.RECREACION_FOTOGRAFICA) {
      tipoOrientacion = 'recreacion_fotografica_aproximada';
    } else if (modoCamaraHistorica === MODOS_CAMARA_HISTORICA.PRIMERA_PERSONA) {
      tipoOrientacion = objetivoMirada ? 'apuntado_geometrico' : 'libre_usuario';
    }
    const encuadre = enPrimeraPersonaORecreacion()
      ? geometriaEncuadreContextual(idSondaPrimeraPersona, objetivoMirada)
      : null;
    return Object.freeze({
      modo: modoCamaraHistorica,
      idSondaObservador: enPrimeraPersonaORecreacion() ? idSondaPrimeraPersona : idSondaHistoricaEnfocada,
      idSondaExterior: idSondaHistoricaEnfocada,
      objetoExteriorSeleccionado: seleccionado,
      sondaExperimentalEnfocada: sondaEnfocada,
      objetivoMirada: enPrimeraPersonaORecreacion() ? objetivoMirada : null,
      fovGrados: camera.fov,
      fovReferenciaGrados: enPrimeraPersonaORecreacion() ? fovPrimeraPersona : camera.fov,
      fovHorizontalGrados: horizontalFovFromVertical(camera.fov, camera.aspect),
      fovTipo: enPrimeraPersonaORecreacion() ? fovTipo : 'exterior_vertical',
      encuadreObjetivo: encuadre ? Object.freeze({
        diametroEsferaGrados: encuadre.diametroEsferaGrados,
        incluyeAnillos: encuadre.incluyeAnillos,
        fovVerticalNecesarioGrados: encuadre.fovVerticalNecesarioGrados,
        cabeEnAreaLibre: fovTipo === 'contextual_vertical'
          ? camera.fov + 0.05 >= encuadre.fovVerticalNecesarioGrados
          : null
      }) : null,
      fotoUsaFovContexto,
      posicionEscena: Object.freeze(camera.position.toArray()),
      objetivoEscena: Object.freeze(controls.target.toArray()),
      transicionActiva: transicion !== null || transicionOrientacion !== null,
      modoVista,
      tipoOrientacion,
      contextoGeometria:local?'encuentro_local':'trayectoria_global',
      fuenteContextoLocal:local?.source??null,
      datasetContextoLocal:local?.datasetId??null,
      objetivoSinContextoLocal:enPrimeraPersonaORecreacion()
        && (Boolean(satelites.get(objetivoMirada)?.posicion.visible)
          || OBJETIVOS_CONTEXTO_VOYAGER.has(objetivoMirada)) && !local,
      fotoRecreacionId: fotoRecreacionActiva?.id ?? null
    });
  }

  function sincronizarOcultamientoPrimeraPersona() {
    for (const [id, sHist] of sondasHistoricas.entries()) {
      const ocultar = enPrimeraPersonaORecreacion() && id === idSondaPrimeraPersona;
      sHist.establecerOcultaPorPrimeraPersona(ocultar);
    }
  }

  function restaurarFovExterior() {
    if (Math.abs(camera.fov - FOV_EXTERIOR_GRADOS) > 1e-3) {
      camera.fov = FOV_EXTERIOR_GRADOS;
      camera.updateProjectionMatrix();
    }
  }

  function salirDePrimeraPersonaHaciaExterior() {
    if (!enPrimeraPersonaORecreacion()) return;
    const sondaPrev = sondasHistoricas.get(idSondaPrimeraPersona);
    modoCamaraHistorica = MODOS_CAMARA_HISTORICA.EXTERIOR;
    transicionOrientacion = null;
    fotoRecreacionActiva = null;
    fotoUsaFovContexto = false;
    fovTipo = 'contextual_vertical';
    fovContextualAutomatico = false;
    sincronizarOcultamientoPrimeraPersona();
    restaurarFovExterior();
    controls.enabled = true;

    if (sondaPrev?.posicion.visible) {
      idSondaHistoricaEnfocada = idSondaPrimeraPersona;
      const centro = sondaPrev.posicion.position;
      const rObs = sondaPrev.obtenerRadioObservacionActual();
      camera.position.copy(centro).add(new THREE.Vector3(rObs * 2.2, rObs * 1.4, rObs * 2.6));
      controls.target.copy(centro);
      controls.minDistance = rObs * 1.15;
      controls.maxDistance = DISTANCIA_MAXIMA;
      controls.update();
    }
    notificarCamaraHistorica();
  }

  function cancelarTransicionInteractiva() {
    if (!transicion) return;
    transicion = null;
    if (!enPrimeraPersonaORecreacion()) {
      controls.enabled = true;
      controls.update();
    }
  }

  function radioBaseModoPlaneta(nombre) {
    if (lunasPlanetarias.has(nombre)) return lunasPlanetarias.get(nombre).radioEscena;
    if (satelites.get(nombre)?.posicion.visible) return satelites.get(nombre).radioFisicoEscena;
    const modoEscala = enPrimeraPersonaORecreacion() ? MODOS_ESCALA_VISUAL.CIENTIFICA : obtenerModoEscala();
    if (modoEscala === MODOS_ESCALA_VISUAL.CIENTIFICA) {
      return obtenerRadioFisicoEscena(nombre);
    }
    return objetos.get(nombre).planeta.radio;
  }

  function radioActualMundoPlaneta(nombre) {
    if (lunasPlanetarias.has(nombre)) return lunasPlanetarias.get(nombre).radioEscena;
    if (satelites.get(nombre)?.posicion.visible) return satelites.get(nombre).radioFisicoEscena;
    const objeto = objetos.get(nombre);
    return objeto.planeta.radio * Math.max(objeto.posicion.scale.x, 1e-6);
  }

  function radioEncuadre(nombre) {
    const radio = radioActualMundoPlaneta(nombre);
    return radio * (nombre === 'Saturno' ? 2.02 : 1.014);
  }

  function sondaExteriorActiva() {
    if (idSondaHistoricaEnfocada && sondasHistoricas.has(idSondaHistoricaEnfocada)) {
      return sondasHistoricas.get(idSondaHistoricaEnfocada);
    }
    if (sondaEnfocada && sonda) return sonda;
    return null;
  }

  function radioObservacionSondaActiva() {
    const activa = sondaExteriorActiva();
    return activa?.obtenerRadioObservacionActual
      ? activa.obtenerRadioObservacionActual()
      : 0.78;
  }

  function encuadreActual() {
    const opciones = regionSistema === REGIONES_SISTEMA.INTERIOR
      ? { region: REGIONES_SISTEMA.INTERIOR, usarRadiosActuales: true, sonda }
      : (obtenerModoEscala() === MODOS_ESCALA_VISUAL.CIENTIFICA
        ? { region: REGIONES_SISTEMA.COMPLETO, usarRadiosActuales: true, sonda }
        : null);
    return calcularEncuadreVista(camera, objetos, obtenerZonaEncuadre(), opciones);
  }

  function aplicarEncuadre() {
    if (enPrimeraPersonaORecreacion()) return;
    const { posicion, objetivo } = encuadreActual();
    camera.position.copy(posicion);
    controls.target.copy(objetivo);
    camera.lookAt(objetivo);
    controls.update();
  }

  function distanciaObservacion(direccion) {
    if ((sondaEnfocada || idSondaHistoricaEnfocada) && !seleccionado) {
      return radioObservacionSondaActiva() * 3.15;
    }
    // La compensación del inspector se aplica a la proyección, sin alterar
    // esta distancia física de observación ni compensar dos veces el zoom.
    const mitadVertical = THREE.MathUtils.degToRad(camera.fov) / 2;
    const mitadHorizontal = Math.atan(Math.tan(mitadVertical) * camera.aspect);
    const radioPlanetaModo = radioBaseModoPlaneta(seleccionado);
    let radioVertical = radioPlanetaModo * 1.014;
    let radioHorizontal = radioVertical;

    if (seleccionado === 'Saturno') {
      const anillo = objetos.get(seleccionado).posicion.children[0].children
        .find(nodo => nodo.geometry?.type === 'RingGeometry');
      anillo.updateWorldMatrix(true, false);
      const giro = anillo.getWorldQuaternion(new THREE.Quaternion());
      const ejeX = new THREE.Vector3(1, 0, 0).applyQuaternion(giro);
      const ejeY = new THREE.Vector3(1 - 1, 1, 0).applyQuaternion(giro);
      const arriba = camera.up.clone().addScaledVector(direccion, -camera.up.dot(direccion));
      if (arriba.lengthSq() < 1e-6) arriba.set(0, 0, 1);
      arriba.normalize();
      const derecha = new THREE.Vector3().crossVectors(direccion, arriba).normalize();
      const radioAnillo = radioPlanetaModo * 2.02;
      radioVertical = Math.max(radioVertical,
        radioAnillo * Math.hypot(ejeX.dot(arriba), ejeY.dot(arriba)));
      radioHorizontal = Math.max(radioHorizontal,
        radioAnillo * Math.hypot(ejeX.dot(derecha), ejeY.dot(derecha)));
    }

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
    let despejeMinimo = Infinity;
    const longitud = control
      ? inicio.distanceTo(control) + control.distanceTo(fin)
      : inicio.distanceTo(fin);
    const muestras = Math.max(64, Math.min(1024, Math.ceil(longitud / 4)));
    const margenSolar = obtenerModoEscala() === MODOS_ESCALA_VISUAL.CIENTIFICA ? 0.24 : 5.6;

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

      despejeMinimo = Math.min(despejeMinimo, distanciaAlCentro(centroSol) - margenSolar);
      for (const [nombre, objeto] of objetos) {
        const margen = radioEncuadre(nombre) * 1.15;
        despejeMinimo = Math.min(despejeMinimo, distanciaAlCentro(objeto.posicion.position) - margen);
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

    for (const amplitud of [0.5, 2, 8, 15, 30, 60, 120, 240, 480, 960, 1920, 3840]) {
      for (const direccion of [vertical, lateral, vertical.clone().negate(), lateral.clone().negate()]) {
        const control = mitad.clone().addScaledVector(direccion, amplitud);
        if (despejeRuta(inicio, fin, control) > 0) return control;
      }
    }
    return null;
  }

  function actualizarOrbitas() {
    if (enPrimeraPersonaORecreacion()) {
      for (const orbita of orbitas) {
        orbita.visible = false;
      }
      return;
    }
    let relacionMinima = Infinity;
    for (const [nombre, objeto] of objetos) {
      const relacion = camera.position.distanceTo(objeto.posicion.position) / Math.max(radioEncuadre(nombre), 1e-6);
      relacionMinima = Math.min(relacionMinima, relacion);
    }
    const centroSel = centroSeleccionado();
    const relacionSeleccionado = seleccionado && centroSel
      ? camera.position.distanceTo(centroSel) / Math.max(radioEncuadre(seleccionado), 1e-6)
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
    if (idSondaHistoricaEnfocada && sondasHistoricas.has(idSondaHistoricaEnfocada)) {
      return sondasHistoricas.get(idSondaHistoricaEnfocada).posicion.position;
    }
    if (sondaEnfocada && sonda) return sonda.posicion.position;
    if (lunasPlanetarias.get(seleccionado)?.posicion.visible) {
      return lunasPlanetarias.get(seleccionado).posicion.position;
    }
    if (satelites.get(seleccionado)?.posicion.visible) {
      return satelites.get(seleccionado).posicion.position;
    }
    return objetos.get(seleccionado)?.posicion.position ?? null;
  }

  function distanciaMinima() {
    if ((sondaEnfocada || idSondaHistoricaEnfocada) && !seleccionado) {
      return radioObservacionSondaActiva() * 1.15;
    }
    if (!seleccionado) {
      return obtenerModoEscala() === MODOS_ESCALA_VISUAL.CIENTIFICA ? 0.25 : 4;
    }
    const radioPlanetaModo = radioBaseModoPlaneta(seleccionado);
    return radioPlanetaModo * (seleccionado === 'Saturno' ? 2.65 : 2.35);
  }

  function iniciarTransicion(tipo, duracion, direccion = null, control = null, destinoFijo = null) {
    transicion = {
      tipo,
      duracion: globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0.001 : duracion,
      transcurrido: 0,
      inicioPosicion: camera.position.clone(),
      inicioObjetivo: controls.target.clone(),
      direccion,
      control,
      destinoFijo
    };
    controls.enabled = false;
  }

  function limpiarSeleccionSondas() {
    if (sondaEnfocada) {
      sondaEnfocada = false;
      alSeleccionarSonda?.(false);
    }
    if (idSondaHistoricaEnfocada) {
      idSondaHistoricaEnfocada = null;
      alSeleccionarSondaHistorica?.(null);
    }
  }

  function seleccionar(nombre) {
    if (enPrimeraPersonaORecreacion()) {
      apuntarPrimeraPersonaHacia(nombre);
      return;
    }
    if (seleccionado === nombre && !sondaEnfocada && !idSondaHistoricaEnfocada) return;
    limpiarSeleccionSondas();
    if (
      regionSistema === REGIONES_SISTEMA.INTERIOR
      && nombre
      && !['Mercurio', 'Venus', 'Tierra', 'Marte'].includes(nombre)
    ) {
      regionSistema = REGIONES_SISTEMA.COMPLETO;
    }
    seleccionado = nombre;
    controls.enablePan = false;
    controls.minDistance = distanciaMinima();
    controls.maxDistance = DISTANCIA_MAXIMA;
    iniciarTransicion('centrar', 0.75);
    const esLuna = lunasPlanetarias.has(nombre) || Boolean(satelites.get(nombre)?.posicion.visible);
    alSeleccionar?.(esLuna ? null : nombre);
    alSeleccionarLuna?.(esLuna ? nombre : null);
    notificarCamaraHistorica();
  }

  function seleccionarSonda() {
    if (!sonda || !sonda.posicion.visible) return false;
    salirDePrimeraPersonaHaciaExterior();
    if (seleccionado !== null) {
      seleccionado = null;
      alSeleccionar?.(null);
    }
    if (idSondaHistoricaEnfocada) {
      idSondaHistoricaEnfocada = null;
      alSeleccionarSondaHistorica?.(null);
    }
    if (!sondaEnfocada) {
      sondaEnfocada = true;
      controls.enablePan = false;
      controls.minDistance = distanciaMinima();
      controls.maxDistance = DISTANCIA_MAXIMA;
      iniciarTransicion('centrar', 0.75);
      alSeleccionarSonda?.(true);
    }
    return true;
  }

  function enfocarSonda() {
    if (!sonda || !sonda.posicion.visible) return false;
    salirDePrimeraPersonaHaciaExterior();
    if (seleccionado !== null) {
      seleccionado = null;
      alSeleccionar?.(null);
    }
    if (idSondaHistoricaEnfocada) {
      idSondaHistoricaEnfocada = null;
      alSeleccionarSondaHistorica?.(null);
    }
    if (!sondaEnfocada) {
      sondaEnfocada = true;
      alSeleccionarSonda?.(true);
    }
    controls.enablePan = false;
    controls.minDistance = distanciaMinima();
    controls.maxDistance = DISTANCIA_MAXIMA;

    const centro = sonda.posicion.position;
    const haciaSol = centro.clone().negate();
    if (haciaSol.lengthSq() < 1e-6) haciaSol.set(0, 0, 1);
    haciaSol.normalize();
    const tangente = new THREE.Vector3(-haciaSol.z, 0, haciaSol.x);
    if (tangente.lengthSq() < 1e-6) tangente.set(1, 0, 0);
    tangente.normalize();
    const direccion = haciaSol.clone().multiplyScalar(0.54)
      .addScaledVector(tangente, 0.74)
      .addScaledVector(camera.up, 0.34)
      .normalize();

    const destino = centro.clone().addScaledVector(direccion, distanciaObservacion(direccion));
    const control = controlDeRuta(camera.position, destino);
    const duracion = THREE.MathUtils.clamp(1.55 + camera.position.distanceTo(destino) / 600, 1.55, 4.2);
    iniciarTransicion('explorar', duracion, direccion, control);
    return true;
  }

  /**
   * Enfoca en cámara exterior cualquiera de las sondas históricas (`voyager-1` o `voyager-2`),
   * siguiendo dinámicamente su desplazamiento histórico.
   */
  function enfocarSondaHistorica(idSondaHist, { inmediato = false } = {}) {
    const sHist = sondasHistoricas.get(idSondaHist);
    if (!sHist || !sHist.posicion.visible) return false;
    salirDePrimeraPersonaHaciaExterior();

    if (seleccionado !== null) {
      seleccionado = null;
      alSeleccionar?.(null);
    }
    if (sondaEnfocada) {
      sondaEnfocada = false;
      alSeleccionarSonda?.(false);
    }
    idSondaHistoricaEnfocada = idSondaHist;
    alSeleccionarSondaHistorica?.(idSondaHist);

    controls.enablePan = false;
    controls.minDistance = distanciaMinima();
    controls.maxDistance = DISTANCIA_MAXIMA;

    const centro = sHist.posicion.position;
    const haciaSol = centro.clone().negate();
    if (haciaSol.lengthSq() < 1e-6) haciaSol.set(0, 0, 1);
    haciaSol.normalize();
    const tangente = new THREE.Vector3(-haciaSol.z, 0, haciaSol.x);
    if (tangente.lengthSq() < 1e-6) tangente.set(1, 0, 0);
    tangente.normalize();
    const direccion = haciaSol.clone().multiplyScalar(0.50)
      .addScaledVector(tangente, 0.76)
      .addScaledVector(camera.up, 0.36)
      .normalize();

    const distObs = distanciaObservacion(direccion);
    const destino = centro.clone().addScaledVector(direccion, distObs);

    if (inmediato) {
      cancelarTransicionInteractiva();
      camera.position.copy(destino);
      controls.target.copy(centro);
      camera.lookAt(centro);
      controls.enabled = true;
      controls.update();
    } else {
      const control = controlDeRuta(camera.position, destino);
      const duracion = THREE.MathUtils.clamp(1.25 + camera.position.distanceTo(destino) / 1400, 1.25, 3.4);
      iniciarTransicion('explorar', duracion, direccion, control);
    }
    notificarCamaraHistorica();
    return true;
  }

  /** Compone el planeta del encuentro y, si está cerca, la sonda en el área libre. */
  function encuadrarEncuentroHistorico(idSondaHist, nombrePlaneta, { inmediato = false } = {}) {
    const sHist = sondasHistoricas.get(idSondaHist);
    if (!sHist || !sHist.posicion.visible) return false;
    const objPlaneta = objetos.get(nombrePlaneta);
    const lunaHistorica = satelites.get(nombrePlaneta);
    if (!objPlaneta && !lunaHistorica?.posicion.visible) {
      return enfocarSondaHistorica(idSondaHist, { inmediato });
    }

    salirDePrimeraPersonaHaciaExterior();
    if (seleccionado !== null) {
      seleccionado = null;
      alSeleccionar?.(null);
    }
    if (sondaEnfocada) {
      sondaEnfocada = false;
      alSeleccionarSonda?.(false);
    }
    idSondaHistoricaEnfocada = idSondaHist;
    alSeleccionarSondaHistorica?.(idSondaHist);

    controls.enablePan = false;
    controls.minDistance = distanciaMinima();
    controls.maxDistance = DISTANCIA_MAXIMA;

    const centroSonda = sHist.posicion.position;
    const centroPlaneta = objPlaneta?.posicion.position ?? lunaHistorica.posicion.position;
    const separacion = centroSonda.clone().sub(centroPlaneta);
    const distanciaSonda = separacion.length();
    const radioPlaneta = Math.max(radioEncuadre(nombrePlaneta), 1e-5);
    const incluirSonda = distanciaSonda <= radioPlaneta * 8;
    const haciaSonda = distanciaSonda > 1e-6
      ? separacion.clone().divideScalar(distanciaSonda)
      : new THREE.Vector3(-0.38, 0.22, 0.9).normalize();
    const desdePlaneta = incluirSonda ? haciaSonda : camera.position.clone().sub(centroPlaneta).normalize();
    if (desdePlaneta.lengthSq() < 1e-6) desdePlaneta.set(-0.38, 0.22, 0.9).normalize();
    const lateral = new THREE.Vector3(-desdePlaneta.z, 0, desdePlaneta.x);
    if (lateral.lengthSq() < 1e-6) lateral.set(1, 0, 0);
    lateral.normalize();
    const direccion = desdePlaneta.clone().addScaledVector(lateral, 0.22)
      .addScaledVector(camera.up, 0.12).normalize();
    const objetivo = centroPlaneta.clone();
    if (incluirSonda) objetivo.addScaledVector(separacion, 0.16);
    const zona = obtenerZonaEncuadre();
    const fraccionHorizontal = Math.max(0.35, (zona.right - zona.left) / zona.width);
    const fraccionVertical = Math.max(0.35, (zona.bottom - zona.top) / zona.height);
    const mitadVertical = THREE.MathUtils.degToRad(camera.fov) / 2;
    const mitadHorizontal = Math.atan(Math.tan(mitadVertical) * camera.aspect);
    const anguloEncuadre = Math.min(mitadVertical * fraccionVertical, mitadHorizontal * fraccionHorizontal) * 0.82;
    const radioComposicion = incluirSonda
      ? Math.max(radioPlaneta * 1.45, distanciaSonda * 0.30 + radioPlaneta)
      : radioPlaneta * 1.45;
    const distObs = Math.max(radioPlaneta * 5.2,
      radioComposicion / Math.tan(anguloEncuadre),
      incluirSonda ? distanciaSonda + radioPlaneta * 2.4 : 0);
    const destino = centroPlaneta.clone().addScaledVector(direccion, distObs);

    if (inmediato) {
      cancelarTransicionInteractiva();
      camera.position.copy(destino);
      controls.target.copy(objetivo);
      camera.lookAt(objetivo);
      controls.enabled = true;
      controls.update();
    } else {
      const duracion = THREE.MathUtils.clamp(1.2 + camera.position.distanceTo(destino) / 1400, 1.2, 3.0);
      iniciarTransicion('fijo', duracion, null, null, { posicion: destino, objetivo });
    }
    notificarCamaraHistorica();
    return true;
  }

  /**
   * Encuadra simultáneamente Voyager 1, Voyager 2 y el Sol sin modificar sus distancias reales.
   */
  function encuadrarComparativaHistorica() {
    salirDePrimeraPersonaHaciaExterior();
    limpiarSeleccionSondas();
    if (seleccionado !== null) {
      seleccionado = null;
      alSeleccionar?.(null);
    }

    const puntos = [new THREE.Vector3(0, 0, 0)];
    for (const sHist of sondasHistoricas.values()) {
      if (sHist.posicion.visible) {
        puntos.push(sHist.posicion.position.clone());
      }
    }
    if (puntos.length === 1 && objetos.has('Neptuno')) {
      puntos.push(objetos.get('Neptuno').posicion.position.clone());
    }

    const caja = new THREE.Box3().setFromPoints(puntos);
    const centro = caja.getCenter(new THREE.Vector3());
    const esfera = caja.getBoundingSphere(new THREE.Sphere());
    const radio = Math.max(esfera.radius, 48);

    const fovRad = THREE.MathUtils.degToRad(FOV_EXTERIOR_GRADOS);
    const dist = Math.min(DISTANCIA_MAXIMA * 0.92, (radio / Math.tan(fovRad * 0.42)) * 1.25);
    const dirVista = new THREE.Vector3(-0.34, 0.52, 0.78).normalize();
    const destinoPos = centro.clone().addScaledVector(dirVista, dist);

    controls.enablePan = true;
    controls.minDistance = 0.35;
    controls.maxDistance = DISTANCIA_MAXIMA;
    iniciarTransicion('fijo', 1.4, null, null, {
      posicion: destinoPos,
      objetivo: centro
    });
    notificarCamaraHistorica();
    return true;
  }

  /**
   * Presentación cinematográfica discreta de salida desde la Tierra en 1977.
   */
  function encuadrarSalidaTierra1977() {
    salirDePrimeraPersonaHaciaExterior();
    seleccionar('Tierra');
    return explorarSeleccionado();
  }

  function resolverPosicionObjetivoMirada(idObjetivo) {
    if (!idObjetivo) return null;
    if (idObjetivo === 'Sol') return centroSol;
    if (objetos.has(idObjetivo)) return objetos.get(idObjetivo).posicion.position;
    if (satelites.has(idObjetivo) && satelites.get(idObjetivo).posicion.visible) {
      return satelites.get(idObjetivo).posicion.position;
    }
    if (sondasHistoricas.has(idObjetivo) && sondasHistoricas.get(idObjetivo).posicion.visible) {
      return sondasHistoricas.get(idObjetivo).posicion.position;
    }
    return null;
  }

  function actualizarAngulosDesdeDireccion(dirUnit) {
    const clampedY = THREE.MathUtils.clamp(dirUnit.y, -0.9995, 0.9995);
    pitchPrimeraPersona = Math.asin(clampedY);
    yawPrimeraPersona = Math.atan2(dirUnit.x, dirUnit.z);
  }

  /**
   * Activa la Cámara en Primera Persona en la posición histórica exacta de `idSondaHist`.
   */
  function activarPrimeraPersona(idSondaHist, {
    objetivo = objetivoMirada ?? 'Tierra',
    fovGrados = 45
  } = {}) {
    const sHist = sondasHistoricas.get(idSondaHist);
    if (!sHist || !sHist.posicion.visible) return false;

    cancelarTransicionInteractiva();
    if (seleccionado !== null) {
      seleccionado = null;
      alSeleccionar?.(null);
    }
    if (sondaEnfocada) {
      sondaEnfocada = false;
      alSeleccionarSonda?.(false);
    }

    modoCamaraHistorica = MODOS_CAMARA_HISTORICA.PRIMERA_PERSONA;
    transicionOrientacion = null;
    fotoRecreacionActiva = null;
    fotoUsaFovContexto = false;
    idSondaPrimeraPersona = idSondaHist;
    idSondaHistoricaEnfocada = idSondaHist;
    alSeleccionarSondaHistorica?.(idSondaHist);

    objetivoMirada = objetivo === idSondaHist ? 'Tierra' : objetivo;
    establecerFovInterno(fovGrados);
    fovContextualAutomatico = fovTipo === 'contextual_vertical'
      && Math.abs(fovPrimeraPersona-obtenerFovContextualParaObjetivo(idSondaHist,objetivoMirada)) < 0.05;

    controls.enabled = false;
    sincronizarOcultamientoPrimeraPersona();

    const posObservador = posicionObservador(idSondaHist,objetivo);
    camera.position.copy(posObservador);
    const posObj = resolverPosicionObjetivoMirada(objetivoMirada) ?? centroSol;
    dirMiradaScratch.copy(posObj).sub(posObservador);
    if (dirMiradaScratch.lengthSq() > 1e-12) {
      dirMiradaScratch.normalize();
      actualizarAngulosDesdeDireccion(dirMiradaScratch);
    }
    aplicarOrientacionPrimeraPersona();
    notificarCamaraHistorica();
    return true;
  }

  /**
   * Activa la Cámara Fotográfica Histórica para recrear en 3D la geometría de una fotografía auténtica.
   */
  function activarRecreacionFotografica(foto, { usarFovContexto = false } = {}) {
    if (!foto) return false;
    const sHist = sondasHistoricas.get(foto.missionId);
    if (!sHist || !sHist.posicion.visible) return false;

    cancelarTransicionInteractiva();
    if (seleccionado !== null) {
      seleccionado = null;
      alSeleccionar?.(null);
    }
    if (sondaEnfocada) {
      sondaEnfocada = false;
      alSeleccionarSonda?.(false);
    }

    modoCamaraHistorica = MODOS_CAMARA_HISTORICA.RECREACION_FOTOGRAFICA;
    transicionOrientacion = null;
    fotoRecreacionActiva = foto;
    fotoUsaFovContexto = usarFovContexto;
    idSondaPrimeraPersona = foto.missionId;
    idSondaHistoricaEnfocada = foto.missionId;
    alSeleccionarSondaHistorica?.(foto.missionId);

    objetivoMirada = resolverPosicionObjetivoMirada(foto.targetBody) ? foto.targetBody : 'Sol';
    const fovContexto = satelites.get(foto.targetBody)?.posicion.visible
      ? obtenerFovContextualParaObjetivo(foto.missionId, foto.targetBody)
      : (foto.contextFovDeg ?? 6.0);
    establecerFovInterno(usarFovContexto ? fovContexto : (foto.instrumentFovDeg ?? 0.424), !usarFovContexto);
    fovContextualAutomatico = false;

    controls.enabled = false;
    sincronizarOcultamientoPrimeraPersona();
    aplicarOrientacionPrimeraPersona();
    notificarCamaraHistorica();
    return true;
  }

  function apuntarPrimeraPersonaHacia(nuevoObjetivo) {
    if (!enPrimeraPersonaORecreacion()) return false;
    if (nuevoObjetivo === idSondaPrimeraPersona) return false;
    const posObj = resolverPosicionObjetivoMirada(nuevoObjetivo);
    if (!posObj) return false;
    if (modoCamaraHistorica === MODOS_CAMARA_HISTORICA.RECREACION_FOTOGRAFICA && nuevoObjetivo !== fotoRecreacionActiva?.targetBody) {
      modoCamaraHistorica = MODOS_CAMARA_HISTORICA.PRIMERA_PERSONA;
      fotoRecreacionActiva = null;
    }
    const observador = posicionObservador(idSondaPrimeraPersona,nuevoObjetivo);
    if (!observador) return false;
    dirMiradaScratch.copy(posObj).sub(observador);
    if (dirMiradaScratch.lengthSq() < 1e-12) return false;
    transicionOrientacion = {
      inicioYaw: yawPrimeraPersona,
      inicioPitch: pitchPrimeraPersona,
      transcurrido: 0,
      duracion: globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0.001 : 0.36
    };
    objetivoMirada = nuevoObjetivo;
    aplicarOrientacionPrimeraPersona();
    notificarCamaraHistorica();
    return true;
  }

  function establecerFovPrimeraPersona(grados,{automatico=false}={}) {
    if (!enPrimeraPersonaORecreacion() || !Number.isFinite(grados)) return camera.fov;
    establecerFovInterno(grados);
    fovContextualAutomatico = automatico && modoCamaraHistorica === MODOS_CAMARA_HISTORICA.PRIMERA_PERSONA
      && fovTipo === 'contextual_vertical';
    notificarCamaraHistorica();
    return fovPrimeraPersona;
  }

  function actualizarFovContextualAutomatico() {
    if (!fovContextualAutomatico || modoCamaraHistorica !== MODOS_CAMARA_HISTORICA.PRIMERA_PERSONA) return;
    const necesario=obtenerFovContextualParaObjetivo(idSondaPrimeraPersona,objetivoMirada);
    if (Math.abs(necesario-fovPrimeraPersona)<0.05) return;
    establecerFovInterno(necesario,false);
    notificarCamaraHistorica();
  }

  function obtenerFovContextualParaObjetivo(idSonda, objetivo) {
    const encuadre = geometriaEncuadreContextual(idSonda, objetivo);
    const minimo = satelites.get(objetivo)?.posicion.visible ? FOV_MIN_PRIMERA_PERSONA : 45;
    return encuadre
      ? THREE.MathUtils.clamp(Math.max(minimo, encuadre.fovVerticalNecesarioGrados), minimo, FOV_MAX_PRIMERA_PERSONA)
      : 45;
  }

  function geometriaEncuadreContextual(idSonda, objetivo) {
    const sonda = sondasHistoricas.get(idSonda);
    const centro = resolverPosicionObjetivoMirada(objetivo);
    const esPlaneta = objetos.has(objetivo);
    const luna = satelites.get(objetivo);
    if (!sonda?.posicion.visible || !centro || (!esPlaneta && !luna?.posicion.visible)) return null;
    const observador = posicionObservador(idSonda,objetivo);
    const distancia = observador.distanceTo(centro);
    const radio = esPlaneta ? obtenerRadioFisicoEscena(objetivo) : luna.radioFisicoEscena;
    const diametroEsferaGrados = sphereAngularDiameterDeg(radio, distancia);
    const tangentEsfera = sphereHalfTangent(radio, distancia);
    if (diametroEsferaGrados === null || tangentEsfera === null) return null;
    let halfTangentX = tangentEsfera;
    let halfTangentY = tangentEsfera;
    let incluyeAnillos = false;
    if (objetivo === 'Saturno') {
      const anillo = objetos.get('Saturno').posicion.children[0].children
        .find(nodo => nodo.geometry?.type === 'RingGeometry');
      if (anillo) {
        anillo.updateWorldMatrix(true, false);
        const giro = anillo.getWorldQuaternion(new THREE.Quaternion());
        const escala = anillo.getWorldScale(new THREE.Vector3());
        const forward = centro.clone().sub(observador).normalize();
        const right = new THREE.Vector3().crossVectors(forward, camera.up);
        if (right.lengthSq() < 1e-10) right.set(1, 0, 0);
        right.normalize();
        const up = new THREE.Vector3().crossVectors(right, forward).normalize();
        const ring = projectedRingHalfTangents({
          observer: observador, center: centro,
          axisX: new THREE.Vector3(1, 0, 0).applyQuaternion(giro),
          axisY: new THREE.Vector3(0, 1, 0).applyQuaternion(giro),
          outerRadius: anillo.geometry.parameters.outerRadius * escala.x,
          forward, right, up
        });
        if (ring?.fullyInFront) {
          halfTangentX = Math.max(halfTangentX, ring.horizontal);
          halfTangentY = Math.max(halfTangentY, ring.vertical);
          incluyeAnillos = true;
        } else {
          // Desde dentro de la extensión proyectada del anillo no existe
          // un encuadre completo mediante una proyección frontal finita.
          return null;
        }
      }
    }
    const zona = obtenerZonaEncuadre();
    const fovVerticalNecesarioGrados = requiredVerticalFovDeg({
      halfTangentX, halfTangentY,
      aspect: camera.aspect,
      freeFractionX: (zona.right - zona.left) / zona.width,
      freeFractionY: (zona.bottom - zona.top) / zona.height,
      margin: 0.88
    });
    if (fovVerticalNecesarioGrados === null) return null;
    return { diametroEsferaGrados, incluyeAnillos, fovVerticalNecesarioGrados };
  }

  function establecerFovInterno(grados, instrumental = Math.abs(grados - 0.424) < 1e-6 || Math.abs(grados - 3.2) < 1e-6) {
    fovPrimeraPersona = THREE.MathUtils.clamp(grados, FOV_MIN_PRIMERA_PERSONA, FOV_MAX_PRIMERA_PERSONA);
    fovTipo = instrumental ? 'instrumento_cuadrado' : 'contextual_vertical';
    camera.fov = instrumental
      ? verticalFovForSquareFootprint(fovPrimeraPersona, camera.aspect)
      : fovPrimeraPersona;
    camera.updateProjectionMatrix();
  }

  function restaurarEstadoCamaraHistorica(estado, foto = null) {
    if (!estado) return false;
    if (estado.modo === MODOS_CAMARA_HISTORICA.RECREACION_FOTOGRAFICA && foto) {
      return activarRecreacionFotografica(foto, { usarFovContexto: estado.fotoUsaFovContexto });
    }
    if (estado.modo === MODOS_CAMARA_HISTORICA.PRIMERA_PERSONA) {
      const ok = activarPrimeraPersona(estado.idSondaObservador, {
        objetivo: estado.objetivoMirada || 'Sol',
        fovGrados: estado.fovReferenciaGrados
      });
      if (ok && !estado.objetivoMirada) {
        objetivoMirada = null;
        dirMiradaScratch.fromArray(estado.objetivoEscena).sub(camera.position).normalize();
        actualizarAngulosDesdeDireccion(dirMiradaScratch);
        aplicarOrientacionPrimeraPersona();
        notificarCamaraHistorica();
      }
      return ok;
    }
    salirDePrimeraPersonaHaciaExterior();
    cancelarTransicionInteractiva();
    seleccionado = estado.objetoExteriorSeleccionado ?? null;
    sondaEnfocada = Boolean(estado.sondaExperimentalEnfocada);
    idSondaHistoricaEnfocada = estado.idSondaExterior ?? null;
    alSeleccionarSondaHistorica?.(idSondaHistoricaEnfocada);
    alSeleccionar?.(seleccionado);
    camera.position.fromArray(estado.posicionEscena);
    controls.target.fromArray(estado.objetivoEscena);
    camera.fov = estado.fovGrados;
    camera.updateProjectionMatrix();
    camera.lookAt(controls.target);
    controls.enabled = true;
    controls.update();
    notificarCamaraHistorica();
    return true;
  }

  function aplicarOrientacionPrimeraPersona(segundos = 0) {
    if (!enPrimeraPersonaORecreacion()) return;
    const sHist = sondasHistoricas.get(idSondaPrimeraPersona);
    if (!sHist || !sHist.posicion.visible) return;

    camera.position.copy(posicionObservador(idSondaPrimeraPersona,objetivoMirada));

    if (objetivoMirada) {
      const posObj = resolverPosicionObjetivoMirada(objetivoMirada);
      if (posObj) {
        dirMiradaScratch.copy(posObj).sub(camera.position);
        if (dirMiradaScratch.lengthSq() > 1e-12) {
          dirMiradaScratch.normalize();
          if (transicionOrientacion) {
            const destinoPitch = Math.asin(THREE.MathUtils.clamp(dirMiradaScratch.y, -0.9995, 0.9995));
            const destinoYaw = Math.atan2(dirMiradaScratch.x, dirMiradaScratch.z);
            transicionOrientacion.transcurrido += segundos;
            const t = Math.min(1, transicionOrientacion.transcurrido / transicionOrientacion.duracion);
            const mezcla = suavizar(t);
            const deltaYaw = THREE.MathUtils.euclideanModulo(
              destinoYaw - transicionOrientacion.inicioYaw + Math.PI, 2 * Math.PI
            ) - Math.PI;
            yawPrimeraPersona = transicionOrientacion.inicioYaw + deltaYaw * mezcla;
            pitchPrimeraPersona = THREE.MathUtils.lerp(transicionOrientacion.inicioPitch, destinoPitch, mezcla);
            if (t === 1) transicionOrientacion = null;
          } else {
            actualizarAngulosDesdeDireccion(dirMiradaScratch);
          }
        }
      }
    }

    const cosPitch = Math.cos(pitchPrimeraPersona);
    dirMiradaScratch.set(
      cosPitch * Math.sin(yawPrimeraPersona),
      Math.sin(pitchPrimeraPersona),
      cosPitch * Math.cos(yawPrimeraPersona)
    ).normalize();

    puntoMiradaScratch.copy(camera.position).addScaledVector(dirMiradaScratch, 100);
    camera.up.set(0, 1, 0);
    camera.lookAt(puntoMiradaScratch);
    controls.target.copy(puntoMiradaScratch);
  }

  function explorarSeleccionado() {
    if (!seleccionado || enPrimeraPersonaORecreacion()) return false;

    const centro = centroSeleccionado();
    if (!centro) return false;
    const direccion = camera.position.clone().sub(centro);
    if (direccion.lengthSq() < 1e-12) direccion.set(0, 0.5, 1);
    direccion.normalize();

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
    const duracion = THREE.MathUtils.clamp(
      1.8 + camera.position.distanceTo(destino) / 700, 1.8, 5.2
    );
    iniciarTransicion('explorar', duracion, direccion, control);
    return true;
  }

  function vistaGeneral() {
    salirDePrimeraPersonaHaciaExterior();
    regionSistema = REGIONES_SISTEMA.COMPLETO;
    cambiarVista('cientifica');
  }

  function enfocarRegionSistema(nuevaRegion) {
    if (nuevaRegion !== REGIONES_SISTEMA.INTERIOR && nuevaRegion !== REGIONES_SISTEMA.COMPLETO) {
      return false;
    }
    salirDePrimeraPersonaHaciaExterior();
    regionSistema = nuevaRegion;
    cambiarVista('cientifica');
    return true;
  }

  function vistaCinematografica() {
    salirDePrimeraPersonaHaciaExterior();
    modoVista = 'cinematografica';
    if (!seleccionado && !sondaEnfocada && !idSondaHistoricaEnfocada) seleccionar('Saturno');
    if (idSondaHistoricaEnfocada) enfocarSondaHistorica(idSondaHistoricaEnfocada);
    else if (sondaEnfocada) enfocarSonda();
    else explorarSeleccionado();
  }

  function cambiarVista(modo) {
    salirDePrimeraPersonaHaciaExterior();
    limpiarSeleccionSondas();
    seleccionado = null;
    ultimoClic = null;
    modoVista = modo;
    controls.enablePan = true;
    controls.minDistance = distanciaMinima();
    controls.maxDistance = DISTANCIA_MAXIMA;
    const destino = encuadreActual();
    const control = controlDeRuta(camera.position, destino.posicion);
    iniciarTransicion('vista', modo === 'cientifica' ? 1.45 : 1.7, null, control);
    alSeleccionar?.(null);
    alSeleccionarLuna?.(null);
    notificarCamaraHistorica();
  }

  function alCambiarModoEscala(modoAnterior, modoNuevo) {
    if (enPrimeraPersonaORecreacion()) return;
    if (modoAnterior === modoNuevo) return;
    if (seleccionado) {
      if (lunasPlanetarias.has(seleccionado) || satelites.get(seleccionado)?.posicion.visible) {
        controls.minDistance = distanciaMinima();
        return;
      }
      const radioPrevio = modoAnterior === MODOS_ESCALA_VISUAL.CIENTIFICA
        ? obtenerRadioFisicoEscena(seleccionado)
        : objetos.get(seleccionado).planeta.radio;
      const radioNuevo = radioBaseModoPlaneta(seleccionado);
      const centro = objetos.get(seleccionado).posicion.position;
      const offset = camera.position.clone().sub(centro);
      const distActual = offset.length();
      controls.minDistance = distanciaMinima();
      if (distActual > 0 && distActual < radioPrevio * 40) {
        const razon = radioNuevo / Math.max(radioPrevio, 1e-8);
        cancelarTransicionInteractiva();
        camera.position.copy(centro).addScaledVector(offset.normalize(), Math.max(distActual * razon, controls.minDistance * 1.05));
        controls.target.copy(centro);
        controls.update();
      }
      return;
    }

    const activa = sondaExteriorActiva();
    if (activa) {
      const escalaPrevia = modoAnterior === MODOS_ESCALA_VISUAL.CIENTIFICA ? 0.0025 : 0.075;
      const escalaNueva = modoNuevo === MODOS_ESCALA_VISUAL.CIENTIFICA ? 0.0025 : 0.075;
      const centro = activa.posicion.position;
      const offset = camera.position.clone().sub(centro);
      const distActual = offset.length();
      controls.minDistance = distanciaMinima();
      if (distActual > 0 && distActual < 35 * escalaPrevia) {
        const razon = escalaNueva / escalaPrevia;
        cancelarTransicionInteractiva();
        camera.position.copy(centro).addScaledVector(offset.normalize(), Math.max(distActual * razon, controls.minDistance * 1.05));
        controls.target.copy(centro);
        controls.update();
      }
      return;
    }

    controls.minDistance = distanciaMinima();
  }

  function actualizar(segundos) {
    if (enPrimeraPersonaORecreacion()) {
      aplicarOrientacionPrimeraPersona(segundos);
      actualizarOrbitas();
      return;
    }

    if (!transicion) {
      controls.update();
      actualizarOrbitas();
      return;
    }

    transicion.transcurrido += segundos;
    const t = Math.min(transicion.transcurrido / transicion.duracion, 1);
    const mezcla = suavizar(t);

    let destinoObjetivo;
    let destinoPosicion;
    if (transicion.tipo === 'fijo' && transicion.destinoFijo) {
      destinoObjetivo = transicion.destinoFijo.objetivo;
      destinoPosicion = transicion.destinoFijo.posicion;
    } else {
      const vista = transicion.tipo === 'vista' ? encuadreActual() : null;
      destinoObjetivo = vista?.objetivo ?? centroSeleccionado() ?? centroSol;
      destinoPosicion = vista?.posicion ??
        (transicion.tipo === 'centrar'
          ? transicion.inicioPosicion
          : destinoObjetivo.clone().addScaledVector(transicion.direccion, distanciaObservacion(transicion.direccion)));
    }

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

  function alActualizarPosiciones(centroAnterior, { reencuadrarVista = true } = {}) {
    if (enPrimeraPersonaORecreacion()) {
      posicionesListas = true;
      aplicarOrientacionPrimeraPersona();
      return;
    }
    if (sondaEnfocada || idSondaHistoricaEnfocada) {
      posicionesListas = true;
      return;
    }
    if (!seleccionado) {
      if (!posicionesListas) {
        posicionesListas = true;
        aplicarEncuadre();
      } else if (reencuadrarVista && !transicion) {
        iniciarTransicion('vista', 0.9);
      }
      return;
    }
    if (!centroAnterior) return;
    const centroNuevo = centroSeleccionado();
    if (!centroNuevo) return;
    const desplazamiento = centroNuevo.clone().sub(centroAnterior);
    if (transicion) {
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

  function alActualizarLuna(centroAnterior) {
    if (!centroAnterior || !(lunasPlanetarias.has(seleccionado) || satelites.get(seleccionado)?.posicion.visible) || enPrimeraPersonaORecreacion()) return;
    const delta = centroSeleccionado().clone().sub(centroAnterior);
    camera.position.add(delta);
    controls.target.add(delta);
    if (transicion) {
      transicion.inicioPosicion.add(delta);
      transicion.inicioObjetivo.add(delta);
      transicion.control?.add(delta);
    }
    controls.update();
  }

  function alActualizarPosicionSonda(posicionAnterior) {
    if (!sondaEnfocada || !sonda || !posicionAnterior || enPrimeraPersonaORecreacion()) return;
    const desplazamiento = sonda.posicion.position.clone().sub(posicionAnterior);
    if (transicion) {
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

  function alActualizarPosicionSondaHistorica(idSondaHist, posicionAnterior) {
    if (enPrimeraPersonaORecreacion() && idSondaHist === idSondaPrimeraPersona) {
      aplicarOrientacionPrimeraPersona();
      return;
    }
    if (idSondaHistoricaEnfocada !== idSondaHist || !posicionAnterior) return;
    const sHist = sondasHistoricas.get(idSondaHist);
    if (!sHist || !sHist.posicion.visible) return;
    const desplazamiento = sHist.posicion.position.clone().sub(posicionAnterior);
    if (transicion) {
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
    if (enPrimeraPersonaORecreacion()) {
      if (fovTipo === 'instrumento_cuadrado') establecerFovInterno(fovPrimeraPersona, true);
      aplicarOrientacionPrimeraPersona();
      notificarCamaraHistorica();
      return;
    }
    if (lunasPlanetarias.has(seleccionado) || satelites.get(seleccionado)?.posicion.visible) {
      const centro = centroSeleccionado();
      const direccion = camera.position.clone().sub(centro).normalize();
      const necesaria = distanciaObservacion(direccion);
      if (camera.position.distanceTo(centro) < necesaria) {
        camera.position.copy(centro).addScaledVector(direccion, necesaria);
        controls.target.copy(centro);
        controls.update();
      }
    }
    if (posicionesListas && !seleccionado && !sondaEnfocada && !idSondaHistoricaEnfocada && !transicion) {
      aplicarEncuadre();
    }
  }

  function objetivoProyectadoCercano(clientX, clientY, rect) {
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    camera.getWorldDirection(delanteScratch);

    let mejor = null;
    let menorDistPx = 15;

    for (const [nombre, objeto] of objetos) {
      const pos = objeto.posicion.position;
      proyectadoScratch.copy(pos).sub(camera.position);
      if (proyectadoScratch.dot(delanteScratch) <= 0) continue;
      proyectadoScratch.copy(pos).project(camera);
      if (proyectadoScratch.z >= 1) continue;
      const sx = (proyectadoScratch.x + 1) * rect.width / 2;
      const sy = (1 - proyectadoScratch.y) * rect.height / 2;
      const d = Math.hypot(px - sx, py - sy);
      if (d <= menorDistPx) {
        menorDistPx = d;
        mejor = { tipo: 'planeta', id: nombre };
      }
    }

    if (sonda?.posicion.visible) {
      const pos = sonda.posicion.position;
      proyectadoScratch.copy(pos).sub(camera.position);
      if (proyectadoScratch.dot(delanteScratch) > 0) {
        proyectadoScratch.copy(pos).project(camera);
        if (proyectadoScratch.z < 1) {
          const sx = (proyectadoScratch.x + 1) * rect.width / 2;
          const sy = (1 - proyectadoScratch.y) * rect.height / 2;
          const d = Math.hypot(px - sx, py - sy);
          if (d <= menorDistPx) {
            menorDistPx = d;
            mejor = { tipo: 'sonda', id: '__SONDA__' };
          }
        }
      }
    }

    for (const [idHist, sHist] of sondasHistoricas.entries()) {
      if (!sHist.posicion.visible || !sHist.visual.visible) continue;
      const pos = sHist.posicion.position;
      proyectadoScratch.copy(pos).sub(camera.position);
      if (proyectadoScratch.dot(delanteScratch) > 0) {
        proyectadoScratch.copy(pos).project(camera);
        if (proyectadoScratch.z < 1) {
          const sx = (proyectadoScratch.x + 1) * rect.width / 2;
          const sy = (1 - proyectadoScratch.y) * rect.height / 2;
          const d = Math.hypot(px - sx, py - sy);
          if (d <= menorDistPx) {
            menorDistPx = d;
            mejor = { tipo: 'sonda_historica', id: idHist };
          }
        }
      }
    }

    return mejor;
  }

  function objetivoEn(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    puntero.set(
      (clientX - rect.left) / rect.width * 2 - 1,
      -(clientY - rect.top) / rect.height * 2 + 1
    );
    camera.updateMatrixWorld();
    raycaster.setFromCamera(puntero, camera);

    const candidatasMallas = [...mallasPlanetas];
    if (sonda?.posicion.visible && sonda.mallasSeleccionables) {
      candidatasMallas.push(...sonda.mallasSeleccionables);
    }
    for (const sHist of sondasHistoricas.values()) {
      if (sHist.posicion.visible && sHist.visual.visible && sHist.mallasSeleccionables) {
        candidatasMallas.push(...sHist.mallasSeleccionables);
      }
    }

    const intersecciones = raycaster.intersectObjects(candidatasMallas, false);
    for (const hit of intersecciones) {
      if (hit.object.userData.nombreLuna && (lunasPlanetarias.get(hit.object.userData.nombreLuna)?.posicion.visible || satelites.get(hit.object.userData.nombreLuna)?.posicion.visible)) {
        return { tipo: 'luna', id: hit.object.userData.nombreLuna };
      }
      if (hit.object.userData.esSonda) {
        const idSondaHit = hit.object.userData.idSonda ?? '__SONDA__';
        if (idSondaHit === '__SONDA__' && sonda?.posicion.visible) {
          return { tipo: 'sonda', id: '__SONDA__' };
        }
        if (sondasHistoricas.has(idSondaHit) && sondasHistoricas.get(idSondaHit).posicion.visible) {
          return { tipo: 'sonda_historica', id: idSondaHit };
        }
        continue;
      }
      if (hit.object.userData.nombrePlaneta) {
        return { tipo: 'planeta', id: hit.object.userData.nombrePlaneta };
      }
    }

    const etiquetas = obtenerEtiquetas();
    const porEtiqueta = etiquetas?.objetivoEnPantalla?.(clientX, clientY);
    if (porEtiqueta) return porEtiqueta;

    return objetivoProyectadoCercano(clientX, clientY, rect);
  }

  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    gesto = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      prevX: event.clientX,
      prevY: event.clientY,
      arrastre: false
    };
  });

  canvas.addEventListener('pointermove', event => {
    if (gesto && event.pointerId === gesto.id) {
      if (Math.hypot(event.clientX - gesto.x, event.clientY - gesto.y) > 5) {
        gesto.arrastre = true;
        cancelarTransicionInteractiva();
      }
      if (gesto.arrastre && enPrimeraPersonaORecreacion()) {
        transicionOrientacion = null;
        const dx = event.clientX - gesto.prevX;
        const dy = event.clientY - gesto.prevY;
        gesto.prevX = event.clientX;
        gesto.prevY = event.clientY;
        const sensibilidad = THREE.MathUtils.degToRad(camera.fov) / Math.max(canvas.clientHeight, 320);
        yawPrimeraPersona += dx * sensibilidad;
        pitchPrimeraPersona = THREE.MathUtils.clamp(
          pitchPrimeraPersona + dy * sensibilidad,
          -Math.PI * 0.495,
          Math.PI * 0.495
        );
        if (objetivoMirada !== null || modoCamaraHistorica === MODOS_CAMARA_HISTORICA.RECREACION_FOTOGRAFICA) {
          objetivoMirada = null;
          if (modoCamaraHistorica === MODOS_CAMARA_HISTORICA.RECREACION_FOTOGRAFICA) {
            modoCamaraHistorica = MODOS_CAMARA_HISTORICA.PRIMERA_PERSONA;
            fotoRecreacionActiva = null;
          }
          notificarCamaraHistorica();
        }
        aplicarOrientacionPrimeraPersona();
      }
      return;
    }

    const hover = objetivoEn(event.clientX, event.clientY);
    obtenerEtiquetas()?.establecerHover?.(hover?.id ?? null);
    canvas.style.cursor = hover ? 'pointer' : (enPrimeraPersonaORecreacion() ? 'grab' : '');
  });

  canvas.addEventListener('pointerleave', () => {
    obtenerEtiquetas()?.establecerHover?.(null);
    canvas.style.cursor = '';
  });

  canvas.addEventListener('wheel', event => {
    if (enPrimeraPersonaORecreacion()) {
      event.preventDefault();
      const factor = event.deltaY > 0 ? 1.14 : (1 / 1.14);
      establecerFovPrimeraPersona(camera.fov * factor);
      return;
    }
    cancelarTransicionInteractiva();
  }, { passive: false });

  canvas.addEventListener('pointerup', event => {
    if (!gesto || event.pointerId !== gesto.id) return;
    const fueArrastre = gesto.arrastre ||
      Math.hypot(event.clientX - gesto.x, event.clientY - gesto.y) > 6;
    gesto = null;
    if (fueArrastre) {
      ultimoClic = null;
      return;
    }

    const objetivo = objetivoEn(event.clientX, event.clientY);

    if (enPrimeraPersonaORecreacion()) {
      if (objetivo) {
        apuntarPrimeraPersonaHacia(objetivo.id);
      }
      return;
    }

    const dobleClicCercano = ultimoClic &&
      event.timeStamp - ultimoClic.tiempo < 380 &&
      Math.hypot(event.clientX - ultimoClic.x, event.clientY - ultimoClic.y) < 12;

    if (dobleClicCercano && (!objetivo || objetivo.id === ultimoClic.id)) {
      if (ultimoClic.tipo === 'sonda') enfocarSonda();
      else if (ultimoClic.tipo === 'sonda_historica') enfocarSondaHistorica(ultimoClic.id);
      else if (ultimoClic.tipo === 'planeta') explorarSeleccionado();
      else if (ultimoClic.tipo === 'luna') explorarSeleccionado();
      ultimoClic = null;
      return;
    }

    if (!objetivo) {
      ultimoClic = null;
      return;
    }

    if (objetivo.tipo === 'sonda') {
      seleccionarSonda();
    } else if (objetivo.tipo === 'sonda_historica') {
      enfocarSondaHistorica(objetivo.id);
    } else if (objetivo.tipo === 'planeta') {
      seleccionar(objetivo.id);
    } else if (objetivo.tipo === 'luna') {
      seleccionar(objetivo.id);
    }
    ultimoClic = {
      tipo: objetivo.tipo,
      id: objetivo.id,
      tiempo: event.timeStamp,
      x: event.clientX,
      y: event.clientY
    };
  });

  return {
    actualizar,
    alActualizarPosiciones,
    alActualizarLuna,
    alActualizarPosicionSonda,
    alActualizarPosicionSondaHistorica,
    alCambiarModoEscala,
    alCambiarTamano,
    explorarSeleccionado,
    seleccionar,
    seleccionarSonda,
    enfocarSonda,
    sondaSeleccionada: () => sondaEnfocada,
    enfocarSondaHistorica,
    encuadrarEncuentroHistorico,
    sondaHistoricaSeleccionada: () => idSondaHistoricaEnfocada,
    encuadrarComparativaHistorica,
    encuadrarSalidaTierra1977,
    activarPrimeraPersona,
    activarRecreacionFotografica,
    salirDePrimeraPersonaHaciaExterior,
    apuntarPrimeraPersonaHacia,
    establecerFovPrimeraPersona,
    actualizarFovContextualAutomatico,
    obtenerFovContextualParaObjetivo,
    restaurarEstadoCamaraHistorica,
    obtenerEstadoCamaraHistorica,
    establecerContextosLocales,
    requiereEscalaFisicaUnoAUno: enPrimeraPersonaORecreacion,
    vistaCinematografica,
    vistaGeneral,
    enfocarRegionSistema,
    regionSistemaActual: () => regionSistema,
    modoVistaActual: () => modoVista,
    nombreSeleccionado: () => seleccionado
  };
}
