// Etapa 12D — reproducción y telemetría de una trayectoria de empuje finito ya
// calculada. La reproducción es una función pura del instante: no integra, no
// consume combustible y muestrea los estados integrados (Hermite para posición
// y velocidad; masa lineal, exacta dentro de cada tramo de flujo constante).
import { advanceJdTdb } from '../science/Time.js';
import { queryMoon } from '../science/PlanetaryMoons.js';
import { calculateEngineering } from './ProbeEngineering.js';
import { EARTH_RADIUS_KM, MOON_RADIUS_KM, hasLunarCoverage } from './MissionPhysics.js';
import { sampleIntegratedState } from './MissionPlayback.js';
import { FINITE_THRUST_MODEL_VERSION, isFiniteThrustResultCurrent } from './FiniteThrustPlan.js';
import { accelerationKmS2, kmS2ToMS2, tsiolkovskyDeltaVMS } from './FiniteThrustDynamics.js';

const norm = v => Math.hypot(...v);
const subtract = (a, b) => a.map((x, i) => x - b[i]);

export function createFiniteThrustExecution({ result, design, dataset, name = 'Maniobra de empuje finito' }) {
  if (result?.kind !== 'finite-thrust') throw Error('El resultado no corresponde a una maniobra de empuje finito.');
  if (!design || !dataset?.moons?.Luna) throw Error('Falta la sonda y la efeméride lunar validada.');
  let options;
  try { options = JSON.parse(result.optionsKey); } catch { throw Error('Condiciones de empuje finito inválidas.'); }
  if (!isFiniteThrustResultCurrent(result, design, options)) throw Error('El cálculo de empuje finito quedó obsoleto tras cambiar la sonda o sus condiciones. Recalcula.');
  if (result.model !== FINITE_THRUST_MODEL_VERSION) throw Error('El modelo físico del cálculo no coincide con el vigente.');
  const propagation = result.propagation;
  const knots = propagation?.knots;
  if (!Array.isArray(knots) || knots.length < 2 || Math.abs(knots[0].elapsedSeconds) > 1e-6) throw Error('La trayectoria carece de estados iniciales reproducibles.');
  for (let i = 0; i < knots.length; i++) {
    const k = knots[i];
    if (!Number.isFinite(k.elapsedSeconds) || !Number.isFinite(k.massKg) || k.positionKm.length !== 3 || !k.positionKm.every(Number.isFinite)
      || k.velocityKmS.length !== 3 || !k.velocityKmS.every(Number.isFinite) || (i && k.elapsedSeconds <= knots[i - 1].elapsedSeconds)) {
      throw Error('Muestras de trayectoria inválidas o desordenadas.');
    }
  }
  const durationSeconds = propagation.endSeconds;
  if (Math.abs(knots.at(-1).elapsedSeconds - durationSeconds) > 1e-6 || !hasLunarCoverage(dataset, result.departureJd, advanceJdTdb(result.departureJd, durationSeconds))) {
    throw Error('La ejecución excede la cobertura de la efeméride lunar.');
  }
  const trajectory = knots.map(knot => {
    const jdTdb = advanceJdTdb(result.departureJd, knot.elapsedSeconds);
    const moon = queryMoon(dataset, 'Luna', jdTdb);
    if (!moon) throw Error('Falta estado lunar para la trayectoria calculada.');
    return { elapsedSeconds: knot.elapsedSeconds, jdTdb, positionKm: knot.positionKm, velocityKmS: knot.velocityKmS, moonPositionKm: moon.positionKm };
  });
  const finalMoon = queryMoon(dataset, 'Luna', advanceJdTdb(result.departureJd, durationSeconds));
  const events = [
    { id: 'initial', title: 'Órbita terrestre inicial', elapsedSeconds: 0, side: 'post', kind: 'initial' },
    ...propagation.events.map(event => ({ id: event.id, title: event.title, elapsedSeconds: event.elapsedSeconds, side: 'post', kind: event.kind })),
    { id: 'result', title: 'Fin de la propagación calculada', elapsedSeconds: durationSeconds, side: 'post', kind: 'result' }
  ].sort((a, b) => a.elapsedSeconds - b.elapsedSeconds);
  return Object.freeze({
    kind: 'finite-thrust', name, design: structuredClone(design), dataset, options, durationSeconds, events,
    result: structuredClone(result), propagation: structuredClone(propagation),
    // Forma compatible con MissionExecutionView: solo geometría de presentación.
    transfer: { model: result.model, target: 'finite-thrust', departureJd: result.departureJd, flightSeconds: durationSeconds, trajectory,
      initialPositionKm: knots[0].positionKm, circularVelocityKmS: knots[0].velocityKmS,
      arrivalPositionKm: knots.at(-1).positionKm, moonArrivalPositionKm: finalMoon.positionKm },
    evaluation: { status: result.status, engineering: calculateEngineering(design) }
  });
}

export function sampleFiniteThrustExecution(execution, elapsedSeconds) {
  if (execution?.kind !== 'finite-thrust' || !Number.isFinite(elapsedSeconds) || elapsedSeconds < 0 || elapsedSeconds > execution.durationSeconds) {
    throw Error('Instante fuera de la trayectoria calculada.');
  }
  const knots = execution.propagation.knots;
  const integrated = sampleIntegratedState(knots, elapsedSeconds);
  let low = 0, high = knots.length - 1;
  while (high - low > 1) { const mid = Math.floor((low + high) / 2); if (knots[mid].elapsedSeconds <= elapsedSeconds) low = mid; else high = mid; }
  const a = knots[low], b = knots[high];
  const u = (elapsedSeconds - a.elapsedSeconds) / (b.elapsedSeconds - a.elapsedSeconds);
  const massKg = elapsedSeconds === a.elapsedSeconds ? a.massKg : elapsedSeconds === b.elapsedSeconds ? b.massKg : a.massKg + (b.massKg - a.massKg) * u;
  const jdTdb = advanceJdTdb(execution.result.departureJd, elapsedSeconds);
  const moon = queryMoon(execution.dataset, 'Luna', jdTdb);
  if (!moon) throw Error('No hay estado lunar para este instante; reproducción interrumpida.');
  const system = execution.result.system, engine = system.engine;
  const initialMassKg = execution.propagation.initialMassKg, dryMassKg = execution.propagation.dryMassKg;
  // Encendido activo: inicio inclusivo, fin exclusivo.
  const burn = execution.propagation.burns.find(item => item.status !== 'skipped' && elapsedSeconds >= item.effectiveStartSeconds && elapsedSeconds < item.effectiveEndSeconds) ?? null;
  const thrustN = burn ? burn.thrustN : 0;
  const accelerationMS2 = burn ? kmS2ToMS2(accelerationKmS2(thrustN, massKg)) : 0;
  const depletedAt = execution.propagation.burns.find(item => item.status === 'depleted' || (item.status === 'completed' && item.massAfterKg <= dryMassKg + 1e-9));
  const earthDistanceKm = norm(integrated.positionKm), lunarDistanceKm = norm(subtract(integrated.positionKm, moon.positionKm));
  const phase = elapsedSeconds >= execution.durationSeconds ? 'result' : burn ? 'burn'
    : depletedAt && elapsedSeconds >= depletedAt.effectiveEndSeconds ? 'depleted' : 'coast';
  return {
    elapsedSeconds, remainingSeconds: execution.durationSeconds - elapsedSeconds, jdTdb,
    positionKm: integrated.positionKm, velocityKmS: integrated.velocityKmS,
    moonPositionKm: moon.positionKm, moonVelocityKmS: moon.velocityKmS,
    earthDistanceKm, earthAltitudeKm: earthDistanceKm - EARTH_RADIUS_KM, lunarDistanceKm, lunarAltitudeKm: lunarDistanceKm - MOON_RADIUS_KM,
    lunarRelativeSpeedKmS: norm(subtract(integrated.velocityKmS, moon.velocityKmS)),
    massKg, dryMassKg, fuelKg: Math.max(0, massKg - dryMassKg), fuelConsumedKg: initialMassKg - massKg,
    engineOn: Boolean(burn), activeBurnId: burn?.id ?? null, throttle: burn?.throttle ?? 0, thrustN, accelerationMS2,
    propulsiveDeltaVMS: massKg < initialMassKg ? tsiolkovskyDeltaVMS(engine.ispS, initialMassKg, massKg) : 0,
    maneuverState: burn ? `encendido · ${burn.id}` : phase === 'depleted' ? 'apagado · propelente agotado' : 'apagado',
    phase, segmentIndex: integrated.segmentIndex,
    provenance: 'estados DOPRI54 con masa variable; posición y velocidad por Hermite, masa lineal por tramo'
  };
}

export function deriveFiniteThrustTelemetry(execution, sample) {
  if (!execution || !sample) throw Error('Falta un estado de misión reproducible.');
  const engineering = execution.evaluation.engineering;
  const engine = execution.result.system.engine;
  const requiredWhileBurningW = engineering.idlePowerW + engine.activePowerW;
  const consumptionW = sample.engineOn ? requiredWhileBurningW : engineering.idlePowerW;
  return {
    missionName: execution.name, probeName: execution.design.name,
    propagated: { jdTdb: sample.jdTdb, positionKm: sample.positionKm, velocityKmS: sample.velocityKmS,
      moonPositionKm: sample.moonPositionKm, moonVelocityKmS: sample.moonVelocityKmS },
    derived: { earthDistanceKm: sample.earthDistanceKm, earthAltitudeKm: sample.earthAltitudeKm, lunarDistanceKm: sample.lunarDistanceKm,
      lunarAltitudeKm: sample.lunarAltitudeKm, lunarRelativeSpeedKmS: sample.lunarRelativeSpeedKmS },
    propulsion: { engineName: engine.name, engineKind: engine.kind, engineOn: sample.engineOn, activeBurnId: sample.activeBurnId,
      throttle: sample.throttle, thrustN: sample.thrustN, accelerationMS2: sample.accelerationMS2, massKg: sample.massKg,
      dryMassKg: sample.dryMassKg, fuelKg: sample.fuelKg, fuelConsumedKg: sample.fuelConsumedKg, propulsiveDeltaVMS: sample.propulsiveDeltaVMS,
      state: sample.maneuverState },
    energyEstimate: { nominalGenerationW: engineering.generationW, consumptionW, netNominalW: engineering.generationW - consumptionW,
      batteryCapacityWh: engineering.batteryWh, batteryChargeWh: null,
      warning: 'Generación nominal a 1 AU con iluminación directa; eclipses y orientación no calculados. La batería no se usa para habilitar encendidos.' },
    phase: sample.phase, elapsedSeconds: sample.elapsedSeconds, remainingSeconds: sample.remainingSeconds,
    objectiveReached: null, missionSuccess: null,
    provenance: { spacecraft: 'Estados DOPRI54 de 8 componentes (posición, velocidad, masa, Δv acumulado) con empuje finito; Hermite entre nudos.',
      moon: 'Horizons geocéntrico interpolado en TDB dentro de cobertura.', resources: 'Masa y combustible de la integración; no de animaciones.' }
  };
}
