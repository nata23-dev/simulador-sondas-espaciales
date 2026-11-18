// Etapa 12F — cálculo de un descenso a partir del destino (perfil del registro), la sonda del Hangar como carga útil y un módulo de aterrizaje.
// Guarda la firma que permite invalidar el resultado cuando cambian destino, vehículo, órbita, masa, motor, combustible o perfil de descenso.
import { designSignature } from './MissionPlanStore.js';
import { getBodyProfile, landingCapability, CAPABILITY } from './CelestialBodyMissionRegistry.js';
import { LANDING_MODEL_VERSION, simulateLanding, validateLandingOptions } from './BodyLandingSimulation.js';
import { payloadFromDesign, validateLander } from './BodyLandingVehicle.js';
import { validateInitialOrbit, createLandingEnvironment } from './BodyLandingDynamics.js';

export const landingKey = (bodyId, lander, options) => JSON.stringify({ bodyId, lander, options });

export function validateLandingInputs({ bodyId, design, lander, options }) {
  const issues = [];
  let profile = null;
  try { profile = getBodyProfile(bodyId); } catch (error) { return [error.message]; }
  const capability = landingCapability(profile);
  if (![CAPABILITY.operational, CAPABILITY.experimental].includes(capability.state)) return [capability.reason];
  if (!design) issues.push('No hay una sonda seleccionada en el Hangar.');
  else issues.push(...payloadFromDesign(design).issues);
  issues.push(...validateLander(lander), ...validateLandingOptions(options));
  if (options?.orbit) issues.push(...validateInitialOrbit(createLandingEnvironment(profile), options.orbit));
  return issues;
}

export function calculateLanding({ bodyId, design, lander, options }) {
  const issues = validateLandingInputs({ bodyId, design, lander, options });
  if (issues.length) throw Error(issues.join(' '));
  const payload = payloadFromDesign(design), profile = getBodyProfile(bodyId);
  const simulation = simulateLanding({ profile, lander, payloadMassKg: payload.massKg, options });
  return Object.freeze({ kind: 'landing', model: LANDING_MODEL_VERSION, bodyId, designSignature: payload.designSignature, payload, key: landingKey(bodyId, lander, options), simulation, status: simulation.outcome });
}
export function isLandingResultCurrent(result, design, bodyId, lander, options) {
  return Boolean(result && design && result.model === LANDING_MODEL_VERSION && result.designSignature === designSignature(design) && result.key === landingKey(bodyId, lander, options));
}
