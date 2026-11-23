// En este módulo reproduzco de forma determinista una transferencia heliocéntrica preliminar en el Centro de Misión.
// Calculo la posición y velocidad de la sonda en cada instante mediante propagación kepleriana en variables universales (μ solar)
// desde el estado inicial que devolvió Lambert, y consulto los planetas en la misma época TDB sobre efemérides Horizons (Hermite).
// Al ser una función pura del tiempo transcurrido, retroceder o repetir produce siempre el mismo estado.
import { propagateKepler, conicSummary } from '../science/KeplerPropagator.js';
import { tdbToTimeScales } from '../science/AstrodynamicsTime.js';
import { KM_PER_AU } from '../science/Units.js';
import { INTERPLANETARY_FRAME } from '../science/InterplanetaryEphemeris.js';
import { INTERPLANETARY_MODEL_VERSION, MU_SUN, MODEL_LIMITS, CANDIDATE_STATUS } from './InterplanetaryPlan.js';
import { calculateEngineering } from './ProbeEngineering.js';

// Mantengo la misma escala heliocéntrica del Sistema Solar en la escena 3D: 32 unidades gráficas por unidad astronómica.
export const HELIOCENTRIC_SCENE_UNITS_PER_AU = 32;
export const HELIOCENTRIC_SCENE_SCALE = HELIOCENTRIC_SCENE_UNITS_PER_AU / KM_PER_AU;
export const INTERPLANETARY_MAX_RATE = 100 * 86400;
const TRAJECTORY_SAMPLES = 480;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = a => Math.hypot(a[0], a[1], a[2]);
const PLANET_COLOR = Object.freeze({ '199': '#a39a91', '299': '#d8b979', '399': '#3f7cc0', '499': '#c46a43', '599': '#c9a77f', '699': '#d6c38f', '799': '#8fd0d8', '899': '#5b7fd6' });

// Busco los pasos por perihelio y afelio de la cónica dentro de (0, T) detectando cambios de signo en r·v y refinándolos por bisección.
function apsisEvents(r0, v0, durationSeconds) {
  const events = [], n = 720, radial = t => { const s = propagateKepler(r0, v0, t, MU_SUN); return s.positionKm[0] * s.velocityKmS[0] + s.positionKm[1] * s.velocityKmS[1] + s.positionKm[2] * s.velocityKmS[2]; };
  let tPrev = 0, fPrev = radial(0);
  for (let i = 1; i <= n; i++) {
    const t = durationSeconds * i / n, f = radial(t);
    if (fPrev !== 0 && Math.sign(f) !== Math.sign(fPrev) && t < durationSeconds) {
      let a = tPrev, b = t, fa = fPrev;
      for (let k = 0; k < 80 && b - a > 1e-3; k++) { const m = (a + b) / 2, fm = radial(m); if (Math.sign(fm) === Math.sign(fa)) { a = m; fa = fm; } else b = m; }
      events.push({ elapsedSeconds: (a + b) / 2, kind: fPrev < 0 ? 'perihelion' : 'aphelion' });
    }
    tPrev = t; fPrev = f;
  }
  return events;
}

// Construyo el paquete inmutable de reproducción heliocéntrica muestreando la cónica y las posiciones planetarias en toda la duración.
export function createInterplanetaryExecution({ result, window, design = null, name = null }) {
  if (!result || result.model !== INTERPLANETARY_MODEL_VERSION) throw Error('El resultado no corresponde al modelo interplanetario vigente.');
  if (![CANDIDATE_STATUS.best, CANDIDATE_STATUS.computed].includes(result.status)) throw Error(`Oportunidad no reproducible: ${result.status}.`);
  if (!window?.stateAt) throw Error('Faltan las efemérides cargadas de la transferencia.');
  const durationSeconds = result.tofDays * 86400;
  const r0 = result.initialState.positionKm, v0 = result.initialState.velocityKmS;
  const trajectory = [];
  for (let i = 0; i <= TRAJECTORY_SAMPLES; i++) {
    const t = durationSeconds * i / TRAJECTORY_SAMPLES, s = propagateKepler(r0, v0, t, MU_SUN), jd = result.departureJdTdb + t / 86400;
    const destination = window.stateAt(result.destinationId, jd), origin = window.stateAt(result.originId, jd);
    if (destination.status !== 'available' || origin.status !== 'available') throw Error('Efemérides no disponibles para el intervalo solicitado.');
    trajectory.push({ elapsedSeconds: t, positionKm: s.positionKm, velocityKmS: s.velocityKmS, moonPositionKm: destination.positionKm, originPositionKm: origin.positionKm });
  }
  const arrivalMissKm = norm(sub(trajectory.at(-1).positionKm, result.destinationState.positionKm));
  const conic = conicSummary(r0, v0, MU_SUN);
  const events = [
    { id: 'departure', kind: 'departure', title: `Salida heliocéntrica desde ${result.originName} (inyección ideal ya aplicada)`, elapsedSeconds: 0, side: 'post' },
    ...apsisEvents(r0, v0, durationSeconds).map((e, i) => ({ id: `${e.kind}-${i}`, kind: e.kind, side: 'post', elapsedSeconds: e.elapsedSeconds,
      title: e.kind === 'perihelion' ? 'Perihelio de la transferencia' : 'Afelio de la transferencia' })),
    { id: 'arrival', kind: 'arrival', title: `Llegada al centro de ${result.destinationName} (cónica; sin captura)`, elapsedSeconds: durationSeconds, side: 'post' }
  ].sort((a, b) => a.elapsedSeconds - b.elapsedSeconds);
  const maxRadius = Math.max(...trajectory.flatMap(p => [norm(p.positionKm), norm(p.moonPositionKm), norm(p.originPositionKm)]));
  return Object.freeze({
    kind: 'interplanetary', name: name ?? `${result.originName} → ${result.destinationName}`, design: design ? structuredClone(design) : null, durationSeconds, events, result, window,
    conic, arrivalMissKm, maxRate: INTERPLANETARY_MAX_RATE,
    transfer: { model: INTERPLANETARY_MODEL_VERSION, target: 'interplanetary', heliocentric: true, departureJd: result.departureJdTdb, flightSeconds: durationSeconds, trajectory,
      initialPositionKm: r0, arrivalPositionKm: result.finalState.positionKm, moonArrivalPositionKm: result.destinationState.positionKm,
      originColor: PLANET_COLOR[result.originId], destinationColor: PLANET_COLOR[result.destinationId],
      sceneScale: HELIOCENTRIC_SCENE_SCALE, bodyRadiusKm: 695700, centralBodyVisualRadius: 0.35, centralBody: { id: '10', name: 'Sol', color: '#f2c766', emissive: true },
      overviewRadiusScene: maxRadius * HELIOCENTRIC_SCENE_SCALE, cameraFar: Math.max(300, maxRadius * HELIOCENTRIC_SCENE_SCALE * 6), hideMoon: false, showOrigin: true },
    evaluation: { status: result.status, engineering: design ? calculateEngineering(design) : null }
  });
}

// Propago analíticamente el estado de la sonda y evalúo los planetas de origen y destino en el instante pedido.
export function sampleInterplanetaryExecution(execution, elapsedSeconds) {
  if (execution?.kind !== 'interplanetary' || !Number.isFinite(elapsedSeconds) || elapsedSeconds < 0 || elapsedSeconds > execution.durationSeconds) throw Error('Instante fuera de la trayectoria calculada.');
  const r = execution.result, jdTdb = r.departureJdTdb + elapsedSeconds / 86400;
  const s = propagateKepler(r.initialState.positionKm, r.initialState.velocityKmS, elapsedSeconds, MU_SUN);
  const destination = execution.window.stateAt(r.destinationId, jdTdb), origin = execution.window.stateAt(r.originId, jdTdb);
  if (destination.status !== 'available' || origin.status !== 'available') throw Error('Efemérides no disponibles para el intervalo solicitado.');
  let segmentIndex = 0; const traj = execution.transfer.trajectory;
  segmentIndex = Math.min(traj.length - 2, Math.floor(elapsedSeconds / execution.durationSeconds * (traj.length - 1)));
  return Object.freeze({ elapsedSeconds, remainingSeconds: execution.durationSeconds - elapsedSeconds, jdTdb, positionKm: s.positionKm, velocityKmS: s.velocityKmS,
    moonPositionKm: destination.positionKm, originPositionKm: origin.positionKm, destinationState: destination, originState: origin, segmentIndex, propagation: { chi: s.chi, iterations: s.iterations } });
}

// Derivo la telemetría heliocéntrica instantánea (distancias en km/AU, velocidad relativa al destino, escalas de tiempo y procedencia).
export function deriveInterplanetaryTelemetry(execution, sample) {
  const r = execution.result, time = tdbToTimeScales(sample.jdTdb);
  const relDest = sub(sample.velocityKmS, sample.destinationState.velocityKmS);
  const finished = sample.remainingSeconds <= 1e-6;
  return Object.freeze({
    missionName: execution.name, probeName: execution.design?.name ?? 'Sin sonda asociada (requisitos sin vehículo)', originName: r.originName, destinationName: r.destinationName,
    phase: sample.elapsedSeconds === 0 ? 'departure' : finished ? 'arrival-helio' : 'cruise-helio',
    time: Object.freeze({ utc: time.labelUtc, tdb: time.labelTdb, jdTdb: sample.jdTdb, utcPredicted: time.utcPredicted, tdbMinusUtcSeconds: time.tdbMinusUtcSeconds,
      elapsedDays: sample.elapsedSeconds / 86400, remainingDays: sample.remainingSeconds / 86400, durationDays: r.tofDays }),
    state: Object.freeze({ positionKm: sample.positionKm, velocityKmS: sample.velocityKmS, frame: INTERPLANETARY_FRAME }),
    derived: Object.freeze({ sunDistanceKm: norm(sample.positionKm), sunDistanceAu: norm(sample.positionKm) / KM_PER_AU, speedKmS: norm(sample.velocityKmS),
      originDistanceKm: norm(sub(sample.positionKm, sample.originPositionKm)), destinationDistanceKm: norm(sub(sample.positionKm, sample.moonPositionKm)),
      destinationRelativeSpeedKmS: norm(relDest) }),
    requirements: r.requirements,
    provenance: Object.freeze({ datasets: [...new Set([sample.originState.dataset?.id, sample.destinationState.dataset?.id].filter(Boolean))],
      solutions: [...new Set([sample.originState.dataset?.solutionId, sample.destinationState.dataset?.solutionId].filter(Boolean))],
      interpolation: `${sample.destinationState.interpolation.method} (${r.destinationName})`, source: 'NASA/JPL Horizons' }),
    model: `Cónica heliocéntrica idealizada (Lambert cero revoluciones, ${r.lambert.diagnostics.transferType}); propagación kepleriana con μ☉ = ${MU_SUN} km³/s². Sin perturbaciones planetarias.`,
    validation: '12G aprobada en auditoría independiente (Gemini). Éxito de misión: no evaluado.',
    limits: MODEL_LIMITS
  });
}
