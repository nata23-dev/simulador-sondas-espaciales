// Etapa 12E — cálculo del lanzamiento a partir de la sonda del Hangar (carga útil con su masa húmeda real),
// un lanzador editable y las condiciones de ascenso. Guarda la firma que permite detectar resultados obsoletos.
import { designSignature } from './MissionPlanStore.js';
import { LAUNCH_MODEL_VERSION, simulateLaunch, validateLaunchOptions } from './LaunchSimulation.js';
import { payloadFromDesign, validateLauncher } from './LaunchVehicle.js';

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
export function isLaunchResultCurrent(result, design, launcher, options) {
  return Boolean(result && design && result.model === LAUNCH_MODEL_VERSION && result.designSignature === designSignature(design) && result.key === launchKey(launcher, options));
}
