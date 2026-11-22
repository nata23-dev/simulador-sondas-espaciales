import './style.css';
import { crearWorkspaceLayout } from './ui/WorkspaceLayout.js';

import { cargarEfemerides, obtenerEstados } from './astronomy/Ephemerides.js';
import { createSolarSystem } from './graphics/SolarSystem.js';
import { bindQualityControls, getQualityState, equipoEscritorio, suspenderAdaptacion } from './graphics/QualityProfile.js';
import { crearMedidorFps } from './ui/FpsMeter.js';
import { precargarEnReposo, conexionLimitada } from './graphics/DeferredTextures.js';
import { claveTexturaPlaneta } from './graphics/PlanetFactory.js';
import { MODOS_ESCALA_VISUAL } from './graphics/ScaleModeConfig.js';
import { crearPanelInfoPlaneta } from './ui/PlanetInfoPanel.js';
import { crearPanelInfoLuna } from './ui/MoonInfoPanel.js';
import { MOONS, queryMoon, validateMoonDataset } from './science/PlanetaryMoons.js';
import { crearSelectorPlanetas } from './ui/PlanetSelector.js';
import { crearControlesTemporales } from './ui/TimelineControls.js';
import { crearControlesVisualizacion } from './ui/VisualizationControls.js';
import { crearControlesHUD } from './ui/HudControls.js';
// 18: la hoja del laboratorio se carga aquí, en su lugar de siempre en la cascada (antes de theme.css y lab-shell.css), aunque el
// código del laboratorio se descargue al entrar en él: si llegara después, sus reglas pisarían las de capas posteriores.
import './ui/experimental-laboratory.css';
import { createSolarSystemMissionView } from './integration/SolarSystemMissionView.js';
import { createMissionProbeSceneModel } from './lab/MissionProbeSceneModel.js';
import { createInterplanetaryEphemeris } from './science/InterplanetaryEphemeris.js';
import { createAppNavigator } from './ui/AppNavigator.js';
import { createCommandPalette } from './ui/CommandPalette.js';
import { createFeaturedMissions } from './ui/FeaturedMissions.js';
import { createLabFormEnhancer } from './ui/LabFormEnhancer.js';
import { crearControlesDistancia } from './ui/DistanceToolControls.js';
import { crearControlesModoHistorico } from './ui/HistoricalModeControls.js';
import { createMeasurableBodyEndpoint } from './science/DistanceMeasurement.js';
import { HORIZONS_FRAME } from './science/Frames.js';
import { KM_PER_AU } from './science/Units.js';
import { gregorianLabelToJulianMidnight } from './science/Time.js';
import { physicalPositionKmToScene } from './integration/ProbeVisualAdapter.js';
import {
  loadScientificPipeline,
  queryVisualStates,
  scientificPipelineEnabled
} from './integration/ScientificVisualPipeline.js';
import { createHistoricalVisualPipeline } from './integration/HistoricalVisualPipeline.js';
import { createHistoricalComparatorSession } from './integration/HistoricalComparatorSession.js';
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
import { crearSuperficieLanzamientoCinematografico, metadatosLanzamiento } from './ui/LaunchCinematicOverlay.js';
import { LANZAMIENTOS_VOYAGER, LC41, instanteUtcMs, puntoSubsolar } from './science/VoyagerLaunchProfile.js';
// 14: capa visual común (tokens, componentes y movimiento). Se importa después de los demás estilos para prevalecer.
import './ui/theme.css';
// 17: laboratorio en tres etapas (panel lateral, pestañas y Centro de Misión con panel por pestañas); después de theme.css.
import './ui/lab-shell.css';

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
let planetaSeleccionado = null;
let lunaSeleccionada = null;
let datosLunas = null;
let estadosLunas = {};
let proveedorCientifico = null;
let consultaActual = 0;
// 17.1: reproducción de la misión del laboratorio en esta misma escena (se crea junto al simulador).
let vistaMisionLaboratorio = null;
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
  // 23: con la misión del laboratorio en la escena, el satélite está en la época de la misión, no en la de exploración.
  let estadoPanelLuna = vistaMisionLaboratorio?.isControlling() ? vistaMisionLaboratorio.moonInfoState(lunaSeleccionada) : estadosLunas[lunaSeleccionada];
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
    const sinPosicion = [VOYAGER_1_ID, VOYAGER_2_ID].filter(id =>
      (vis === 'both' || vis === id) && snapshot.probes[id]?.status === 'spk_segment_transition');
    estadoDatos.textContent = sinPosicion.length
      ? `${sinPosicion.map(id => HISTORICAL_MISSIONS_CATALOG[id].name).join(' y ')} · Sin posición verificada durante este minuto. La trayectoria se interrumpe y continúa después.`
      : `NASA/JPL Horizons · ${contextNote} · ${snapshot.timeLabels.shortLabelTdb}`;
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
    const instanteAnterior = motorHistorico.getJdTdb();
    const paso = motorHistorico.step(deltaReal);
    if (paso.changed || paso.triggeredEvent) {
      const visibilidad = motorHistorico.getVisibilityMode();
      const empalmeAtravesado = [VOYAGER_1_ID, VOYAGER_2_ID]
        .filter(id => visibilidad === 'both' || visibilidad === id)
        .map(id => HISTORICAL_MISSIONS_CATALOG[id].spkSegmentSplice)
        .sort((a, b) => motorHistorico.getDirection() > 0
          ? a.beforeJdTdb - b.beforeJdTdb
          : b.afterJdTdb - a.afterJdTdb)
        .find(splice => splice && (
          (instanteAnterior <= splice.beforeJdTdb && paso.jdTdb > splice.beforeJdTdb)
          || (instanteAnterior >= splice.afterJdTdb && paso.jdTdb < splice.afterJdTdb)
        ));
      const instanteVisible = empalmeAtravesado
        ? (empalmeAtravesado.beforeJdTdb + empalmeAtravesado.afterJdTdb) / 2
        : paso.jdTdb;
      if (empalmeAtravesado) {
        motorHistorico.setTimeJdTdb(instanteVisible);
        motorHistorico.setPlaying(false);
      }
      bucleHistOcupado = true;
      aplicarInstanteHistorico(instanteVisible, {
        reencuadrarEvento: !empalmeAtravesado && !motorHistorico.isPlaying() && paso.triggeredEvent ? paso.triggeredEvent : null
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
    simulador.ocultarSonda();
    planetaSeleccionado = null;
    selectorPlanetas.actualizar(null);
    actualizarPanel(controlesTemporales.obtenerFecha());

    const dockHist = document.querySelector('#hist-mission-dock');
    if (dockHist) dockHist.hidden = false;

    simulador.precargarModelosHistoricos();
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
    cerrarLanzamiento3D();
    const dockHist = document.querySelector('#hist-mission-dock');
    if (dockHist) dockHist.hidden = true;
    const fpIndicator = document.querySelector('#fp-scene-indicator');
    if (fpIndicator) fpIndicator.hidden = true;
  }

  const fecha2026 = controlesTemporales.obtenerFecha() || '2026-10-10';
  // 17.1: si la misión del laboratorio ocupa la escena, sus planetas están en la época de la misión: no se sobrescriben.
  if (datosAstronomicos && !vistaMisionLaboratorio?.isControlling()) {
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

  // 17.1: el modo experimental es el laboratorio de misiones (la Sonda Experimental 01 ya no forma parte de la interfaz).
  // La sonda de la escena solo aparece cuando «3 · Reproducir» dibuja una misión planificada en este Sistema Solar.
  controlesTemporales.detener();
  if (!vistaMisionLaboratorio?.isControlling()) simulador.ocultarSonda();
  controlesDistancia.configurarModoOperacion('exploracion');
  tituloEscena.textContent = 'Sistema Solar';
  const observedEl = document.querySelector('#observed-body');
  if (observedEl) observedEl.textContent = 'Observando · Vista General';
  etiquetaModoVista.textContent = nuevoModo === 'experimental' ? 'LABORATORIO DE MISIONES' : 'EXPLORADOR ESPACIAL / VISTA GENERAL';
  hud.actualizarSeleccionSonda(false);

  if (modoPrevio === 'historico') {
    simulador.vistaGeneral();
  }
  actualizarPanel(fecha2026);
}

// 17.1: al terminar la reproducción de una misión del laboratorio, la escena vuelve a la fecha de exploración.
// En el modo histórico no se toca: ese modo aplica su propio instante al activarse.
function restaurarEscenaTrasMisionLaboratorio() {
  if (modoOperacion === 'historico' || !datosAstronomicos) return;
  ++consultaActual;
  const fecha = controlesTemporales.obtenerFecha() || '2026-10-10';
  const jdFecha = gregorianLabelToJulianMidnight(fecha);
  instanteCientificoActivo = { jdTdb: jdFecha, labelTdb: `${fecha} · 00:00 TDB` };
  const estados = obtenerEstados(datosAstronomicos, fecha);
  simulador.actualizarPosiciones(estados, { reencuadrarVista: false });
  actualizarLunasExploracion(jdFecha);
  estadosActuales = estados;
  fechaEscena.textContent = `${fecha} · 00:00 TDB`;
  estadoDatos.textContent = `NASA/JPL Horizons · muestra diaria ${fecha} (TDB)`;
  actualizarPanel(fecha);
  controlesDistancia.actualizar();
}

// Efemérides interplanetarias (2026–2046, centros de los ocho planetas) para la reproducción en la escena principal.
let promesaEfemeridesInterplanetarias = null;
function cargarEfemeridesInterplanetarias() {
  if (!promesaEfemeridesInterplanetarias) {
    const base = import.meta.env.BASE_URL;
    const leer = async archivo => {
      const respuesta = await fetch(`${base}${archivo}`);
      if (!respuesta.ok) throw Error(`${archivo}: HTTP ${respuesta.status}`);
      return respuesta.json();
    };
    promesaEfemeridesInterplanetarias = leer('data/interplanetary-ephemerides-catalog-v1.json')
      .then(catalog => createInterplanetaryEphemeris({ catalog, loadJson: leer }));
    promesaEfemeridesInterplanetarias.catch(() => { promesaEfemeridesInterplanetarias = null; });
  }
  return promesaEfemeridesInterplanetarias;
}

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
  if (!datosAstronomicos || modoOperacion === 'historico' || vistaMisionLaboratorio?.isControlling()) return;
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
  controlesDistancia.actualizar();
  if (proveedorCientifico) {
    queryVisualStates(proveedorCientifico, jdFecha)
      .then(({ states, status }) => {
        if (solicitud !== consultaActual || modoOperacion === 'historico' || vistaMisionLaboratorio?.isControlling()) return;
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

// 25: lanzamiento 3D en su propio módulo (carga diferida): acercamiento a la Tierra en la escena principal, fundido a la escena de
// Cabo Cañaveral y, al terminar, vuelta al Sistema Solar en el instante del lanzamiento.
let lanzamiento3D = null;
let lanzamientoEnCurso = false;
let misionLanzamiento = null;
let solicitudLanzamiento = 0;

function cerrarLanzamiento3D() {
  solicitudLanzamiento += 1;
  lanzamiento3D?.destruir();
  lanzamiento3D = null;
  lanzamientoEnCurso = false;
  overlayLanzamiento?.establecerCargando(null);
  overlayLanzamiento?.mostrar(false);
  simulador.terminarAproximacionTierra();
}

function alCompletarLanzamiento({ misionId }) {
  cerrarLanzamiento3D();
  if (!motorHistorico) return;
  const launchJd = HISTORICAL_MISSIONS_CATALOG[misionId].launchJdTdb;
  motorHistorico.setTimeJdTdb(launchJd);
  motorHistorico.setVisibilityMode(misionId);
  actualizarDockMision(misionId);
  aplicarInstanteHistorico(launchJd, {
    accionPosteriorEscena: () => simulador.encuadrarSalidaTierra1977(misionId)
  }).catch(console.error);
}

async function iniciarLanzamientoHistorico(misionId = VOYAGER_2_ID) {
  if (modoOperacion !== 'historico' || lanzamientoEnCurso) return;
  lanzamientoEnCurso = true;
  misionLanzamiento = misionId;
  const solicitud = ++solicitudLanzamiento;
  // 27: la preparación (acercamiento, texturas, compilación) no cuenta para la resolución dinámica.
  let finPreparacion = () => {};
  suspenderAdaptacion(new Promise(resolve => { finPreparacion = resolve; }));
  detenerBucleHistorico();
  recorridoGuiado?.mostrar(false);
  overlayLanzamiento?.mostrar(true, metadatosLanzamiento(misionId));
  overlayLanzamiento?.establecerCargando('Acercándose a la Tierra…');
  const fovInicial = simulador.obtenerFovCamara();
  try {
    const [modulo] = await Promise.all([
      import('./launch/VoyagerLaunchDirector.js'),
      simulador.aproximarATierraParaLanzamiento({ duracionS: 3.2, subsolar: puntoSubsolar(instanteUtcMs(LANZAMIENTOS_VOYAGER[misionId], -24)), sitio: LC41 })
    ]);
    if (solicitud !== solicitudLanzamiento) return;
    overlayLanzamiento?.establecerCargando('Preparando Cabo Cañaveral, 1977…');
    lanzamiento3D = modulo.crearLanzamientoVoyager3D({
      contenedor: document.querySelector('.scene-panel'),
      misionId,
      calidad: getQualityState().profile,
      detalle: getQualityState('lanzamiento').detalle, // 27: lo que aprendió el lanzamiento anterior (o el perfil del equipo)
      escritorio: equipoEscritorio(),
      baseUrl: import.meta.env.BASE_URL,
      fovInicial,
      reducirMovimiento: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
      alCambiar: estado => overlayLanzamiento?.actualizar(estado),
      alTerminar: datos => alCompletarLanzamiento(datos)
    });
    overlayLanzamiento?.configurarLinea(lanzamiento3D.linea.eventos, lanzamiento3D.linea.duracion);
    await lanzamiento3D.listo;
    if (solicitud !== solicitudLanzamiento) return;
    overlayLanzamiento?.establecerCargando(null);
    simulador.establecerRenderPausado(true);
  } catch (error) {
    console.error('No se pudo abrir el lanzamiento 3D:', error);
    if (solicitud === solicitudLanzamiento) cerrarLanzamiento3D();
  } finally {
    finPreparacion();
  }
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
    // 17.1: la única sonda de esta escena fuera del modo histórico es la de la misión del laboratorio en reproducción.
    hud.actualizarSeleccionSonda(activa, vistaMisionLaboratorio?.getState().probeName ?? 'Sonda');
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
      const previo = createHistoricalComparatorSession({
        engineState: obtenerEstadoMotorHistoricoPlano(),
        snapshot: ultimoSnapshotHistorico,
        querySnapshot: jdTdb => pipelineHistorico.queryVisualHistoricalSnapshot(jdTdb)
      });
      previo.camara = simulador.obtenerEstadoCamaraHistorica();
      previo.evento = eventoSeleccionadoHistorico;
      estadoPrevioComparador = previo;
      if (previo.snapshotPromise) {
        // El salto de evento puede actualizar el motor antes de terminar su consulta.
        // Nunca guardar como estado restaurable un snapshot de otra fecha.
        previo.snapshotPromise.then(snapshot => {
            if (estadoPrevioComparador === previo && comparadorAbierto) {
              controlesHistoricos.actualizarFechaRecorridoComparador(snapshot.timeLabels.labelUtc);
              document.querySelector('#hist-clock-utc').textContent = snapshot.timeLabels.labelUtc;
              document.querySelector('#hist-clock-tdb').textContent = `${snapshot.timeLabels.shortLabelTdb} · Recorrido en pausa`;
            }
          }).catch(error => console.error('No se pudo sincronizar el recorrido', error));
      }
    }
    comparadorAbierto = true;
    comparadorUsaContextoActual = usarFovContexto;
    detenerBucleHistorico();
    ++consultaHistToken;
    const token = ++consultaComparadorToken;
    if (estadoPrevioComparador.snapshot) {
      controlesHistoricos.actualizarFechaRecorridoComparador(estadoPrevioComparador.snapshot.timeLabels.labelUtc);
    }
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
  alCambiarFovComparador: (photo, { usarFovContexto = false, zoomVisual = false }) => {
    comparadorUsaContextoActual = usarFovContexto;
    if (!photo || !snapshotComparador) return;
    simulador.activarRecreacionFotografica(photo, { usarFovContexto });
    // Magnificación óptica de visualización, separada del campo ISS documentado.
    // Mantiene observador, fecha y objetivo; sólo estrecha el viewport vertical.
    if (zoomVisual) simulador.establecerFovPrimeraPersona(0.35, { visualZoom: true });
    controlesHistoricos.actualizarTelemetriaComparador(snapshotComparador);
  },
  alCambiarInspeccionVisualIo: activa => simulador.establecerInspeccionVisualIo(activa),
  alCerrarComparadorFoto: async ({ reanudar = true } = {}) => {
    simulador.establecerInspeccionVisualIo(false);
    comparadorAbierto = false;
    const token = ++consultaComparadorToken;
    const previo = estadoPrevioComparador;
    estadoPrevioComparador = null;
    snapshotComparador = null;
    if (!previo || !motorHistorico || modoOperacion !== 'historico') return;
    let snapshotRecorrido = previo.snapshot;
    if (!snapshotRecorrido) {
      try { snapshotRecorrido = await previo.snapshotPromise; }
      catch (error) {
        console.error('No se pudo recuperar la fecha del recorrido', error);
        return;
      }
    }
    if (token !== consultaComparadorToken || comparadorAbierto
      || modoOperacion !== 'historico' || motorHistorico.getJdTdb() !== previo.motor.jdTdb) return;
    motorHistorico.setTimeJdTdb(previo.motor.jdTdb);
    motorHistorico.setVisibilityMode(previo.motor.visibilityMode);
    motorHistorico.setSelectedProbeId(previo.motor.selectedProbeId);
    motorHistorico.setDirection(previo.motor.direction);
    ultimoSnapshotHistorico = snapshotRecorrido;
    eventoSeleccionadoHistorico = previo.evento;
    simulador.actualizarPosiciones(snapshotRecorrido.planets, { reencuadrarVista: false });
    simulador.actualizarEscenaHistorica({
      probesVisual: snapshotRecorrido.probes,
      moonsVisual: snapshotRecorrido.moons,
      localFrames: snapshotRecorrido.localFrames,
      jdTdb: snapshotRecorrido.jdTdb,
      visibilityMode: previo.motor.visibilityMode
    });
    simulador.restaurarEstadoCamaraHistorica(
      previo.camara,
      previo.camara.fotoRecreacionId ? getVoyagerPhotoById(previo.camara.fotoRecreacionId) : null
    );
    controlesHistoricos.actualizarDesdeMotor({
      snapshot: snapshotRecorrido,
      engineState: obtenerEstadoMotorHistoricoPlano()
    });
    actualizarEncabezadoHistorico(snapshotRecorrido);
    actualizarOrientacionHistorica();
    if (reanudar && previo.motor.playing) iniciarReproduccionHistorica();
  }
});

overlayLanzamiento = crearSuperficieLanzamientoCinematografico({
  alPausar: () => lanzamiento3D?.alternarPausa(),
  alSiguiente: () => lanzamiento3D?.siguienteEvento(),
  alAnterior: () => lanzamiento3D?.eventoAnterior(),
  alVelocidad: k => lanzamiento3D?.establecerVelocidad(k),
  alReiniciar: () => lanzamiento3D?.reiniciar(),
  alIrAEvento: id => lanzamiento3D?.irAEvento(id),
  // Durante el acercamiento todavía no hay escena: se vuelve directamente al instante del lanzamiento.
  alSaltar: () => (lanzamiento3D ? lanzamiento3D.saltar() : lanzamientoEnCurso && alCompletarLanzamiento({ misionId: misionLanzamiento }))
});
document.addEventListener('keydown', ev => {
  if (!overlayLanzamiento?.esVisible() || ev.defaultPrevented) return;
  if (ev.key === 'Escape') { ev.preventDefault(); overlayLanzamiento.overlay.querySelector('#launch-skip-btn').click(); }
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
        : estadoCam.fovTipo === 'zoom_visual_vertical'
          ? `Zoom 3D ${estadoCam.fovGrados.toFixed(3).replace('.', ',')}° vertical · no ISS`
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

// 17.1: «3 · Reproducir» del laboratorio dibuja las misiones heliocéntricas en esta escena (misma conversión de ejes y escala).
vistaMisionLaboratorio = createSolarSystemMissionView({
  scene: simulador,
  loadEphemeris: cargarEfemeridesInterplanetarias,
  createModel: createMissionProbeSceneModel,
  onRelease: restaurarEscenaTrasMisionLaboratorio
});
simulador.alCambiarModoEscala(() => {
  controlesDistancia.actualizar();
});

crearControlesVisualizacion(simulador);
bindQualityControls(document.querySelector('#quality-controls')); // 15: perfiles de calidad gráfica (solo presentación)
crearMedidorFps({ casilla: document.querySelector('#show-fps'), calidad: () => getQualityState() }); // 26: contador de FPS opcional (también ?fps=1); 27: con la resolución
botonReintentar.addEventListener('click', iniciar);

async function iniciar() {
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
    let errorCientifico = null;

    // 17.1: el proveedor científico solo se carga para el flujo opcional ?ephemeris=scientific; ya no hay una sonda
    // demostrativa que propagar al arrancar.
    if (modoCientifico) {
      try {
        proveedorCientifico = await loadScientificPipeline({ baseUrl: import.meta.env.BASE_URL });
      } catch (error) {
        errorCientifico = error;
      }
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
    instanteCientificoActivo = null;
    controlesDistancia.actualizar();
    console.error(error);
    estadoDatos.textContent = `No se pudieron cargar las efemérides: ${error.message}`;
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
  obtenerEstadoModeloSondaMision: () => simulador.obtenerEstadoModeloSonda(),
  // 17.1: estado de la reproducción de la misión del laboratorio en el Sistema Solar principal y lo que dibuja la escena.
  obtenerEstadoMisionEscenaPrincipal: () => vistaMisionLaboratorio?.getState() ?? null,
  obtenerDiagnosticoEscena: () => simulador.obtenerDiagnosticoEscena(),
  obtenerEstadoLanzamiento: () => ({ activo: lanzamientoEnCurso, cargado: Boolean(lanzamiento3D), ...(lanzamiento3D?.estado() ?? {}) }),
  // 25: saltar a un instante de misión (s desde la ignición de los motores sólidos) y pausar, para revisiones y capturas.
  irALanzamiento: t => lanzamiento3D?.irAMision(t),
  interiorLanzamiento: () => lanzamiento3D?.interno ?? null,
  pausarLanzamiento: () => lanzamiento3D?.pausar(),
  reanudarLanzamiento: () => lanzamiento3D?.reanudar(),
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
// 14: mapa de áreas en la cabecera (solo navegación).
const navegadorAreas = createAppNavigator();
// 14.1: búsqueda global, portada de misiones destacadas y presentación de formularios del laboratorio (solo interfaz).
const paletaBusqueda = createCommandPalette({ navigator: navegadorAreas });
const misionesDestacadas = createFeaturedMissions({ navigator: navegadorAreas });
// 18: el laboratorio (≈ 1 MB de código, su CSS y un segundo contexto WebGL) se carga la primera vez que se entra en él.
// Mientras llega, la última petición de navegación («lab:navigate») se retiene y se repite al crearlo.
let laboratorioExperimental = null, mejorasLaboratorio = null, promesaLaboratorio = null, navegacionLaboratorioPendiente = null;
const retenerNavegacionLaboratorio = event => { if (!laboratorioExperimental) { navegacionLaboratorioPendiente = event.detail; event.stopImmediatePropagation(); } };
document.addEventListener('lab:navigate', retenerNavegacionLaboratorio, true);
function cargarLaboratorio() {
  promesaLaboratorio ??= import('./ui/ExperimentalLaboratory.js').then(({ createExperimentalLaboratory }) => {
    laboratorioExperimental = createExperimentalLaboratory({ missionScene: vistaMisionLaboratorio });
    mejorasLaboratorio = createLabFormEnhancer();
    navegadorAreas.attachLab();
    document.removeEventListener('lab:navigate', retenerNavegacionLaboratorio, true);
    const pendiente = navegacionLaboratorioPendiente; navegacionLaboratorioPendiente = null;
    if (pendiente) document.dispatchEvent(new CustomEvent('lab:navigate', { detail: pendiente }));
    return laboratorioExperimental;
  }).catch(error => {
    promesaLaboratorio = null;
    console.error('No se pudo cargar el laboratorio:', error);
    estadoDatos.textContent = `No se pudo cargar el laboratorio (${error.message}). Comprueba la conexión y vuelve a entrar.`;
  });
  return promesaLaboratorio;
}
const observadorModoLaboratorio = new MutationObserver(() => { if (document.querySelector('#app')?.dataset.appMode === 'experimental') cargarLaboratorio(); });
observadorModoLaboratorio.observe(document.querySelector('#app'), { attributes: true, attributeFilter: ['data-app-mode'] });
if (document.querySelector('#app')?.dataset.appMode === 'experimental') cargarLaboratorio();
if (import.meta.hot) import.meta.hot.dispose(() => { observadorModoLaboratorio.disconnect(); mejorasLaboratorio?.dispose(); misionesDestacadas.dispose(); paletaBusqueda.dispose(); navegadorAreas.dispose(); laboratorioExperimental?.dispose(); });
actualizarOrientacionHistorica();
iniciar();
// 18: las texturas se piden al verse cada cuerpo; la Tierra (destino habitual y escenario del lanzamiento) se adelanta cuando el
// navegador queda libre, salvo con «ahorro de datos» o conexión lenta.
if (!conexionLimitada()) precargarEnReposo([claveTexturaPlaneta('Tierra')]);
