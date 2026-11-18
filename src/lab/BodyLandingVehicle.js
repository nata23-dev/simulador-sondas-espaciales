// Etapa 12F — módulo de aterrizaje. Parámetros ILUSTRATIVOS (no corresponden a un vehículo real).
// Se distinguen: carga útil (la sonda del Hangar, con su masa húmeda real), estructura del módulo (cuerpo, depósitos,
// patas), sistema de propulsión (empuje, Isp, estrangulamiento) y propelente del módulo. El propelente de la sonda del
// Hangar NO se usa durante el descenso: viaja como masa de carga útil.
import { calculateEngineering } from './ProbeEngineering.js';
import { designSignature } from './MissionPlanStore.js';

export const STANDARD_GRAVITY_M_S2 = 9.80665; // NIST SP 811 B.9, definición de Isp en segundos

export const DEMO_LANDER = Object.freeze({
  id: 'demo-lander-v1', name: 'Módulo de aterrizaje demostrativo',
  provenance: 'Especificaciones ilustrativas y plausibles para pruebas y entrenamiento (orden de magnitud de un módulo bipropelente de aterrizaje lunar). No es un vehículo real ni una fuente verificada. No altera el catálogo de motores del Hangar.',
  structure: Object.freeze({ busKg: 900, tankageKg: 350, landingGearKg: 250 }),
  propellantMassKg: 4200,
  engine: Object.freeze({ name: 'Motor de descenso estrangulable (ilustrativo)', thrustMaxN: 16000, ispS: 311, throttleable: true, throttleMin: 0.1, restartable: true })
});

export const landerStructuralMassKg = lander => lander.structure.busKg + lander.structure.tankageKg + lander.structure.landingGearKg;
export const massFlowAtThrottle = (engine, throttle) => throttle * engine.thrustMaxN / (engine.ispS * STANDARD_GRAVITY_M_S2);

export function validateLander(lander) {
  const issues = [];
  if (!lander?.structure || !lander.engine) return ['El módulo necesita estructura y motor.'];
  for (const key of ['busKg', 'tankageKg', 'landingGearKg']) if (!Number.isFinite(lander.structure[key]) || lander.structure[key] < 0) issues.push(`structure.${key} debe ser finito y no negativo.`);
  if (!(landerStructuralMassKg(lander) > 0)) issues.push('La masa seca del módulo debe ser positiva.');
  if (!Number.isFinite(lander.propellantMassKg) || lander.propellantMassKg < 0) issues.push('El propelente debe ser finito y no negativo.');
  const e = lander.engine;
  if (!Number.isFinite(e.thrustMaxN) || e.thrustMaxN <= 0) issues.push('El empuje máximo debe ser positivo.');
  if (!Number.isFinite(e.ispS) || e.ispS <= 0) issues.push('El Isp debe ser positivo.');
  if (typeof e.throttleable !== 'boolean') issues.push('Debe declararse si el motor es estrangulable.');
  if (e.throttleable && !(Number.isFinite(e.throttleMin) && e.throttleMin > 0 && e.throttleMin <= 1)) issues.push('El acelerador mínimo debe estar en (0, 1].');
  return issues;
}

// Carga útil: sonda del Hangar con masa húmeda real (seca + propelente cargado).
export function payloadFromDesign(design) {
  const engineering = calculateEngineering(design);
  const issues = [...engineering.structuralIssues];
  if (!(engineering.dryMassKg > 0)) issues.push('La sonda no tiene masa: selecciona una estructura.');
  return { name: design.name, designId: design.id, designSignature: designSignature(design), massKg: engineering.wetMassKg, dryMassKg: engineering.dryMassKg, fuelKg: engineering.fuelKg, issues };
}

export const landerWetMassKg = (lander, payloadMassKg) => payloadMassKg + landerStructuralMassKg(lander) + lander.propellantMassKg;
