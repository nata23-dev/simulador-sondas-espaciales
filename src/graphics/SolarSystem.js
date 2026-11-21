import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { crearPlaneta } from './PlanetFactory.js';
import { registerRenderer, reportFrame } from './QualityProfile.js';
import { crearLunasPlanetarias, establecerInspeccionVisualIo } from './MoonVisuals.js';
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
import { distanciaHeliocentricaAU, exposicionFotografica, irradianciaSolar } from './SolarIllumination.js';
import { crearControladorLanzamientoCinematografico } from './LaunchCinematicController.js';
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

// 14.1: color de presentación de cada órbita de referencia (identifica el cuerpo; no altera la geometría ilustrativa).
const COLORES_ORBITA = Object.freeze({
  Mercurio: 0xa88bc9, Venus: 0xd9a443, Tierra: 0x35b4e8, Marte: 0xd97842,
  Jupiter: 0xe3a68c, Saturno: 0xdcc78f, Urano: 0x7fd8e2, Neptuno: 0x7b97f2
});

function crearReferenciaOrbital(radio, interior, colorHex = 0x7d9cae) {
  const puntos = [];
  const colores = [];
  const color = new THREE.Color(colorHex);
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
  // 14 y 14.1: órbitas de referencia con el color de cada cuerpo y más legibles (presentación; la geometría ilustrativa no cambia).
  const opacidadBase = interior ? 0.3 : 0.36;
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
  scene.background = new THREE.Color(0x030406);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.05, 36000);
  camera.position.set(320, 450, 830);

  const renderer = new THREE.WebGLRenderer({
    antialias: true
  });

  registerRenderer(renderer); // 15: relación de píxeles según el perfil de calidad (tope 2, como antes en «Alta»)
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 0.25;
  controls.maxDistance = 24000;

  // Space has no uniform ambient source. Sunlight comes from the solar PointLight.

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
      UNIDADES_POR_AU * planeta.orbitaAU, planeta.orbitaAU < 2, COLORES_ORBITA[planeta.nombre]
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

  const lunasPlanetarias = crearLunasPlanetarias(scene, objetos);
  function ajustarPadresDeLunas(nombreLuna) {
    for (const [key, moon] of lunasPlanetarias.moons) {
      const parent = objetos.get(moon.definition.parent);
      if (key === nombreLuna) parent.posicion.scale.setScalar(
        factorEscalaCientificaCuerpo(moon.definition.parent, parent.planeta.radio)
      );
      else if (modoEscala === MODOS_ESCALA_VISUAL.EXPLORATORIA) parent.posicion.scale.setScalar(1);
    }
  }

  // 17.1: quien ocupa la escena con sus propios paneles (Centro de Misión del laboratorio) indica el área libre del lienzo.
  let proveedorZonaEncuadre = null;
  function obtenerZonaEncuadre() {
    const lienzo = renderer.domElement.getBoundingClientRect();
    // 17.1.1 (D-01): aunque la zona indicada sea demasiado pequeña para encuadrar, su recorte se mantiene: el lienzo no debe
    // dibujarse fuera de la ventana de quien ocupa la escena.
    let recorteProveedor = null;
    if (proveedorZonaEncuadre) {
      const zona = proveedorZonaEncuadre(lienzo);
      if (zona && zona.right - zona.left >= 80 && zona.bottom - zona.top >= 80) {
        return { width: container.clientWidth, height: container.clientHeight, left: zona.left, right: zona.right, top: zona.top, bottom: zona.bottom, recorte: zona.recorte ?? null };
      }
      recorteProveedor = zona?.recorte ?? null;
    }
    const tiempoEl = document.querySelector('.timeline-panel:not([hidden]), .historical-timeline-panel:not([hidden])');
    const tiempo = tiempoEl ? tiempoEl.getBoundingClientRect() : { top: lienzo.bottom - 90 };
    const ancho = container.clientWidth;
    const alto = container.clientHeight;
    const movil = ancho <= 760;
    let left = movil ? 16 : 92;
    const top = movil ? 126 : 104;
    let right = ancho - (movil ? 16 : 28);
    if (movil && document.querySelector('#app')?.dataset.appMode === 'historico') {
      const herramientas = document.querySelector('#workspace-dock');
      if (herramientas?.getClientRects().length) {
        right = Math.min(right, herramientas.getBoundingClientRect().left - lienzo.left - 8);
      }
    } else if (!movil) {
      // 14.1: en escritorio la barra de herramientas es una columna a la derecha; el margen deja sitio a medio rótulo.
      const herramientas = document.querySelector('#workspace-dock');
      if (herramientas?.getClientRects().length) {
        right = Math.min(right, Math.max(ancho * 0.6, herramientas.getBoundingClientRect().left - lienzo.left - 56));
      }
    }
    let bottom = Math.max(top + 80, Math.min(alto - 24, tiempo.top - lienzo.top - 20));
    // 14.1: la portada de misiones destacadas ocupa el margen izquierdo; el encuadre usa el espacio libre a su derecha.
    const destacadas = document.querySelector('#featured-panel:not([hidden]):not([data-collapsed="true"])');
    if (!movil && destacadas?.getClientRects().length) {
      left = Math.min(Math.max(left, destacadas.getBoundingClientRect().right - lienzo.left + 24), ancho - 260);
    }
    const inspector = document.querySelector('#context-inspector');
    if (inspector && inspector.dataset.state !== 'closed' && inspector.getClientRects().length) {
      const rect = inspector.getBoundingClientRect();
      if (movil) bottom = Math.max(top + 48, Math.min(bottom, rect.top - lienzo.top - 14));
      else if (rect.left - lienzo.left < ancho / 2) {
        const panelRight = rect.right - lienzo.left + 20;
        left = Math.min(Math.max(left, panelRight), ancho - 180);
      } else right = Math.max(left + 80, Math.min(right, rect.left - lienzo.left - 20));
    }
    return { width: ancho, height: alto, left, right, top, bottom, recorte: recorteProveedor };
  }

  // 17.1: si quien ocupa la escena indica un recorte (la ventana de la escena del Centro de Misión), el lienzo y los rótulos
  // solo se ven dentro de él; así no asoman por los huecos entre paneles. Solo presentación.
  let recorteAplicado = '';
  function aplicarRecorte(recorte) {
    const valor = recorte
      ? `inset(${recorte.top}px ${recorte.right}px ${recorte.bottom}px ${recorte.left}px round ${recorte.radius ?? 0}px)` : '';
    if (valor === recorteAplicado) return;
    recorteAplicado = valor;
    container.style.clipPath = valor;
  }

  let desplazamientoProyeccionX = 0;
  let desplazamientoProyeccionY = 0;
  // Desplazar el centro óptico conserva las posiciones físicas y el objetivo
  // orbital. Las cámaras de instrumentos conservan siempre su FOV exacto.
  function componerObjetoEnAreaLibre(segundos) {
    const instrumento = controladorCamara.requiereEscalaFisicaUnoAUno();
    // El panel móvil modifica el área libre después de elegir un acontecimiento.
    // Recalcular el FOV contextual conserva distancia y radio; el FOV manual no se toca.
    controladorCamara.actualizarFovContextualAutomatico();
    const estadoCamara = controladorCamara.obtenerEstadoCamaraHistorica();
    const contextualPrimeraPersona = estadoCamara.modo === 'first_person'
      && estadoCamara.fovTipo === 'contextual_vertical' && estadoCamara.objetivoMirada;
    // 17.1: con la zona de la misión del laboratorio la proyección se centra siempre en ella (también en la vista general),
    // de modo que el encuadre acompaña a la ventana de la escena si la página se desplaza.
    const enfocando = contextualPrimeraPersona || (!instrumento && (Boolean(proveedorZonaEncuadre) || controladorCamara.nombreSeleccionado()
      || controladorCamara.sondaSeleccionada() || controladorCamara.sondaHistoricaSeleccionada()));
    const zona = obtenerZonaEncuadre();
    aplicarRecorte(proveedorZonaEncuadre ? zona.recorte : null);
    const objetivoX = enfocando ? (zona.width - zona.left - zona.right) / 2 : 0;
    const objetivoY = enfocando ? (zona.height - zona.top - zona.bottom) / 2 : 0;
    const reducirMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mezcla = instrumento || reducirMovimiento ? 1 : 1 - Math.exp(-segundos * 7);
    desplazamientoProyeccionX = THREE.MathUtils.lerp(desplazamientoProyeccionX, objetivoX, mezcla);
    desplazamientoProyeccionY = THREE.MathUtils.lerp(desplazamientoProyeccionY, objetivoY, mezcla);
    // El inspector desplaza el centro del encuadre; reducir el zoom hacía
    // desaparecer las sondas y los planetas pequeños en la escala científica.
    camera.zoom = 1;
    camera.setViewOffset(zona.width, zona.height, desplazamientoProyeccionX,
      desplazamientoProyeccionY, zona.width, zona.height);
    camera.updateProjectionMatrix();
  }

  // 17.1: sonda de la misión planificada en el laboratorio («3 · Reproducir»). Sustituye a la antigua Sonda Experimental 01:
  // su modelo y su nombre los fija configurarSondaMision() con el diseño con el que se calculó la misión (sin Voyager.glb).
  const sonda = crearSondaVisual({
    idSonda: '__SONDA__',
    nombreGrupo: 'SondaMision',
    maxMuestrasTrayectoria: 16384,
    cargarModeloGlb: false
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
  const sondasEnEmpalme = new Set();

  const satelitesEncuentro = crearSatelitesEncuentroVisual();
  scene.add(satelitesEncuentro.grupo);

  const heliosfera = crearHeliosferaConceptual();
  scene.add(heliosfera.grupo);

  const medidorDistancia = crearVisualizadorMedicionDistancia();
  scene.add(medidorDistancia.grupo);

  let etiquetas = null;
  let etiquetasHabilitadas = false;
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
    lunasPlanetarias: lunasPlanetarias.moons,
    alSeleccionarLuna: nombre => {
      ajustarPadresDeLunas(nombre);
      if (etiquetas) etiquetas.mostrar(!nombre && etiquetasHabilitadas);
      opcionesExtra.alSeleccionarLuna?.(nombre);
    },
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

  const controladorLanzamiento = crearControladorLanzamientoCinematografico({
    scene,
    camera,
    controls,
    tierraMesh: objetos.get('Tierra')?.posicion,
    alFinalizarLanzamiento: opcionesExtra.alFinalizarLanzamiento ?? null,
    alCambiarFase: opcionesExtra.alCambiarFaseLanzamiento ?? null
  });

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

  // 17.1: cámaras de la misión del laboratorio en la escena principal. `proveedor()` da [{ x, y, z, radio }] en unidades de escena.
  function encuadrarConjuntoMision(proveedor) {
    const ok = controladorCamara.encuadrarConjuntoMision(() => (proveedor() ?? [])
      .map(c => ({ posicion: new THREE.Vector3(c.x, c.y, c.z), radio: c.radio })));
    if (ok) publicarVista();
    return ok;
  }

  function encuadrarDestinoConSonda(nombre) {
    if (!objetos.has(nombre)) return false;
    return controladorCamara.encuadrarDestinoConSonda(nombre);
  }

  function vistaCinematografica() {
    controladorCamara.vistaCinematografica();
    publicarVista();
  }

  function actualizarPlanosProfundidad() {
    if (controladorLanzamiento.estaActivo()) {
      if (camera.near !== 0.05 || camera.far !== 2000) {
        camera.near = 0.05;
        camera.far = 2000;
        camera.updateProjectionMatrix();
      }
      return;
    }
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
    for (const moon of lunasPlanetarias.moons.values()) {
      if (!moon.posicion.visible) continue;
      menorDistanciaSuperficie = Math.min(menorDistanciaSuperficie,
        camera.position.distanceTo(moon.posicion.position) - moon.radioEscena);
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
    ajustarPadresDeLunas(lunasPlanetarias.moons.has(seleccionado) ? seleccionado : null);

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
    if (typeof mostrarEtiquetas === 'boolean') {
      etiquetasHabilitadas = mostrarEtiquetas;
      etiquetas.mostrar(mostrarEtiquetas && !lunasPlanetarias.moons.has(controladorCamara.nombreSeleccionado()));
    }
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

  function seleccionarLuna(nombre) {
    if (!lunasPlanetarias.moons.get(nombre)?.posicion.visible
      && !satelitesEncuentro.satelites.get(nombre)?.posicion.visible) return false;
    if (controladorCamara.requiereEscalaFisicaUnoAUno()) {
      const apuntado = controladorCamara.apuntarPrimeraPersonaHacia(nombre);
      if (apuntado) {
        const observador = controladorCamara.obtenerEstadoCamaraHistorica().idSondaObservador;
        controladorCamara.establecerFovPrimeraPersona(
          controladorCamara.obtenerFovContextualParaObjetivo(observador, nombre));
      }
      return apuntado;
    }
    controladorCamara.seleccionar(nombre);
    return controladorCamara.explorarSeleccionado();
  }

  function actualizarLunas(states, visible = true) {
    const seleccionado = controladorCamara.nombreSeleccionado();
    const old = lunasPlanetarias.moons.get(seleccionado)?.posicion.visible
      ? lunasPlanetarias.moons.get(seleccionado).posicion.position.clone() : null;
    lunasPlanetarias.actualizar(states, visible);
    if (old) controladorCamara.alActualizarLuna(old);
  }

  function actualizarPosiciones(estados, opciones = {}) {
    const seleccionado = controladorCamara.nombreSeleccionado();
    const centroAnterior = seleccionado && objetos.has(seleccionado)
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

  // 17.1: identidad visual de la sonda de la misión (nombre de la etiqueta y modelo 3D ya normalizado). Solo presentación.
  function configurarSondaMision({ nombre = 'Sonda', modelo = null, radioObservacion } = {}) {
    sonda.establecerModeloExterno(modelo, { radioObservacion });
    etiquetas.establecerNombreSonda(nombre);
  }

  // --- API específica para Voyager 1 y Voyager 2 en Modo Histórico ---
  function configurarTrayectoriaHistorica(idMision, knotsEscena) {
    const sHist = sondasHistoricas.get(idMision);
    if (!sHist || !Array.isArray(knotsEscena)) return;
    const total = knotsEscena.length;
    const vertices = new Float32Array(total * 3);
    const tiemposJd = new Float64Array(total);
    const cortes = new Uint8Array(total);
    for (let i = 0; i < total; i++) {
      const k = knotsEscena[i];
      vertices[i * 3] = k.x;
      vertices[i * 3 + 1] = k.y;
      vertices[i * 3 + 2] = k.z;
      tiemposJd[i] = k.jdTdb;
      cortes[i] = k.breakBefore ? 1 : 0;
    }
    sHist.establecerTrayectoria(vertices, tiemposJd, cortes);
  }

  function actualizarEscenaHistorica({
    probesVisual,
    moonsVisual,
    localFrames = {},
    jdTdb,
    visibilityMode = 'both'
  }) {
    const seleccionado = controladorCamara.nombreSeleccionado();
    const centroAnteriorLuna = satelitesEncuentro.satelites.get(seleccionado)?.posicion.visible
      ? satelitesEncuentro.satelites.get(seleccionado).posicion.position.clone() : null;
    satelitesEncuentro.actualizarEstados(moonsVisual);
    controladorCamara.establecerContextosLocales(localFrames);
    if (centroAnteriorLuna && satelitesEncuentro.satelites.get(seleccionado)?.posicion.visible) {
      controladorCamara.alActualizarLuna(centroAnteriorLuna);
    }
    const posicionTierra = objetos.get('Tierra')?.posicion.position ?? null;

    for (const [idMision, sHist] of sondasHistoricas.entries()) {
      const habilitadaPorFiltro = visibilityMode === 'both' || visibilityMode === idMision;
      const datoSonda = probesVisual?.[idMision];

      if (!habilitadaPorFiltro || !datoSonda) {
        sHist.mostrarSonda(false);
        continue;
      }

      if (datoSonda.visual?.posicionEscena) {
        const posAnterior = sHist.posicion.visible || sondasEnEmpalme.has(idMision)
          ? sHist.posicion.position.clone() : null;
        sondasEnEmpalme.delete(idMision);
        sHist.mostrarTrayectoria(trayectoriasHistoricasVisibles);
        sHist.actualizarEstadoEscena(datoSonda.visual.posicionEscena, jdTdb, posicionTierra);
        controladorCamara.alActualizarPosicionSondaHistorica(idMision, posAnterior);
      } else {
        // Un observador en primera persona requiere una posición certificada.
        if (datoSonda.status === 'spk_segment_transition' && sHist.posicion.visible) {
          sondasEnEmpalme.add(idMision);
        }
        const camara = controladorCamara.obtenerEstadoCamaraHistorica();
        if (camara.idSondaObservador === idMision && camara.modo !== 'exterior') {
          controladorCamara.salirDePrimeraPersonaHaciaExterior();
        }
        sHist.mostrarSonda(false);
      }
    }
  }

  function ocultarModoHistoricoEscena() {
    controladorCamara.salirDePrimeraPersonaHaciaExterior();
    lunasPlanetarias.ocultar();
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
    const estado = controladorCamara.obtenerEstadoCamaraHistorica();
    if (estado.modo === 'first_person' && estado.objetivoMirada) {
      if (controladorCamara.apuntarPrimeraPersonaHacia(estado.objetivoMirada)) return;
    }
    const historica = controladorCamara.sondaHistoricaSeleccionada();
    if (historica && controladorCamara.enfocarSondaHistorica(historica)) {
      publicarVista();
      return;
    }
    if (controladorCamara.sondaSeleccionada() && controladorCamara.enfocarSonda()) {
      publicarVista();
      return;
    }
    if (controladorCamara.nombreSeleccionado() && controladorCamara.explorarSeleccionado()) {
      publicarVista();
      return;
    }
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
  const centroFotometricoProyectado = new THREE.Vector3();

  function planetaVisibleCercaDeSonda() {
    let elegido = null;
    let menorRelacion = 35;
    for (const objeto of objetos.values()) {
      const radio = objeto.planeta.radio * objeto.posicion.scale.x;
      if (!(radio > 0)) continue;
      const relacion = camera.position.distanceTo(objeto.posicion.position) / radio;
      if (relacion >= menorRelacion) continue;
      centroFotometricoProyectado.copy(objeto.posicion.position).project(camera);
      if (centroFotometricoProyectado.z < -1 || centroFotometricoProyectado.z > 1
        || Math.abs(centroFotometricoProyectado.x) > 1.25
        || Math.abs(centroFotometricoProyectado.y) > 1.25) continue;
      elegido = objeto;
      menorRelacion = relacion;
    }
    return elegido;
  }

  function actualizarExposicion(segundos) {
    const estadoCamHist = controladorCamara.obtenerEstadoCamaraHistorica();
    const nombreObjetivo = controladorCamara.requiereEscalaFisicaUnoAUno()
      ? estadoCamHist.objetivoMirada
      : controladorCamara.nombreSeleccionado();
    const sateliteLocal = satelitesEncuentro.satelites.get(nombreObjetivo);
    const lunaGlobal = lunasPlanetarias.moons.get(nombreObjetivo);
    const objetoSeleccionado = objetos.get(nombreObjetivo)
      ?? (sateliteLocal?.posicion.visible ? sateliteLocal : null)
      ?? (lunaGlobal?.posicion.visible ? lunaGlobal : null);
    // En la vista exterior histórica la cámara sigue a la Voyager y puede
    // encuadrar un planeta sin que exista un nombre de objetivo seleccionado.
    // La ganancia fotográfica debe seguir al cuerpo realmente visible.
    const exteriorHistorico = estadoCamHist.modo === 'exterior'
      && Boolean(estadoCamHist.idSondaExterior);
    const objeto = objetoSeleccionado ?? (exteriorHistorico ? planetaVisibleCercaDeSonda() : null);
    let objetivo = 1.05;
    if (objeto) {
      const radioEfectivo = Math.max(objeto.planeta
        ? objeto.planeta.radio * objeto.posicion.scale.x
        : objeto.radioEscena ?? objeto.radioFisicoEscena, 1e-6);
      const distancia = camera.position.distanceTo(objeto.posicion.position);
      const relacion = distancia / radioEfectivo;
      const umbralRel = controladorCamara.requiereEscalaFisicaUnoAUno() ? 950 : 35;
      const cercano = THREE.MathUtils.clamp((umbralRel - relacion) / Math.max(umbralRel * 0.65, 1), 0, 1);
      const adaptacion = cercano * cercano * (3 - 2 * cercano);
      const distanciaAU = distanciaHeliocentricaAU(objeto.posicion.position);
      // El modelo de la sonda comparte exposición con el planeta. Limitar
      // esta ayuda exterior evita quemar el modelo y la textura planetaria.
      const ganancia = exteriorHistorico && !objetoSeleccionado
        ? Math.min(12, exposicionFotografica(distanciaAU))
        : exposicionFotografica(distanciaAU);
      objetivo *= 1 + adaptacion * (ganancia - 1);
    }
    renderer.toneMappingExposure = THREE.MathUtils.damp(
      renderer.toneMappingExposure, objetivo, 2.5, segundos
    );
  }

  function obtenerEstadoIluminacion() {
    const planetas = {};
    for (const [nombre, objeto] of objetos) {
      const distanceAU = distanciaHeliocentricaAU(objeto.posicion.position);
      planetas[nombre] = { distanceAU, irradianceWm2: irradianciaSolar(distanceAU) };
    }
    return {
      solarPointIntensity: sol.luz.intensity,
      exposure: renderer.toneMappingExposure,
      toneMapping: renderer.toneMapping,
      outputColorSpace: renderer.outputColorSpace,
      planetas
    };
  }

  function animar(tiempo) {
    requestAnimationFrame(animar);
    const delta = Math.max((tiempo - tiempoAnterior) / 1000, 0);
    tiempoAnterior = tiempo;
    reportFrame(delta);
    const dtClamped = Math.min(delta, 0.1);

    for (const objeto of objetos.values()) objeto.actualizarGiro(dtClamped);
    sol.actualizar(dtClamped, camera);
    lunasPlanetarias.actualizarEfectos(tiempo / 1000);
    satelitesEncuentro.actualizarEfectos(tiempo / 1000);

    if (controladorLanzamiento.estaActivo()) {
      controladorLanzamiento.actualizar(dtClamped);
    } else {
      controladorCamara.actualizar(delta);
      componerObjetoEnAreaLibre(dtClamped);
    }

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
    // Las líneas de recorrido permanecen configuradas, pero se ocultan durante
    // la observación desde la sonda para no atravesar visualmente el disco planetario.
    if (estadoCamHist.modo !== 'exterior') {
      for (const sHist of sondasHistoricas.values()) sHist.trayectoriaGrupo.visible = false;
    } else {
      for (const sHist of sondasHistoricas.values()) {
        sHist.trayectoriaGrupo.visible = trayectoriasHistoricasVisibles && sHist.posicion.visible;
      }
    }
    etiquetas.actualizar(
      controladorCamara.nombreSeleccionado(),
      controladorCamara.sondaSeleccionada(),
      sol.radioActualEscena(),
      {
        idSondaActiva: idHistSel,
        modoPrimeraPersona: controladorCamara.requiereEscalaFisicaUnoAUno(),
        objetivoMirada: estadoCamHist.objetivoMirada,
        lanzamientoActivo: controladorLanzamiento.estaActivo(),
        comparadorActivo: Boolean(opcionesExtra.obtenerComparadorActivo?.())
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
    actualizarLunas,
    seleccionarLuna,
    obtenerEstadoVisualLunas: () => Object.fromEntries([...lunasPlanetarias.moons].map(([key, moon]) => [key, {
      visible: moon.posicion.visible,
      position: moon.posicion.position.toArray(),
      parentPosition: objetos.get(moon.definition.parent).posicion.position.toArray(),
      screen: (() => {
        const p = moon.posicion.position.clone().project(camera);
        const rect = renderer.domElement.getBoundingClientRect();
        return [(p.x + 1) * rect.width / 2 + rect.left, (1 - p.y) * rect.height / 2 + rect.top];
      })(),
      radiusScene: moon.radioEscena,
      parentRadiusScene: objetos.get(moon.definition.parent).planeta.radio
        * objetos.get(moon.definition.parent).posicion.scale.x
    }])),
    configurarTrayectoriaSonda,
    actualizarEstadoSonda,
    ocultarSonda,
    configurarSondaMision,
    // 17.1: diagnóstico de solo lectura (verificación automatizada): posiciones dibujadas y estado de la sonda.
    obtenerDiagnosticoEscena: () => ({
      planetas: Object.fromEntries([...objetos].map(([nombre, objeto]) => [nombre, objeto.posicion.position.toArray()])),
      sonda: { visible: sonda.posicion.visible, posicion: sonda.posicion.position.toArray(), escalaVisual: sonda.visual.scale.x,
        trayectoriaVisible: sonda.trayectoriaEsVisible() && sonda.trayectoriaGrupo.visible, seleccionada: controladorCamara.sondaSeleccionada(), modelo: sonda.obtenerEstadoModelo() },
      lunasVisibles: [...lunasPlanetarias.moons.values()].filter(moon => moon.posicion.visible).length,
      camara: { posicion: camera.position.toArray(), seleccionado: controladorCamara.nombreSeleccionado() ?? null },
      modoEscala
    }),
    establecerFactorEscalaSonda: sonda.establecerFactorEscala,
    establecerProveedorZonaEncuadre(fn) { proveedorZonaEncuadre = typeof fn === 'function' ? fn : null; if (!proveedorZonaEncuadre) aplicarRecorte(null); },
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
    establecerInspeccionVisualIo,
    obtenerFovContextualParaObjetivo: controladorCamara.obtenerFovContextualParaObjetivo,
    restaurarEstadoCamaraHistorica: controladorCamara.restaurarEstadoCamaraHistorica,
    salirDePrimeraPersona: controladorCamara.salirDePrimeraPersonaHaciaExterior,
    apuntarPrimeraPersonaHacia: controladorCamara.apuntarPrimeraPersonaHacia,
    establecerFovPrimeraPersona: controladorCamara.establecerFovPrimeraPersona,
    obtenerEstadoCamaraHistorica: controladorCamara.obtenerEstadoCamaraHistorica,
    alCambiarCamaraHistorica(fn) {
      observadoresCamaraHistorica.add(fn);
      fn(controladorCamara.obtenerEstadoCamaraHistorica());
      return () => observadoresCamaraHistorica.delete(fn);
    },
    iniciarLanzamientoCinematografico: misionId => controladorLanzamiento.iniciar(misionId),
    pausarLanzamiento: () => controladorLanzamiento.pausar(),
    reanudarLanzamiento: () => controladorLanzamiento.reanudar(),
    saltarLanzamiento: () => controladorLanzamiento.saltar(),
    cancelarLanzamiento: () => controladorLanzamiento.cancelar(),
    reiniciarLanzamiento: () => controladorLanzamiento.reiniciar(),
    estaEnLanzamiento: () => controladorLanzamiento.estaActivo(),
    obtenerFaseLanzamiento: () => controladorLanzamiento.obtenerFaseActual(),
    actualizarLineaDistancia: medidorDistancia.actualizar,
    establecerModoEscala,
    modoEscalaActual: () => modoEscala,
    obtenerEstadoIluminacion,
    alCambiarModoEscala(fn) {
      observadoresModoEscala.add(fn);
      fn(modoEscala);
      return () => observadoresModoEscala.delete(fn);
    },
    enfocarRegionSistema,
    encuadrarConjuntoMision,
    encuadrarDestinoConSonda,
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
