import { UNIDADES_POR_AU } from '../graphics/SceneScale.js';
import { eclipticToSceneAxes, requireVector3 } from '../science/Frames.js';
import { DYNAMICAL_MODELS } from '../science/GravitationalDynamics.js';
import { HORIZONS_PLANETS } from '../science/HorizonsEphemerides.js';
import { createProbeDynamicState, probeStateToScientificState } from '../science/ProbeState.js';
import { decomposeJdTdbCalendar, formatMissionElapsedTime } from '../science/SimulationTime.js';
import { KM_PER_AU, SECONDS_PER_DAY } from '../science/Units.js';

export const SCENE_UNITS_PER_KM = UNIDADES_POR_AU / KM_PER_AU;

/**
 * Convierte un vector físico en km (marco eclíptico J2000/ICRF) a coordenadas
 * visuales de la escena Three.js sin modificar el vector original.
 */
export function physicalPositionKmToScene(positionKm) {
  requireVector3(positionKm, 'positionKm');
  const rotated = eclipticToSceneAxes(positionKm);
  return Object.freeze({
    x: rotated.x * SCENE_UNITS_PER_KM,
    y: rotated.y * SCENE_UNITS_PER_KM,
    z: rotated.z * SCENE_UNITS_PER_KM
  });
}

function formatDynamicalModelSummary(model) {
  const integratorLabel = model.integratorMethod === 'dopri54' ? 'DOPRI54 (RK45)' : 'RK4';
  if (model.kind === DYNAMICAL_MODELS.TWO_BODY_CENTRAL) {
    return `Dos cuerpos (central ${model.centralBodyId}) · ${integratorLabel}`;
  }
  const count = model.perturbingBodyIds.length;
  const indirect = model.includeIndirectTerms ? ' + térm. indirecto' : '';
  return `Sol + ${count} planetas (efem. prescritas${indirect}) · ${integratorLabel}`;
}

/**
 * Adaptador puro de `ProbeDynamicState` a coordenadas gráficas y telemetría de HUD.
 * Conserva intacto el estado físico original.
 */
export function probeStateToVisual(probeDynamicState) {
  const state = createProbeDynamicState(probeDynamicState);
  const p = state.position;
  const v = state.velocity;
  const distanceKm = Math.hypot(p.x, p.y, p.z);
  const speedKmPerS = Math.hypot(v.x, v.y, v.z);
  const calendar = decomposeJdTdbCalendar(state.time.epochJdTdb, state.time.elapsedSeconds);

  return Object.freeze({
    id: state.probe.id,
    nombre: state.probe.name,
    clasificacion: state.probe.classification,
    posicionEscena: physicalPositionKmToScene(p),
    posicionKm: state.position,
    posicionAU: Object.freeze({
      x: p.x / KM_PER_AU,
      y: p.y / KM_PER_AU,
      z: p.z / KM_PER_AU
    }),
    velocidadKmPorS: state.velocity,
    velocidadAUporDia: Object.freeze({
      x: v.x * SECONDS_PER_DAY / KM_PER_AU,
      y: v.y * SECONDS_PER_DAY / KM_PER_AU,
      z: v.z * SECONDS_PER_DAY / KM_PER_AU
    }),
    distanciaHeliocentricaKm: distanceKm,
    distanciaHeliocentricaAU: distanceKm / KM_PER_AU,
    rapidezHeliocentricaKmPorS: speedKmPerS,
    jdTdb: state.time.jdTdb,
    elapsedSeconds: state.time.elapsedSeconds,
    tiempoTranscurridoTexto: formatMissionElapsedTime(state.time.elapsedSeconds),
    fechaTDB: calendar.labelTdb,
    fechaCortaTDB: calendar.shortLabelTdb,
    fechaISO: calendar.dateIso,
    modeloFisicoTexto: formatDynamicalModelSummary(state.dynamicalModel),
    scientificState: probeStateToScientificState(state),
    probeState: state
  });
}

/**
 * Convierte las muestras de posición física en km de una trayectoria propagada
 * a un `Float32Array` de vértices en coordenadas de escena Three.js `(x, z, -y) * escala`.
 */
export function trajectoryRenderSamplesToScenePositions(renderSamples) {
  if (!renderSamples || typeof renderSamples !== 'object'
    || !(renderSamples.positionsKm instanceof Float64Array)
    || !Number.isSafeInteger(renderSamples.count) || renderSamples.count < 1) {
    throw new TypeError('renderSamples debe contener count y positionsKm (Float64Array).');
  }
  const { count, positionsKm } = renderSamples;
  if (positionsKm.length < count * 3) {
    throw new RangeError('renderSamples.positionsKm tiene longitud insuficiente.');
  }
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const px = positionsKm[i * 3];
    const py = positionsKm[i * 3 + 1];
    const pz = positionsKm[i * 3 + 2];
    out[i * 3] = px * SCENE_UNITS_PER_KM;
    out[i * 3 + 1] = pz * SCENE_UNITS_PER_KM;
    out[i * 3 + 2] = -py * SCENE_UNITS_PER_KM;
  }
  return out;
}

/**
 * Evalúa de forma síncrona las posiciones visuales de los ocho planetas en un
 * instante `elapsedSeconds` usando el `PrescribedEphemerisField` validado.
 * Compatible con `simulador.actualizarPosiciones` y `PlanetInfoPanel`.
 */
export function evaluateVisualPlanetsFromField(ephemerisField, elapsedSeconds) {
  const calendar = decomposeJdTdbCalendar(ephemerisField.epochJdTdb, elapsedSeconds);
  const states = {};
  let allExact = true;

  for (const [planetName, bodyId] of Object.entries(HORIZONS_PLANETS)) {
    const sample = ephemerisField.getBodyStateAtElapsedSeconds(bodyId, elapsedSeconds);
    const p = sample.position;
    const v = sample.velocity;
    if (!sample.exactSample) allExact = false;
    states[planetName] = Object.freeze({
      posicionEscena: physicalPositionKmToScene(p),
      posicionKm: Object.freeze({
        x: p.x,
        y: p.y,
        z: p.z,
        unit: 'km'
      }),
      posicionAU: Object.freeze({
        x: p.x / KM_PER_AU,
        y: p.y / KM_PER_AU,
        z: p.z / KM_PER_AU
      }),
      velocidadAUporDia: Object.freeze({
        x: v.x * SECONDS_PER_DAY / KM_PER_AU,
        y: v.y * SECONDS_PER_DAY / KM_PER_AU,
        z: v.z * SECONDS_PER_DAY / KM_PER_AU
      }),
      jdTDB: sample.jdTdb,
      fechaTDB: calendar.labelTdb,
      scientificStatus: sample.exactSample ? 'exact' : 'interpolated'
    });
  }

  return Object.freeze({
    states: Object.freeze(states),
    status: allExact ? 'exact' : 'interpolated',
    calendar
  });
}
