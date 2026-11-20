// Etapa 12E — cálculo del lanzamiento a partir de la sonda del Hangar (carga útil con su masa húmeda real),
// un lanzador editable y las condiciones de ascenso. Guarda la firma que permite detectar resultados obsoletos.
import { designSignature } from './MissionPlanStore.js';
import { LAUNCH_MODEL_VERSION, simulateLaunch, validateLaunchOptions } from './LaunchSimulation.js';
import { payloadFromDesign, validateLauncher } from './LaunchVehicle.js';
import { ORBIT_CLASSES } from './LaunchOrbit.js';

export const launchKey = (launcher, options) => JSON.stringify({ launcher: { id: launcher.id, stages: launcher.stages, separation: launcher.separation }, options });

export function validateLaunchInputs({ design, launcher, options }) {
  const issues = [];
  if (!design) issues.push('No hay una sonda seleccionada en el Hangar.');
  else issues.push(...payloadFromDesign(design).issues);
  issues.push(...validateLauncher(launcher), ...validateLaunchOptions(options));
  return issues;
}

export function calculateLaunch({ design, launcher, options }) {
  const issues = validateLaunchInputs({ design, launcher, options });
  if (issues.length) throw Error(issues.join(' '));
  const payload = payloadFromDesign(design);
  const simulation = simulateLaunch({ launcher, payloadMassKg: payload.massKg, options });
  return Object.freeze({ kind: 'launch', model: LAUNCH_MODEL_VERSION, designSignature: payload.designSignature, payload,
    key: launchKey(launcher, options), simulation, status: simulation.orbit.classification });
}
/**
 * Etapa 16: capacidad estimada del lanzador con estas condiciones de ascenso: mayor carga que alcanza la órbita según el modelo,
 * por bisección (cada simulación es la misma que usa «Calcular lanzamiento»). Orientativa: el resultado es monótono en la
 * práctica para el programa de ascenso fijo, pero no se garantiza para cualquier guía editada.
 */
export function estimatePayloadCapacityKg({ launcher, options, maxKg = 40000, toleranceKg = 25 }) {
  const reaches = massKg => simulateLaunch({ launcher, payloadMassKg: massKg, options }).orbit.classification === ORBIT_CLASSES.orbit;
  if (!reaches(1)) return 0;
  let lo = 1, hi = maxKg;
  if (reaches(hi)) return hi;
  while (hi - lo > toleranceKg) { const mid = (lo + hi) / 2; if (reaches(mid)) lo = mid; else hi = mid; }
  return lo;
}
export function isLaunchResultCurrent(result, design, launcher, options) {
  return Boolean(result && design && result.model === LAUNCH_MODEL_VERSION && result.designSignature === designSignature(design) && result.key === launchKey(launcher, options));
}
