// Aquí defino los cohetes lanzadores demostrativos, sus relaciones propulsivas y el acoplamiento con la carga útil.
// Mantengo los parámetros ilustrativos del lanzador separados de los componentes reales de sondas (ComponentCatalog.js);
// no representan ningún cohete comercial o histórico concreto.
import { calculateEngineering } from './ProbeEngineering.js';
import { designSignature } from './MissionPlanStore.js';
import { EARTH_GM_KM3_S2, STANDARD_GRAVITY_M_S2, WGS84_A_KM } from './LaunchEarth.js';
import { SEA_LEVEL_PRESSURE_PA } from './LaunchAtmosphere.js';

// Cada etapa declara masa estructural seca (kg), propelente (kg), empuje a nivel del mar y en vacío (N),
// impulso específico en vacío (s), área de referencia (m²) y coeficiente de arrastre Cd (constante).
// Mantengo un flujo másico constante ṁ = F_vac/(Isp_vac·g0) y varío empuje e Isp con la presión ambiente:
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

// Escalo el lanzador demostrativo por un factor k para cubrir cargas pesadas (como sondas exteriores de varias toneladas):
// multiplico masas, empujes y caudal por k (conservando T/W, Isp y Cd) y el área frontal por k^(2/3), reduciendo el arrastre relativo.
export function scaleLauncher(launcher, k, { id, name } = {}) {
  if (!(k > 0) || !Number.isFinite(k)) throw new RangeError('El factor de escala del lanzador debe ser positivo.');
  const areaFactor = k ** (2 / 3);
  return Object.freeze({ ...launcher, id: id ?? `${launcher.id}-x${k}`, name: name ?? `${launcher.name} ×${k}`,
    provenance: `${launcher.provenance} Escala ×${k} del lanzador demostrativo (masas y empujes ×${k}, área ×${areaFactor.toFixed(3)}).`,
    stages: Object.freeze(launcher.stages.map(stage => Object.freeze({ ...stage, structuralMassKg: stage.structuralMassKg * k, propellantMassKg: stage.propellantMassKg * k,
      thrustSeaLevelN: stage.thrustSeaLevelN * k, thrustVacuumN: stage.thrustVacuumN * k, referenceAreaM2: Math.round(stage.referenceAreaM2 * areaFactor * 100) / 100 }))),
    separation: launcher.separation });
}
export const HEAVY_LAUNCHER_SCALE = 2.5;
export const HEAVY_DEMO_LAUNCHER = scaleLauncher(DEMO_LAUNCHER, HEAVY_LAUNCHER_SCALE, { id: 'demo-two-stage-heavy-v1', name: 'Lanzador demostrativo pesado (×2,5)' });
// Expongo los preajustes de lanzador con su capacidad orientativa a LEO (Cabo Cañaveral, acimut 90°, perigeo ≥ 160 km)
// estimada por bisección con este mismo modelo; cambia si se editan las etapas.
export const LAUNCHER_PRESETS = Object.freeze([
  Object.freeze({ id: DEMO_LAUNCHER.id, label: 'Ligero · demostrativo de dos etapas', launcher: DEMO_LAUNCHER, nominalCapacityKg: 2800 }),
  Object.freeze({ id: HEAVY_DEMO_LAUNCHER.id, label: 'Pesado · demostrativo ×2,5', launcher: HEAVY_DEMO_LAUNCHER, nominalCapacityKg: 6900 })
]);
/** Selecciono el preajuste más ligero cuya capacidad orientativa cubre la carga con un 10 % de margen (o el pesado si ninguno basta). */
export function recommendedLauncherPreset(payloadMassKg) {
  return LAUNCHER_PRESETS.find(preset => payloadMassKg * 1.1 <= preset.nominalCapacityKg) ?? LAUNCHER_PRESETS.at(-1);
}

// Calculo el flujo másico constante (kg/s), el empuje efectivo (N) y el impulso específico efectivo (s) a una presión dada (Pa).
export const massFlowKgS = stage => stage.thrustVacuumN / (stage.ispVacuumS * STANDARD_GRAVITY_M_S2);
export function thrustAt(stage, pressurePa) {
  const ratio = Math.min(1, Math.max(0, pressurePa / SEA_LEVEL_PRESSURE_PA));
  return stage.thrustVacuumN - (stage.thrustVacuumN - stage.thrustSeaLevelN) * ratio;
}
export const ispAt = (stage, pressurePa) => thrustAt(stage, pressurePa) / (massFlowKgS(stage) * STANDARD_GRAVITY_M_S2);

// Valido la coherencia física de las etapas y de la secuencia de separación de un lanzador.
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

// Extraigo la carga útil directamente de la sonda diseñada en el Hangar usando su masa húmeda real (seca + propelente).
export function payloadFromDesign(design) {
  const engineering = calculateEngineering(design);
  const issues = [...engineering.structuralIssues];
  if (!(engineering.dryMassKg > 0)) issues.push('La sonda no tiene masa: selecciona una estructura.');
  return { name: design.name, designId: design.id, designSignature: designSignature(design), massKg: engineering.wetMassKg,
    dryMassKg: engineering.dryMassKg, fuelKg: engineering.fuelKg, issues };
}

// Sumo la masa total (kg) de la carga útil y todas las etapas activas desde `fromStage` en adelante.
export const stackMassKg = (launcher, payloadMassKg, fromStage = 0) =>
  payloadMassKg + launcher.stages.slice(fromStage).reduce((n, s) => n + s.structuralMassKg + s.propellantMassKg, 0);

// Calculo la relación empuje/peso al despegue usando la gravedad local GM/r² (en m/s²).
export function liftoffThrustToWeight(launcher, payloadMassKg, radiusKm = WGS84_A_KM) {
  const g = EARTH_GM_KM3_S2 / radiusKm ** 2 * 1000; // Gravedad superficial local en m/s².
  return launcher.stages[0].thrustSeaLevelN / (stackMassKg(launcher, payloadMassKg) * g);
}
