/**
 * En este módulo implemento el motor de reproducción temporal del Modo Histórico
 * de las misiones Voyager 1 y Voyager 2.
 *
 * - Unidades: instantes y cotas en JD TDB, pasos de reloj y ventanas de
 *   desaceleración en segundos (s) y velocidades de reproducción en segundos
 *   TDB por segundo real (`tdbSecondsPerRealSecond`).
 * - Marco de referencia: este módulo gestiona únicamente el estado temporal y
 *   de eventos (es independiente de coordenadas espaciales; las efemérides
 *   consultadas después operan en `SUN_CENTER` / `ICRF_ECLIPTIC_J2000`).
 * - Límites: confino siempre el reloj dentro de `[minJdTdb, maxJdTdb]` mediante
 *   representación dividida (`createSplitHistoricalTime`), freno automáticamente
 *   al aproximarme a hitos históricos y detengo el reloj exactamente sobre cada
 *   evento sin sobrepasarlo cuando la autopausa está activa.
 */
import { SECONDS_PER_DAY } from './Units.js';
import {
  HISTORICAL_PLAYBACK_SPEEDS,
  createSplitHistoricalTime,
  utcTimestampToJdTdb
} from './HistoricalTime.js';
import {
  HISTORICAL_MISSIONS_CATALOG,
  VOYAGER_1_ID,
  VOYAGER_2_ID
} from './VoyagerHistoricalMissions.js';
import {
  EVENT_KINDS,
  findPreviousAndNextEvents,
  getHistoricalEventById,
  listHistoricalEvents
} from './VoyagerHistoricalEvents.js';

export const PROBE_VISIBILITY_MODES = Object.freeze({
  BOTH: 'both',
  VOYAGER_1: VOYAGER_1_ID,
  VOYAGER_2: VOYAGER_2_ID
});

/** Busco un perfil de velocidad por identificador y, si no existe, uso `1d_s` (1 día/s) como valor por defecto. */
function findSpeedById(speedId) {
  return HISTORICAL_PLAYBACK_SPEEDS.find(s => s.id === speedId) ?? HISTORICAL_PLAYBACK_SPEEDS[2];
}

/** Determino el radio de la ventana temporal (en s) dentro del cual reduzco velocidad al acercarme a un hito. */
function eventSlowdownWindowSeconds(event) {
  if (event.kind === EVENT_KINDS.RETROSPECTIVE_BOUNDARY_CROSSING) {
    return 20 * SECONDS_PER_DAY;
  }
  return 2.5 * SECONDS_PER_DAY;
}

/**
 * Aquí instancio el motor de estado de la línea temporal histórica de Voyager,
 * controlando reproducción, sentido, velocidad, visibilidad de sondas y saltos
 * entre eventos sin exceder los límites de cobertura.
 */
export function createHistoricalMissionEngine({
  minJdTdb,
  maxJdTdb,
  initialJdTdb = minJdTdb,
  initialSpeedId = '1d_s',
  initialVisibility = PROBE_VISIBILITY_MODES.BOTH,
  initialSelectedProbe = VOYAGER_2_ID
}) {
  const splitTime = createSplitHistoricalTime({
    minJdTdb,
    maxJdTdb,
    initialJdTdb
  });

  let playing = false;
  // Uso +1 para avance cronológico y -1 para retroceso.
  let direction = 1;
  let speed = findSpeedById(initialSpeedId);
  let effectiveSpeed = speed;
  let visibilityMode = initialVisibility;
  let selectedProbeId = initialSelectedProbe;
  let autoSlowNearEvents = true;
  let autoPauseAtEvents = true;
  let triggeredEvent = null;
  let bypassedEventId = null;

  function activeEventsList() {
    return listHistoricalEvents({
      missionFilter: visibilityMode === PROBE_VISIBILITY_MODES.BOTH ? 'both' : visibilityMode
    });
  }

  /** Posiciono el reloj histórico en `targetJdTdb` limpiando opcionalmente el evento disparado. */
  function setTimeJdTdb(targetJdTdb, { clearTriggered = true } = {}) {
    if (clearTriggered) {
      triggeredEvent = null;
      bypassedEventId = null;
    }
    return splitTime.setJdTdb(targetJdTdb);
  }

  /** Convierto una marca UTC documentada a JD TDB y muevo el reloj a ese instante. */
  function setUtcTimestamp(utcIso) {
    const jd = utcTimestampToJdTdb(utcIso);
    return setTimeJdTdb(jd);
  }

  /** Salto al instante de lanzamiento oficial de la sonda elegida y ajusto la velocidad inicial a 1 h/s. */
  function jumpToLaunch(missionId = null) {
    const targetMissionId = missionId
      ?? (visibilityMode === PROBE_VISIBILITY_MODES.VOYAGER_1 ? VOYAGER_1_ID : VOYAGER_2_ID);
    const mission = HISTORICAL_MISSIONS_CATALOG[targetMissionId] ?? HISTORICAL_MISSIONS_CATALOG[VOYAGER_2_ID];
    selectedProbeId = mission.id;
    playing = false;
    direction = 1;
    speed = findSpeedById('1h_s');
    effectiveSpeed = speed;
    return setTimeJdTdb(mission.launchJdTdb);
  }

  /** Salto al último instante disponible dentro de la cobertura histórica verificada. */
  function jumpToLatestAvailable() {
    playing = false;
    return setTimeJdTdb(splitTime.maxJdTdb);
  }

  /** Me posiciono exactamente en un hito histórico del catálogo, ajusto su velocidad sugerida y lo marco como disparado. */
  function jumpToEvent(eventId) {
    const ev = getHistoricalEventById(eventId);
    if (!ev) return null;
    playing = false;
    selectedProbeId = ev.missionId;
    if (visibilityMode !== PROBE_VISIBILITY_MODES.BOTH && visibilityMode !== ev.missionId) {
      visibilityMode = PROBE_VISIBILITY_MODES.BOTH;
    }
    if (ev.recommendedSpeedId) {
      speed = findSpeedById(ev.recommendedSpeedId);
      effectiveSpeed = speed;
    }
    setTimeJdTdb(ev.jdTdb, { clearTriggered: false });
    triggeredEvent = ev;
    bypassedEventId = ev.id;
    return ev;
  }

  function jumpToPreviousEvent() {
    const { previous } = findPreviousAndNextEvents(splitTime.getJdTdb(), {
      missionFilter: visibilityMode === PROBE_VISIBILITY_MODES.BOTH ? 'both' : visibilityMode,
      toleranceSeconds: 5
    });
    if (!previous) {
      jumpToLaunch();
      return null;
    }
    return jumpToEvent(previous.id);
  }

  function jumpToNextEvent() {
    const { next } = findPreviousAndNextEvents(splitTime.getJdTdb(), {
      missionFilter: visibilityMode === PROBE_VISIBILITY_MODES.BOTH ? 'both' : visibilityMode,
      toleranceSeconds: 5
    });
    if (!next) {
      jumpToLatestAvailable();
      return null;
    }
    return jumpToEvent(next.id);
  }

  function skipTriggeredEventAndContinue() {
    if (triggeredEvent) {
      bypassedEventId = triggeredEvent.id;
      triggeredEvent = null;
    }
    playing = true;
  }

  /**
   * Aquí avanzo o retrocedo el reloj histórico según `realDeltaSeconds`,
   * aplicando desaceleración automática de proximidad y detención exacta sin
   * sobrepaso cuando cruzo un acontecimiento histórico relevante.
   */
  function step(realDeltaSeconds) {
    if (!playing || !Number.isFinite(realDeltaSeconds) || realDeltaSeconds <= 0) {
      effectiveSpeed = speed;
      return Object.freeze({
        jdTdb: splitTime.getJdTdb(),
        changed: false,
        triggeredEvent
      });
    }

    const beforeJd = splitTime.getJdTdb();
    const events = activeEventsList();
    let chosenSpeed = speed;

    if (autoSlowNearEvents) {
      for (const ev of events) {
        if (ev.id === bypassedEventId) continue;
        const deltaToEventSec = (ev.jdTdb - beforeJd) * SECONDS_PER_DAY * direction;
        const windowSec = eventSlowdownWindowSeconds(ev);
        if (deltaToEventSec > 0 && deltaToEventSec <= windowSec) {
          const rec = findSpeedById(ev.recommendedSpeedId ?? '1d_s');
          if (rec.tdbSecondsPerRealSecond < chosenSpeed.tdbSecondsPerRealSecond) {
            chosenSpeed = rec;
          }
          break;
        }
      }
    }
    effectiveSpeed = chosenSpeed;

    const deltaTdbSeconds = realDeltaSeconds * chosenSpeed.tdbSecondsPerRealSecond * direction;
    const tentativeJd = beforeJd + deltaTdbSeconds / SECONDS_PER_DAY;

    if (autoPauseAtEvents) {
      let crossed = null;
      for (const ev of events) {
        if (ev.id === bypassedEventId) continue;
        if (direction > 0 && beforeJd < ev.jdTdb - 1e-8 && tentativeJd >= ev.jdTdb - 1e-8) {
          if (!crossed || ev.jdTdb < crossed.jdTdb) crossed = ev;
        } else if (direction < 0 && beforeJd > ev.jdTdb + 1e-8 && tentativeJd <= ev.jdTdb + 1e-8) {
          if (!crossed || ev.jdTdb > crossed.jdTdb) crossed = ev;
        }
      }
      if (crossed) {
        splitTime.setJdTdb(crossed.jdTdb);
        playing = false;
        triggeredEvent = crossed;
        selectedProbeId = crossed.missionId;
        return Object.freeze({
          jdTdb: splitTime.getJdTdb(),
          changed: true,
          triggeredEvent: crossed
        });
      }
    }

    const afterJd = splitTime.advanceByTdbSeconds(deltaTdbSeconds);
    if (bypassedEventId) {
      const bypassed = getHistoricalEventById(bypassedEventId);
      if (!bypassed || Math.abs((afterJd - bypassed.jdTdb) * SECONDS_PER_DAY) > 120) {
        bypassedEventId = null;
      }
    }

    if ((direction > 0 && splitTime.atEnd()) || (direction < 0 && splitTime.atStart())) {
      playing = false;
    }

    return Object.freeze({
      jdTdb: afterJd,
      changed: Math.abs(afterJd - beforeJd) > 1e-11,
      triggeredEvent
    });
  }

  return Object.freeze({
    getJdTdb: splitTime.getJdTdb,
    getBounds: () => Object.freeze({ minJdTdb: splitTime.minJdTdb, maxJdTdb: splitTime.maxJdTdb }),
    getProgress: splitTime.normalizedProgress,
    setProgress: fraction => {
      triggeredEvent = null;
      bypassedEventId = null;
      return splitTime.setNormalizedProgress(fraction);
    },
    setTimeJdTdb,
    setUtcTimestamp,
    isPlaying: () => playing,
    setPlaying: value => {
      playing = Boolean(value);
      if (playing && triggeredEvent) {
        bypassedEventId = triggeredEvent.id;
        triggeredEvent = null;
      }
      if (playing && direction > 0 && splitTime.atEnd()) {
        splitTime.setJdTdb(splitTime.minJdTdb);
      } else if (playing && direction < 0 && splitTime.atStart()) {
        splitTime.setJdTdb(splitTime.maxJdTdb);
      }
      return playing;
    },
    togglePlaying: () => {
      const next = !playing;
      if (next && triggeredEvent) {
        bypassedEventId = triggeredEvent.id;
        triggeredEvent = null;
      }
      if (next && direction > 0 && splitTime.atEnd()) {
        splitTime.setJdTdb(splitTime.minJdTdb);
      }
      playing = next;
      return playing;
    },
    getDirection: () => direction,
    setDirection: dir => {
      direction = dir < 0 ? -1 : 1;
      return direction;
    },
    toggleReverse: () => {
      direction = direction < 0 ? 1 : -1;
      return direction;
    },
    getSpeed: () => speed,
    getEffectiveSpeed: () => effectiveSpeed,
    setSpeedById: speedId => {
      speed = findSpeedById(speedId);
      effectiveSpeed = speed;
      return speed;
    },
    getVisibilityMode: () => visibilityMode,
    setVisibilityMode: mode => {
      if (Object.values(PROBE_VISIBILITY_MODES).includes(mode)) {
        visibilityMode = mode;
        if (mode === VOYAGER_1_ID || mode === VOYAGER_2_ID) {
          selectedProbeId = mode;
        }
      }
      return visibilityMode;
    },
    getSelectedProbeId: () => selectedProbeId,
    setSelectedProbeId: probeId => {
      if (probeId === VOYAGER_1_ID || probeId === VOYAGER_2_ID) {
        selectedProbeId = probeId;
      }
      return selectedProbeId;
    },
    getEventAssists: () => Object.freeze({
      autoSlowNearEvents,
      autoPauseAtEvents
    }),
    setAutoSlowNearEvents: enabled => {
      autoSlowNearEvents = Boolean(enabled);
      return autoSlowNearEvents;
    },
    setAutoPauseAtEvents: enabled => {
      autoPauseAtEvents = Boolean(enabled);
      return autoPauseAtEvents;
    },
    getTriggeredEvent: () => triggeredEvent,
    clearTriggeredEvent: () => {
      triggeredEvent = null;
    },
    skipTriggeredEventAndContinue,
    jumpToLaunch,
    jumpToLatestAvailable,
    jumpToEvent,
    jumpToPreviousEvent,
    jumpToNextEvent,
    step
  });
}
