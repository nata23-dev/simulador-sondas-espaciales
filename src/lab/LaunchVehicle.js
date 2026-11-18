// Etapa 12E — cohete lanzador y carga útil. Los parámetros del lanzador son ILUSTRATIVOS y se mantienen
// separados de las especificaciones de las sondas (ComponentCatalog.js). No corresponden a ningún cohete real.
import { calculateEngineering } from './ProbeEngineering.js';
import { designSignature } from './MissionPlanStore.js';
import { EARTH_GM_KM3_S2, STANDARD_GRAVITY_M_S2, WGS84_A_KM } from './LaunchEarth.js';
import { SEA_LEVEL_PRESSURE_PA } from './LaunchAtmosphere.js';

// Cada etapa: masa estructural seca (kg), propelente (kg), empuje al nivel del mar y en vacío (N),
// impulso específico en vacío (s), área de referencia (m²) y coeficiente de arrastre Cd (constante).
// Flujo másico ṁ = F_vac/(Isp_vac·g0), constante; el empuje y el Isp efectivos dependen de la presión ambiente:
//   F(p) = F_vac − (F_vac − F_SL)·p/p0   →   Isp(p) = F(p)/(ṁ·g0)
export const DEMO_LAUNCHER = Object.freeze({
  id: 'demo-two-stage-v1', name: 'Lanzador demostrativo de dos etapas',
  provenance: 'Parámetros ilustrativos para pruebas y entrenamiento; no corresponden a un cohete real ni a una fuente verificada.',
  stages: Object.freeze([
    Object.freeze({ id: 'stage-1', name: 'Etapa 1', structuralMassKg: 6000, propellantMassKg: 80000, thrustSeaLevelN: 1450000, thrustVacuumN: 1600000,
      ispVacuumS: 310, referenceAreaM2: 7.1, dragCoefficient: 0.3 }),
    Object.freeze({ id: 'stage-2', name: 'Etapa 2', structuralMassKg: 1800, propellantMassKg: 15000, thrustSeaLevelN: 160000, thrustVacuumN: 190000,
      ispVacuumS: 350, referenceAreaM2: 7.1, dragCoefficient: 0.3 })
  ]),
  separation: Object.freeze({ coastAfterCutoffSeconds: 2, ignitionDelaySeconds: 4, separationImpulseMS: 0 })
});

export const massFlowKgS = stage => stage.thrustVacuumN / (stage.ispVacuumS * STANDARD_GRAVITY_M_S2);
export function thrustAt(stage, pressurePa) {
  const ratio = Math.min(1, Math.max(0, pressurePa / SEA_LEVEL_PRESSURE_PA));
  return stage.thrustVacuumN - (stage.thrustVacuumN - stage.thrustSeaLevelN) * ratio;
}
export const ispAt = (stage, pressurePa) => thrustAt(stage, pressurePa) / (massFlowKgS(stage) * STANDARD_GRAVITY_M_S2);

export function validateLauncher(launcher) {
  const issues = [];
  if (!launcher || !Array.isArray(launcher.stages) || launcher.stages.length < 1 || launcher.stages.length > 2) return ['El lanzador necesita una o dos etapas.'];
  launcher.stages.forEach((stage, i) => {
    const label = `Etapa ${i + 1}`;
    for (const key of ['structuralMassKg', 'propellantMassKg', 'thrustVacuumN', 'ispVacuumS', 'referenceAreaM2']) {
      if (!Number.isFinite(stage[key]) || stage[key] <= 0) issues.push(`${label}: ${key} debe ser finito y positivo.`);
    }
    if (!Number.isFinite(stage.thrustSeaLevelN) || stage.thrustSeaLevelN < 0) issues.push(`${label}: thrustSeaLevelN inválido.`);
    else if (stage.thrustSeaLevelN > stage.thrustVacuumN) issues.push(`${label}: el empuje a nivel del mar no puede superar el de vacío.`);
    if (!Number.isFinite(stage.dragCoefficient) || stage.dragCoefficient < 0 || stage.dragCoefficient > 5) issues.push(`${label}: coeficiente de arrastre fuera de 0–5.`);
  });
  const sep = launcher.separation;
  if (!sep || ![sep.coastAfterCutoffSeconds, sep.ignitionDelaySeconds, sep.separationImpulseMS].every(Number.isFinite) || sep.coastAfterCutoffSeconds < 0 || sep.ignitionDelaySeconds < 0) issues.push('Secuencia de separación inválida.');
  else if (sep.separationImpulseMS !== 0) issues.push('El impulso de separación no está soportado en esta etapa (debe ser 0): la separación conserva posición y velocidad.');
  return issues;
}

// La carga útil es la sonda del Hangar con su masa húmeda real (seca + propelente cargado).
export function payloadFromDesign(design) {
  const engineering = calculateEngineering(design);
  const issues = [...engineering.structuralIssues];
  if (!(engineering.dryMassKg > 0)) issues.push('La sonda no tiene masa: selecciona una estructura.');
  return { name: design.name, designId: design.id, designSignature: designSignature(design), massKg: engineering.wetMassKg,
    dryMassKg: engineering.dryMassKg, fuelKg: engineering.fuelKg, issues };
}

export const stackMassKg = (launcher, payloadMassKg, fromStage = 0) =>
  payloadMassKg + launcher.stages.slice(fromStage).reduce((n, s) => n + s.structuralMassKg + s.propellantMassKg, 0);

// Relación empuje-peso al despegue con la gravedad local (GM/r², r = distancia al centro de la Tierra).
export function liftoffThrustToWeight(launcher, payloadMassKg, radiusKm = WGS84_A_KM) {
  const g = EARTH_GM_KM3_S2 / radiusKm ** 2 * 1000; // m/s²
  return launcher.stages[0].thrustSeaLevelN / (stackMassKg(launcher, payloadMassKg) * g);
}
