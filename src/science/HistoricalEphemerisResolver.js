/**
 * En este módulo resuelvo efemérides históricas verificadas de NASA/JPL Horizons
 * para los ocho planetas, Voyager 1 (`-31`), Voyager 2 (`-32`) y los satélites de
 * encuentro, además de calcular su telemetría científica y la polilínea multianual.
 *
 * - Unidades: posiciones y distancias en km (y equivalentes en AU), velocidades en
 *   km/s, tiempos de luz y tiempos de misión en segundos (s), cadencias en segundos
 *   y épocas en JD TDB.
 * - Marco de referencia: exijo `SUN_CENTER` / `ICRF_ECLIPTIC_J2000` con vectores
 *   geométricos (`VEC_CORR=NONE`).
 * - Límites y políticas: priorizo siempre el conjunto de mayor resolución temporal
 *   (ventanas densas de sobrevuelo sobre crucero), nunca extrapolo ni interpolo a
 *   través de una unión documentada de segmentos SPK (`spkSegmentSplice`), y cacheo
 *   en memoria tanto el proveedor LRU como las polilíneas históricas construidas.
 */
import { createEphemerisProvider } from './EphemerisProvider.js';
import { HORIZONS_FRAME } from './Frames.js';
import { HORIZONS_PLANETS } from './HorizonsEphemerides.js';
import { requireJdTdb } from './Time.js';
import { kmToAu, SECONDS_PER_DAY } from './Units.js';
import { jdTdbToHistoricalLabels } from './HistoricalTime.js';
import {
  HISTORICAL_MISSIONS_CATALOG,
  VOYAGER_1_ID,
  VOYAGER_2_ID,
  VOYAGER_1_NAIF_ID,
  VOYAGER_2_NAIF_ID,
  getHistoricalMissionById,
  resolveMissionPhase
} from './VoyagerHistoricalMissions.js';
import { findPreviousAndNextEvents } from './VoyagerHistoricalEvents.js';
import { MOON_CATALOG as MOONS } from './MoonCatalog.js';

// Adopto la velocidad exacta de la luz en el vacío según el SI / IAU (km/s).
export const SPEED_OF_LIGHT_KM_S = 299792.458;
export const HISTORICAL_CATALOG_PATH = 'data/historical-ephemerides-catalog-v1.json';
const COVERAGE_TOLERANCE_DAYS = 1e-8;

export const HISTORICAL_ENCOUNTER_MOONS = Object.freeze(Object.fromEntries(
  Object.entries(MOONS).map(([key, moon]) => [key, Object.freeze({
    id: moon.id, key, name: moon.name, parentPlanet: moon.parent, radiusKm: moon.radiusKm
  })])
));

/** Formateo un tiempo de viaje de la luz en segundos como `h min s` o segundos decimales. */
export function formatLightTimeHms(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const totalSec = Math.round(seconds);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hours > 0) {
    return `${hours} h ${String(minutes).padStart(2, '0')} min ${String(secs).padStart(2, '0')} s`;
  }
  if (minutes > 0) {
    return `${minutes} min ${String(secs).padStart(2, '0')} s`;
  }
  return `${seconds.toFixed(1)} s`;
}

/** Formateo el tiempo transcurrido desde el lanzamiento en años, días, horas y minutos. */
export function formatMissionElapsed(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return 'Pre-lanzamiento';
  const totalSec = Math.floor(seconds);
  const years = Math.floor(totalSec / (365.25 * SECONDS_PER_DAY));
  const remAfterYears = totalSec - Math.floor(years * 365.25 * SECONDS_PER_DAY);
  const days = Math.floor(remAfterYears / SECONDS_PER_DAY);
  const remDay = remAfterYears % SECONDS_PER_DAY;
  const hours = Math.floor(remDay / 3600);
  const minutes = Math.floor((remDay % 3600) / 60);
  if (years > 0) {
    return `${years} a ${days} d ${String(hours).padStart(2, '0')} h`;
  }
  return `${days} d ${String(hours).padStart(2, '0')} h ${String(minutes).padStart(2, '0')} min`;
}

/**
 * Aquí selecciono el conjunto histórico que cubre `(bodyId, jdTdb)` con mayor
 * resolución temporal (menor `cadenceSeconds`), priorizando ventanas de sobrevuelo
 * frente a archivos multianuales de crucero.
 */
export function selectBestHistoricalDataset(datasets, bodyId, jdTdb) {
  const targetId = String(bodyId);
  const candidates = [];
  for (const entry of datasets) {
    if (!entry.bodyIds.includes(targetId)) continue;
    const cov = entry.bodyCoverage?.[targetId] ?? entry.coverage;
    if (jdTdb >= cov.startJdTdb - COVERAGE_TOLERANCE_DAYS
      && jdTdb <= cov.endJdTdb + COVERAGE_TOLERANCE_DAYS) {
      candidates.push({ entry, cov });
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    if (a.entry.cadenceSeconds !== b.entry.cadenceSeconds) {
      return a.entry.cadenceSeconds - b.entry.cadenceSeconds;
    }
    if ((a.entry.referencePriority ?? 0) !== (b.entry.referencePriority ?? 0)) {
      return (b.entry.referencePriority ?? 0) - (a.entry.referencePriority ?? 0);
    }
    const spanA = a.cov.endJdTdb - a.cov.startJdTdb;
    const spanB = b.cov.endJdTdb - b.cov.startJdTdb;
    return spanA - spanB;
  });
  return candidates[0].entry;
}

/** Extraigo un resumen inmutable de procedencia (dataset, archivo, cadencia, solución Horizons y nodos usados). */
function summarizeSampleProvenance(resolution) {
  if (!resolution?.state) return null;
  const state = resolution.state;
  const meta = state.provenance?.sourceMetadata ?? {};
  const samples = Array.isArray(resolution.samples) && resolution.samples.length > 0
    ? resolution.samples
    : [{ jdTdb: state.time.jdTdb, provenance: state.provenance }];
  const sampleJdTdbs = samples.map(s => s.jdTdb ?? s.time.jdTdb);
  const sampleLabels = sampleJdTdbs.map(jd => jdTdbToHistoricalLabels(jd).labelTdb);
  const firstSampleMeta = samples[0]?.provenance?.sourceMetadata ?? {};
  return Object.freeze({
    status: resolution.status,
    datasetId: resolution.datasetId ?? meta.ephemerisDatasetId ?? null,
    file: resolution.file ?? meta.ephemerisFile ?? null,
    cadenceSeconds: resolution.cadenceSeconds ?? null,
    source: state.provenance?.source ?? 'NASA/JPL Horizons',
    apiVersion: state.provenance?.version ?? samples[0]?.provenance?.version ?? null,
    solutionId: meta.solutionId ?? firstSampleMeta.solutionId ?? null,
    responseSha256: meta.responseSha256 ?? firstSampleMeta.responseSha256 ?? null,
    sampleJdTdbs: Object.freeze(sampleJdTdbs),
    sampleLabelsTdb: Object.freeze(sampleLabels),
    spliceWarning: resolution.spliceWarning ?? null
  });
}

/**
 * Aquí calculo la telemetría científica completa de una sonda Voyager en `jdTdb`:
 * distancias al Sol, a la Tierra y a la sonda gemela (en km y AU), rapidez
 * heliocéntrica (km/s), tiempo de luz de ida, fase de misión y procedencia.
 */
export function computeProbeScientificTelemetry({
  missionId,
  probeResolution,
  earthState,
  otherProbeResolution = null,
  jdTdb
}) {
  const mission = getHistoricalMissionById(missionId);
  if (!mission) throw new RangeError(`Misión histórica desconocida: ${missionId}`);
  const timeLabels = jdTdbToHistoricalLabels(jdTdb);
  const events = findPreviousAndNextEvents(jdTdb, { missionFilter: missionId });
  const phase = resolveMissionPhase(missionId, jdTdb);

  if (!probeResolution?.state) {
    return Object.freeze({
      mission,
      status: probeResolution?.status ?? 'unavailable',
      isRealData: false,
      reason: probeResolution?.reason ?? 'Sin efemérides para la fecha solicitada.',
      ascentFraction: probeResolution?.ascentFraction ?? null,
      jdTdb,
      timeLabels,
      phase,
      events,
      elapsedSeconds: jdTdb >= mission.launchJdTdb ? (jdTdb - mission.launchJdTdb) * SECONDS_PER_DAY : null,
      elapsedDisplay: jdTdb >= mission.launchJdTdb
        ? formatMissionElapsed((jdTdb - mission.launchJdTdb) * SECONDS_PER_DAY)
        : 'Pre-lanzamiento',
      state: null,
      provenance: null
    });
  }

  const state = probeResolution.state;
  if (state.reference.id !== HORIZONS_FRAME.id || state.reference.origin !== HORIZONS_FRAME.origin) {
    throw new RangeError(`Referencia incompatible en ${mission.name}: ${state.reference.id}/${state.reference.origin}`);
  }

  const p = state.position;
  const v = state.velocity;
  const distanceSunKm = Math.hypot(p.x, p.y, p.z);
  const distanceSunAu = kmToAu(distanceSunKm);
  const heliocentricSpeedKmS = Math.hypot(v.x, v.y, v.z);
  const velocityDirection = heliocentricSpeedKmS > 0
    ? Object.freeze({
      x: v.x / heliocentricSpeedKmS,
      y: v.y / heliocentricSpeedKmS,
      z: v.z / heliocentricSpeedKmS
    })
    : Object.freeze({ x: 0, y: 0, z: 0 });

  let distanceEarthKm = null;
  let distanceEarthAu = null;
  let oneWayLightTimeSeconds = null;
  let oneWayLightTimeDisplay = '—';

  if (earthState && Math.abs(earthState.time.jdTdb - state.time.jdTdb) <= 1e-6) {
    const ep = earthState.position;
    distanceEarthKm = Math.hypot(p.x - ep.x, p.y - ep.y, p.z - ep.z);
    distanceEarthAu = kmToAu(distanceEarthKm);
    oneWayLightTimeSeconds = distanceEarthKm / SPEED_OF_LIGHT_KM_S;
    oneWayLightTimeDisplay = formatLightTimeHms(oneWayLightTimeSeconds);
  }

  let distanceBetweenVoyagersKm = null;
  let distanceBetweenVoyagersAu = null;
  if (otherProbeResolution?.state
    && Math.abs(otherProbeResolution.state.time.jdTdb - state.time.jdTdb) <= 1e-6) {
    const op = otherProbeResolution.state.position;
    distanceBetweenVoyagersKm = Math.hypot(p.x - op.x, p.y - op.y, p.z - op.z);
    distanceBetweenVoyagersAu = kmToAu(distanceBetweenVoyagersKm);
  }

  const elapsedSeconds = Math.max(0, (jdTdb - mission.launchJdTdb) * SECONDS_PER_DAY);

  return Object.freeze({
    mission,
    status: probeResolution.status,
    isRealData: true,
    jdTdb,
    timeLabels,
    phase,
    events,
    elapsedSeconds,
    elapsedDisplay: formatMissionElapsed(elapsedSeconds),
    distanceSunKm,
    distanceSunAu,
    distanceEarthKm,
    distanceEarthAu,
    distanceBetweenVoyagersKm,
    distanceBetweenVoyagersAu,
    heliocentricSpeedKmS,
    positionKm: Object.freeze({ x: p.x, y: p.y, z: p.z }),
    positionAu: Object.freeze({ x: kmToAu(p.x), y: kmToAu(p.y), z: kmToAu(p.z) }),
    velocityKmS: Object.freeze({ x: v.x, y: v.y, z: v.z }),
    velocityDirection,
    oneWayLightTimeSeconds,
    oneWayLightTimeDisplay,
    cameraOperational: jdTdb <= mission.cameraShutdownJdTdb,
    state,
    provenance: summarizeSampleProvenance(probeResolution)
  });
}

/**
 * Aquí creo el resolvedor histórico con inicialización perezosa del catálogo,
 * caché LRU de conjuntos de efemérides y caché de polilíneas de trayectoria.
 */
export function createHistoricalEphemerisResolver({
  loadJson,
  catalog = null,
  catalogPath = HISTORICAL_CATALOG_PATH,
  maxCachedDatasets = 22
}) {
  if (typeof loadJson !== 'function') {
    throw new TypeError('createHistoricalEphemerisResolver requiere una función loadJson(path).');
  }

  let initPromise = null;
  let provider = null;
  let datasets = null;
  let timelineBounds = null;
  const backboneCache = new Map();

  /** Inicializo una única vez el proveedor y determino las cotas temporales comunes verificadas. */
  async function ensureInitialized() {
    if (provider) return;
    if (!initPromise) {
      initPromise = (async () => {
        const rawCatalog = catalog ?? await loadJson(catalogPath);
        const createdProvider = createEphemerisProvider({
          catalog: rawCatalog,
          loadJson,
          maxCachedDatasets,
          maxStatesPerDataset: 100000
        });
        const allDatasets = createdProvider.listDatasets();

        // Calculo el límite superior común verificado entre los 8 planetas y ambas Voyager.
        const requiredEndIds = [...Object.values(HORIZONS_PLANETS), VOYAGER_1_NAIF_ID, VOYAGER_2_NAIF_ID];
        let commonMaxJdTdb = Infinity;
        for (const bodyId of requiredEndIds) {
          let maxForBody = -Infinity;
          for (const d of allDatasets) {
            if (!d.bodyIds.includes(bodyId)) continue;
            const cov = d.bodyCoverage?.[bodyId] ?? d.coverage;
            if (cov.endJdTdb > maxForBody) maxForBody = cov.endJdTdb;
          }
          if (maxForBody < commonMaxJdTdb) commonMaxJdTdb = maxForBody;
        }

        const minJdTdb = HISTORICAL_MISSIONS_CATALOG[VOYAGER_2_ID].launchJdTdb;
        timelineBounds = Object.freeze({
          minJdTdb,
          maxJdTdb: commonMaxJdTdb
        });
        datasets = allDatasets;
        provider = createdProvider;
      })();
    }
    await initPromise;
  }

  async function getTimelineBounds() {
    await ensureInitialized();
    return timelineBounds;
  }

  /** Resuelvo un planeta, luna o cuerpo estándar seleccionando el dataset más fino e interpolando con Hermite cúbica. */
  async function resolveStandardBody(bodyId, jdTdb) {
    await ensureInitialized();
    requireJdTdb(jdTdb);
    const best = selectBestHistoricalDataset(datasets, bodyId, jdTdb);
    if (!best) {
      return Object.freeze({
        status: 'out_of_coverage',
        bodyId: String(bodyId),
        state: null,
        isRealData: false,
        reason: `El cuerpo ${bodyId} no dispone de efemérides históricas para JD ${jdTdb}.`
      });
    }
    const maxIntervalSeconds = Math.max(best.cadenceSeconds * 1.005, best.cadenceSeconds + 2);
    const result = await provider.getInterpolated(String(bodyId), jdTdb, {
      datasetId: best.id,
      maxIntervalSeconds
    });
    if (result.status !== 'exact' && result.status !== 'interpolated') {
      return Object.freeze({
        status: result.status,
        bodyId: String(bodyId),
        state: null,
        isRealData: false,
        datasetId: best.id,
        reason: result.reason ?? `No fue posible resolver ${bodyId} en ${best.id}.`
      });
    }
    return Object.freeze({
      status: result.status,
      bodyId: String(bodyId),
      state: result.state,
      samples: result.samples ?? Object.freeze([result.state]),
      datasetId: best.id,
      file: best.file,
      cadenceSeconds: best.cadenceSeconds,
      isRealData: true
    });
  }

  /**
   * Aquí resuelvo el estado histórico de Voyager 1 o Voyager 2 distinguiendo
   * pre-lanzamiento, fase visual de ascenso antes de la primera muestra Horizons,
   * transiciones entre segmentos SPK y cobertura real certificada.
   */
  async function resolveProbeState(missionId, jdTdb) {
    await ensureInitialized();
    requireJdTdb(jdTdb);
    const mission = getHistoricalMissionById(missionId);
    if (!mission) throw new RangeError(`Misión histórica desconocida: ${missionId}`);

    if (jdTdb < mission.launchJdTdb - COVERAGE_TOLERANCE_DAYS) {
      return Object.freeze({
        status: 'pre_launch',
        missionId,
        naifId: mission.naifId,
        state: null,
        isRealData: false,
        reason: `${mission.name} aún no había sido lanzada (lanzamiento oficial: ${mission.launchDateDisplayUtc}).`
      });
    }

    if (jdTdb < mission.firstValidJdTdb - COVERAGE_TOLERANCE_DAYS) {
      const span = Math.max(1e-9, mission.firstValidJdTdb - mission.launchJdTdb);
      const ascentFraction = Math.min(1, Math.max(0, (jdTdb - mission.launchJdTdb) / span));
      return Object.freeze({
        status: 'launch_ascent_visual',
        missionId,
        naifId: mission.naifId,
        state: null,
        isRealData: false,
        ascentFraction,
        reason: `Fase de ascenso e inyección Titan IIIE-Centaur (${mission.launchDateDisplayUtc} → ${mission.firstSampleTdbLabel}). Presentación visual previa al primer vector heliocéntrico de Horizons.`
      });
    }

    // Evito explícitamente interpolar a través de una unión documentada de segmentos SPK.
    const splice = mission.spkSegmentSplice;
    if (splice
      && jdTdb > splice.beforeJdTdb + COVERAGE_TOLERANCE_DAYS
      && jdTdb < splice.afterJdTdb - COVERAGE_TOLERANCE_DAYS) {
      // Rechazo devolver un extremo de otra época o interpolar soluciones orbitales distintas en la junta.
      return Object.freeze({
        status: 'spk_segment_transition',
        missionId,
        naifId: mission.naifId,
        state: null,
        samples: Object.freeze([]),
        isRealData: false,
        reason: splice.note,
        spliceWarning: splice.note
      });
    }

    const bodyRes = await resolveStandardBody(mission.naifId, jdTdb);
    return Object.freeze({
      ...bodyRes,
      missionId,
      naifId: mission.naifId
    });
  }

  /** Enruto la consulta de un cuerpo NAIF hacia `resolveProbeState` si es Voyager o hacia `resolveStandardBody`. */
  async function resolveBodyState(bodyId, jdTdb) {
    const id = String(bodyId);
    if (id === VOYAGER_1_NAIF_ID) return resolveProbeState(VOYAGER_1_ID, jdTdb);
    if (id === VOYAGER_2_NAIF_ID) return resolveProbeState(VOYAGER_2_ID, jdTdb);
    return resolveStandardBody(id, jdTdb);
  }

  /**
   * Aquí consulto de forma atómica todos los cuerpos del Modo Histórico en `jdTdb`:
   * - Los 8 planetas del Sistema Solar (exijo que todos tengan estado válido).
   * - Voyager 1 (`-31`) y Voyager 2 (`-32`) con su telemetría científica completa.
   * - Los satélites de encuentro cuando el instante cae dentro de su ventana densa.
   */
  async function queryHistoricalSnapshot(jdTdb) {
    await ensureInitialized();
    requireJdTdb(jdTdb);

    const planetEntries = Object.entries(HORIZONS_PLANETS);
    const moonEntries = Object.values(HISTORICAL_ENCOUNTER_MOONS);

    const [planetResList, v1Res, v2Res, moonResList] = await Promise.all([
      Promise.all(planetEntries.map(([, id]) => resolveStandardBody(id, jdTdb))),
      resolveProbeState(VOYAGER_1_ID, jdTdb),
      resolveProbeState(VOYAGER_2_ID, jdTdb),
      Promise.all(moonEntries.map(m => resolveStandardBody(m.id, jdTdb)))
    ]);

    const planets = {};
    for (let i = 0; i < planetEntries.length; i++) {
      const [planetName] = planetEntries[i];
      const res = planetResList[i];
      if (!res.state) {
        throw new Error(`Falta estado histórico para ${planetName} en JD ${jdTdb}: ${res.status} (${res.reason ?? ''})`);
      }
      planets[planetName] = res;
    }

    const moons = {};
    for (let i = 0; i < moonEntries.length; i++) {
      const moonMeta = moonEntries[i];
      const res = moonResList[i];
      if (res.state) {
        moons[moonMeta.key] = Object.freeze({ ...res, meta: moonMeta });
      }
    }

    const earthState = planets.Tierra.state;
    const voyager1 = computeProbeScientificTelemetry({
      missionId: VOYAGER_1_ID,
      probeResolution: v1Res,
      earthState,
      otherProbeResolution: v2Res,
      jdTdb
    });
    const voyager2 = computeProbeScientificTelemetry({
      missionId: VOYAGER_2_ID,
      probeResolution: v2Res,
      earthState,
      otherProbeResolution: v1Res,
      jdTdb
    });

    return Object.freeze({
      jdTdb,
      timeLabels: jdTdbToHistoricalLabels(jdTdb),
      planets: Object.freeze(planets),
      moons: Object.freeze(moons),
      probes: Object.freeze({
        [VOYAGER_1_ID]: voyager1,
        [VOYAGER_2_ID]: voyager2
      })
    });
  }

  /**
   * Aquí construyo y cacheo la polilínea histórica multianual verificada de una
   * sonda combinando muestras de crucero con muestras densas de sobrevuelos
   * planetarios para conservar la curvatura real de las asistencias gravitacionales.
   */
  async function loadMissionTrajectoryBackbone(missionId) {
    await ensureInitialized();
    const mission = getHistoricalMissionById(missionId);
    if (!mission) throw new RangeError(`Misión desconocida: ${missionId}`);
    if (backboneCache.has(missionId)) return backboneCache.get(missionId);

    const promise = (async () => {
      const probeEntries = datasets
        .filter(d => d.bodyIds.includes(mission.naifId))
        .sort((a, b) => a.cadenceSeconds - b.cadenceSeconds);

      const rawDataList = await Promise.all(probeEntries.map(entry => loadJson(entry.file)));

      // Recorro los conjuntos del más fino al más grueso: descarto nodos gruesos dentro de ventanas ya cubiertas por un conjunto más denso.
      const fineWindows = [];
      const collectedKnots = [];

      for (let i = 0; i < probeEntries.length; i++) {
        const entry = probeEntries[i];
        const raw = rawDataList[i];
        const cov = entry.bodyCoverage?.[mission.naifId] ?? entry.coverage;
        const series = raw?.series?.[mission.naifId] ?? [];

        // En ventanas muy densas (<= 1800 s) aplico un paso de submuestreo para mantener ~3500–5500 vértices fluidos en GPU.
        const stride = entry.cadenceSeconds <= 900 ? 3 : (entry.cadenceSeconds <= 1800 ? 2 : 1);

        for (let s = 0; s < series.length; s++) {
          const isBoundary = s === 0 || s === series.length - 1;
          if (!isBoundary && stride > 1 && (s % stride !== 0)) continue;
          const tuple = series[s];
          const jd = tuple[0];
          const coveredByFiner = fineWindows.some(w =>
            jd > w.startJdTdb + COVERAGE_TOLERANCE_DAYS && jd < w.endJdTdb - COVERAGE_TOLERANCE_DAYS
          );
          if (coveredByFiner) continue;
          collectedKnots.push(Object.freeze({
            jdTdb: jd,
            xKm: tuple[2],
            yKm: tuple[3],
            zKm: tuple[4],
            datasetId: entry.id,
            cadenceSeconds: entry.cadenceSeconds
          }));
        }

        fineWindows.push({ startJdTdb: cov.startJdTdb, endJdTdb: cov.endJdTdb });
      }

      collectedKnots.sort((a, b) => a.jdTdb - b.jdTdb);

      // Elimino instantes duplicados en las fronteras entre conjuntos contiguos.
      const uniqueKnots = [];
      for (const knot of collectedKnots) {
        if (uniqueKnots.length > 0 && Math.abs(knot.jdTdb - uniqueKnots[uniqueKnots.length - 1].jdTdb) <= 1e-7) {
          continue;
        }
        uniqueKnots.push(knot);
      }

      // En una frontera de reajuste SPK existen dos extremos válidos pero no una trayectoria certificada entre ellos;
      // conservo ambos nodos y marco `breakBefore` para no trazar un segmento ficticio sobre la junta.
      const splice = mission.spkSegmentSplice;
      const certifiedKnots = uniqueKnots.map((knot, index) => Object.freeze({
        ...knot,
        breakBefore: Boolean(splice && index > 0
          && uniqueKnots[index - 1].jdTdb <= splice.beforeJdTdb + COVERAGE_TOLERANCE_DAYS
          && knot.jdTdb >= splice.afterJdTdb - COVERAGE_TOLERANCE_DAYS)
      }));

      return Object.freeze({
        missionId,
        naifId: mission.naifId,
        knots: Object.freeze(certifiedKnots)
      });
    })();

    backboneCache.set(missionId, promise);
    return promise;
  }

  return Object.freeze({
    ensureInitialized,
    getTimelineBounds,
    getProvider: async () => {
      await ensureInitialized();
      return provider;
    },
    listDatasets: async (filter) => {
      await ensureInitialized();
      return provider.listDatasets(filter);
    },
    resolveProbeState,
    resolveBodyState,
    queryHistoricalSnapshot,
    loadMissionTrajectoryBackbone
  });
}
