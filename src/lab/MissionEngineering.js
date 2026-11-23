// Aquí evalúo la viabilidad ingenieril de una misión lunar a partir del diseño de la sonda y de la transferencia.
// Calculo el consumo propulsivo por maniobra mediante la ecuación de Tsiolkovski (kg, s, N, m/s) y compruebo
// márgenes de propelente, validez de la aproximación impulsiva y presupuesto eléctrico (W y Wh).
import { getComponent } from './ComponentCatalog.js';
import { calculateEngineering, STANDARD_GRAVITY_M_S2 } from './ProbeEngineering.js';
import { EARTH_MU_KM3_S2 } from './MissionPhysics.js';

// Simulo secuencialmente el consumo de propelente (kg) y la duración de encendido (s) para una lista de impulsos Δv (m/s).
export function consumeManeuvers({ dryMassKg, fuelKg, ispS, thrustN, deltaVMS }) {
  if (![dryMassKg, fuelKg, ispS, thrustN].every(Number.isFinite) || dryMassKg <= 0 || fuelKg < 0 || ispS <= 0 || thrustN <= 0
    || !Array.isArray(deltaVMS) || deltaVMS.some(value => !Number.isFinite(value) || value < 0)) throw Error('Parámetros propulsivos inválidos.');
  let massKg = dryMassKg + fuelKg;
  let sequenceExecutable = true;
  const maneuvers = deltaVMS.map((deltaV, index) => {
    const massBeforeKg = massKg;
    const massAfterIdealKg = massBeforeKg / Math.exp(deltaV / (STANDARD_GRAVITY_M_S2 * ispS));
    const fuelRequiredKg = massBeforeKg - massAfterIdealKg;
    const availableFuelKg = Math.max(0, massBeforeKg - dryMassKg);
    const executable = sequenceExecutable && fuelRequiredKg <= availableFuelKg + 1e-9;
    if (!executable) sequenceExecutable = false;
    const fuelConsumedKg = executable ? Math.min(availableFuelKg, fuelRequiredKg) : 0;
    if (executable) massKg = massBeforeKg - fuelConsumedKg;
    return {
      index, deltaVMS: deltaV, massBeforeKg, fuelRequiredKg,
      fuelConsumedKg, massAfterKg: massKg,
      fuelRemainingKg: Math.max(0, massKg - dryMassKg),
      burnSeconds: executable ? fuelConsumedKg * ispS * STANDARD_GRAVITY_M_S2 / thrustN : null,
      executable
    };
  });
  return { maneuvers, finalMassKg: massKg, fuelRemainingKg: Math.max(0, massKg - dryMassKg) };
}

// Evalúo si la sonda puede ejecutar la inyección lunar verificando estructura, propulsión, fracción de periodo orbital y energía.
export function evaluateMission(design, transfer) {
  const engineering = calculateEngineering(design);
  const reasons = [];
  if (engineering.structuralIssues.length) reasons.push(...engineering.structuralIssues);
  if (!engineering.thrustN || !engineering.effectiveIspS || !engineering.fuelKg) reasons.push('Falta propulsión y propelente compatibles con combustible disponible.');
  const engine = design.parts.find(part => getComponent(part.componentId)?.category === 'engine');
  const engineSpec = getComponent(engine?.componentId);
  if (engineSpec?.propellant === 'xenon') reasons.push('El motor iónico no se ha validado para una inyección impulsiva desde órbita terrestre; requiere propagación de empuje finito y potencia continua.');
  if (transfer.target === 'flyby' && !transfer.flybyResolved) reasons.push('El tramo posterior no demuestra un sobrevuelo lunar seguro dentro de 25 000 km de distancia mínima.');
  const availableDeltaVMS = engineering.deltaVMS;
  const budget = engineering.thrustN && engineering.effectiveIspS && engineering.fuelKg && !engineering.structuralIssues.length
    ? consumeManeuvers({ dryMassKg: engineering.dryMassKg, fuelKg: engineering.fuelKg,
      ispS: engineering.effectiveIspS, thrustN: engineering.thrustN,
      deltaVMS: [transfer.departureDeltaVMS] }) : null;
  const maneuver = budget?.maneuvers[0] ?? null;
  const remainingDeltaVMS = maneuver?.executable
    ? STANDARD_GRAVITY_M_S2 * engineering.effectiveIspS * Math.log(budget.finalMassKg / engineering.dryMassKg)
    : null;
  if (maneuver && !maneuver.executable) reasons.push(`Combustible insuficiente: requiere ${maneuver.fuelRequiredKg.toFixed(1)} kg y dispone de ${engineering.fuelKg.toFixed(1)} kg.`);
  // Comparo el tiempo de encendido con el periodo de la órbita de estacionamiento para validar la hipótesis impulsiva.
  const parkingPeriodSeconds = 2 * Math.PI * Math.sqrt(transfer.parkingRadiusKm ** 3 / EARTH_MU_KM3_S2);
  const burnFraction = maneuver?.burnSeconds == null ? null : maneuver.burnSeconds / parkingPeriodSeconds;
  if (burnFraction != null && burnFraction > 0.1) reasons.push('Encendido demasiado largo para la aproximación impulsiva (>10 % del período orbital inicial); falta modelar empuje finito.');
  // Verifico que la generación nominal y la batería cubran tanto el pico durante el encendido como el crucero en reposo.
  const requiredPowerW = engineering.idlePowerW + (engineSpec?.activePowerW ?? 0);
  const burnHours = (maneuver?.burnSeconds ?? 0) / 3600;
  const energyShortfallWh = Math.max(0, requiredPowerW - engineering.generationW) * burnHours;
  if (maneuver?.executable && energyShortfallWh > engineering.batteryWh + 1e-8) reasons.push('Energía insuficiente para el encendido bajo potencia solar nominal y batería disponibles.');
  if (engineering.idlePowerW > engineering.generationW && engineering.batteryWh < (engineering.idlePowerW - engineering.generationW) * transfer.flightSeconds / 3600) {
    reasons.push('Energía insuficiente para mantener el consumo en reposo durante el crucero bajo potencia nominal.');
  }
  const fuelOrPowerInsufficient = reasons.some(reason => /insuficiente|Falta propulsión|incompatib|estructura/i.test(reason));
  const status = fuelOrPowerInsufficient ? 'INSUFICIENTE' : reasons.length ? 'NO VERIFICABLE' : 'VIABLE SEGÚN EL MODELO';
  return {
    status, reasons, engineering, availableDeltaVMS, requiredDeltaVMS: transfer.departureDeltaVMS,
    budget, remainingDeltaVMS, parkingPeriodSeconds, burnFraction, requiredPowerW, energyShortfallWh,
    interpretation: 'El estado evalúa la inyección terrestre ideal; no certifica sobrevuelo, captura lunar ni éxito de misión.'
  };
}
