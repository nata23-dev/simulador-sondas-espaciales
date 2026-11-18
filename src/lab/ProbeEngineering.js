import { getComponent } from './ComponentCatalog.js';
import { validateDesign } from './ProbeDesign.js';

// Aceleración normal convencional, no gravedad local del cuerpo central.
// NIST SP 811, B.9: https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b9
export const STANDARD_GRAVITY_M_S2 = 9.80665;

export function calculateEngineering(design) {
  const structuralIssues = validateDesign(design);
  const core = getComponent(design.coreId);
  const mounted = design.parts.map(entry => ({ entry, component: getComponent(entry.componentId) })).filter(item => item.component);
  const dryMassKg = (core?.dryMassKg ?? 0) + mounted.reduce((n, item) => n + item.component.dryMassKg, 0);
  const tanks = mounted.filter(item => item.component.category === 'tank');
  const engines = mounted.filter(item => item.component.category === 'engine');
  const fuelCapacityKg = tanks.reduce((n, item) => n + item.component.fuelCapacityKg, 0);
  const fuelKg = tanks.reduce((n, item) => n + item.entry.fuelKg, 0);
  const wetMassKg = dryMassKg + fuelKg;
  const generationW = mounted.reduce((n, item) => n + item.component.generationW, 0);
  const idlePowerW = mounted.reduce((n, item) => n + item.component.idlePowerW, 0);
  const activePowerW = mounted.reduce((n, item) => n + item.component.activePowerW, 0);
  const batteryWh = mounted.reduce((n, item) => n + item.component.batteryWh, 0);
  const enginePropellant = engines[0]?.component.propellant;
  const compatible = Boolean(enginePropellant && engines.every(item => item.component.propellant === enginePropellant)
    && tanks.length && tanks.every(item => item.component.propellant === enginePropellant));
  const thrustN = compatible ? engines.reduce((n, item) => n + item.component.thrustN, 0) : null;
  const effectiveIspS = thrustN > 0
    ? thrustN / engines.reduce((n, item) => n + item.component.thrustN / item.component.ispS, 0) : null;
  const deltaVMS = compatible && fuelKg > 0 && dryMassKg > 0 && effectiveIspS > 0 && !structuralIssues.length
    ? STANDARD_GRAVITY_M_S2 * effectiveIspS * Math.log(wetMassKg / dryMassKg) : null;
  const netIdleW = generationW - idlePowerW;
  const autonomyHours = idlePowerW > generationW && batteryWh > 0
    ? batteryWh / (idlePowerW - generationW) : null;
  const notes = [...structuralIssues];
  if (!core) notes.push('Selecciona una estructura para iniciar el ensamblaje.');
  if (!engines.length) notes.push('Delta-v no disponible: falta un motor.');
  else if (!tanks.length) notes.push('Delta-v no disponible: falta un tanque compatible.');
  else if (!compatible) notes.push('Delta-v no disponible: motor y tanque incompatibles.');
  else if (!fuelKg) notes.push('Delta-v no disponible: el tanque está vacío.');
  if (idlePowerW > generationW && !batteryWh) notes.push('Sin batería para cubrir el déficit eléctrico.');
  if (idlePowerW <= generationW) notes.push('Autonomía por batería no disponible: no existe déficit de potencia en reposo bajo la iluminación nominal asumida.');
  else if (!batteryWh) notes.push('Autonomía por batería no disponible: falta capacidad energética.');
  if (generationW > 0) notes.push('Potencia solar nominal a 1 AU con iluminación directa; sombra, orientación y distancia no calculadas.');
  if (engines.some(item => item.component.activePowerW > 0) && generationW < activePowerW + idlePowerW) {
    notes.push('La potencia nominal no basta para operar todos los equipos activos; no se calcula tiempo de encendido.');
  }
  return { structuralIssues, dryMassKg, wetMassKg, fuelCapacityKg, fuelKg, thrustN,
    effectiveIspS, deltaVMS, generationW, idlePowerW, activePowerW,
    batteryWh, netIdleW, autonomyHours, notes };
}
