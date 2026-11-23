// Aquí implemento la reproducción determinista de una misión lunar ya calculada, junto con la interpolación
// cúbica de Hermite de estados integrados (km, km/s) y el reloj de reproducción hacia delante o hacia atrás.
import { advanceJdTdb } from '../science/Time.js';
import { queryMoon } from '../science/PlanetaryMoons.js';
import { EARTH_RADIUS_KM, MOON_RADIUS_KM, TRANSFER_MODEL_VERSION } from './MissionPhysics.js';
import { isMissionResultCurrent } from './MissionPlanStore.js';

const norm = vector => Math.hypot(...vector);
const subtract = (a, b) => a.map((value, index) => value - b[index]);
const EPSILON = 1e-6;

function validVector(vector) {
  return Array.isArray(vector) && vector.length === 3 && vector.every(Number.isFinite);
}

// Verifico vigencia, viabilidad y cobertura efemérica de un plan lunar para empaquetarlo como ejecución reproducible.
export function createMissionExecution({ result, design, dataset, name = 'Misión lunar' }) {
  if (!result || !design || !dataset?.moons?.Luna) throw Error('Falta una planificación y la efeméride lunar validada.');
  let options;
  try { options = JSON.parse(result.options); } catch { throw Error('Condiciones de planificación inválidas.'); }
  if (!isMissionResultCurrent(result, design, options)) throw Error('La planificación quedó obsoleta tras cambiar la sonda o sus condiciones.');
  if (result.evaluation?.status !== 'VIABLE SEGÚN EL MODELO' || !result.evaluation.budget?.maneuvers?.[0]?.executable) {
    throw Error('La maniobra no es viable según el plan; corrige la sonda o la órbita inicial.');
  }
  const transfer = result.transfer;
  if (transfer?.model !== TRANSFER_MODEL_VERSION) throw Error('El modelo físico del plan no coincide con el vigente.');
  const knots = transfer.trajectory;
  if (!Array.isArray(knots) || knots.length < 2 || Math.abs(knots[0].elapsedSeconds) > EPSILON
    || !validVector(transfer.circularVelocityKmS)) throw Error('La trayectoria carece de estados iniciales reproducibles.');
  for (let i = 0; i < knots.length; i++) {
    const point = knots[i];
    if (!Number.isFinite(point.elapsedSeconds) || !validVector(point.positionKm) || !validVector(point.velocityKmS)
      || (i && point.elapsedSeconds <= knots[i - 1].elapsedSeconds)) throw Error('Muestras de trayectoria inválidas o desordenadas.');
  }
  const durationSeconds = knots.at(-1).elapsedSeconds;
  if (!queryMoon(dataset, 'Luna', transfer.departureJd)
    || !queryMoon(dataset, 'Luna', advanceJdTdb(transfer.departureJd, durationSeconds))) {
    throw Error('La ejecución excede la cobertura de la efeméride lunar.');
  }
  const closest = transfer.target === 'flyby' ? transfer.closestApproach.elapsedSeconds : null;
  const events = [
    { id: 'parking', title: 'Órbita terrestre inicial', elapsedSeconds: 0, side: 'pre', kind: 'initial' },
    { id: 'injection', title: 'Inyección impulsiva calculada', elapsedSeconds: 0, side: 'post', kind: 'maneuver' },
    { id: 'cruise', title: 'Crucero propagado · primera muestra', elapsedSeconds: knots[1].elapsedSeconds, side: 'post', kind: 'phase' },
    { id: 'arrival', title: 'Aproximación nominal', elapsedSeconds: transfer.flightSeconds, side: 'post', kind: 'encounter' },
    ...(closest != null ? [{ id: 'closest', title: 'Distancia mínima lunar muestreada', elapsedSeconds: closest, side: 'post', kind: 'encounter' }] : []),
    { id: 'result', title: 'Fin de trayectoria calculada', elapsedSeconds: durationSeconds, side: 'post', kind: 'result' }
  ].sort((a, b) => a.elapsedSeconds - b.elapsedSeconds || (a.side === 'pre' ? -1 : b.side === 'pre' ? 1 : 0));
  return Object.freeze({ name, design: structuredClone(design), transfer: structuredClone(transfer),
    evaluation: structuredClone(result.evaluation), dataset, options, durationSeconds, events });
}

// Interpolo posición (km) y velocidad (km/s) entre dos nudos consecutivos mediante un polinomio cúbico de Hermite.
export function sampleIntegratedState(knots, seconds) {
  if (seconds === knots[0].elapsedSeconds) return { positionKm: [...knots[0].positionKm], velocityKmS: [...knots[0].velocityKmS], segmentIndex: 0 };
  if (seconds === knots.at(-1).elapsedSeconds) return { positionKm: [...knots.at(-1).positionKm], velocityKmS: [...knots.at(-1).velocityKmS], segmentIndex: knots.length - 2 };
  let low = 0, high = knots.length - 1;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (knots[middle].elapsedSeconds <= seconds) low = middle;
    else high = middle;
  }
  const a = knots[low], b = knots[high];
  const h = b.elapsedSeconds - a.elapsedSeconds;
  const u = (seconds - a.elapsedSeconds) / h;
  const u2 = u * u, u3 = u2 * u;
  const positionKm = [], velocityKmS = [];
  for (let axis = 0; axis < 3; axis++) {
    const p0 = a.positionKm[axis], p1 = b.positionKm[axis];
    const v0 = a.velocityKmS[axis], v1 = b.velocityKmS[axis];
    positionKm.push((2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * h * v0
      + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * h * v1);
    velocityKmS.push(((6 * u2 - 6 * u) * p0 + (-6 * u2 + 6 * u) * p1) / h
      + (3 * u2 - 4 * u + 1) * v0 + (3 * u2 - 2 * u) * v1);
  }
  return { positionKm, velocityKmS, segmentIndex: low };
}

// Evalúo el estado completo de la misión lunar (nave, Luna, distancias, masa y fase) en un instante y lado de maniobra.
export function sampleMissionExecution(execution, elapsedSeconds, { side = 'post' } = {}) {
  if (!execution || !Number.isFinite(elapsedSeconds) || elapsedSeconds < 0 || elapsedSeconds > execution.durationSeconds) {
    throw Error('Instante fuera de la trayectoria calculada.');
  }
  if (!['pre', 'post'].includes(side)) throw Error('Lado de maniobra desconocido.');
  const preManeuver = elapsedSeconds === 0 && side === 'pre';
  const transfer = execution.transfer;
  const integrated = preManeuver
    ? { positionKm: [...transfer.initialPositionKm], velocityKmS: [...transfer.circularVelocityKmS], segmentIndex: 0 }
    : sampleIntegratedState(transfer.trajectory, elapsedSeconds);
  const jdTdb = advanceJdTdb(transfer.departureJd, elapsedSeconds);
  const moon = queryMoon(execution.dataset, 'Luna', jdTdb);
  if (!moon) throw Error('No hay estado lunar para este instante; reproducción interrumpida.');
  const beforeMassKg = execution.evaluation.engineering.wetMassKg;
  const dryMassKg = execution.evaluation.engineering.dryMassKg;
  const maneuver = execution.evaluation.budget.maneuvers[0];
  const massKg = preManeuver ? beforeMassKg : maneuver.massAfterKg;
  const fuelKg = preManeuver ? execution.evaluation.engineering.fuelKg : maneuver.fuelRemainingKg;
  const earthDistanceKm = norm(integrated.positionKm);
  const lunarDistanceKm = norm(subtract(integrated.positionKm, moon.positionKm));
  const phase = preManeuver ? 'parking'
    : elapsedSeconds === 0 ? 'injection'
      : elapsedSeconds >= execution.durationSeconds ? 'result'
        : elapsedSeconds >= transfer.flightSeconds ? (transfer.target === 'flyby' ? 'flyby' : 'arrival')
          : 'cruise';
  return {
    elapsedSeconds, remainingSeconds: execution.durationSeconds - elapsedSeconds,
    jdTdb, positionKm: integrated.positionKm, velocityKmS: integrated.velocityKmS,
    moonPositionKm: moon.positionKm, moonVelocityKmS: moon.velocityKmS,
    earthDistanceKm, earthAltitudeKm: earthDistanceKm - EARTH_RADIUS_KM,
    lunarDistanceKm, lunarAltitudeKm: lunarDistanceKm - MOON_RADIUS_KM,
    lunarRelativeSpeedKmS: norm(subtract(integrated.velocityKmS, moon.velocityKmS)),
    massKg, dryMassKg, fuelKg, fuelConsumedKg: preManeuver ? 0 : maneuver.fuelConsumedKg,
    executedDeltaVMS: preManeuver ? 0 : maneuver.deltaVMS,
    pendingDeltaVMS: preManeuver ? maneuver.deltaVMS : 0,
    maneuverState: preManeuver ? 'pendiente' : 'impulso ideal aplicado',
    phase, segmentIndex: integrated.segmentIndex,
    provenance: 'trayectoria DOPRI54 interpolada con Hermite; masa por evento impulsivo ideal'
  };
}

// Creo un reloj de reproducción acotado a [0, durationSeconds] con velocidad, sentido, saltos y distinción pre/post inyección.
export function createPlaybackClock(durationSeconds, { maxRate = 86400 } = {}) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw Error('Duración de reproducción inválida.');
  let elapsedSeconds = 0, rate = 3600, direction = 1, playing = false, beforeManeuver = true, finished = false;
  const snapshot = () => Object.freeze({ elapsedSeconds, rate, direction, playing, beforeManeuver, finished });
  return {
    snapshot,
    play() { if (elapsedSeconds >= durationSeconds && direction > 0) { playing = false; finished = true; }
      else { playing = true; finished = false; } return snapshot(); },
    pause() { playing = false; return snapshot(); },
    setRate(value) { if (!Number.isFinite(value) || value <= 0 || value > maxRate) throw Error('Velocidad temporal inválida.');
      rate = value; return snapshot(); },
    setDirection(value) { if (![1, -1].includes(value)) throw Error('Dirección de reproducción inválida.');
      direction = value; return snapshot(); },
    seek(value, { side = value === 0 ? 'pre' : 'post' } = {}) {
      if (!Number.isFinite(value) || value < 0 || value > durationSeconds || !['pre', 'post'].includes(side)) throw Error('Salto fuera del cálculo.');
      elapsedSeconds = value; beforeManeuver = value === 0 && side === 'pre';
      finished = value === durationSeconds; return snapshot();
    },
    reset() { elapsedSeconds = 0; beforeManeuver = true; playing = false; direction = 1; finished = false; return snapshot(); },
    advance(realSeconds) {
      if (!Number.isFinite(realSeconds) || realSeconds < 0) throw Error('Paso temporal real inválido.');
      if (!playing) return snapshot();
      const next = Math.max(0, Math.min(durationSeconds, elapsedSeconds + realSeconds * rate * direction));
      elapsedSeconds = next;
      if (direction > 0 && next > 0) beforeManeuver = false;
      if (direction < 0 && next === 0) beforeManeuver = true;
      if (next === durationSeconds && direction > 0) { playing = false; finished = true; }
      if (next === 0 && direction < 0) { playing = false; finished = false; }
      return snapshot();
    }
  };
}
