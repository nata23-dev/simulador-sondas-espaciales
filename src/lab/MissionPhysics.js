// Aquí calculo transferencias Tierra–Luna en el problema restringido de tres cuerpos con efeméride lunar real.
// Uso el integrador DOPRI54 en marco geocéntrico (km, km/s, km³/s², s, JD TDB) incluyendo el término gravitatorio
// indirecto lunar, y resuelvo el apuntado a la Luna futura mediante corrección de tiro desde una semilla de Hohmann.
import { SOLAR_SYSTEM_GM_CATALOG } from '../science/GravitationalParameters.js';
import { integrateDopri54 } from '../science/NumericalIntegrator.js';
import { queryMoon } from '../science/PlanetaryMoons.js';
import { advanceJdTdb } from '../science/Time.js';

export const EARTH_MU_KM3_S2 = SOLAR_SYSTEM_GM_CATALOG.getMu('399');
export const MOON_MU_KM3_S2 = SOLAR_SYSTEM_GM_CATALOG.getMu('301');
export const MOON_RADIUS_KM = SOLAR_SYSTEM_GM_CATALOG.getParameter('301').referenceRadiusKm;
export const EARTH_RADIUS_KM = SOLAR_SYSTEM_GM_CATALOG.getParameter('399').referenceRadiusKm;
export const LUNAR_COVERAGE = Object.freeze({ startJd: 2461314.5, endJd: 2461345.5 });
export const TRANSFER_MODEL_VERSION = 'earth-moon-restricted-ephemeris-v2';

const length = v => Math.hypot(...v);
const unit = v => v.map(x => x / length(v));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);

// Compruebo si el intervalo [departureJd, arrivalJd] cae por completo dentro de la tabla local de efemérides lunares.
export function hasLunarCoverage(dataset, departureJd, arrivalJd) {
  const rows = dataset?.moons?.Luna?.rows;
  return Boolean(rows?.length && departureJd >= rows[0][0] && arrivalJd <= rows.at(-1)[0]);
}

// Resuelvo el sistema lineal 3×3 del método de tiro (Jacobiano numérico) mediante eliminación gaussiana con pivoteo parcial.
function solve3(matrix, vector) {
  const rows = matrix.map((row, i) => [...row, vector[i]]);
  for (let column = 0; column < 3; column++) {
    let pivot = column;
    for (let i = column + 1; i < 3; i++) if (Math.abs(rows[i][column]) > Math.abs(rows[pivot][column])) pivot = i;
    if (Math.abs(rows[pivot][column]) < 1e-9) throw Error('El problema de apuntado lunar está mal condicionado.');
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const scale = rows[column][column];
    for (let j = column; j < 4; j++) rows[column][j] /= scale;
    for (let i = 0; i < 3; i++) if (i !== column) {
      const factor = rows[i][column];
      for (let j = column; j < 4; j++) rows[i][j] -= factor * rows[column][j];
    }
  }
  return rows.map(row => row[3]);
}

// Construyo la derivada geocéntrica Tierra–Luna (atracción terrestre, lunar directa y término indirecto lunar).
export function restrictedDerivative(dataset, departureJd) {
  return (seconds, state, out) => {
    const moon = queryMoon(dataset, 'Luna', advanceJdTdb(departureJd, seconds));
    if (!moon) throw Error('La integración requiere efemérides lunares fuera de cobertura.');
    const rEarth = Math.hypot(state[0], state[1], state[2]);
    const relative = [state[0] - moon.positionKm[0], state[1] - moon.positionKm[1], state[2] - moon.positionKm[2]];
    const rMoon = length(relative);
    if (rEarth <= EARTH_RADIUS_KM || rMoon <= MOON_RADIUS_KM) throw Error('La trayectoria intercepta un cuerpo; no se admite esta solución.');
    const earthFactor = -EARTH_MU_KM3_S2 / rEarth ** 3;
    const moonFactor = -MOON_MU_KM3_S2 / rMoon ** 3;
    const indirectFactor = -MOON_MU_KM3_S2 / moon.distanceKm ** 3;
    for (let i = 0; i < 3; i++) {
      out[i] = state[i + 3];
      out[i + 3] = earthFactor * state[i] + moonFactor * relative[i] + indirectFactor * moon.positionKm[i];
    }
  };
}

// Propago un estado cartesiano de 6 componentes [r, v] con DOPRI54 entre startSeconds y targetSeconds.
function propagate(derivative, initialState, startSeconds, targetSeconds, recordSteps = false, maxStepSeconds = 3600) {
  const result = integrateDopri54({ derivative, initialState, startSeconds, targetSeconds,
    initialStepSeconds: 300, maxStepSeconds,
    absTol: [1e-5, 1e-5, 1e-5, 1e-8, 1e-8, 1e-8], relTol: 1e-11, recordSteps });
  if (result.aborted) throw Error(`Integración orbital incompleta: ${result.abortReason}.`);
  return result;
}

// Uso la elipse de Hohmann como semilla inicial para la corrección de tiro numérica:
// propago la solución final con gravedad terrestre y lunar (término indirecto incluido) apuntando a la Luna futura,
// eligiendo la fase y el plano óptimos de la órbita de estacionamiento (no una fase observada de antemano).
export function calculateLunarTransfer({ dataset, departureJd, altitudeKm, target = 'approach', targetDistanceKm = target === 'flyby' ? 20000 : 50000 }) {
  if (!Number.isFinite(departureJd) || !Number.isFinite(altitudeKm) || altitudeKm < 200 || altitudeKm > 150000) {
    throw Error('Fecha TDB o altitud fuera del intervalo de planificación (200–150 000 km).');
  }
  if (!['approach', 'flyby'].includes(target)) throw Error('Objetivo lunar desconocido.');
  const range = target === 'flyby' ? [5000, 25000] : [30000, 100000];
  if (!Number.isFinite(targetDistanceKm) || targetDistanceKm < range[0] || targetDistanceKm > range[1]) {
    throw Error(`Distancia lunar nominal fuera del rango ${range[0]}–${range[1]} km.`);
  }
  if (!queryMoon(dataset, 'Luna', departureJd)) throw Error('La salida no está cubierta por las efemérides lunares locales.');
  const parkingRadiusKm = EARTH_RADIUS_KM + altitudeKm;
  // Uso `standoffKm` como distancia geométrica de apuntado; la propagación posterior incluye la atracción lunar real.
  const standoffKm = targetDistanceKm;
  let arrivalJd = advanceJdTdb(departureJd, 4.5 * 86400);
  let moon, apogeeKm, semiMajorKm, flightSeconds;
  for (let iteration = 0; iteration < 24; iteration++) {
    moon = queryMoon(dataset, 'Luna', arrivalJd);
    if (!moon) throw Error('La llegada queda fuera de la cobertura lunar; elige una salida anterior.');
    apogeeKm = moon.distanceKm - standoffKm;
    if (apogeeKm <= parkingRadiusKm + 1000) throw Error('La órbita inicial no permite la transferencia elíptica seleccionada.');
    semiMajorKm = (parkingRadiusKm + apogeeKm) / 2;
    flightSeconds = Math.PI * Math.sqrt(semiMajorKm ** 3 / EARTH_MU_KM3_S2);
    const candidate = advanceJdTdb(departureJd, flightSeconds);
    if (!hasLunarCoverage(dataset, departureJd, candidate)) throw Error('La transferencia completa excede la cobertura lunar local.');
    if (Math.abs(candidate - arrivalJd) * 86400 < 0.01) { arrivalJd = candidate; break; }
    arrivalJd = candidate;
    if (iteration === 23) throw Error('No converge el tiempo de transferencia con las efemérides disponibles.');
  }
  moon = queryMoon(dataset, 'Luna', arrivalJd);
  apogeeKm = moon.distanceKm - standoffKm;
  semiMajorKm = (parkingRadiusKm + apogeeKm) / 2;
  flightSeconds = Math.PI * Math.sqrt(semiMajorKm ** 3 / EARTH_MU_KM3_S2);
  const radial = unit(moon.positionKm);
  const angular = cross(moon.positionKm, moon.velocityKmS);
  if (length(angular) < 1e-9) throw Error('No se puede definir un plano de transferencia lunar.');
  const tangentArrival = unit(cross(unit(angular), radial));
  const initialPosition = radial.map(x => -x * parkingRadiusKm);
  const speedCircular = Math.sqrt(EARTH_MU_KM3_S2 / parkingRadiusKm);
  const speedPerigee = Math.sqrt(EARTH_MU_KM3_S2 * (2 / parkingRadiusKm - 1 / semiMajorKm));
  const initialVelocity = tangentArrival.map(x => -x * speedPerigee);
  const targetPosition = radial.map(x => x * apogeeKm);
  const derivative = restrictedDerivative(dataset, departureJd);
  const arrivalError = velocity => {
    const run = propagate(derivative, [...initialPosition, ...velocity], 0, flightSeconds);
    return Array.from(run.finalState.slice(0, 3)).map((x, i) => targetPosition[i] - x);
  };
  let aimedVelocity = [...initialVelocity];
  let residual = arrivalError(aimedVelocity);
  // Itero por Newton–Raphson amortiguado sobre la velocidad inicial hasta reducir el error de llegada a menos de 2 km.
  for (let iteration = 0; iteration < 12 && length(residual) > 2; iteration++) {
    const epsilon = 1e-5;
    const columns = [];
    for (let axis = 0; axis < 3; axis++) {
      const trial = [...aimedVelocity]; trial[axis] += epsilon;
      const perturbed = arrivalError(trial);
      columns.push(perturbed.map((value, i) => (residual[i] - value) / epsilon));
    }
    const correction = solve3([0, 1, 2].map(row => columns.map(column => column[row])), residual);
    let improved = false;
    for (const factor of [1, 0.5, 0.25, 0.125, 0.0625]) {
      const candidate = aimedVelocity.map((value, i) => value + correction[i] * factor);
      try {
        const candidateResidual = arrivalError(candidate);
        if (length(candidateResidual) < length(residual)) {
          aimedVelocity = candidate; residual = candidateResidual; improved = true; break;
        }
      } catch { /* Pruebo un factor menor por si este paso interceptó un cuerpo. */ }
    }
    if (!improved) throw Error('No converge el apuntado hacia la Luna con este modelo.');
  }
  if (length(residual) > 2) throw Error(`El apuntado lunar no alcanza la precisión requerida (${length(residual).toFixed(1)} km).`);
  const integration = propagate(derivative, [...initialPosition, ...aimedVelocity], 0, flightSeconds, true);
  const arrivalState = Array.from(integration.finalState);
  const missKm = length(arrivalState.slice(0, 3).map((x, i) => x - targetPosition[i]));
  const relativeVelocity = arrivalState.slice(3).map((x, i) => x - moon.velocityKmS[i]);
  const arrivalSeparationKm = length(arrivalState.slice(0, 3).map((x, i) => x - moon.positionKm[i]));
  const trajectory = integration.knots.states.map((state, i) => ({
    elapsedSeconds: integration.knots.times[i],
    jdTdb: advanceJdTdb(departureJd, integration.knots.times[i]),
    positionKm: Array.from(state.slice(0, 3)), velocityKmS: Array.from(state.slice(3, 6)),
    moonPositionKm: queryMoon(dataset, 'Luna', advanceJdTdb(departureJd, integration.knots.times[i])).positionKm
  }));
  let closestApproach = { elapsedSeconds: flightSeconds, jdTdb: arrivalJd, distanceKm: arrivalSeparationKm,
    positionKm: arrivalState.slice(0, 3), velocityKmS: arrivalState.slice(3) };
  if (target === 'flyby') for (const point of trajectory) {
    const distanceKm = length(point.positionKm.map((x, i) => x - point.moonPositionKm[i]));
    if (distanceKm < closestApproach.distanceKm) closestApproach = {
      elapsedSeconds: point.elapsedSeconds, jdTdb: point.jdTdb,
      distanceKm, positionKm: point.positionKm, velocityKmS: point.velocityKmS
    };
  }
  let flybyResolved = false;
  if (target === 'flyby') {
    // Extiendo la propagación un día adicional tras la llegada para resolver el paso mínimo y la salida del sobrevuelo.
    const postEnd = advanceJdTdb(arrivalJd, 86400);
    if (!hasLunarCoverage(dataset, departureJd, postEnd)) throw Error('El sobrevuelo requiere un día adicional de efemérides tras la llegada.');
    const post = propagate(derivative, arrivalState, flightSeconds, flightSeconds + 86400, true, 300);
    for (let i = 1; i < post.knots.states.length; i++) {
      const state = post.knots.states[i];
      const jd = advanceJdTdb(departureJd, post.knots.times[i]);
      const lunarState = queryMoon(dataset, 'Luna', jd);
      const distanceKm = length(Array.from(state.slice(0, 3)).map((x, axis) => x - lunarState.positionKm[axis]));
      if (distanceKm < closestApproach.distanceKm) closestApproach = {
        elapsedSeconds: post.knots.times[i], jdTdb: jd, distanceKm,
        positionKm: Array.from(state.slice(0, 3)), velocityKmS: Array.from(state.slice(3))
      };
      trajectory.push({ elapsedSeconds: post.knots.times[i], jdTdb: jd,
        positionKm: Array.from(state.slice(0, 3)), velocityKmS: Array.from(state.slice(3)), moonPositionKm: lunarState.positionKm });
    }
    const postFinal = trajectory.at(-1);
    const moonFinal = queryMoon(dataset, 'Luna', postFinal.jdTdb);
    const finalDistance = length(postFinal.positionKm.map((x, i) => x - moonFinal.positionKm[i]));
    flybyResolved = closestApproach.jdTdb >= arrivalJd
      && closestApproach.distanceKm > MOON_RADIUS_KM && closestApproach.distanceKm < 25000
      && finalDistance > closestApproach.distanceKm + 1000;
  }
  const moonRelativeEnergyKm2S2 = dot(relativeVelocity, relativeVelocity) / 2
    - MOON_MU_KM3_S2 / arrivalSeparationKm;
  const circularVelocity = tangentArrival.map(x => -x * speedCircular);
  return {
    model: TRANSFER_MODEL_VERSION, departureJd, arrivalJd, flightSeconds,
    altitudeKm, target, standoffKm, parkingRadiusKm, apogeeKm,
    departureDeltaVMS: length(aimedVelocity.map((x, i) => x - circularVelocity[i])) * 1000,
    circularSpeedKmS: speedCircular, transferSpeedKmS: speedPerigee,
    initialPositionKm: initialPosition, initialVelocityKmS: aimedVelocity, circularVelocityKmS: circularVelocity,
    arrivalPositionKm: arrivalState.slice(0, 3), arrivalVelocityKmS: arrivalState.slice(3),
    moonArrivalPositionKm: moon.positionKm, moonArrivalVelocityKmS: moon.velocityKmS,
    arrivalSeparationKm, relativeArrivalSpeedKmS: length(relativeVelocity), moonRelativeEnergyKm2S2,
    integrationMissKm: missKm, closestApproach, flybyResolved, trajectory,
    limitations: [
      'Fase y plano de órbita inicial elegidos para la transferencia; no se conoce una fase real de la sonda.',
      'Propagación restringida Tierra–Luna con efeméride lunar; omite Sol, otros cuerpos, presión de radiación, errores de navegación y empuje finito.',
      target === 'flyby' ? 'La distancia mínima muestreada procede de un día de propagación posterior (pasos de hasta 300 s); no representa captura, aterrizaje ni éxito completo.' : 'La aproximación es un encuentro geométrico dentro del modelo; no incluye captura lunar.'
    ]
  };
}
