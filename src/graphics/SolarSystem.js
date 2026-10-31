import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { crearPlaneta } from './PlanetFactory.js';
import { crearControladorCamara } from './CameraController.js';
import { crearSol } from './Sun.js';
import { crearProteccionTransitosSolares } from './SolarTransitGuard.js';
import { crearFondoEstelar } from './StarField.js';
import { crearSondaVisual } from './SpaceProbeVisual.js';
import {
  crearHeliosferaConceptual,
  crearSatelitesEncuentroVisual
} from './HeliosphereVisual.js';
import {
  MODOS_ESCALA_VISUAL,
  factorEscalaCientificaCuerpo
} from './ScaleModeConfig.js';
import { crearEtiquetasPlanetas } from '../ui/PlanetLabels.js';
import { UNIDADES_POR_AU, posicionEscenaProporcional } from './SpatialScale.js';
import {
  HISTORICAL_MISSIONS_CATALOG,
  VOYAGER_1_ID,
  VOYAGER_2_ID
} from '../science/VoyagerHistoricalMissions.js';

const PLANETAS = [
  { nombre: 'Mercurio', radio: 0.7, orbitaAU: 0.387, color: 0xaaaaaa },
  { nombre: 'Venus', radio: 1.1, orbitaAU: 0.723, color: 0xe5bd82 },
  { nombre: 'Tierra', radio: 1.3, orbitaAU: 1.000, color: 0x3989ff },
  { nombre: 'Marte', radio: 0.9, orbitaAU: 1.524, color: 0xd9693d },
  { nombre: 'Jupiter', radio: 3.2, orbitaAU: 5.203, color: 0xc9a07a },
  { nombre: 'Saturno', radio: 2.8, orbitaAU: 9.537, color: 0xd5bd88 },
  { nombre: 'Urano', radio: 2.1, orbitaAU: 19.191, color: 0x86d8dd },
  { nombre: 'Neptuno', radio: 2.1, orbitaAU: 30.070, color: 0x4269ed }
];

function crearReferenciaOrbital(radio, interior) {
  const puntos = [];
  const colores = [];
  const color = new THREE.Color(0x7d9cae);
  const muestras = 192;

  for (let i = 0; i <= muestras; i++) {
    const t = i / muestras;
    const angulo = (t - 0.5) * Math.PI * 1.56;
    const brillo = Math.pow(Math.sin(Math.PI * t), 1.35);
    puntos.push(new THREE.Vector3(Math.cos(angulo) * radio, 0, Math.sin(angulo) * radio));
    colores.push(color.r * brillo, color.g * brillo, color.b * brillo);
  }

  const geometria = new THREE.BufferGeometry().setFromPoints(puntos);
  geometria.setAttribute('color', new THREE.Float32BufferAttribute(colores, 3));
  const opacidadBase = interior ? 0.088 : 0.125;
  const orbita = new THREE.Line(geometria, new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    opacity: opacidadBase
  }));
  orbita.userData.opacidadBase = opacidadBase;
  return orbita;
}

function crearVisualizadorMedicionDistancia() {
  const grupo = new THREE.Group();
  grupo.name = 'MedicionDistanciaCientifica3D';
  grupo.visible = false;

  const vertices = new Float32Array(6);
  const atributo = new THREE.BufferAttribute(vertices, 3);
  atributo.setUsage(THREE.DynamicDrawUsage);
  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute('position', atributo);

  const linea = new THREE.Line(
    geometria,
    new THREE.LineDashedMaterial({
      color: 0xd3bd91,
      transparent: true,
      opacity: 0.72,
      dashSize: 1.2,
      gapSize: 0.75,
      depthWrite: false
    })
  );
  linea.frustumCulled = false;
  grupo.add(linea);

  const puntos = new THREE.Points(
    geometria,
    new THREE.PointsMaterial({
      color: 0xf0dcb2,
      size: 4.5,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.9,
      depthWrite: false
    })
  );
  puntos.frustumCulled = false;
  grupo.add(puntos);

  function actualizar(puntoA, puntoB, mostrar = true) {
    if (!mostrar || !puntoA || !puntoB) {
      grupo.visible = false;
      return;
    }
    vertices[0] = puntoA.x;
    vertices[1] = puntoA.y;
    vertices[2] = puntoA.z;
    vertices[3] = puntoB.x;
    vertices[4] = puntoB.y;
    vertices[5] = puntoB.z;
    atributo.needsUpdate = true;

    const longitud = Math.hypot(
      puntoB.x - puntoA.x,
      puntoB.y - puntoA.y,
      puntoB.z - puntoA.z
    );
    const paso = THREE.MathUtils.clamp(longitud / 44, 0.008, 22);
    linea.material.dashSize = paso;
    linea.material.gapSize = paso * 0.62;
    linea.computeLineDistances();
    grupo.visible = true;
  }

  return { grupo, actualizar };
}

export function createSolarSystem(container, alSeleccionar, alSeleccionarSonda = null, opcionesExtra = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02040c);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.05, 36000);
  camera.position.set(320, 450, 830);

  const renderer = new THREE.WebGLRenderer({
    antialias: true
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 0.25;
  controls.maxDistance = 24000;

  scene.add(new THREE.AmbientLight(0x8398b6, 0.16));

  let modoEscala = MODOS_ESCALA_VISUAL.CIENTIFICA;
  const observadoresModoEscala = new Set();

  const sol = crearSol();
  sol.establecerModoEscala(modoEscala);
  scene.add(sol.grupo);

  const objetos = new Map();
  const orbitas = [];
  const orbitasPorNombre = new Map();

  for (const planeta of PLANETAS) {
    const orbita = crearReferenciaOrbital(
      UNIDADES_POR_AU * planeta.orbitaAU, planeta.orbitaAU < 2
    );

    scene.add(orbita);
    orbitas.push(orbita);
    orbitasPorNombre.set(planeta.nombre, orbita);

    const objeto = crearPlaneta(planeta);
    objeto.posicion.scale.setScalar(
      factorEscalaCientificaCuerpo(planeta.nombre, planeta.radio)
    );
    scene.add(objeto.posicion);
    objetos.set(planeta.nombre, objeto);
  }

  function obtenerZonaEncuadre() {
    const lienzo = renderer.domElement.getBoundingClientRect();
    const destinoEl = document.querySelector('.destination-panel > summary');
    const tiempoEl = document.querySelector('.timeline-panel:not([hidden]), .historical-timeline-panel:not([hidden])');
    const destino = destinoEl ? destinoEl.getBoundingClientRect() : { right: lienzo.left + 120, bottom: lienzo.top + 56 };
    const tiempo = tiempoEl ? tiempoEl.getBoundingClientRect() : { top: lienzo.bottom - 90 };
    const ancho = container.clientWidth;
    const alto = container.clientHeight;
    const movil = ancho <= 760;
    const left = movil ? 24 : Math.min(ancho * 0.26, destino.right - lienzo.left + 24);
    const top = movil ? destino.bottom - lienzo.top + 22 : 104;
    const bottom = Math.max(top + 80, Math.min(alto - 32, tiempo.top - lienzo.top - 30));
    return { width: ancho, height: alto, left, right: ancho - (movil ? 24 : 44), top, bottom };
  }

  // Sonda Experimental 01 (modo simulación experimental)
  const sonda = crearSondaVisual({
    idSonda: '__SONDA__',
    nombreGrupo: 'SondaExperimental01'
  });
  sonda.mostrarSonda(false);
  scene.add(sonda.trayectoriaGrupo);
  scene.add(sonda.posicion);

  // Instancias históricas independientes de Voyager 1 (-31) y Voyager 2 (-32) con Voyager.glb compartido
  const metaV1 = HISTORICAL_MISSIONS_CATALOG[VOYAGER_1_ID];
  const metaV2 = HISTORICAL_MISSIONS_CATALOG[VOYAGER_2_ID];

  const sondaVoyager1 = crearSondaVisual({
    idSonda: VOYAGER_1_ID,
    nombreGrupo: 'Voyager1_Historica',
    colorRecorrido: metaV1.trajectoryColorHex,
    colorPendiente: metaV1.trajectoryFutureColorHex,
    colorBaliza: metaV1.trajectoryColorHex,
    maxMuestrasTrayectoria: 6500
  });
  sondaVoyager1.mostrarSonda(false);
  scene.add(sondaVoyager1.trayectoriaGrupo);
  scene.add(sondaVoyager1.posicion);

  const sondaVoyager2 = crearSondaVisual({
    idSonda: VOYAGER_2_ID,
    nombreGrupo: 'Voyager2_Historica',
    colorRecorrido: metaV2.trajectoryColorHex,
    colorPendiente: metaV2.trajectoryFutureColorHex,
    colorBaliza: metaV2.trajectoryColorHex,
    maxMuestrasTrayectoria: 9500
  });
  sondaVoyager2.mostrarSonda(false);
  scene.add(sondaVoyager2.trayectoriaGrupo);
  scene.add(sondaVoyager2.posicion);

  const sondasHistoricas = new Map([
    [VOYAGER_1_ID, sondaVoyager1],
    [VOYAGER_2_ID, sondaVoyager2]
  ]);

  const satelitesEncuentro = crearSatelitesEncuentroVisual();
  scene.add(satelitesEncuentro.grupo);

  const heliosfera = crearHeliosferaConceptual();
  scene.add(heliosfera.grupo);

  const medidorDistancia = crearVisualizadorMedicionDistancia();
  scene.add(medidorDistancia.grupo);

  let etiquetas = null;
  const observadoresCamaraHistorica = new Set();

  let controladorCamara = null;
  const obtenerModoEscalaEfectivo = () => {
    if (controladorCamara?.requiereEscalaFisicaUnoAUno()) {
      return MODOS_ESCALA_VISUAL.CIENTIFICA;
    }
    return modoEscala;
  };

  controladorCamara = crearControladorCamara({
    camera,
    controls,
    canvas: renderer.domElement,
    objetos,
    orbitas,
    obtenerZonaEncuadre,
    alSeleccionar: nombre => {
      alSeleccionar?.(nombre);
      publicarVista();
    },
    sonda,
    alSeleccionarSonda,
    sondasHistoricas,
    satelites: satelitesEncuentro.satelites,
    alSeleccionarSondaHistorica: opcionesExtra.alSeleccionarSondaHistorica ?? null,
    alCambiarEstadoCamaraHistorica: estado => {
      const unoAUno = controladorCamara.requiereEscalaFisicaUnoAUno();
      sol.establecerModoEscala(unoAUno ? MODOS_ESCALA_VISUAL.CIENTIFICA : modoEscala);
      satelitesEncuentro.establecerForzarUnoAUno(unoAUno);
      if (unoAUno) {
        for (const [nombre, obj] of objetos) {
          obj.posicion.scale.setScalar(factorEscalaCientificaCuerpo(nombre, obj.planeta.radio));
        }
      }
      for (const fn of observadoresCamaraHistorica) fn(estado);
    },
    obtenerModoEscala: obtenerModoEscalaEfectivo,
    obtenerEtiquetas: () => etiquetas
  });

  const transitosSolares = crearProteccionTransitosSolares({
    camera,
    objetos,
    nombreSeleccionado: controladorCamara.nombreSeleccionado,
    obtenerModoEscala: obtenerModoEscalaEfectivo,
    sondasHistoricas
  });

  const fondoEstelar = crearFondoEstelar(camera, renderer.getPixelRatio());
  scene.add(fondoEstelar.grupo);
  etiquetas = crearEtiquetasPlanetas(container, camera, objetos, sonda, {
    sondasHistoricas: [
      { id: VOYAGER_1_ID, etiqueta: 'Voyager 1', colorCss: metaV1.markerCssColor, sonda: sondaVoyager1 },
      { id: VOYAGER_2_ID, etiqueta: 'Voyager 2', colorCss: metaV2.markerCssColor, sonda: sondaVoyager2 }
    ],
    satelites: satelitesEncuentro.satelites
  });

  let orbitasVisibles = true;
  let trayectoriasHistoricasVisibles = true;
  let alCambiarVista = () => {};

  function publicarVista() {
    alCambiarVista(controladorCamara.modoVistaActual());
  }

  function vistaGeneral() {
    controladorCamara.vistaGeneral();
    publicarVista();
  }

  function enfocarRegionSistema(region) {
    const ok = controladorCamara.enfocarRegionSistema(region);
    if (ok) publicarVista();
    return ok;
  }

  function vistaCinematografica() {
    controladorCamara.vistaCinematografica();
    publicarVista();
  }

  function actualizarPlanosProfundidad() {
    let menorDistanciaSuperficie = camera.position.length() - sol.radioActualEscena();
    for (const [nombre, objeto] of objetos) {
      const radioEfectivo = objeto.planeta.radio * objeto.posicion.scale.x
        * (nombre === 'Saturno' ? 2.05 : 1.04);
      const dist = camera.position.distanceTo(objeto.posicion.position) - radioEfectivo;
      if (dist < menorDistanciaSuperficie) menorDistanciaSuperficie = dist;
    }
    for (const sat of satelitesEncuentro.satelites.values()) {
      if (!sat.posicion.visible) continue;
      const distSat = camera.position.distanceTo(sat.posicion.position) - sat.posicion.scale.x * 1.04;
      if (distSat < menorDistanciaSuperficie) menorDistanciaSuperficie = distSat;
    }
    if (sonda.posicion.visible && sonda.visual.visible) {
      const distSonda = camera.position.distanceTo(sonda.posicion.position)
        - sonda.obtenerRadioObservacionActual();
      if (distSonda < menorDistanciaSuperficie) menorDistanciaSuperficie = distSonda;
    }
    for (const sHist of sondasHistoricas.values()) {
      if (sHist.posicion.visible && sHist.visual.visible) {
        const distHist = camera.position.distanceTo(sHist.posicion.position)
          - sHist.obtenerRadioObservacionActual();
        if (distHist < menorDistanciaSuperficie) menorDistanciaSuperficie = distHist;
      }
    }

    const referencia = Math.max(menorDistanciaSuperficie, 0.00012);
    const nuevoNear = THREE.MathUtils.clamp(referencia * 0.25, 0.00004, 0.5);
    const nuevoFar = Math.max(20000, camera.position.length() + 18000);

    if (
      Math.abs(nuevoNear - camera.near) / Math.max(camera.near, 1e-7) > 0.08
      || Math.abs(nuevoFar - camera.far) > 400
    ) {
      camera.near = nuevoNear;
      camera.far = nuevoFar;
      camera.updateProjectionMatrix();
    }
  }

  function establecerModoEscala(nuevoModo) {
    if (nuevoModo !== MODOS_ESCALA_VISUAL.CIENTIFICA && nuevoModo !== MODOS_ESCALA_VISUAL.EXPLORATORIA) {
      return false;
    }
    if (nuevoModo === modoEscala) return true;

    const anterior = modoEscala;
    modoEscala = nuevoModo;
    const efectivo = obtenerModoEscalaEfectivo();
    sol.establecerModoEscala(efectivo);
    satelitesEncuentro.establecerModoEscala(nuevoModo);
    sonda.establecerModoEscala(nuevoModo, controladorCamara.sondaSeleccionada());
    for (const [idHist, sHist] of sondasHistoricas) {
      sHist.establecerModoEscala(nuevoModo, controladorCamara.sondaHistoricaSeleccionada() === idHist);
    }

    const seleccionado = controladorCamara.nombreSeleccionado();
    if (seleccionado && objetos.has(seleccionado) && !controladorCamara.requiereEscalaFisicaUnoAUno()) {
      const obj = objetos.get(seleccionado);
      const factorInmediato = nuevoModo === MODOS_ESCALA_VISUAL.CIENTIFICA
        ? factorEscalaCientificaCuerpo(seleccionado, obj.planeta.radio)
        : 1;
      obj.posicion.scale.setScalar(factorInmediato);
    }

    controladorCamara.alCambiarModoEscala(anterior, nuevoModo);
    actualizarPlanosProfundidad();
    for (const fn of observadoresModoEscala) fn(modoEscala);
    return true;
  }

  function configurarVisualizacion({
    orbitas: verOrbitas,
    etiquetas: mostrarEtiquetas,
    estrellas,
    trayectoriaSonda,
    trayectoriasHistoricas,
    heliosferaConceptual
  } = {}) {
    if (typeof verOrbitas === 'boolean') orbitasVisibles = verOrbitas;
    if (typeof mostrarEtiquetas === 'boolean') etiquetas.mostrar(mostrarEtiquetas);
    if (typeof estrellas === 'boolean') fondoEstelar.grupo.visible = estrellas;
    if (typeof trayectoriaSonda === 'boolean') sonda.mostrarTrayectoria(trayectoriaSonda);
    if (typeof trayectoriasHistoricas === 'boolean') {
      trayectoriasHistoricasVisibles = trayectoriasHistoricas;
      for (const sHist of sondasHistoricas.values()) {
        sHist.mostrarTrayectoria(trayectoriasHistoricas && sHist.posicion.visible);
      }
    }
    if (typeof heliosferaConceptual === 'boolean') {
      heliosfera.mostrar(heliosferaConceptual);
    }
  }

  function seleccionarPlaneta(nombre) {
    if (!objetos.has(nombre)) return false;
    controladorCamara.seleccionar(nombre);
    return controladorCamara.explorarSeleccionado();
  }

  function actualizarPosiciones(estados, opciones = {}) {
    const seleccionado = controladorCamara.nombreSeleccionado();
    const centroAnterior = seleccionado
      ? objetos.get(seleccionado).posicion.position.clone()
      : null;

    for (const [nombre, objeto] of objetos) {
      const estado = estados[nombre];
      if (estado.posicionEscena) {
        const { x, y, z } = estado.posicionEscena;
        objeto.posicion.position.set(x, y, z);
      } else {
        posicionEscenaProporcional(estado.posicionAU, objeto.posicion.position);
      }
      const posicionEscena = objeto.posicion.position;
      const orbita = orbitasPorNombre.get(nombre);
      const radioHorizontal = Math.hypot(posicionEscena.x, posicionEscena.z);
      orbita.scale.setScalar(radioHorizontal / (UNIDADES_POR_AU * objeto.planeta.orbitaAU));
      orbita.position.y = posicionEscena.y;
      orbita.rotation.y = -Math.atan2(posicionEscena.z, posicionEscena.x);
    }

    controladorCamara.alActualizarPosiciones(centroAnterior, opciones);
  }

  function configurarTrayectoriaSonda(verticesEscenaFloat32, tiemposSegundosFloat64) {
    sonda.establecerTrayectoria(verticesEscenaFloat32, tiemposSegundosFloat64);
  }

  function actualizarEstadoSonda(posicionEscena, elapsedSeconds) {
    const posicionAnterior = sonda.posicion.visible ? sonda.posicion.position.clone() : null;
    const posicionTierra = objetos.get('Tierra')?.posicion.position ?? null;
    sonda.actualizarEstadoEscena(posicionEscena, elapsedSeconds, posicionTierra);
    controladorCamara.alActualizarPosicionSonda(posicionAnterior);
  }

  function ocultarSonda() {
    if (controladorCamara.sondaSeleccionada()) vistaGeneral();
    sonda.mostrarSonda(false);
  }

  // --- API específica para Voyager 1 y Voyager 2 en Modo Histórico ---
  function configurarTrayectoriaHistorica(idMision, knotsEscena) {
    const sHist = sondasHistoricas.get(idMision);
    if (!sHist || !Array.isArray(knotsEscena)) return;
    const total = knotsEscena.length;
    const vertices = new Float32Array(total * 3);
    const tiemposJd = new Float64Array(total);
    for (let i = 0; i < total; i++) {
      const k = knotsEscena[i];
      vertices[i * 3] = k.x;
      vertices[i * 3 + 1] = k.y;
      vertices[i * 3 + 2] = k.z;
      tiemposJd[i] = k.jdTdb;
    }
    sHist.establecerTrayectoria(vertices, tiemposJd);
  }

  function actualizarEscenaHistorica({
    probesVisual,
    moonsVisual,
    jdTdb,
    visibilityMode = 'both'
  }) {
    satelitesEncuentro.actualizarEstados(moonsVisual);
    const posicionTierra = objetos.get('Tierra')?.posicion.position ?? null;

    for (const [idMision, sHist] of sondasHistoricas.entries()) {
      const habilitadaPorFiltro = visibilityMode === 'both' || visibilityMode === idMision;
      const datoSonda = probesVisual?.[idMision];

      if (!habilitadaPorFiltro || !datoSonda) {
        sHist.mostrarSonda(false);
        continue;
      }

      if (datoSonda.visual?.posicionEscena) {
        const posAnterior = sHist.posicion.visible ? sHist.posicion.position.clone() : null;
        sHist.mostrarTrayectoria(trayectoriasHistoricasVisibles);
        sHist.actualizarEstadoEscena(datoSonda.visual.posicionEscena, jdTdb, posicionTierra);
        controladorCamara.alActualizarPosicionSondaHistorica(idMision, posAnterior);
      } else {
        // Pre-lanzamiento o introducción visual de ascenso terrestre (sin inventar sonda en el espacio)
        sHist.mostrarSonda(false);
      }
    }
  }

  function ocultarModoHistoricoEscena() {
    controladorCamara.salirDePrimeraPersonaHaciaExterior();
    for (const sHist of sondasHistoricas.values()) {
      sHist.mostrarSonda(false);
    }
    satelitesEncuentro.ocultarTodos();
    heliosfera.mostrar(false);
  }

  function establecerAparienciaGlobalSondas(modo) {
    const ok = sonda.establecerApariencia(modo);
    for (const sHist of sondasHistoricas.values()) {
      sHist.establecerApariencia(modo);
    }
    return ok;
  }

  function restablecerCamara() {
    vistaGeneral();
  }

  function ajustarTamano() {
    const ancho = container.clientWidth;
    const alto = container.clientHeight;
    if (!ancho || !alto) return;
    camera.aspect = ancho / alto;
    camera.updateProjectionMatrix();
    renderer.setSize(ancho, alto);
    controladorCamara.alCambiarTamano();
  }

  let tiempoAnterior = performance.now();

  function actualizarExposicion(segundos) {
    const estadoCamHist = controladorCamara.obtenerEstadoCamaraHistorica();
    const nombreObjetivo = controladorCamara.requiereEscalaFisicaUnoAUno()
      ? estadoCamHist.objetivoMirada
      : controladorCamara.nombreSeleccionado();
    const objeto = objetos.get(nombreObjetivo);
    let objetivo = 1.05;
    if (objeto) {
      const radioEfectivo = Math.max(objeto.planeta.radio * objeto.posicion.scale.x, 1e-6);
      const distancia = camera.position.distanceTo(objeto.posicion.position);
      const relacion = distancia / radioEfectivo;
      const umbralRel = controladorCamara.requiereEscalaFisicaUnoAUno() ? 950 : 35;
      const cercano = THREE.MathUtils.clamp((umbralRel - relacion) / Math.max(umbralRel * 0.65, 1), 0, 1);
      const adaptacion = cercano * cercano * (3 - 2 * cercano);
      const distanciaAU = objeto.posicion.position.length() / UNIDADES_POR_AU;
      objetivo *= 1 + adaptacion * (Math.min(12, Math.pow(Math.max(distanciaAU, 1), 0.85)) - 1);
    }
    renderer.toneMappingExposure = THREE.MathUtils.damp(
      renderer.toneMappingExposure, objetivo, 2.5, segundos
    );
  }

  function animar(tiempo) {
    requestAnimationFrame(animar);
    const delta = Math.max((tiempo - tiempoAnterior) / 1000, 0);
    tiempoAnterior = tiempo;
    const dtClamped = Math.min(delta, 0.1);

    for (const objeto of objetos.values()) objeto.actualizarGiro(dtClamped);
    sol.actualizar(dtClamped, camera);
    controladorCamara.actualizar(delta);

    sonda.actualizarEscalaVisual(dtClamped, camera, controladorCamara.sondaSeleccionada());
    const idHistSel = controladorCamara.sondaHistoricaSeleccionada();
    for (const [idHist, sHist] of sondasHistoricas.entries()) {
      sHist.actualizarEscalaVisual(dtClamped, camera, idHistSel === idHist);
    }

    actualizarExposicion(dtClamped);
    if (!orbitasVisibles) for (const orbita of orbitas) orbita.visible = false;
    transitosSolares.actualizar(dtClamped);
    actualizarPlanosProfundidad();
    fondoEstelar.actualizar();

    const estadoCamHist = controladorCamara.obtenerEstadoCamaraHistorica();
    etiquetas.actualizar(
      controladorCamara.nombreSeleccionado(),
      controladorCamara.sondaSeleccionada(),
      sol.radioActualEscena(),
      {
        idSondaActiva: idHistSel,
        modoPrimeraPersona: controladorCamara.requiereEscalaFisicaUnoAUno(),
        objetivoMirada: estadoCamHist.objetivoMirada
      }
    );
    renderer.render(scene, camera);
  }

  window.addEventListener('resize', ajustarTamano);
  new ResizeObserver(ajustarTamano).observe(container);

  ajustarTamano();
  requestAnimationFrame(animar);

  return {
    actualizarPosiciones,
    configurarTrayectoriaSonda,
    actualizarEstadoSonda,
    ocultarSonda,
    mostrarTrayectoriaSonda: sonda.mostrarTrayectoria,
    trayectoriaSondaVisible: sonda.trayectoriaEsVisible,
    seleccionarSonda: controladorCamara.seleccionarSonda,
    enfocarSonda: controladorCamara.enfocarSonda,
    sondaSeleccionada: controladorCamara.sondaSeleccionada,
    establecerAparienciaSonda: establecerAparienciaGlobalSondas,
    obtenerEstadoModeloSonda: sonda.obtenerEstadoModelo,
    obtenerEstadoModelosHistoricos: () => Object.freeze({
      [VOYAGER_1_ID]: sondaVoyager1.obtenerEstadoModelo(),
      [VOYAGER_2_ID]: sondaVoyager2.obtenerEstadoModelo()
    }),
    alCambiarModeloSonda: sonda.alCambiarModelo,
    configurarTrayectoriaHistorica,
    actualizarEscenaHistorica,
    ocultarModoHistoricoEscena,
    fijarCrucesHeliosfera: heliosfera.fijarMarcadoresCrucesReales,
    mostrarHeliosfera: heliosfera.mostrar,
    heliosferaVisible: heliosfera.esVisible,
    enfocarSondaHistorica: controladorCamara.enfocarSondaHistorica,
    encuadrarEncuentroHistorico: controladorCamara.encuadrarEncuentroHistorico,
    sondaHistoricaSeleccionada: controladorCamara.sondaHistoricaSeleccionada,
    encuadrarComparativaHistorica: controladorCamara.encuadrarComparativaHistorica,
    encuadrarSalidaTierra1977: controladorCamara.encuadrarSalidaTierra1977,
    activarPrimeraPersona: controladorCamara.activarPrimeraPersona,
    activarRecreacionFotografica: controladorCamara.activarRecreacionFotografica,
    salirDePrimeraPersona: controladorCamara.salirDePrimeraPersonaHaciaExterior,
    apuntarPrimeraPersonaHacia: controladorCamara.apuntarPrimeraPersonaHacia,
    establecerFovPrimeraPersona: controladorCamara.establecerFovPrimeraPersona,
    obtenerEstadoCamaraHistorica: controladorCamara.obtenerEstadoCamaraHistorica,
    alCambiarCamaraHistorica(fn) {
      observadoresCamaraHistorica.add(fn);
      fn(controladorCamara.obtenerEstadoCamaraHistorica());
      return () => observadoresCamaraHistorica.delete(fn);
    },
    actualizarLineaDistancia: medidorDistancia.actualizar,
    establecerModoEscala,
    modoEscalaActual: () => modoEscala,
    alCambiarModoEscala(fn) {
      observadoresModoEscala.add(fn);
      fn(modoEscala);
      return () => observadoresModoEscala.delete(fn);
    },
    enfocarRegionSistema,
    regionSistemaActual: controladorCamara.regionSistemaActual,
    configurarVisualizacion,
    seleccionarPlaneta,
    restablecerCamara,
    explorarSeleccionado: controladorCamara.explorarSeleccionado,
    vistaGeneral,
    vistaCinematografica,
    modoVistaActual: controladorCamara.modoVistaActual,
    alCambiarVista(fn) {
      alCambiarVista = fn;
      publicarVista();
    }
  };
}
