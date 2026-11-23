// En este módulo planifico y valido el cálculo de un descenso propulsado a partir del perfil del cuerpo destino,
// la sonda diseñada en el Hangar como carga útil y el módulo de aterrizaje elegido.
// También construyo la firma que me permite invalidar resultados guardados cuando cambia el destino, el vehículo,
// la órbita inicial, las masas, el motor, el propelente o los parámetros de guiado.
import { designSignature } from './MissionPlanStore.js';
import { getBodyProfile, landingCapability, CAPABILITY } from './CelestialBodyMissionRegistry.js';
import { LANDING_MODEL_VERSION, simulateLanding, validateLandingOptions } from './BodyLandingSimulation.js';
import { payloadFromDesign, validateLander } from './BodyLandingVehicle.js';
import { validateInitialOrbit, createLandingEnvironment } from './BodyLandingDynamics.js';

// Genero una clave determinista con los parámetros del descenso para detectar cambios de configuración.
export const landingKey = (bodyId, lander, options) => JSON.stringify({ bodyId, lander, options });

// Valido que el destino soporte descenso propulsado y que la sonda, el módulo y la órbita inicial sean coherentes.
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

// Ejecuto la validación completa y lanzo la simulación numérica de descenso, devolviendo un resultado inmutable.
export function calculateLanding({ bodyId, design, lander, options }) {
  const issues = validateLandingInputs({ bodyId, design, lander, options });
  if (issues.length) throw Error(issues.join(' '));
  const payload = payloadFromDesign(design), profile = getBodyProfile(bodyId);
  const simulation = simulateLanding({ profile, lander, payloadMassKg: payload.massKg, options });
  return Object.freeze({ kind: 'landing', model: LANDING_MODEL_VERSION, bodyId, designSignature: payload.designSignature, payload, key: landingKey(bodyId, lander, options), simulation, status: simulation.outcome });
}

// Compruebo si un resultado previo sigue vigente respecto al modelo físico, la firma de la sonda y la configuración actual.
export function isLandingResultCurrent(result, design, bodyId, lander, options) {
  return Boolean(result && design && result.model === LANDING_MODEL_VERSION && result.designSignature === designSignature(design) && result.key === landingKey(bodyId, lander, options));
}
