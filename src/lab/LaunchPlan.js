// Aquí coordino el cálculo de un lanzamiento terrestre tomando la sonda actual del Hangar (con su masa húmeda real),
// un lanzador configurable y las opciones de ascenso, y guardo firmas para detectar cuándo un resultado quedó obsoleto.
import { designSignature } from './MissionPlanStore.js';
import { LAUNCH_MODEL_VERSION, simulateLaunch, validateLaunchOptions } from './LaunchSimulation.js';
import { payloadFromDesign, validateLauncher } from './LaunchVehicle.js';
import { ORBIT_CLASSES } from './LaunchOrbit.js';

// Serializo la configuración relevante del lanzador y las opciones de vuelo para invalidar resultados si algo cambia.
export const launchKey = (launcher, options) => JSON.stringify({ launcher: { id: launcher.id, stages: launcher.stages, separation: launcher.separation }, options });

// Valido en conjunto la sonda elegida, el lanzador y los parámetros de ascenso antes de ejecutar la simulación.
export function validateLaunchInputs({ design, launcher, options }) {
  const issues = [];
  if (!design) issues.push('No hay una sonda seleccionada en el Hangar.');
  else issues.push(...payloadFromDesign(design).issues);
  issues.push(...validateLauncher(launcher), ...validateLaunchOptions(options));
  return issues;
}

// Calculo y empaqueto un resultado de lanzamiento inmutable asociado a la firma vigente de la sonda y del lanzador.
export function calculateLaunch({ design, launcher, options }) {
  const issues = validateLaunchInputs({ design, launcher, options });
  if (issues.length) throw Error(issues.join(' '));
  const payload = payloadFromDesign(design);
  const simulation = simulateLaunch({ launcher, payloadMassKg: payload.massKg, options });
  return Object.freeze({ kind: 'launch', model: LAUNCH_MODEL_VERSION, designSignature: payload.designSignature, payload,
    key: launchKey(launcher, options), simulation, status: simulation.orbit.classification });
}
/**
 * Aquí estimo por bisección la capacidad máxima de carga útil (kg) del lanzador bajo estas condiciones de ascenso,
 * reutilizando exactamente la misma simulación física del lanzamiento. El valor es orientativo porque la monotonía
 * se cumple en el programa de ascenso estándar pero no está garantizada para cualquier ley de guiado editada.
 */
export function estimatePayloadCapacityKg({ launcher, options, maxKg = 40000, toleranceKg = 25 }) {
  const reaches = massKg => simulateLaunch({ launcher, payloadMassKg: massKg, options }).orbit.classification === ORBIT_CLASSES.orbit;
  if (!reaches(1)) return 0;
  let lo = 1, hi = maxKg;
  if (reaches(hi)) return hi;
  while (hi - lo > toleranceKg) { const mid = (lo + hi) / 2; if (reaches(mid)) lo = mid; else hi = mid; }
  return lo;
}
// Compruebo si un resultado calculado sigue vigente para la versión del modelo, la sonda y los parámetros actuales.
export function isLaunchResultCurrent(result, design, launcher, options) {
  return Boolean(result && design && result.model === LAUNCH_MODEL_VERSION && result.designSignature === designSignature(design) && result.key === launchKey(launcher, options));
}
