// Etapa 12E — reproducción y telemetría de un lanzamiento ya calculado.
// La reproducción es una función pura del instante: no integra, no consume propelente ni repite la separación.
// Posición y velocidad: Hermite entre nudos integrados. Masa y consumo: lineales dentro de cada tramo (flujo constante).
// La separación es el salto de masa entre dos tramos consecutivos; al retroceder se recupera el tramo anterior.
import { calculateEngineering } from './ProbeEngineering.js';
import { sampleIntegratedState } from './MissionPlayback.js';
import { designSignature } from './MissionPlanStore.js';
import { EARTH_GM_KM3_S2, STANDARD_GRAVITY_M_S2, WGS84_A_KM, norm3, geodeticFromPosition } from './LaunchEarth.js';
import { createEnvironment, evaluateForces } from './LaunchDynamics.js';
import { orbitalElements } from './LaunchOrbit.js';
import { LAUNCH_MODEL_VERSION } from './LaunchSimulation.js';

export const LAUNCH_VIEW_OVERVIEW_MIN_DISTANCE = 2.4; // unidades de escena (1 u = 10 000 km): encuadre de la Tierra completa

export function createLaunchExecution({ result, design, name = 'Lanzamiento terrestre' }) {
  if (result?.kind !== 'launch') throw Error('El resultado no corresponde a un lanzamiento.');
  const sim = result.simulation;
  if (!design || !sim) throw Error('Falta la sonda o el cálculo del lanzamiento.');
  if (result.model !== LAUNCH_MODEL_VERSION) throw Error('El modelo físico del cálculo no coincide con el vigente.');
  if (result.designSignature !== designSignature(design)) throw Error('El cálculo del lanzamiento quedó obsoleto tras cambiar la sonda. Recalcula.');
  const knots = sim.knots;
  if (!Array.isArray(knots) || knots.length < 2) throw Error('El lanzamiento no tiene una trayectoria reproducible (no despega).');
  for (let i = 0; i < knots.length; i++) {
    const k = knots[i];
    if (!Number.isFinite(k.elapsedSeconds) || !k.positionKm.every(Number.isFinite) || !k.velocityKmS.every(Number.isFinite) || (i && k.elapsedSeconds <= knots[i - 1].elapsedSeconds)) throw Error('Muestras de trayectoria inválidas o desordenadas.');
  }
  const durationSeconds = knots.at(-1).elapsedSeconds;
  const trajectory = knots.map(k => ({ elapsedSeconds: k.elapsedSeconds, positionKm: k.positionKm, velocityKmS: k.velocityKmS, moonPositionKm: [0, 0, 0] }));
  const events = [{ id: 'initial', title: 'Vehículo en la plataforma', elapsedSeconds: 0, side: 'post', kind: 'initial' },
    ...sim.events.filter(e => e.id !== 'failure').map(e => ({ id: e.id, title: e.title, elapsedSeconds: Math.min(e.elapsedSeconds, durationSeconds), side: 'post', kind: e.kind }))]
    .sort((a, b) => a.elapsedSeconds - b.elapsedSeconds);
  return Object.freeze({
    kind: 'launch', name, design: structuredClone(design), options: sim.options, durationSeconds, events, result, simulation: sim,
    environment: createEnvironment(sim.environment),
    transfer: { model: LAUNCH_MODEL_VERSION, target: 'launch', departureJd: null, flightSeconds: durationSeconds, trajectory,
      initialPositionKm: knots[0].positionKm, circularVelocityKmS: knots[0].velocityKmS, arrivalPositionKm: knots.at(-1).positionKm,
      moonArrivalPositionKm: knots.at(-1).positionKm, overviewMinDistance: LAUNCH_VIEW_OVERVIEW_MIN_DISTANCE },
    evaluation: { status: sim.status, engineering: calculateEngineering(design) }
  });
}

const segmentAt = (segments, t) => {
  for (let i = segments.length - 1; i >= 0; i--) if (t >= segments[i].startSeconds && segments[i].endSeconds > segments[i].startSeconds) return segments[i];
  return segments[0];
};
const interpolate = (knots, t, key) => {
  let low = 0, high = knots.length - 1;
  while (high - low > 1) { const mid = (low + high) >> 1; if (knots[mid].elapsedSeconds <= t) low = mid; else high = mid; }
  const a = knots[low], b = knots[high], u = (t - a.elapsedSeconds) / (b.elapsedSeconds - a.elapsedSeconds);
  return a[key] + (b[key] - a[key]) * Math.min(1, Math.max(0, u));
};

// Propelente consumido por una etapa hasta el instante t (suma de sus tramos encendidos, flujo constante).
function stageConsumedKg(sim, stageIndex, t) {
  const stage = sim.stages[stageIndex], id = stage.stageId;
  return sim.segments.filter(s => s.kind === 'burn' && s.stageId === id).reduce((n, s) => n + s.massFlowKgS * Math.max(0, Math.min(t, s.endSeconds) - s.startSeconds), 0);
}

export function sampleLaunchExecution(execution, elapsedSeconds) {
  if (execution?.kind !== 'launch' || !Number.isFinite(elapsedSeconds) || elapsedSeconds < 0 || elapsedSeconds > execution.durationSeconds) throw Error('Instante fuera de la trayectoria calculada.');
  const sim = execution.simulation, t = elapsedSeconds;
  const integrated = sampleIntegratedState(sim.knots, t);
  const segment = segmentAt(sim.segments, t);
  const span = segment.endSeconds - segment.startSeconds;
  const massKg = span > 0 ? segment.massStartKg + (segment.massEndKg - segment.massStartKg) * Math.min(1, Math.max(0, (t - segment.startSeconds) / span)) : segment.massStartKg;
  const separated = sim.stages[0].separationSeconds != null && t >= sim.stages[0].separationSeconds;
  const burning = segment.kind === 'burn' && t < segment.endSeconds;
  const stageIndex = segment.stageIndex ?? 0;
  const stage1Left = separated ? 0 : Math.max(0, sim.stages[0].propellantLoadedKg - stageConsumedKg(sim, 0, t));
  const stage2Left = Math.max(0, sim.stages[1]?.propellantLoadedKg - stageConsumedKg(sim, 1, t) || 0);
  const forces = evaluateForces(execution.environment, { stage: null, aero: segment.aero }, t, [...integrated.positionKm, ...integrated.velocityKmS, massKg, 0]);
  // Empuje y dirección reales de esa etapa en ese instante (misma función que la integración).
  let thrustN = 0, direction = null;
  if (burning) {
    const stageSpec = execution.simulation.launcherStages[stageIndex];
    const f = evaluateForces(execution.environment, { stage: stageSpec, guidance: segment.guidance, aero: segment.aero }, t, [...integrated.positionKm, ...integrated.velocityKmS, massKg, 0]);
    thrustN = f.thrustN; direction = f.direction;
  }
  const dragN = norm3(forces.drag) * massKg * 1000;
  const r = norm3(integrated.positionKm), gLocalMS2 = EARTH_GM_KM3_S2 / (r * r) * 1000;
  const properAccelMS2 = burning ? Math.hypot(...direction.map((x, i) => x * thrustN / massKg + forces.drag[i] * 1000)) : dragN / massKg;
  const geodetic = geodeticFromPosition(integrated.positionKm);
  const phase = execution.durationSeconds - t <= 0.01 ? 'result' : segment.kind === 'hold' ? 'pad' : burning ? (stageIndex === 0 ? 'ascent-1' : segment.label.includes('circularización') ? 'circularization' : 'ascent-2')
    : segment.label.includes('Balístico previo a la separación') ? 'stage-1-coast' : segment.label.includes('previo al encendido') ? 'separation-coast' : 'coast';
  return {
    elapsedSeconds: t, remainingSeconds: execution.durationSeconds - t, jdTdb: null,
    positionKm: integrated.positionKm, velocityKmS: integrated.velocityKmS, moonPositionKm: [0, 0, 0], moonVelocityKmS: [0, 0, 0], segmentIndex: integrated.segmentIndex,
    massKg, fuelKg: stage1Left + stage2Left, stage1PropellantKg: stage1Left, stage2PropellantKg: stage2Left,
    altitudeKm: geodetic.altitudeKm, inertialSpeedKmS: norm3(integrated.velocityKmS), relativeSpeedKmS: forces.relativeSpeedKmS,
    dynamicPressurePa: forces.dynamicPressurePa, densityKgM3: forces.densityKgM3, atmosphericPressurePa: forces.pressurePa,
    thrustN, thrustToWeight: burning ? thrustN / (massKg * gLocalMS2) : 0, dragN, properAccelerationMS2: properAccelMS2, gLoad: properAccelMS2 / STANDARD_GRAVITY_M_S2,
    activeStage: separated ? 2 : 1, engineOn: burning, engineLabel: burning ? `Etapa ${stageIndex + 1} encendida` : 'Motores apagados',
    propulsiveDeltaVMS: interpolate(sim.knots, t, 'dvAccKmS') * 1000, separated, segmentLabel: segment.label, phase,
    thrustDirection: direction,
    provenance: 'estados DOPRI54 de 8 componentes; Hermite en posición/velocidad, masa lineal por tramo; fuerzas reevaluadas con el mismo modelo'
  };
}

export function deriveLaunchTelemetry(execution, sample) {
  if (!execution || !sample) throw Error('Falta un estado de misión reproducible.');
  const sim = execution.simulation;
  let elements = null;
  try { if (sample.altitudeKm > 0) elements = orbitalElements(sample.positionKm, sample.velocityKmS); } catch { elements = null; }
  const finished = sample.remainingSeconds <= 0.01; // el control deslizante redondea; el resultado se muestra en el último centésimo de segundo
  return {
    missionName: execution.name, probeName: execution.design.name, launcherName: sim.launcherName,
    propagated: { positionKm: sample.positionKm, velocityKmS: sample.velocityKmS },
    flight: { altitudeKm: sample.altitudeKm, inertialSpeedKmS: sample.inertialSpeedKmS, relativeSpeedKmS: sample.relativeSpeedKmS,
      dynamicPressurePa: sample.dynamicPressurePa, properAccelerationMS2: sample.properAccelerationMS2, gLoad: sample.gLoad },
    propulsion: { engineOn: sample.engineOn, engineLabel: sample.engineLabel, activeStage: sample.activeStage, thrustN: sample.thrustN, thrustToWeight: sample.thrustToWeight,
      massKg: sample.massKg, fuelKg: sample.fuelKg, stage1PropellantKg: sample.stage1PropellantKg, stage2PropellantKg: sample.stage2PropellantKg,
      propulsiveDeltaVMS: sample.propulsiveDeltaVMS, separated: sample.separated },
    orbit: elements ? { bound: elements.bound, apogeeAltitudeKm: elements.bound ? elements.apoapsisRadiusKm - WGS84_A_KM : null, perigeeAltitudeKm: elements.periapsisRadiusKm - WGS84_A_KM,
      eccentricity: elements.eccentricity, inclinationDeg: elements.inclinationDeg, specificEnergyKm2S2: elements.specificEnergyKm2S2, note: 'osculante instantáneo, dos cuerpos, sin arrastre' } : null,
    result: finished ? { classification: sim.orbit.outcome ?? sim.orbit.classification, reasons: sim.orbit.reasons } : null,
    phase: sample.phase, elapsedSeconds: sample.elapsedSeconds, remainingSeconds: sample.remainingSeconds,
    objectiveReached: finished ? sim.orbit.classification.startsWith('ÓRBITA') : null, missionSuccess: null,
    provenance: { spacecraft: 'Masa puntual integrada con DOPRI54: gravedad central, empuje variable con la presión, arrastre con velocidad relativa a la atmósfera corrotante y masa variable.',
      atmosphere: 'US-1976 por capas hasta 86 km; extrapolación exponencial hasta 200 km; vacío por encima. Sin viento.',
      limits: 'Orientación idealizada (sin dinámica de actitud, sin rotación del cuerpo); Cd constante; sin Mach, empuje lateral ni cargas estructurales.' }
  };
}
