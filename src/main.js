import './style.css';
import { crearWorkspaceLayout } from './ui/WorkspaceLayout.js';

import { cargarEfemerides, obtenerEstados } from './astronomy/Ephemerides.js';
import { createSolarSystem } from './graphics/SolarSystem.js';
import { MODOS_ESCALA_VISUAL } from './graphics/ScaleModeConfig.js';
import { crearPanelInfoPlaneta } from './ui/PlanetInfoPanel.js';
import { crearPanelInfoLuna } from './ui/MoonInfoPanel.js';
import { MOONS, queryMoon, validateMoonDataset } from './science/PlanetaryMoons.js';
import { crearSelectorPlanetas } from './ui/PlanetSelector.js';
import { crearControlesTemporales } from './ui/TimelineControls.js';
import { crearControlesVisualizacion } from './ui/VisualizationControls.js';
import { crearControlesHUD } from './ui/HudControls.js';
import { crearControlesMision } from './ui/MissionControls.js';
import { crearControlesDistancia } from './ui/DistanceToolControls.js';
import { crearControlesModoHistorico } from './ui/HistoricalModeControls.js';
import { createMeasurableBodyEndpoint } from './science/DistanceMeasurement.js';
import { HORIZONS_FRAME } from './science/Frames.js';
import { KM_PER_AU } from './science/Units.js';
import { gregorianLabelToJulianMidnight } from './science/Time.js';
import { jdTdbToElapsedSeconds } from './science/SimulationTime.js';
import {
  EXPERIMENTAL_PROBE_01_DEFINITION,
  EXPERIMENTAL_PROBE_01_EPOCH_DATE,
  propagateExperimentalProbe01
} from './science/ExperimentalProbe01.js';
import {
  evaluateVisualPlanetsFromField,
  physicalPositionKmToScene,
  probeStateToVisual,
  trajectoryRenderSamplesToScenePositions
} from './integration/ProbeVisualAdapter.js';
import {
  loadScientificPipeline,
  queryVisualStates,
  scientificPipelineEnabled
} from './integration/ScientificVisualPipeline.js';
import { createHistoricalVisualPipeline } from './integration/HistoricalVisualPipeline.js';
import { createHistoricalMissionEngine } from './science/HistoricalMissionEngine.js';
import {
  HISTORICAL_MISSIONS_CATALOG,
  VOYAGER_1_ID,
  VOYAGER_2_ID
} from './science/VoyagerHistoricalMissions.js';
import {
  EVENT_KINDS,
  VOYAGER_HISTORICAL_EVENTS,
  getHistoricalEventById
} from './science/VoyagerHistoricalEvents.js';
import { crearModalBienvenidaHistorica } from './ui/HistoricalWelcomeModal.js';
import { crearRecorridoHistoricoGuiado, HITOS_RECORRIDO_GUIADO } from './ui/HistoricalGuidedTour.js';
import { getVoyagerPhotoById } from './science/VoyagerPhotoCatalog.js';
import { crearSuperficieLanzamientoCinematografico } from './ui/LaunchCinematicOverlay.js';
import { METADATOS_HISTORICOS_LANZAMIENTO } from './graphics/LaunchCinematicController.js';

const ETIQUETAS_CUERPOS = {
  Jupiter: 'Júpiter',
  Io: 'Ío',
  Titan: 'Titán',
  Triton: 'Tritón'
};

// Este módulo coordina los datos, la escena y los tres modos de operación sin mezclar estados.
const estadoDatos = document.querySelector('#data-status');
const botonReintentar = document.querySelector('#retry-button');
const fechaEscena = document.querySelector('#scene-date');
const tituloEscena = document.querySelector('#scene-title');
const etiquetaModoVista = document.querySelector('#view-mode-label');
const panelInfo = crearPanelInfoPlaneta();
const panelLuna = crearPanelInfoLuna({
  alPlaneta: () => { if (lunaSeleccionada) simulador.seleccionarPlaneta(MOONS[lunaSeleccionada].parent); },
  alVistaGeneral: () => simulador.vistaGeneral()
});
const hud = crearControlesHUD();

let modoOperacion = 'exploracion'; // 'exploracion' | 'historico' | 'experimental'
let datosAstronomicos = null;
let estadosActuales = null;
let instanteCientificoActivo = null;
let estadoVisualSondaActual = null;
let planetaSeleccionado = null;
let lunaSeleccionada = null;
let datosLunas = null;
let estadosLunas = {};
let proveedorCientifico = null;
let trayectoriaSonda = null;
let tiempoMisionSegundos = 0;
let modoEjecucionMision = 'listo';
let rafMisionId = null;
let instanteRealAnterior = 0;
let consultaActual = 0;
const modoCientifico = scientificPipelineEnabled(window.location.search);

// Estado del Modo Histórico Voyager 1 y Voyager 2
let pipelineHistorico = null;
let motorHistorico = null;
let promesaInicioHistorico = null;
let ultimoSnapshotHistorico = null;
let rafHistoricoId = null;
let instanteRealHistAnterior = 0;
let consultaHistToken = 0;
let bucleHistOcupado = false;

function detenerBucleMision() {
  if (rafMisionId !== null) {
    cancelAnimationFrame(rafMisionId);
    rafMisionId = null;
  }
}

function detenerBucleHistorico() {
  if (rafHistoricoId !== null) {
    cancelAnimationFrame(rafHistoricoId);
    rafHistoricoId = null;
  }
  if (motorHistorico?.isPlaying()) {
    motorHistorico.setPlaying(false);
  }
}

function actualizarPanel(fecha) {
  const planetaParaFicha = modoOperacion === 'historico' || lunaSeleccionada ? null : planetaSeleccionado;
  panelInfo.actualizar(
    planetaParaFicha,
    estadosActuales?.[planetaParaFicha],
    datosAstronomicos?.metadatos,
    fecha
  );
  let estadoPanelLuna = estadosLunas[lunaSeleccionada];
  if (modoOperacion === 'historico' && lunaSeleccionada && ultimoSnapshotHistorico) {
    const lunar = ultimoSnapshotHistorico.moons?.[lunaSeleccionada]?.state;
    const parent = ultimoSnapshotHistorico.planets?.[MOONS[lunaSeleccionada].parent]?.state;
    if (lunar && parent) {
      estadoPanelLuna = {
        distanceKm: Math.hypot(lunar.position.x - parent.position.x,
          lunar.position.y - parent.position.y, lunar.position.z - parent.position.z),
        status: 'Horizons · vector directo luna–planeta + planeta local',
        jdTdb: ultimoSnapshotHistorico.jdTdb
      };
    } else estadoPanelLuna = null;
  }
  panelLuna.actualizar(lunaSeleccionada, estadoPanelLuna);
}

function actualizarLunasExploracion(jdTdb) {
  estadosLunas = {};
  if (modoOperacion !== 'historico' && datosLunas) {
    for (const key of Object.keys(MOONS)) {
      const state = queryMoon(datosLunas, key, jdTdb);
      if (state) estadosLunas[key] = state;
    }
  }
  simulador.actualizarLunas(estadosLunas, modoOperacion !== 'historico');
  if (lunaSeleccionada && !estadosLunas[lunaSeleccionada]) {
    simulador.vistaGeneral();
    estadoDatos.textContent = 'La luna seleccionada está fuera de la cobertura verificada.';
  }
}

function obtenerDescriptorCientificoCuerpo(idCuerpo) {
  // En Modo Histórico todas las distancias se calculan con estados reales en el mismo instante JD TDB histórico
  if (modoOperacion === 'historico') {
    if (!ultimoSnapshotHistorico) {
      return {
        endpoint: null,
        posicionEscena: null,
        motivoNoDisponible: 'Cargando efemérides históricas de NASA/JPL Horizons…'
      };
    }
    const snap = ultimoSnapshotHistorico;
    const epochLabel = snap.timeLabels.shortLabelTdb;

    if (idCuerpo === 'Sol') {
      return {
        endpoint: createMeasurableBodyEndpoint({
          id: 'Sol',
          name: 'Sol',
          positionKm: { x: 0, y: 0, z: 0 },
          jdTdb: snap.jdTdb,
          epochLabelTdb: epochLabel,
          origin: HORIZONS_FRAME.origin,
          frameId: HORIZONS_FRAME.id,
          source: 'Origen heliocéntrico (500@10)'
        }),
        posicionEscena: { x: 0, y: 0, z: 0 },
        motivoNoDisponible: null
      };
    }

    if (idCuerpo === VOYAGER_1_ID || idCuerpo === VOYAGER_2_ID) {
      const probe = snap.probes[idCuerpo];
      if (!probe?.state) {
        return {
          endpoint: null,
          posicionEscena: null,
          motivoNoDisponible: probe?.reason ?? `${idCuerpo} no dispone de estado espacial en esta fecha.`
        };
      }
      return {
        endpoint: createMeasurableBodyEndpoint({
          id: idCuerpo,
          name: `${probe.mission.name} (${probe.mission.naifId})`,
          positionKm: probe.positionKm,
          jdTdb: snap.jdTdb,
          epochLabelTdb: epochLabel,
          origin: HORIZONS_FRAME.origin,
          frameId: HORIZONS_FRAME.id,
          source: `NASA/JPL Horizons (${probe.status === 'exact' ? 'muestra exacta' : 'Hermite C¹'})`
        }),
        posicionEscena: probe.visual?.posicionEscena ?? physicalPositionKmToScene(probe.positionKm),
        motivoNoDisponible: null
      };
    }

    if (snap.moons[idCuerpo]?.state) {
      const moon = snap.moons[idCuerpo];
      return {
        endpoint: createMeasurableBodyEndpoint({
          id: idCuerpo,
          name: ETIQUETAS_CUERPOS[idCuerpo] ?? idCuerpo,
          positionKm: moon.state.position,
          jdTdb: snap.jdTdb,
          epochLabelTdb: epochLabel,
          origin: HORIZONS_FRAME.origin,
          frameId: HORIZONS_FRAME.id,
          source: 'NASA/JPL Horizons (ventana de sobrevuelo)'
        }),
        posicionEscena: moon.visual.posicionEscena,
        motivoNoDisponible: null
      };
    }
    if (idCuerpo === 'Io' || idCuerpo === 'Titan' || idCuerpo === 'Triton') {
      return {
        endpoint: null,
        posicionEscena: null,
        motivoNoDisponible: `${ETIQUETAS_CUERPOS[idCuerpo]} solo dispone de efemérides densas durante las ventanas de encuentro planetario.`
      };
    }

    const planetRaw = snap.rawPlanets[idCuerpo];
    const planetVis = snap.planets[idCuerpo];
    if (planetRaw?.state && planetVis) {
      return {
        endpoint: createMeasurableBodyEndpoint({
          id: idCuerpo,
          name: ETIQUETAS_CUERPOS[idCuerpo] ?? idCuerpo,
          positionKm: planetRaw.state.position,
          jdTdb: snap.jdTdb,
          epochLabelTdb: epochLabel,
          origin: HORIZONS_FRAME.origin,
          frameId: HORIZONS_FRAME.id,
          source: `NASA/JPL Horizons (${planetRaw.status === 'exact' ? 'muestra exacta' : 'Hermite C¹'})`
        }),
        posicionEscena: planetVis.posicionEscena,
        motivoNoDisponible: null
      };
    }

    return {
      endpoint: null,
      posicionEscena: null,
      motivoNoDisponible: `Sin estado histórico para ${idCuerpo}.`
    };
  }

  // Modos Exploración y Experimental (2026)
  if (!estadosActuales || !instanteCientificoActivo) {
    return {
      endpoint: null,
      posicionEscena: null,
      motivoNoDisponible: 'Esperando carga de efemérides científicas…'
    };
  }

  if (idCuerpo === 'Sol') {
    return {
      endpoint: createMeasurableBodyEndpoint({
        id: 'Sol',
        name: 'Sol',
        positionKm: { x: 0, y: 0, z: 0 },
        jdTdb: instanteCientificoActivo.jdTdb,
        epochLabelTdb: instanteCientificoActivo.labelTdb,
        origin: HORIZONS_FRAME.origin,
        frameId: HORIZONS_FRAME.id,
        source: 'Origen heliocéntrico (500@10)'
      }),
      posicionEscena: { x: 0, y: 0, z: 0 },
      motivoNoDisponible: null
    };
  }

  if (idCuerpo === 'sonda-experimental-01') {
    if (modoOperacion !== 'experimental') {
      return {
        endpoint: null,
        posicionEscena: null,
        motivoNoDisponible: 'Activa el modo Experimental para medir a Sonda Experimental 01.'
      };
    }
    if (!trayectoriaSonda) {
      return {
        endpoint: null,
        posicionEscena: null,
        motivoNoDisponible: 'La propagación orbital de Sonda Experimental 01 no está disponible.'
      };
    }
    if (!estadoVisualSondaActual) {
      return {
        endpoint: null,
        posicionEscena: null,
        motivoNoDisponible: 'Sonda Experimental 01 no dispone de estado antes de su época inicial (2026-10-10 · 00:00 TDB).'
      };
    }
    return {
      endpoint: createMeasurableBodyEndpoint({
        id: 'sonda-experimental-01',
        name: EXPERIMENTAL_PROBE_01_DEFINITION.name,
        positionKm: estadoVisualSondaActual.posicionKm,
        jdTdb: estadoVisualSondaActual.jdTdb,
        epochLabelTdb: instanteCientificoActivo.labelTdb,
        origin: HORIZONS_FRAME.origin,
        frameId: HORIZONS_FRAME.id,
        source: 'Propagación numérica DOPRI54'
      }),
      posicionEscena: estadoVisualSondaActual.posicionEscena,
      motivoNoDisponible: null
    };
  }

  const estado = estadosActuales[idCuerpo];
  if (!estado) {
    return {
      endpoint: null,
      posicionEscena: null,
      motivoNoDisponible: `No hay estado científico disponible para ${ETIQUETAS_CUERPOS[idCuerpo] ?? idCuerpo}.`
    };
  }

  let positionKm;
  let jdTdb;
  let source;

  if (estado.scientificState) {
    positionKm = estado.scientificState.position;
    jdTdb = estado.scientificState.time.jdTdb;
    source = estado.scientificStatus === 'interpolated'
      ? 'NASA/JPL Horizons (Hermite C¹)'
      : 'NASA/JPL Horizons (proveedor científico)';
  } else if (estado.posicionKm) {
    positionKm = estado.posicionKm;
    jdTdb = estado.jdTDB ?? instanteCientificoActivo.jdTdb;
    source = estado.scientificStatus === 'exact'
      ? 'NASA/JPL Horizons (muestra exacta)'
      : 'NASA/JPL Horizons (Hermite C¹)';
  } else {
    positionKm = {
      x: estado.posicionAU.x * KM_PER_AU,
      y: estado.posicionAU.y * KM_PER_AU,
      z: estado.posicionAU.z * KM_PER_AU
    };
    jdTdb = estado.jdTDB ?? instanteCientificoActivo.jdTdb;
    source = 'NASA/JPL Horizons (efeméride diaria)';
  }

  return {
    endpoint: createMeasurableBodyEndpoint({
      id: idCuerpo,
      name: ETIQUETAS_CUERPOS[idCuerpo] ?? idCuerpo,
      positionKm,
      jdTdb,
      epochLabelTdb: instanteCientificoActivo.labelTdb,
      origin: HORIZONS_FRAME.origin,
      frameId: HORIZONS_FRAME.id,
      source
    }),
    posicionEscena: estado.posicionEscena ?? physicalPositionKmToScene(positionKm),
    motivoNoDisponible: null
  };
}

function aplicarEstadoSondaEnSegundos(segundos) {
  if (!trayectoriaSonda || modoOperacion !== 'experimental') {
    estadoVisualSondaActual = null;
    if (modoOperacion !== 'experimental') simulador.ocultarSonda();
    return null;
  }
  const estadoDinamico = trayectoriaSonda.getStateAtElapsedSeconds(segundos);
  const estadoVisual = probeStateToVisual(estadoDinamico);
  estadoVisualSondaActual = estadoVisual;
  simulador.actualizarEstadoSonda(estadoVisual.posicionEscena, segundos);
  controlesMision.actualizarTelemetria(estadoVisual);
  controlesMision.actualizarEnfoqueSonda(simulador.sondaSeleccionada());
  return estadoVisual;
}

function sincronizarSondaConFechaDiaria(fecha) {
  if (!trayectoriaSonda) {
    estadoVisualSondaActual = null;
    return;
  }
  if (modoOperacion !== 'experimental') {
    estadoVisualSondaActual = null;
    simulador.ocultarSonda();
    return;
  }
  const jd = gregorianLabelToJulianMidnight(fecha);
  const seg = jdTdbToElapsedSeconds(trayectoriaSonda.epochJdTdb, jd);
  if (seg < trayectoriaSonda.minSeconds || seg > trayectoriaSonda.maxSeconds) {
    tiempoMisionSegundos = 0;
    estadoVisualSondaActual = null;
    modoEjecucionMision = seg < trayectoriaSonda.minSeconds ? 'anterior_epoca' : 'fin_cobertura';
    simulador.ocultarSonda();
    controlesMision.actualizarTelemetria(null);
    controlesMision.actualizarEnfoqueSonda(false);
    controlesMision.actualizarEstadoEjecucion(modoEjecucionMision);
    return;
  }
  tiempoMisionSegundos = seg;
  aplicarEstadoSondaEnSegundos(seg);
  modoEjecucionMision = seg === 0
    ? 'listo'
    : (seg >= trayectoriaSonda.maxSeconds ? 'fin_cobertura' : 'pausado');
  controlesMision.actualizarEstadoEjecucion(
    modoEjecucionMision,
    controlesTemporales.obtenerVelocidad()
  );
}

function colocarEscenaEnEpocaInicialMision() {
  if (!datosAstronomicos || !trayectoriaSonda) return;
  ++consultaActual;
  tiempoMisionSegundos = 0;
  instanteCientificoActivo = {
    jdTdb: trayectoriaSonda.epochJdTdb,
    labelTdb: `${EXPERIMENTAL_PROBE_01_EPOCH_DATE} · 00:00 TDB`
  };
  if (modoCientifico) {
    const { states } = evaluateVisualPlanetsFromField(trayectoriaSonda.ephemerisField, 0);
    simulador.actualizarPosiciones(states, { reencuadrarVista: false });
    estadosActuales = states;
    estadoDatos.textContent = `Proveedor científico · muestras exactas · ${EXPERIMENTAL_PROBE_01_EPOCH_DATE} TDB`;
  } else {
    const estados = obtenerEstados(datosAstronomicos, EXPERIMENTAL_PROBE_01_EPOCH_DATE);
    simulador.actualizarPosiciones(estados, { reencuadrarVista: false });
    estadosActuales = estados;
    estadoDatos.textContent = `NASA/JPL Horizons · muestra diaria ${EXPERIMENTAL_PROBE_01_EPOCH_DATE} (TDB)`;
  }
  fechaEscena.textContent = `${EXPERIMENTAL_PROBE_01_EPOCH_DATE} · 00:00 TDB`;
  controlesTemporales.sincronizarFechaSilenciosa(EXPERIMENTAL_PROBE_01_EPOCH_DATE, null, '00:00');
  actualizarPanel(EXPERIMENTAL_PROBE_01_EPOCH_DATE);
  aplicarEstadoSondaEnSegundos(0);
  controlesDistancia.actualizar();
}

function avanzarFotogramaMision(ahora) {
  if (modoOperacion !== 'experimental' || modoEjecucionMision !== 'simulando' || !trayectoriaSonda) {
    rafMisionId = null;
    return;
  }
  const deltaReal = Math.min(Math.max((ahora - instanteRealAnterior) / 1000, 0), 0.1);
  instanteRealAnterior = ahora;
  const factorVelocidad = controlesTemporales.obtenerVelocidad();

  tiempoMisionSegundos = Math.min(
    tiempoMisionSegundos + deltaReal * 86400 * factorVelocidad,
    trayectoriaSonda.maxSeconds
  );

  const { states, calendar } = evaluateVisualPlanetsFromField(
    trayectoriaSonda.ephemerisField,
    tiempoMisionSegundos
  );
  instanteCientificoActivo = {
    jdTdb: calendar.jdTdb,
    labelTdb: calendar.shortLabelTdb
  };
  simulador.actualizarPosiciones(states, { reencuadrarVista: false });
  estadosActuales = states;
  aplicarEstadoSondaEnSegundos(tiempoMisionSegundos);
  fechaEscena.textContent = calendar.labelTdb;
  actualizarPanel(calendar.dateIso);
  controlesDistancia.actualizar();

  const etiquetaVelocidad = `${String(factorVelocidad).replace('.', ',')}×`;
  controlesTemporales.sincronizarFechaSilenciosa(
    calendar.dateIso,
    `Misión · ${etiquetaVelocidad}`,
    calendar.timeHm
  );
  estadoDatos.textContent = `Simulación orbital TDB · Hermite + DOPRI54 · ${calendar.shortLabelTdb}`;

  if (tiempoMisionSegundos >= trayectoriaSonda.maxSeconds) {
    rafMisionId = null;
    modoEjecucionMision = 'fin_cobertura';
    controlesMision.actualizarEstadoEjecucion('fin_cobertura');
    controlesTemporales.sincronizarFechaSilenciosa(
      calendar.dateIso,
      'Fin de cobertura',
      calendar.timeHm
    );
    estadoDatos.textContent = `Fin de cobertura de efemérides NASA/JPL Horizons (${calendar.shortLabelTdb})`;
    return;
  }

  rafMisionId = requestAnimationFrame(avanzarFotogramaMision);
}

// =========================================================================
// MOTOR Y COORDINACIÓN DEL MODO HISTÓRICO VOYAGER 1 (-31) Y VOYAGER 2 (-32)
// =========================================================================

function obtenerEstadoMotorHistoricoPlano() {
  if (!motorHistorico) return null;
  const assists = motorHistorico.getEventAssists();
  return {
    jdTdb: motorHistorico.getJdTdb(),
    progress: motorHistorico.getProgress(),
    playing: motorHistorico.isPlaying(),
    direction: motorHistorico.getDirection(),
    speed: motorHistorico.getSpeed(),
    effectiveSpeed: motorHistorico.getEffectiveSpeed(),
    visibilityMode: motorHistorico.getVisibilityMode(),
    selectedProbeId: motorHistorico.getSelectedProbeId(),
    triggeredEvent: motorHistorico.getTriggeredEvent(),
    autoSlowNearEvents: assists.autoSlowNearEvents,
    autoPauseAtEvents: assists.autoPauseAtEvents
  };
}

function actualizarEncabezadoHistorico(snapshot) {
  if (modoOperacion !== 'historico' || !motorHistorico) return;
  const estadoCam = simulador.obtenerEstadoCamaraHistorica();
  const vis = motorHistorico.getVisibilityMode();

  if (estadoCam.modo === 'photo_recreation') {
    etiquetaModoVista.innerHTML = 'CÁMARA FOTOGRÁFICA ISS <span class="heading-divider">/</span> HISTÓRICO';
  } else if (estadoCam.modo === 'first_person') {
    etiquetaModoVista.innerHTML = 'PRIMERA PERSONA · ESCALA 1:1 <span class="heading-divider">/</span> HISTÓRICO';
  } else {
    etiquetaModoVista.innerHTML = 'MISIONES HISTÓRICAS NASA <span class="heading-divider">/</span> 1977–2026';
  }

  if (vis === VOYAGER_1_ID) {
    tituloEscena.textContent = 'Voyager 1';
  } else if (vis === VOYAGER_2_ID) {
    tituloEscena.textContent = 'Voyager 2';
  } else {
    tituloEscena.textContent = 'Voyager 1 y Voyager 2';
  }

  const observedEl = document.querySelector('#observed-body');
  if (observedEl) {
    if (estadoCam.modo === 'first_person' || estadoCam.modo === 'photo_recreation') {
      const probeName = estadoCam.idSondaObservador === VOYAGER_1_ID ? 'Voyager 1' : 'Voyager 2';
      const targetName = ETIQUETAS_CUERPOS[estadoCam.objetivoMirada] || estadoCam.objetivoMirada || 'Espacio profundo';
      const fase = snapshot?.probes?.[estadoCam.idSondaObservador]?.phase;
      observedEl.textContent = `Desde ${probeName} → ${targetName}${fase ? ` · ${fase}` : ''} · apuntado geométrico`;
    } else if (vis === VOYAGER_1_ID) {
      observedEl.textContent = `Vista exterior · Voyager 1${snapshot?.probes?.[VOYAGER_1_ID]?.phase ? ` · ${snapshot.probes[VOYAGER_1_ID].phase}` : ''}`;
    } else if (vis === VOYAGER_2_ID) {
      observedEl.textContent = `Vista exterior · Voyager 2${snapshot?.probes?.[VOYAGER_2_ID]?.phase ? ` · ${snapshot.probes[VOYAGER_2_ID].phase}` : ''}`;
    } else {
      observedEl.textContent = 'Exploración exterior · Voyager 1 y 2';
    }
  }

  actualizarDockMision(vis);

  if (snapshot) {
    fechaEscena.textContent = snapshot.timeLabels.labelUtc;
    const cameraGeometry=simulador.obtenerEstadoCamaraHistorica();
    const contextNote=cameraGeometry.contextoGeometria==='encuentro_local'
      ? `Geometría local verificada: ${cameraGeometry.fuenteContextoLocal} · trayectoria global separada`
      : cameraGeometry.objetivoSinContextoLocal
        ? 'Vista global: sin vector nave–objetivo validado para esta fecha'
        : 'Catálogo histórico global (1977–2026)';
    estadoDatos.textContent = `NASA/JPL Horizons · ${contextNote} · ${snapshot.timeLabels.shortLabelTdb}`;
  }
}

async function aplicarInstanteHistorico(jdTdb, {
  reencuadrarEvento = null,
  accionPosteriorEscena = null
} = {}) {
  if (!pipelineHistorico || !motorHistorico) return null;
  const token = ++consultaHistToken;
  const snapshot = await pipelineHistorico.queryVisualHistoricalSnapshot(jdTdb);
  if (token !== consultaHistToken || modoOperacion !== 'historico') return snapshot;

  ultimoSnapshotHistorico = snapshot;
  estadosActuales = snapshot.planets;
  instanteCientificoActivo = {
    jdTdb: snapshot.jdTdb,
    labelTdb: snapshot.timeLabels.shortLabelTdb
  };

  simulador.actualizarPosiciones(snapshot.planets, { reencuadrarVista: false });
  simulador.actualizarEscenaHistorica({
    probesVisual: snapshot.probes,
    moonsVisual: snapshot.moons,
    localFrames: snapshot.localFrames,
    jdTdb: snapshot.jdTdb,
    visibilityMode: motorHistorico.getVisibilityMode()
  });

  if (reencuadrarEvento) {
    enfocarEscenaParaEvento(reencuadrarEvento, snapshot);
  }
  if (accionPosteriorEscena) {
    accionPosteriorEscena(snapshot);
  }

  actualizarEncabezadoHistorico(snapshot);
  controlesHistoricos.actualizarDesdeMotor({
    snapshot,
    engineState: obtenerEstadoMotorHistoricoPlano()
  });
  controlesHistoricos.actualizarEstadoCamaraHistorica(simulador.obtenerEstadoCamaraHistorica());
  if (lunaSeleccionada) actualizarPanel(controlesTemporales.obtenerFecha());
  actualizarOrientacionHistorica();
  controlesDistancia.actualizar();
  return snapshot;
}

function enfocarEscenaParaEvento(ev, snapshot = ultimoSnapshotHistorico) {
  if (!ev || !simulador) return;
  controlesHistoricos.seleccionarPestanaFicha(ev.missionId);

  const camaraActual = simulador.obtenerEstadoCamaraHistorica();
  if (camaraActual.modo === 'first_person' && snapshot?.probes?.[ev.missionId]?.state) {
    const objetivo = objetivoContextualEvento(ev);
    simulador.activarPrimeraPersona(ev.missionId, {
      objetivo,
      fovGrados: simulador.obtenerFovContextualParaObjetivo(ev.missionId, objetivo)
    });
    return;
  }

  if (ev.kind === EVENT_KINDS.LAUNCH) {
    simulador.encuadrarSalidaTierra1977();
    hud.actualizarSeleccionSonda(true, `${ev.probeName} · Lanzamiento 1977`);
    return;
  }

  if (ev.recommendedCameraMode === 'first_person') {
    const objetivo = objetivoContextualEvento(ev);
    const ok = simulador.activarPrimeraPersona(ev.missionId, {
      objetivo,
      fovGrados: simulador.obtenerFovContextualParaObjetivo(ev.missionId, objetivo)
    });
    if (ok) {
      hud.actualizarSeleccionSonda(true, `${ev.probeName} · Vista hacia ${ev.focusTarget || 'Tierra'}`);
      return;
    }
  }

  if (ev.kind === EVENT_KINDS.CLOSEST_APPROACH) {
    simulador.establecerModoEscala(MODOS_ESCALA_VISUAL.CIENTIFICA);
    const ok = simulador.encuadrarEncuentroHistorico(ev.missionId, ev.focusTarget);
    if (!ok && ev.focusTarget) simulador.seleccionarPlaneta(ev.focusTarget);
    hud.actualizarSeleccionSonda(true, `${ev.probeName} · Encuentro`);
    return;
  }

  if (ev.kind === EVENT_KINDS.RETROSPECTIVE_BOUNDARY_CROSSING) {
    simulador.mostrarHeliosfera(true);
    controlesHistoricos.establecerHeliosferaUI(true);
    if (snapshot?.probes?.[ev.missionId]?.state) {
      simulador.encuadrarComparativaHistorica();
    }
    hud.actualizarSeleccionSonda(true, `${ev.probeName} · Frontera heliosférica`);
    return;
  }

  if (snapshot?.probes?.[ev.missionId]?.state) {
    simulador.enfocarSondaHistorica(ev.missionId);
  }
}

function objetivoContextualEvento(ev) {
  return ev?.focusTarget?.startsWith('voyager-') ? 'Sol' : (ev?.focusTarget || 'Sol');
}

function bucleReproduccionHistorica(ahora) {
  if (modoOperacion !== 'historico' || !motorHistorico || !motorHistorico.isPlaying()) {
    rafHistoricoId = null;
    return;
  }

  const deltaReal = Math.min(Math.max((ahora - instanteRealHistAnterior) / 1000, 0), 0.08);
  instanteRealHistAnterior = ahora;

  if (!bucleHistOcupado) {
    const paso = motorHistorico.step(deltaReal);
    if (paso.changed || paso.triggeredEvent) {
      bucleHistOcupado = true;
      aplicarInstanteHistorico(paso.jdTdb, {
        reencuadrarEvento: !motorHistorico.isPlaying() && paso.triggeredEvent ? paso.triggeredEvent : null
      }).catch(err => {
        console.error(err);
        estadoDatos.textContent = `Error en reproducción histórica: ${err.message}`;
        motorHistorico.setPlaying(false);
      }).finally(() => {
        bucleHistOcupado = false;
      });
    }
  }

  if (motorHistorico.isPlaying()) {
    rafHistoricoId = requestAnimationFrame(bucleReproduccionHistorica);
  } else {
    rafHistoricoId = null;
  }
}

function iniciarReproduccionHistorica() {
  if (!motorHistorico || modoOperacion !== 'historico') return;
  motorHistorico.setPlaying(true);
  instanteRealHistAnterior = performance.now();
  if (rafHistoricoId === null) {
    rafHistoricoId = requestAnimationFrame(bucleReproduccionHistorica);
  }
  if (ultimoSnapshotHistorico) {
    controlesHistoricos.actualizarDesdeMotor({
      snapshot: ultimoSnapshotHistorico,
      engineState: obtenerEstadoMotorHistoricoPlano()
    });
  }
}

async function inicializarModoHistoricoSiNecesario() {
  if (motorHistorico && pipelineHistorico) return;
  if (!promesaInicioHistorico) {
    promesaInicioHistorico = (async () => {
      estadoDatos.textContent = 'Cargando catálogo histórico NASA/JPL Horizons (1977–2026)…';
      const pipeline = createHistoricalVisualPipeline({ baseUrl: import.meta.env.BASE_URL });
      const [bounds, backboneV1, backboneV2] = await Promise.all([
        pipeline.getTimelineBounds(),
        pipeline.loadVisualTrajectoryBackbone(VOYAGER_1_ID),
        pipeline.loadVisualTrajectoryBackbone(VOYAGER_2_ID)
      ]);

      simulador.configurarTrayectoriaHistorica(VOYAGER_1_ID, backboneV1.knots);
      simulador.configurarTrayectoriaHistorica(VOYAGER_2_ID, backboneV2.knots);

      // Fija los 4 marcadores reales de cruce de frontera heliosférica usando sus coordenadas Horizons exactas
      const eventosFrontera = [
        { id: 'v1-termination-shock-2004', etiqueta: 'V1 Choque 2004', tipo: 'choque' },
        { id: 'v2-termination-shock-2007', etiqueta: 'V2 Choque 2007', tipo: 'choque' },
        { id: 'v1-heliopause-2012', etiqueta: 'V1 Heliopausa 2012', tipo: 'heliopausa' },
        { id: 'v2-heliopause-2018', etiqueta: 'V2 Heliopausa 2018', tipo: 'heliopausa' }
      ];
      const crucesResueltos = await Promise.all(eventosFrontera.map(async item => {
        const ev = getHistoricalEventById(item.id);
        if (!ev) return null;
        const probeRes = await pipeline.resolver.resolveProbeState(ev.missionId, ev.jdTdb);
        if (!probeRes?.state) return null;
        const m = HISTORICAL_MISSIONS_CATALOG[ev.missionId];
        return {
          id: item.id,
          etiqueta: item.etiqueta,
          posicionEscena: physicalPositionKmToScene(probeRes.state.position),
          colorHex: m.trajectoryColorHex
        };
      }));
      simulador.fijarCrucesHeliosfera(crucesResueltos.filter(Boolean));

      const params = new URLSearchParams(window.location.search);
      const eventoInicialParam = params.get('event');
      const utcInicialParam = params.get('utc');
      const eventoInicial = eventoInicialParam ? getHistoricalEventById(eventoInicialParam) : null;

      const engine = createHistoricalMissionEngine({
        minJdTdb: bounds.minJdTdb,
        maxJdTdb: bounds.maxJdTdb,
        initialJdTdb: eventoInicial ? eventoInicial.jdTdb : bounds.minJdTdb,
        initialSpeedId: '1d_s'
      });
      if (utcInicialParam) {
        try {
          engine.setUtcTimestamp(utcInicialParam);
        } catch {
          // Conserva el inicio verificado si el parámetro UTC de URL no es válido
        }
      }

      pipelineHistorico = pipeline;
      motorHistorico = engine;
    })();
  }
  await promesaInicioHistorico;
}

async function cambiarModoOperacion(nuevoModo) {
  if (nuevoModo === modoOperacion) return;
  const modoPrevio = modoOperacion;
  modoOperacion = nuevoModo;

  if (nuevoModo === 'historico') {
    lunaSeleccionada = null;
    simulador.actualizarLunas({}, false);
    simulador.vistaGeneral();
    controlesTemporales.detener();
    detenerBucleMision();
    if (modoEjecucionMision === 'simulando') {
      modoEjecucionMision = 'pausado';
      controlesMision.actualizarEstadoEjecucion('pausado');
    }
    simulador.ocultarSonda();
    planetaSeleccionado = null;
    selectorPlanetas.actualizar(null);
    actualizarPanel(controlesTemporales.obtenerFecha());

    const dockHist = document.querySelector('#hist-mission-dock');
    if (dockHist) dockHist.hidden = false;

    try {
      await inicializarModoHistoricoSiNecesario();
      if (modoOperacion !== 'historico') return;
      controlesDistancia.configurarModoOperacion('historico');
      const jdActual = motorHistorico.getJdTdb();
      const esInicio1977 = Math.abs(jdActual - HISTORICAL_MISSIONS_CATALOG[VOYAGER_2_ID].launchJdTdb) < 0.05;
      await aplicarInstanteHistorico(jdActual, {
        reencuadrarEvento: esInicio1977 ? VOYAGER_HISTORICAL_EVENTS[0] : motorHistorico.getTriggeredEvent()
      });
      if (esInicio1977) sincronizarAcontecimientoHistorico(VOYAGER_HISTORICAL_EVENTS[0]);
      else actualizarOrientacionHistorica(motorHistorico.getTriggeredEvent());
      modalBienvenida?.abrir(false);
    } catch (err) {
      console.error(err);
      estadoDatos.textContent = `No fue posible inicializar el Modo Histórico: ${err.message}`;
    }
    return;
  }

  // Salida de Modo Histórico hacia Exploración o Experimental
  if (modoPrevio === 'historico') {
    detenerBucleHistorico();
    ++consultaHistToken;
    simulador.ocultarModoHistoricoEscena();
    recorridoGuiado?.mostrar(false);
    overlayLanzamiento?.mostrar(false);
    simulador.cancelarLanzamiento();
    const dockHist = document.querySelector('#hist-mission-dock');
    if (dockHist) dockHist.hidden = true;
    const fpIndicator = document.querySelector('#fp-scene-indicator');
    if (fpIndicator) fpIndicator.hidden = true;
  }

  const fecha2026 = controlesTemporales.obtenerFecha() || '2026-10-10';
  if (datosAstronomicos) {
    const jdFecha = gregorianLabelToJulianMidnight(fecha2026);
    instanteCientificoActivo = {
      jdTdb: jdFecha,
      labelTdb: `${fecha2026} · 00:00 TDB`
    };
    const estados = obtenerEstados(datosAstronomicos, fecha2026);
    simulador.actualizarPosiciones(estados, { reencuadrarVista: modoPrevio === 'historico' });
    actualizarLunasExploracion(jdFecha);
    estadosActuales = estados;
    fechaEscena.textContent = `${fecha2026} · 00:00 TDB`;
    estadoDatos.textContent = `NASA/JPL Horizons · muestra diaria ${fecha2026} (TDB)`;
  }

  if (nuevoModo === 'experimental') {
    controlesDistancia.configurarModoOperacion('experimental');
    tituloEscena.textContent = 'Sistema Solar';
    const observedEl = document.querySelector('#observed-body');
    if (observedEl) observedEl.textContent = 'Observando · Sonda Experimental 01';
    etiquetaModoVista.textContent = 'DINÁMICA ORBITAL / EXPERIMENTAL';
    hud.actualizarSeleccionSonda(true, 'Sonda Experimental 01');
    sincronizarSondaConFechaDiaria(fecha2026);
    if (trayectoriaSonda) {
      simulador.mostrarTrayectoriaSonda(controlesMision.trayectoriaMarcada());
    }
  } else {
    detenerBucleMision();
    if (modoEjecucionMision === 'simulando') {
      modoEjecucionMision = 'pausado';
      controlesMision.actualizarEstadoEjecucion('pausado');
    }
    simulador.ocultarSonda();
    controlesDistancia.configurarModoOperacion('exploracion');
    tituloEscena.textContent = 'Sistema Solar';
    const observedEl = document.querySelector('#observed-body');
    if (observedEl) observedEl.textContent = 'Observando · Vista General';
    etiquetaModoVista.textContent = 'EXPLORADOR ESPACIAL / VISTA GENERAL';
    hud.actualizarSeleccionSonda(false);
  }

  if (modoPrevio === 'historico') {
    simulador.vistaGeneral();
  }
  actualizarPanel(fecha2026);
}

const controlesMision = crearControlesMision({
  alAlternarEjecucion: () => {
    if (!trayectoriaSonda || modoOperacion !== 'experimental') return;
    if (modoEjecucionMision === 'simulando') {
      detenerBucleMision();
      modoEjecucionMision = 'pausado';
      controlesMision.actualizarEstadoEjecucion('pausado');
      const { calendar } = evaluateVisualPlanetsFromField(
        trayectoriaSonda.ephemerisField,
        tiempoMisionSegundos
      );
      controlesTemporales.sincronizarFechaSilenciosa(calendar.dateIso, null, calendar.timeHm);
      return;
    }

    controlesTemporales.detener();
    ++consultaActual;
    if (modoEjecucionMision === 'anterior_epoca'
      || modoEjecucionMision === 'fin_cobertura'
      || tiempoMisionSegundos >= trayectoriaSonda.maxSeconds) {
      colocarEscenaEnEpocaInicialMision();
    }

    modoEjecucionMision = 'simulando';
    controlesMision.actualizarEstadoEjecucion('simulando', controlesTemporales.obtenerVelocidad());
    instanteRealAnterior = performance.now();
    detenerBucleMision();
    rafMisionId = requestAnimationFrame(avanzarFotogramaMision);
  },
  alReiniciar: () => {
    if (!trayectoriaSonda || modoOperacion !== 'experimental') return;
    detenerBucleMision();
    controlesTemporales.detener();
    colocarEscenaEnEpocaInicialMision();
    modoEjecucionMision = 'listo';
    controlesMision.actualizarEstadoEjecucion('listo');
  },
  alEnfocarSonda: () => {
    if (!simulador.enfocarSonda()) {
      estadoDatos.textContent = 'No se pudo calcular una ruta segura de cámara hacia la sonda.';
    }
  },
  alAlternarTrayectoria: mostrar => {
    simulador.mostrarTrayectoriaSonda(mostrar);
  },
  alSeleccionarAparienciaSonda: modo => {
    simulador.establecerAparienciaSonda(modo);
  }
});

const selectorPlanetas = crearSelectorPlanetas({
  alElegir: nombre => {
    if (MOONS[nombre]) {
      if (!simulador.seleccionarLuna(nombre)) {
        estadoDatos.textContent = `${MOONS[nombre].name} no está disponible en esta fecha o modo.`;
      }
      return;
    }
    if (!simulador.seleccionarPlaneta(nombre)) {
      estadoDatos.textContent = `No se pudo iniciar el viaje hacia ${nombre}. Puedes explorar el planeta seleccionado con los controles de cámara.`;
    }
  },
  alExplorar: () => {
    if (!simulador.explorarSeleccionado()) {
      estadoDatos.textContent = 'No se pudo calcular una ruta segura hacia el objeto seleccionado.';
    }
  },
  alVistaGeneral: () => simulador.vistaGeneral()
});

const controlesTemporales = crearControlesTemporales(fecha => {
  if (!datosAstronomicos || modoOperacion === 'historico') return;
  detenerBucleMision();
  const solicitud = ++consultaActual;
  const jdFecha = gregorianLabelToJulianMidnight(fecha);
  instanteCientificoActivo = {
    jdTdb: jdFecha,
    labelTdb: `${fecha} · 00:00 TDB`
  };
  const estados = obtenerEstados(datosAstronomicos, fecha);
  simulador.actualizarPosiciones(estados);
  actualizarLunasExploracion(jdFecha);
  estadosActuales = estados;
  fechaEscena.textContent = `${fecha} · 00:00 TDB`;
  estadoDatos.textContent = proveedorCientifico
    ? `Vista provisional del flujo anterior · consultando proveedor científico para ${fecha}`
    : `NASA/JPL Horizons · muestra diaria ${fecha} (TDB)`;
  actualizarPanel(fecha);
  sincronizarSondaConFechaDiaria(fecha);
  controlesDistancia.actualizar();
  if (proveedorCientifico) {
    queryVisualStates(proveedorCientifico, jdFecha)
      .then(({ states, status }) => {
        if (solicitud !== consultaActual || modoOperacion === 'historico') return;
        simulador.actualizarPosiciones(states);
        actualizarLunasExploracion(jdFecha);
        estadosActuales = states;
        actualizarPanel(fecha);
        controlesDistancia.actualizar();
        estadoDatos.textContent = `Proveedor científico · ${status === 'exact' ? 'muestras exactas' : 'interpolación Hermite'} · ${fecha} TDB`;
      }).catch(error => {
        if (solicitud !== consultaActual || modoOperacion === 'historico') return;
        estadoDatos.textContent = `Fallback visual del flujo anterior · proveedor científico: ${error.message}`;
      });
  }
});

controlesTemporales.alCambiarVelocidad(factor => {
  if (modoEjecucionMision === 'simulando') {
    controlesMision.actualizarEstadoEjecucion('simulando', factor);
  }
});

let comparadorAbierto = false;
let estadoPrevioComparador = null;
let snapshotComparador = null;
let consultaComparadorToken = 0;
let comparadorUsaContextoActual = false;
let overlayLanzamiento = null;
let modalBienvenida = null;
let recorridoGuiado = null;
let eventoSeleccionadoHistorico = null;

function actualizarOrientacionHistorica(ev = eventoSeleccionadoHistorico) {
  if (ev) eventoSeleccionadoHistorico = ev;
  const paso = recorridoGuiado?.obtenerHitoActual();
  const actual = eventoSeleccionadoHistorico;
  const enFechaDelEvento = actual && ultimoSnapshotHistorico
    && Math.abs(actual.jdTdb - ultimoSnapshotHistorico.jdTdb) * 86400 < 5;
  const compartido = enFechaDelEvento && paso?.idEvento === actual.id;
  const estado = document.querySelector('#historical-journey-status');
  const accion = document.querySelector('#hist-start-tour-btn');
  if (estado) {
    estado.textContent = actual && !enFechaDelEvento
      ? `Tiempo libre · ${ultimoSnapshotHistorico.timeLabels.labelUtc} · Recorrido en paso ${paso?.indice ?? 1} de 12`
      : actual
      ? compartido ? `${actual.probeName} · Paso ${paso.indice} de 12` : `${actual.title} · ${actual.probeName} · Exploración libre`
      : '12 pasos guiados · 14 acontecimientos para explorar';
  }
  if (accion) accion.textContent = recorridoGuiado?.haComenzado() ? 'Continuar recorrido' : 'Iniciar recorrido';
}

function sincronizarAcontecimientoHistorico(ev) {
  if (!ev) return;
  const indice = HITOS_RECORRIDO_GUIADO.findIndex(hito => hito.idEvento === ev.id);
  if (indice >= 0) recorridoGuiado?.establecerHito(indice);
  controlesHistoricos?.seleccionarPestanaFicha(ev.missionId);
  actualizarOrientacionHistorica(ev);
}

function continuarRecorridoHistorico() {
  if (modoOperacion !== 'historico' || !motorHistorico) return;
  recorridoGuiado.mostrar(true);
  ejecutarHitoGuiado(recorridoGuiado.obtenerHitoActual());
  actualizarOrientacionHistorica();
}

function alCompletarLanzamiento({ misionId }) {
  overlayLanzamiento?.mostrar(false);
  if (!motorHistorico) return;
  const launchJd = HISTORICAL_MISSIONS_CATALOG[misionId].launchJdTdb;
  motorHistorico.setTimeJdTdb(launchJd);
  motorHistorico.setVisibilityMode(misionId);
  actualizarDockMision(misionId);
  aplicarInstanteHistorico(launchJd, {
    accionPosteriorEscena: () => simulador.encuadrarSalidaTierra1977(misionId)
  }).catch(console.error);
}

function iniciarLanzamientoHistorico(misionId = VOYAGER_2_ID) {
  if (modoOperacion !== 'historico') return;
  detenerBucleHistorico();
  recorridoGuiado?.mostrar(false);
  overlayLanzamiento?.mostrar(true, METADATOS_HISTORICOS_LANZAMIENTO[misionId]);
  simulador.iniciarLanzamientoCinematografico(misionId);
}

function ejecutarHitoGuiado(hito) {
  if (!hito || !motorHistorico) return;
  detenerBucleHistorico();

  if (hito.idEvento) {
    const ev = motorHistorico.jumpToEvent(hito.idEvento);
    if (ev) {
      sincronizarAcontecimientoHistorico(ev);
      motorHistorico.setVisibilityMode(hito.misionId);
      actualizarDockMision(hito.misionId);
      aplicarInstanteHistorico(motorHistorico.getJdTdb(), {
        reencuadrarEvento: ev
      }).catch(console.error);
    }
  }

}

function actualizarDockMision(choice) {
  const dock = document.querySelector('#hist-mission-dock');
  if (!dock) return;
  for (const btn of dock.querySelectorAll('[data-mission-choice]')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.missionChoice === choice));
  }
}

const simulador = createSolarSystem(
  document.querySelector('#solar-system'),
  nombre => {
    planetaSeleccionado = nombre;
    lunaSeleccionada = null;
    selectorPlanetas.actualizar(nombre);
    actualizarPanel(controlesTemporales.obtenerFecha());
    hud.actualizarSeleccion(nombre);
    if (nombre) document.dispatchEvent(new CustomEvent('sim:object-selected', { detail: { id: nombre } }));
  },
  activa => {
    if (activa) {
      planetaSeleccionado = null;
      selectorPlanetas.actualizar(null);
      actualizarPanel(controlesTemporales.obtenerFecha());
    }
    controlesMision.actualizarEnfoqueSonda(activa);
    hud.actualizarSeleccionSonda(activa, EXPERIMENTAL_PROBE_01_DEFINITION.name);
    if (activa) document.dispatchEvent(new CustomEvent('sim:object-selected', { detail: { id: 'experimental-probe' } }));
  },
  {
    alSeleccionarLuna: nombre => {
      lunaSeleccionada = nombre;
      if (nombre) {
        selectorPlanetas.actualizar(nombre);
        hud.actualizarSeleccion(MOONS[nombre].name);
        document.dispatchEvent(new CustomEvent('sim:object-selected', { detail: { id: nombre } }));
      }
      actualizarPanel(controlesTemporales.obtenerFecha());
    },
    alSeleccionarSondaHistorica: idSondaHist => {
      if (!idSondaHist) {
        if (modoOperacion === 'historico') hud.actualizarSeleccionSonda(false);
        return;
      }
      motorHistorico?.setSelectedProbeId(idSondaHist);
      controlesHistoricos?.seleccionarPestanaFicha(idSondaHist);
      const m = HISTORICAL_MISSIONS_CATALOG[idSondaHist];
      hud.actualizarSeleccionSonda(true, m?.name ?? idSondaHist);
      document.dispatchEvent(new CustomEvent('sim:object-selected', { detail: { id: idSondaHist } }));
    },
    alFinalizarLanzamiento: datos => {
      alCompletarLanzamiento(datos);
    },
    alCambiarFaseLanzamiento: datos => {
      overlayLanzamiento?.actualizarFase(datos);
    },
    obtenerComparadorActivo: () => comparadorAbierto
  }
);

const controlesDistancia = crearControlesDistancia({
  obtenerDescriptorCuerpo: obtenerDescriptorCientificoCuerpo,
  alActualizarLineaEscena: (puntoA, puntoB, mostrar) => {
    simulador.actualizarLineaDistancia(puntoA, puntoB, mostrar);
  }
});
controlesDistancia.configurarModoOperacion('exploracion');

const controlesHistoricos = crearControlesModoHistorico({
  baseUrl: import.meta.env.BASE_URL,
  alCambiarModoApp: modo => {
    cambiarModoOperacion(modo);
  },
  alCambiarVisibilidadSondas: modoVis => {
    if (!motorHistorico) return;
    motorHistorico.setVisibilityMode(modoVis);
    if ((modoVis === VOYAGER_1_ID || modoVis === VOYAGER_2_ID)
      && ultimoSnapshotHistorico?.probes?.[modoVis]?.status === 'pre_launch') {
      // Si el usuario filtra Voyager 1 mientras está en ago 1977 (pre-lanzamiento), informa sin inventar sonda
      simulador.salirDePrimeraPersona();
    }
    aplicarInstanteHistorico(motorHistorico.getJdTdb());
  },
  alActivarCamaraExterior: () => {
    simulador.salirDePrimeraPersona();
    actualizarEncabezadoHistorico(ultimoSnapshotHistorico);
  },
  alSeguirSondaExterior: idMision => {
    if (!motorHistorico) return;
    if (motorHistorico.getVisibilityMode() !== 'both' && motorHistorico.getVisibilityMode() !== idMision) {
      motorHistorico.setVisibilityMode('both');
    }
    motorHistorico.setSelectedProbeId(idMision);
    aplicarInstanteHistorico(motorHistorico.getJdTdb(), {
      accionPosteriorEscena: () => {
        if (!simulador.enfocarSondaHistorica(idMision)) {
          estadoDatos.textContent = `${HISTORICAL_MISSIONS_CATALOG[idMision].name} aún no dispone de posición espacial en esta fecha.`;
        }
      }
    });
  },
  alVistaComparativa: () => {
    if (!motorHistorico) return;
    if (motorHistorico.getVisibilityMode() !== 'both') {
      motorHistorico.setVisibilityMode('both');
      aplicarInstanteHistorico(motorHistorico.getJdTdb(), {
        accionPosteriorEscena: () => simulador.encuadrarComparativaHistorica()
      });
    } else {
      simulador.encuadrarComparativaHistorica();
    }
  },
  alActivarPrimeraPersona: (idMisionPreferida, objetivo = 'Tierra') => {
    if (!motorHistorico || !ultimoSnapshotHistorico) return;
    let idElegida = idMisionPreferida;
    if (!ultimoSnapshotHistorico.probes[idElegida]?.state) {
      const otra = idElegida === VOYAGER_1_ID ? VOYAGER_2_ID : VOYAGER_1_ID;
      if (ultimoSnapshotHistorico.probes[otra]?.state) {
        idElegida = otra;
      } else {
        // Si está en los 63 min de ascenso previo al primer estado SPK, avanza al primer vector Horizons verificado
        const m = HISTORICAL_MISSIONS_CATALOG[idMisionPreferida] ?? HISTORICAL_MISSIONS_CATALOG[VOYAGER_2_ID];
        motorHistorico.setTimeJdTdb(m.firstValidJdTdb);
        aplicarInstanteHistorico(motorHistorico.getJdTdb(), {
          accionPosteriorEscena: () => {
            simulador.activarPrimeraPersona(m.id, {
              objetivo,
              fovGrados: simulador.obtenerFovContextualParaObjetivo(m.id, objetivo)
            });
            actualizarEncabezadoHistorico(ultimoSnapshotHistorico);
          }
        });
        return;
      }
    }
    if (motorHistorico.getVisibilityMode() !== 'both' && motorHistorico.getVisibilityMode() !== idElegida) {
      motorHistorico.setVisibilityMode('both');
      aplicarInstanteHistorico(motorHistorico.getJdTdb(), {
        accionPosteriorEscena: () => {
          simulador.activarPrimeraPersona(idElegida, {
            objetivo,
            fovGrados: simulador.obtenerFovContextualParaObjetivo(idElegida, objetivo)
          });
          actualizarEncabezadoHistorico(ultimoSnapshotHistorico);
        }
      });
      return;
    }
    simulador.activarPrimeraPersona(idElegida, {
      objetivo,
      fovGrados: simulador.obtenerFovContextualParaObjetivo(idElegida, objetivo)
    });
    actualizarEncabezadoHistorico(ultimoSnapshotHistorico);
  },
  alCambiarSondaPrimeraPersona: idMision => {
    if (!motorHistorico || !ultimoSnapshotHistorico) return;
    if (!ultimoSnapshotHistorico.probes[idMision]?.state) return;
    if (motorHistorico.getVisibilityMode() !== 'both' && motorHistorico.getVisibilityMode() !== idMision) {
      motorHistorico.setVisibilityMode('both');
    }
    const camActual = simulador.obtenerEstadoCamaraHistorica();
    aplicarInstanteHistorico(motorHistorico.getJdTdb(), {
      accionPosteriorEscena: () => {
        simulador.activarPrimeraPersona(idMision, {
          objetivo: camActual.objetivoMirada || 'Tierra',
          fovGrados: camActual.fovReferenciaGrados || 45
        });
        actualizarEncabezadoHistorico(ultimoSnapshotHistorico);
      }
    });
  },
  alApuntarPrimeraPersona: idObjetivo => {
    const apuntado = simulador.apuntarPrimeraPersonaHacia(idObjetivo);
    if (apuntado && MOONS[idObjetivo]) {
      const observador = simulador.obtenerEstadoCamaraHistorica().idSondaObservador;
      simulador.establecerFovPrimeraPersona(simulador.obtenerFovContextualParaObjetivo(observador, idObjetivo), { automatico: true });
    }
    actualizarEncabezadoHistorico(ultimoSnapshotHistorico);
  },
  alReencuadrarPrimeraPersona: () => {
    const objetivo = eventoSeleccionadoHistorico
      ? objetivoContextualEvento(eventoSeleccionadoHistorico)
      : (simulador.obtenerEstadoCamaraHistorica().objetivoMirada || 'Sol');
    const observador = simulador.obtenerEstadoCamaraHistorica().idSondaObservador;
    simulador.establecerFovPrimeraPersona(simulador.obtenerFovContextualParaObjetivo(observador, objetivo), { automatico: true });
    simulador.apuntarPrimeraPersonaHacia(objetivo);
    actualizarEncabezadoHistorico(ultimoSnapshotHistorico);
  },
  alCambiarFovPrimeraPersona: grados => {
    simulador.establecerFovPrimeraPersona(grados);
  },
  alAlternarTrayectoriasHistoricas: mostrar => {
    simulador.configurarVisualizacion({ trayectoriasHistoricas: mostrar });
  },
  alAlternarHeliosfera: mostrar => {
    simulador.mostrarHeliosfera(mostrar);
  },
  alAlternarReproduccion: () => {
    if (!motorHistorico) return;
    if (motorHistorico.isPlaying()) {
      detenerBucleHistorico();
      if (ultimoSnapshotHistorico) {
        controlesHistoricos.actualizarDesdeMotor({
          snapshot: ultimoSnapshotHistorico,
          engineState: obtenerEstadoMotorHistoricoPlano()
        });
      }
    } else {
      iniciarReproduccionHistorica();
    }
  },
  alAlternarRetroceso: () => {
    if (!motorHistorico) return;
    motorHistorico.toggleReverse();
    if (ultimoSnapshotHistorico) {
      controlesHistoricos.actualizarDesdeMotor({
        snapshot: ultimoSnapshotHistorico,
        engineState: obtenerEstadoMotorHistoricoPlano()
      });
    }
  },
  alIrALanzamiento: () => {
    if (!motorHistorico) return;
    detenerBucleHistorico();
    const jd = motorHistorico.jumpToLaunch();
    const evLanz = motorHistorico.getSelectedProbeId() === VOYAGER_1_ID
      ? getHistoricalEventById('v1-launch-1977')
      : getHistoricalEventById('v2-launch-1977');
    aplicarInstanteHistorico(jd, { reencuadrarEvento: evLanz });
  },
  alIrAUltimoDisponible: () => {
    if (!motorHistorico) return;
    detenerBucleHistorico();
    const jd = motorHistorico.jumpToLatestAvailable();
    aplicarInstanteHistorico(jd, {
      accionPosteriorEscena: () => simulador.encuadrarComparativaHistorica()
    });
  },
  alEventoAnterior: () => {
    if (!motorHistorico) return;
    detenerBucleHistorico();
    const ev = motorHistorico.jumpToPreviousEvent();
    sincronizarAcontecimientoHistorico(ev);
    aplicarInstanteHistorico(motorHistorico.getJdTdb(), {
      reencuadrarEvento: ev ?? VOYAGER_HISTORICAL_EVENTS[0]
    });
  },
  alEventoSiguiente: () => {
    if (!motorHistorico) return;
    detenerBucleHistorico();
    const ev = motorHistorico.jumpToNextEvent();
    sincronizarAcontecimientoHistorico(ev);
    aplicarInstanteHistorico(motorHistorico.getJdTdb(), {
      reencuadrarEvento: ev,
      accionPosteriorEscena: !ev ? () => simulador.encuadrarComparativaHistorica() : null
    });
  },
  alIrAEvento: eventId => {
    if (!motorHistorico) return;
    detenerBucleHistorico();
    const ev = motorHistorico.jumpToEvent(eventId);
    if (ev) {
      sincronizarAcontecimientoHistorico(ev);
      aplicarInstanteHistorico(motorHistorico.getJdTdb(), { reencuadrarEvento: ev });
    }
  },
  alEnfocarEventoActual: ev => {
    if (!motorHistorico || !ev) return;
    enfocarEscenaParaEvento(ev, ultimoSnapshotHistorico);
  },
  alOmitirEventoYContinuar: () => {
    if (!motorHistorico) return;
    motorHistorico.skipTriggeredEventAndContinue();
    iniciarReproduccionHistorica();
  },
  alDeslizarProgreso: fraccion => {
    if (!motorHistorico) return;
    detenerBucleHistorico();
    const jd = motorHistorico.setProgress(fraccion);
    aplicarInstanteHistorico(jd);
  },
  alSeleccionarFechaUtc: utcIso => {
    if (!motorHistorico) return;
    detenerBucleHistorico();
    try {
      const jd = motorHistorico.setUtcTimestamp(utcIso);
      aplicarInstanteHistorico(jd);
    } catch (err) {
      estadoDatos.textContent = `Fecha fuera de rango o inválida: ${err.message}`;
    }
  },
  alCambiarVelocidad: speedId => {
    if (!motorHistorico) return;
    motorHistorico.setSpeedById(speedId);
    if (ultimoSnapshotHistorico) {
      controlesHistoricos.actualizarDesdeMotor({
        snapshot: ultimoSnapshotHistorico,
        engineState: obtenerEstadoMotorHistoricoPlano()
      });
    }
  },
  alCambiarAsistenciasEventos: ({ autoSlow, autoPause }) => {
    if (!motorHistorico) return;
    motorHistorico.setAutoSlowNearEvents(autoSlow);
    motorHistorico.setAutoPauseAtEvents(autoPause);
  },
  alIrAFechaFoto: photo => {
    if (!motorHistorico || !photo) return;
    detenerBucleHistorico();
    if (motorHistorico.getVisibilityMode() !== 'both' && motorHistorico.getVisibilityMode() !== photo.missionId) {
      motorHistorico.setVisibilityMode('both');
    }
    motorHistorico.setSelectedProbeId(photo.missionId);
    motorHistorico.setTimeJdTdb(photo.jdTdb);
    aplicarInstanteHistorico(motorHistorico.getJdTdb(), {
      accionPosteriorEscena: () => {
        if (photo.isFirstSpkJump) {
          simulador.enfocarSondaHistorica(photo.missionId);
        } else if (photo.targetBody && photo.targetBody !== 'Tierra') {
          simulador.establecerModoEscala(MODOS_ESCALA_VISUAL.CIENTIFICA);
          simulador.encuadrarEncuentroHistorico(photo.missionId, photo.targetBody);
        } else {
          simulador.enfocarSondaHistorica(photo.missionId);
        }
      }
    });
  },
  alActivarComparadorFoto: (photo, { usarFovContexto }) => {
    if (!motorHistorico || !photo || !ultimoSnapshotHistorico) return;
    if (!estadoPrevioComparador) {
      estadoPrevioComparador = {
        motor: obtenerEstadoMotorHistoricoPlano(),
        snapshot: ultimoSnapshotHistorico,
        camara: simulador.obtenerEstadoCamaraHistorica(),
        evento: eventoSeleccionadoHistorico
      };
    }
    comparadorAbierto = true;
    comparadorUsaContextoActual = usarFovContexto;
    detenerBucleHistorico();
    ++consultaHistToken;
    const token = ++consultaComparadorToken;
    document.querySelector('#comp-session-date').textContent = estadoPrevioComparador.snapshot.timeLabels.labelUtc;
    pipelineHistorico.queryVisualHistoricalSnapshot(photo.jdTdb).then(snapshot => {
      if (token !== consultaComparadorToken || !comparadorAbierto || modoOperacion !== 'historico') return;
      snapshotComparador = snapshot;
      simulador.actualizarPosiciones(snapshot.planets, { reencuadrarVista: false });
      simulador.actualizarEscenaHistorica({
        probesVisual: snapshot.probes,
        moonsVisual: snapshot.moons,
        localFrames: snapshot.localFrames,
        jdTdb: snapshot.jdTdb,
        visibilityMode: 'both'
      });
      if (!simulador.activarRecreacionFotografica(photo, { usarFovContexto: comparadorUsaContextoActual })) {
        document.querySelector('#comp-geometry-telemetry').textContent = 'Vista 3D no disponible: la sonda carece de posición en la fecha documentada.';
      } else {
        controlesHistoricos.actualizarTelemetriaComparador(snapshot);
      }
    }).catch(error => {
      if (token === consultaComparadorToken) {
        document.querySelector('#comp-geometry-telemetry').textContent = `Vista 3D no disponible: ${error.message}`;
      }
    });
  },
  alCambiarFovComparador: (photo, { usarFovContexto }) => {
    comparadorUsaContextoActual = usarFovContexto;
    if (!photo || !snapshotComparador) return;
    simulador.activarRecreacionFotografica(photo, { usarFovContexto });
    controlesHistoricos.actualizarTelemetriaComparador(snapshotComparador);
  },
  alCerrarComparadorFoto: ({ reanudar = true } = {}) => {
    comparadorAbierto = false;
    ++consultaComparadorToken;
    const previo = estadoPrevioComparador;
    estadoPrevioComparador = null;
    snapshotComparador = null;
    if (!previo || !motorHistorico || modoOperacion !== 'historico') return;
    motorHistorico.setTimeJdTdb(previo.motor.jdTdb);
    motorHistorico.setVisibilityMode(previo.motor.visibilityMode);
    motorHistorico.setSelectedProbeId(previo.motor.selectedProbeId);
    motorHistorico.setDirection(previo.motor.direction);
    ultimoSnapshotHistorico = previo.snapshot;
    eventoSeleccionadoHistorico = previo.evento;
    simulador.actualizarPosiciones(previo.snapshot.planets, { reencuadrarVista: false });
    simulador.actualizarEscenaHistorica({
      probesVisual: previo.snapshot.probes,
      moonsVisual: previo.snapshot.moons,
      localFrames: previo.snapshot.localFrames,
      jdTdb: previo.snapshot.jdTdb,
      visibilityMode: previo.motor.visibilityMode
    });
    simulador.restaurarEstadoCamaraHistorica(
      previo.camara,
      previo.camara.fotoRecreacionId ? getVoyagerPhotoById(previo.camara.fotoRecreacionId) : null
    );
    controlesHistoricos.actualizarDesdeMotor({
      snapshot: previo.snapshot,
      engineState: obtenerEstadoMotorHistoricoPlano()
    });
    actualizarEncabezadoHistorico(previo.snapshot);
    actualizarOrientacionHistorica();
    if (reanudar && previo.motor.playing) iniciarReproduccionHistorica();
  }
});

overlayLanzamiento = crearSuperficieLanzamientoCinematografico({
  alPausar: () => simulador.pausarLanzamiento(),
  alReanudar: () => simulador.reanudarLanzamiento(),
  alSaltar: () => simulador.saltarLanzamiento(),
  alReiniciar: () => simulador.reiniciarLanzamiento()
});

modalBienvenida = crearModalBienvenidaHistorica({
  alIniciarRecorridoGuiado: () => {
    continuarRecorridoHistorico();
  },
  alExplorarLibremente: () => {},
  alVerLanzamiento: misionId => {
    iniciarLanzamientoHistorico(misionId || VOYAGER_2_ID);
  }
});

recorridoGuiado = crearRecorridoHistoricoGuiado({
  alIrAHito: hito => {
    ejecutarHitoGuiado(hito);
  },
  alVerLanzamiento: misionId => {
    iniciarLanzamientoHistorico(misionId);
  },
  alAbrirFoto: foto => {
    controlesHistoricos.abrirComparadorAB(foto);
  },
  alCerrarRecorrido: () => { detenerBucleHistorico(); actualizarOrientacionHistorica(); }
});

function crearDocksEscenarioHistorico() {
  const scenePanel = document.querySelector('.scene-panel');
  if (!scenePanel || document.querySelector('#hist-mission-dock')) return;

  const missionDock = document.createElement('nav');
  missionDock.id = 'hist-mission-dock';
  missionDock.className = 'hist-mission-dock hud-secondary';
  missionDock.setAttribute('aria-label', 'Selector de misión y accesos históricos');
  missionDock.hidden = true;
  missionDock.innerHTML = `
    <div class="hist-mission-selector" role="group" aria-label="Misión visible">
      <button type="button" class="hist-mission-btn" data-mission-choice="voyager-2" aria-pressed="false" title="Centrar y seguir Voyager 2 (-32)">
        <span class="v-dot v-dot--v2"></span>Voyager 2
      </button>
      <button type="button" class="hist-mission-btn" data-mission-choice="voyager-1" aria-pressed="false" title="Centrar y seguir Voyager 1 (-31)">
        <span class="v-dot v-dot--v1"></span>Voyager 1
      </button>
      <button type="button" class="hist-mission-btn" data-mission-choice="both" aria-pressed="true" title="Encuadrar simultáneamente ambas Voyager">
        <span class="v-dot v-dot--both"></span>Ambas
      </button>
    </div>
    <div class="hist-mission-quick-actions">
      <button type="button" id="hist-start-tour-btn" class="hist-quick-btn hist-quick-btn--tour" title="Recorrido guiado paso a paso por 12 hitos clave (1977–2026)">
        Recorrido guiado
      </button>
      <button type="button" id="hist-launch-cinematic-btn" class="hist-quick-btn hist-quick-btn--launch" title="Ver despegue cinematográfico Titan IIIE-Centaur en 3D">
        Lanzamiento 3D
      </button>
      <button type="button" id="hist-welcome-open-btn" class="hist-quick-btn hist-quick-btn--help" title="Explicación y bienvenida histórica">
        ¿Cómo funciona?
      </button>
    </div>
  `;
  scenePanel.append(missionDock);

  const fpIndicator = document.createElement('div');
  fpIndicator.id = 'fp-scene-indicator';
  fpIndicator.className = 'fp-scene-indicator hud-secondary';
  fpIndicator.setAttribute('role', 'status');
  fpIndicator.hidden = true;
  fpIndicator.innerHTML = `
    <div class="fp-scene-indicator-info">
      <span class="fp-dot"></span>
      <strong id="fp-indicator-probe">Voyager 2</strong>
      <span class="fp-sep">·</span>
      <span id="fp-indicator-target">Hacia Urano</span>
      <span class="fp-sep">·</span>
      <span id="fp-indicator-fov">FOV: 0,42°</span>
      <span class="fp-fidelity-tag">Apuntado geométrico</span>
    </div>
    <button type="button" id="fp-exit-btn" class="fp-exit-btn" title="Regresar a cámara exterior orbital">
      Exterior ↗
    </button>
  `;
  scenePanel.append(fpIndicator);
  const footprint = document.createElement('div');
  footprint.id = 'iss-square-footprint';
  footprint.className = 'iss-square-footprint';
  footprint.setAttribute('aria-hidden', 'true');
  footprint.hidden = true;
  footprint.innerHTML = '<span>Campo ISS · fotograma cuadrado</span>';
  scenePanel.append(footprint);
  const cameraCut = document.createElement('div');
  cameraCut.id = 'camera-cut-mask';
  cameraCut.setAttribute('aria-hidden', 'true');
  cameraCut.hidden = true;
  scenePanel.append(cameraCut);
  const ajustarHuellaIss = () => {
    const side = Math.min(scenePanel.clientWidth, scenePanel.clientHeight);
    footprint.style.width = `${side}px`;
    footprint.style.height = `${side}px`;
  };
  ajustarHuellaIss();
  window.addEventListener('resize', ajustarHuellaIss);

  for (const btn of missionDock.querySelectorAll('[data-mission-choice]')) {
    btn.addEventListener('click', () => {
      const choice = btn.dataset.missionChoice;
      if (!motorHistorico) return;
      motorHistorico.setVisibilityMode(choice);
      actualizarDockMision(choice);
      aplicarInstanteHistorico(motorHistorico.getJdTdb(), {
        accionPosteriorEscena: () => {
          if (choice === 'both') simulador.encuadrarComparativaHistorica();
          else simulador.enfocarSondaHistorica(choice);
        }
      }).catch(console.error);
      for (const btnVis of document.querySelectorAll('[data-hist-vis]')) {
        btnVis.setAttribute('aria-pressed', String(btnVis.dataset.histVis === choice));
      }
    });
  }

  missionDock.querySelector('#hist-start-tour-btn').addEventListener('click', () => {
    continuarRecorridoHistorico();
  });

  missionDock.querySelector('#hist-launch-cinematic-btn').addEventListener('click', () => {
    const misionActiva = motorHistorico?.getVisibilityMode() === VOYAGER_1_ID ? VOYAGER_1_ID : VOYAGER_2_ID;
    iniciarLanzamientoHistorico(misionActiva);
  });

  missionDock.querySelector('#hist-welcome-open-btn').addEventListener('click', () => {
    modalBienvenida.abrir(true);
  });

  fpIndicator.querySelector('#fp-exit-btn').addEventListener('click', () => {
    simulador.salirDePrimeraPersona();
  });
}

crearDocksEscenarioHistorico();

let ultimoModoCamaraNotificado = null;
let ultimoObservadorNotificado = null;
let temporizadorCorteCamara = null;
let secuenciaCorteCamara = 0;
simulador.alCambiarCamaraHistorica(estadoCam => {
  const cambioDePuntoDeVista = ultimoModoCamaraNotificado !== null
    && (ultimoModoCamaraNotificado !== estadoCam.modo
      || (estadoCam.modo !== 'exterior' && ultimoObservadorNotificado !== estadoCam.idSondaObservador));
  ultimoModoCamaraNotificado = estadoCam.modo;
  ultimoObservadorNotificado = estadoCam.idSondaObservador;
  if (cambioDePuntoDeVista && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const mask = document.querySelector('#camera-cut-mask');
    clearTimeout(temporizadorCorteCamara);
    mask.hidden = false;
    mask.style.transition = 'none';
    mask.style.opacity = '0.88';
    const secuencia = ++secuenciaCorteCamara;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (secuencia !== secuenciaCorteCamara) return;
      mask.style.transition = 'opacity 220ms ease-out';
      mask.style.opacity = '0';
    }));
    temporizadorCorteCamara = setTimeout(() => {
      if (secuencia === secuenciaCorteCamara) mask.hidden = true;
    }, 270);
  }
  controlesHistoricos.actualizarEstadoCamaraHistorica(estadoCam);
  const cameraContext = document.querySelector('#camera-context');
  if (cameraContext) {
    const nave = estadoCam.idSondaObservador === VOYAGER_1_ID ? 'Voyager 1' : 'Voyager 2';
    const objetivo = ETIQUETAS_CUERPOS[estadoCam.objetivoMirada] || estadoCam.objetivoMirada || 'espacio profundo';
    cameraContext.textContent = estadoCam.modo === 'exterior'
      ? 'Vista exterior · explora alrededor de las sondas. Pulsa «Desde Voyager» para mirar desde una de ellas.'
      : `${estadoCam.modo === 'photo_recreation' ? 'Comparación fotográfica' : 'Vista desde la sonda'} · ${nave} → ${objetivo}. Apuntado geométrico sin orientación CK/IK.`;
  }
  if (modoOperacion === 'historico') {
    actualizarEncabezadoHistorico(ultimoSnapshotHistorico);
  }
  const fpIndicator = document.querySelector('#fp-scene-indicator');
  const footprint = document.querySelector('#iss-square-footprint');
  if (footprint) footprint.hidden = estadoCam.fovTipo !== 'instrumento_cuadrado';
  if (fpIndicator) {
    const enFp = estadoCam.modo === 'first_person' || estadoCam.modo === 'photo_recreation';
    fpIndicator.hidden = !enFp;
    if (enFp) {
      const elProbe = fpIndicator.querySelector('#fp-indicator-probe');
      const elTarget = fpIndicator.querySelector('#fp-indicator-target');
      const elFov = fpIndicator.querySelector('#fp-indicator-fov');
      if (elProbe) elProbe.textContent = estadoCam.idSondaObservador === VOYAGER_1_ID ? 'Desde Voyager 1' : 'Desde Voyager 2';
      if (elTarget) {
        const nombreObjetivo = ETIQUETAS_CUERPOS[estadoCam.objetivoMirada] || estadoCam.objetivoMirada || 'Espacio profundo';
        const notaPaleBlueDot = estadoCam.modo === 'first_person'
          && eventoSeleccionadoHistorico?.id === 'v1-pale-blue-dot-1990'
          && estadoCam.objetivoMirada === 'Tierra'
          ? ' · punto subpíxel'
          : '';
        const notaEncuadre = estadoCam.modo === 'first_person'
          && estadoCam.fovTipo === 'contextual_vertical'
          && estadoCam.encuadreObjetivo?.cabeEnAreaLibre === false
          ? ' · encuadre parcial' : '';
        elTarget.textContent = `→ ${nombreObjetivo}${notaPaleBlueDot}${notaEncuadre}`;
      }
      if (elFov) elFov.textContent = estadoCam.fovTipo === 'instrumento_cuadrado'
        ? `FOV ISS: ${estadoCam.fovReferenciaGrados.toFixed(estadoCam.fovReferenciaGrados < 1 ? 3 : 1).replace('.', ',')}° por lado`
        : `FOV: ${estadoCam.fovReferenciaGrados.toFixed(estadoCam.fovReferenciaGrados < 2 ? 2 : 1).replace('.', ',')}° vertical`;
    }
  }
});

simulador.alCambiarVista(() => {
  if (modoOperacion === 'historico') {
    // Reafirma el encabezado propio del Modo Histórico si un control general notificó vista
    queueMicrotask(() => actualizarEncabezadoHistorico(ultimoSnapshotHistorico));
  }
});

simulador.alCambiarModeloSonda(info => {
  controlesMision.actualizarEstadoModelo3D(info);
});
simulador.alCambiarModoEscala(() => {
  controlesDistancia.actualizar();
});

crearControlesVisualizacion(simulador);
botonReintentar.addEventListener('click', iniciar);

async function iniciar() {
  detenerBucleMision();
  detenerBucleHistorico();
  estadoDatos.textContent = 'Cargando efemérides de NASA/JPL Horizons…';
  botonReintentar.hidden = true;
  selectorPlanetas.habilitar(false);

  try {
    datosAstronomicos = await cargarEfemerides();
    try {
      const moonFiles = ['moons-2026-10.json', 'moons-stage6-2026-10.json'];
      const moonSets = [];
      for (const file of moonFiles) {
        try {
          const response = await fetch(`${import.meta.env.BASE_URL}data/${file}`);
          if (!response.ok) throw Error(`HTTP ${response.status}`);
          moonSets.push(await response.json());
        } catch (error) { console.error(`Efemérides lunares ${file} no disponibles:`, error); }
      }
      if (!moonSets.length) throw Error('Sin conjuntos de efemérides lunares locales');
      const loadedMoons = { ...moonSets[0], moons: Object.assign({}, ...moonSets.map(set => set.moons)) };
      const validated = validateMoonDataset(loadedMoons, { isolate: true });
      datosLunas = validated.data;
      for (const [key, reason] of Object.entries(validated.invalid)) console.error(`Luna ${key} no disponible: ${reason}`);
    } catch (moonError) {
      datosLunas = null;
      console.error('Lunas no disponibles:', moonError);
    }
    proveedorCientifico = null;
    trayectoriaSonda = null;
    estadoVisualSondaActual = null;
    let errorCientifico = null;
    let proveedorMotor = null;

    try {
      proveedorMotor = await loadScientificPipeline({ baseUrl: import.meta.env.BASE_URL });
      if (modoCientifico) proveedorCientifico = proveedorMotor;
    } catch (error) {
      errorCientifico = error;
    }

    if (proveedorMotor) {
      try {
        trayectoriaSonda = await propagateExperimentalProbe01({
          ephemerisProvider: proveedorMotor
        });
        const muestrasRender = trayectoriaSonda.getRenderSamplesKm();
        const verticesEscena = trajectoryRenderSamplesToScenePositions(muestrasRender);
        simulador.configurarTrayectoriaSonda(verticesEscena, muestrasRender.timesSeconds);
        simulador.mostrarTrayectoriaSonda(controlesMision.trayectoriaMarcada());
        controlesMision.configurarMision({
          definicionSonda: EXPERIMENTAL_PROBE_01_DEFINITION,
          marco: 'Heliocéntrica · ICRF Eclíptico J2000'
        });
      } catch (errorProp) {
        console.error(errorProp);
        controlesMision.informarError(`Error de propagación orbital: ${errorProp.message}`);
      }
    } else if (errorCientifico) {
      controlesMision.informarError(`Sin proveedor de efemérides para el motor orbital: ${errorCientifico.message}`);
    }

    controlesTemporales.configurar(datosAstronomicos, '2026-10-10');
    if (modoCientifico && errorCientifico) {
      estadoDatos.textContent = `Fallback visual del flujo anterior · proveedor científico: ${errorCientifico.message}`;
    }
    selectorPlanetas.habilitar(true);

    // Activación opcional por parámetro URL (?mode=historical | ?mode=experimental)
    const params = new URLSearchParams(window.location.search);
    const modoUrl = params.get('mode');
    if (modoUrl === 'historical' || modoUrl === 'historico') {
      controlesHistoricos.establecerModoApp('historico');
      await cambiarModoOperacion('historico');
    } else if (modoUrl === 'experimental') {
      controlesHistoricos.establecerModoApp('experimental');
      await cambiarModoOperacion('experimental');
    } else {
      simulador.ocultarSonda();
    }
  } catch (error) {
    ++consultaActual;
    datosAstronomicos = null;
    trayectoriaSonda = null;
    estadoVisualSondaActual = null;
    instanteCientificoActivo = null;
    controlesDistancia.actualizar();
    console.error(error);
    estadoDatos.textContent = `No se pudieron cargar las efemérides: ${error.message}`;
    controlesMision.informarError(`Efemérides no disponibles: ${error.message}`);
    botonReintentar.hidden = false;
    document.querySelector('#source-menu').open = true;
  }
}

// Diagnóstico de solo lectura para verificación automatizada E2E
window.__SIMULADOR_DIAGNOSTICO__ = Object.freeze({
  obtenerModoOperacion: () => modoOperacion,
  obtenerEstadoIluminacion: () => simulador.obtenerEstadoIluminacion(),
  obtenerSnapshotHistorico: () => ultimoSnapshotHistorico,
  obtenerEstadoMotorHistorico: () => obtenerEstadoMotorHistoricoPlano(),
  obtenerSnapshotComparador: () => snapshotComparador,
  obtenerEstadoCamaraHistorica: () => simulador.obtenerEstadoCamaraHistorica(),
  obtenerLunas: () => ({ seleccionada: lunaSeleccionada, estados: estadosLunas,
    visibles: simulador.obtenerEstadoVisualLunas() }),
  obtenerEstadoModelosHistoricos: () => simulador.obtenerEstadoModelosHistoricos(),
  obtenerEstadoModeloExperimental: () => simulador.obtenerEstadoModeloSonda(),
  obtenerEstadoLanzamiento: () => ({
    activo: simulador.estaEnLanzamiento(),
    fase: simulador.obtenerFaseLanzamiento?.()
  }),
  obtenerEstadoRecorridoGuiado: () => ({
    activo: recorridoGuiado?.esVisible() ?? false,
    hito: recorridoGuiado?.obtenerHitoActual() ?? null
  }),
  iniciarLanzamiento: id => iniciarLanzamientoHistorico(id),
  iniciarRecorrido: (idx = 0) => {
    recorridoGuiado?.mostrar(true, idx);
    ejecutarHitoGuiado(HITOS_RECORRIDO_GUIADO[idx]);
  }
});

crearWorkspaceLayout({
  alBuscarDestino: id => {
    if (id === 'experimental-probe') {
      const focus = document.querySelector('#mission-focus-button');
      if (focus.disabled) return false;
      focus.click();
      return true;
    }
    if (id === 'voyager-1' || id === 'voyager-2' || id === 'both') {
      if (!motorHistorico) return false;
      document.querySelector(`[data-mission-choice="${id}"]`).click();
      return true;
    }
    if (modoOperacion === 'historico') {
      simulador.salirDePrimeraPersona();
      return simulador.seleccionarPlaneta(id);
    }
    if (MOONS[id]) return simulador.seleccionarLuna(id);
    const selector = document.querySelector('#planet-select');
    if (selector.disabled) return false;
    selector.value = id;
    selector.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
});
actualizarOrientacionHistorica();
iniciar();
