// Etapa 12F — reproducción y telemetría de un descenso ya calculado sobre un cuerpo cualquiera.
// Función pura del instante: no integra, no consume propelente adicional y no repite eventos al retroceder. Posición y velocidad por
// Hermite entre nudos DOPRI54; la masa se interpola linealmente entre nudos (la integración registra ~1 nudo/s en el descenso);
// el empuje y el acelerador se reevalúan con la misma función de guiado que usó la integración.
import { calculateEngineering } from './ProbeEngineering.js';
import { designSignature } from './MissionPlanStore.js';
import { sampleIntegratedState } from './MissionPlayback.js';
import { LANDING_MODEL_VERSION } from './BodyLandingSimulation.js';
import { createLandingEnvironment, descentPhaseOf, landingCommand, orbitalSummary, surfaceKinematics } from './BodyLandingDynamics.js';
import { getBodyProfile } from './CelestialBodyMissionRegistry.js';
import { STANDARD_GRAVITY_M_S2 } from './BodyLandingVehicle.js';

export const LANDING_VIEW_OVERVIEW_MIN_DISTANCE = 2.4;
export const CENTRAL_BODY_SCENE_RADIUS = 0.63710084; // igual que MissionExecutionView: radio de la esfera central en unidades de escena
const BODY_COLOR = Object.freeze({ 'rocky-moon': '#9c9fa4', 'icy-moon': '#b9c9d6', 'rocky-planet': '#9a8878' });

const interpolate = (knots, t, key) => {
  let low = 0, high = knots.length - 1;
  while (high - low > 1) { const mid = (low + high) >> 1; if (knots[mid].elapsedSeconds <= t) low = mid; else high = mid; }
  const a = knots[low], b = knots[high], u = (t - a.elapsedSeconds) / (b.elapsedSeconds - a.elapsedSeconds || 1);
  return a[key] + (b[key] - a[key]) * Math.min(1, Math.max(0, u));
};
const segmentAt = (segments, t) => { for (let i = segments.length - 1; i >= 0; i--) if (t >= segments[i].startSeconds && segments[i].endSeconds > segments[i].startSeconds) return segments[i]; return segments[0]; };

export function createLandingExecution({ result, design, name = null }) {
  if (result?.kind !== 'landing') throw Error('El resultado no corresponde a un descenso.');
  const sim = result.simulation;
  if (!design || !sim) throw Error('Falta la sonda o el cálculo del descenso.');
  if (result.model !== LANDING_MODEL_VERSION) throw Error('El modelo físico del cálculo no coincide con el vigente.');
  if (result.designSignature !== designSignature(design)) throw Error('El cálculo del descenso quedó obsoleto tras cambiar la sonda. Recalcula.');
  const knots = sim.knots;
  if (!Array.isArray(knots) || knots.length < 2) throw Error('El descenso no tiene una trayectoria reproducible.');
  for (let i = 0; i < knots.length; i++) {
    const k = knots[i];
    if (!Number.isFinite(k.elapsedSeconds) || !k.positionKm.every(Number.isFinite) || !k.velocityKmS.every(Number.isFinite) || (i && k.elapsedSeconds <= knots[i - 1].elapsedSeconds)) throw Error('Muestras de trayectoria inválidas o desordenadas.');
  }
  const profile = getBodyProfile(sim.bodyId), env = createLandingEnvironment(profile), durationSeconds = knots.at(-1).elapsedSeconds;
  const trajectory = knots.map(k => ({ elapsedSeconds: k.elapsedSeconds, positionKm: k.positionKm, velocityKmS: k.velocityKmS, moonPositionKm: [0, 0, 0] }));
  const events = [...sim.events.filter(e => e.id !== 'failure').map(e => ({ id: e.id, title: e.title, elapsedSeconds: Math.min(e.elapsedSeconds, durationSeconds), side: 'post', kind: e.kind }))]
    .sort((a, b) => a.elapsedSeconds - b.elapsedSeconds);
  return Object.freeze({
    kind: 'landing', name: name ?? `Descenso en ${sim.bodyName}`, design: structuredClone(design), options: sim.options, durationSeconds, events, result, simulation: sim, profile, environment: env,
    transfer: { model: LANDING_MODEL_VERSION, target: 'landing', departureJd: null, flightSeconds: durationSeconds, trajectory, initialPositionKm: knots[0].positionKm, circularVelocityKmS: knots[0].velocityKmS,
      arrivalPositionKm: knots.at(-1).positionKm, moonArrivalPositionKm: knots.at(-1).positionKm, overviewMinDistance: LANDING_VIEW_OVERVIEW_MIN_DISTANCE,
      // Escena local: el cuerpo central ocupa el radio de la Tierra de la vista (0,6371 u); 1 u = R_cuerpo/0,6371 km. No es una escena del Sistema Solar.
      bodyRadiusKm: env.radiusKm, sceneScale: CENTRAL_BODY_SCENE_RADIUS / env.radiusKm, centralBody: { id: profile.id, name: profile.name, color: BODY_COLOR[profile.type] ?? '#9a9a9a' }, hideMoon: true },
    evaluation: { status: sim.status, engineering: calculateEngineering(design) }
  });
}

export function sampleLandingExecution(execution, elapsedSeconds) {
  if (execution?.kind !== 'landing' || !Number.isFinite(elapsedSeconds) || elapsedSeconds < 0 || elapsedSeconds > execution.durationSeconds) throw Error('Instante fuera de la trayectoria calculada.');
  const sim = execution.simulation, env = execution.environment, t = elapsedSeconds, guidance = sim.options.guidance;
  const integrated = sampleIntegratedState(sim.knots, t);
  const segment = segmentAt(sim.segments, t);
  const massKg = interpolate(sim.knots, t, 'massKg'), dryKg = sim.masses.dryKg;
  const k = surfaceKinematics(env, integrated.positionKm, integrated.velocityKmS);
  const cmd = landingCommand(env, sim.lander, guidance, segment.mode, [...integrated.positionKm, ...integrated.velocityKmS, massKg, 0], dryKg);
  const finished = execution.durationSeconds - t <= 0.01;
  const phase = finished ? 'contact' : segment.id === 'orbit' ? 'orbit' : segment.id === 'deorbit' ? 'deorbit' : segment.id === 'approach' ? 'approach'
    : segment.id === 'ballistic' ? 'ballistic' : descentPhaseOf(guidance, k.horizontalMS);
  const accelMS2 = cmd.thrustN / massKg;
  return {
    elapsedSeconds: t, remainingSeconds: execution.durationSeconds - t, jdTdb: null, positionKm: integrated.positionKm, velocityKmS: integrated.velocityKmS,
    moonPositionKm: [0, 0, 0], moonVelocityKmS: [0, 0, 0], segmentIndex: integrated.segmentIndex,
    massKg, dryMassKg: dryKg, fuelKg: Math.max(0, massKg - dryKg), fuelConsumedKg: sim.masses.wetKg - massKg,
    radiusKm: k.radiusKm, altitudeKm: k.altitudeKm, gravityMS2: k.gravityMS2, inertialSpeedKmS: Math.hypot(...integrated.velocityKmS),
    relativeSpeedMS: k.relativeSpeedMS, verticalMS: k.verticalMS, horizontalMS: k.horizontalMS,
    thrustN: cmd.thrustN, throttle: cmd.throttle, engineOn: cmd.engineOn, accelerationMS2: accelMS2, thrustToWeight: cmd.engineOn ? cmd.thrustN / (massKg * k.gravityMS2) : 0,
    thrustDirection: cmd.engineOn ? cmd.direction : null, saturated: cmd.saturated,
    propulsiveDeltaVMS: interpolate(sim.knots, t, 'dvAccKmS') * 1000, phase, segmentLabel: segment.label,
    massFlowKgS: cmd.thrustN / (sim.lander.engine.ispS * STANDARD_GRAVITY_M_S2),
    provenance: 'estados DOPRI54 de 8 componentes; Hermite en posición/velocidad, masa lineal entre nudos; empuje reevaluado con el mismo guiado'
  };
}

export function deriveLandingTelemetry(execution, sample) {
  if (!execution || !sample) throw Error('Falta un estado de misión reproducible.');
  const sim = execution.simulation, env = execution.environment;
  let elements = null;
  try { elements = orbitalSummary(env, sample.positionKm, sample.velocityKmS); } catch { elements = null; }
  const finished = sample.remainingSeconds <= 0.01;
  return {
    missionName: execution.name, probeName: execution.design.name, landerName: sim.lander.name, bodyName: sim.bodyName, bodyId: sim.bodyId,
    frame: sim.frame, propagated: { positionKm: sample.positionKm, velocityKmS: sample.velocityKmS },
    flight: { radiusKm: sample.radiusKm, altitudeKm: sample.altitudeKm, gravityMS2: sample.gravityMS2, inertialSpeedKmS: sample.inertialSpeedKmS, relativeSpeedMS: sample.relativeSpeedMS,
      verticalMS: sample.verticalMS, horizontalMS: sample.horizontalMS, groundVelocityBasis: env.rotates ? 'v − ω × r (cuerpo con rotación declarada)' : 'cuerpo sin rotación declarada: suelo en reposo en el marco local' },
    propulsion: { engineOn: sample.engineOn, engineLabel: sample.engineOn ? `Encendido · ${(sample.throttle * 100).toFixed(0)} %` : 'Apagado', throttle: sample.throttle, thrustN: sample.thrustN,
      accelerationMS2: sample.accelerationMS2, thrustToWeight: sample.thrustToWeight, massKg: sample.massKg, fuelKg: sample.fuelKg, fuelConsumedKg: sample.fuelConsumedKg, propulsiveDeltaVMS: sample.propulsiveDeltaVMS },
    orbit: elements ? { bound: elements.bound, periapsisAltitudeKm: elements.periapsisRadiusKm - env.radiusKm, apoapsisAltitudeKm: elements.bound ? elements.apoapsisRadiusKm - env.radiusKm : null,
      eccentricity: elements.eccentricity, periodSeconds: elements.periodSeconds, specificEnergyKm2S2: elements.specificEnergyKm2S2, angularMomentumKm2S: elements.angularMomentumKm2S } : null,
    target: null, result: finished ? { classification: sim.outcome, reasons: sim.reasons, contact: sim.contact } : null,
    phase: sample.phase, elapsedSeconds: sample.elapsedSeconds, remainingSeconds: sample.remainingSeconds, objectiveReached: finished ? sim.outcome.startsWith('ATERRIZAJE SUAVE') : null, missionSuccess: null,
    provenance: { spacecraft: `Masa puntual integrada con DOPRI54: gravedad central de ${sim.bodyName} (GM ${env.mu} km³/s², radio ${env.radiusKm} km), empuje modulado y masa variable.`,
      frame: sim.frame.warning,
      limits: 'Sin atmósfera, J2, terceros cuerpos, actitud ni modelo de patas o impacto. Los umbrales de contacto son aproximaciones del simulador; no se declara supervivencia estructural. Sin punto objetivo ni sensores modelados.' }
  };
}
