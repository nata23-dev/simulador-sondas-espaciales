// En este módulo planifico y evalúo maniobras orbitales de empuje finito en el sistema restringido Tierra–Luna.
// Conecto la ingeniería real de la sonda del Hangar (motor, depósito, masas y potencia) con el propagador de empuje finito
// y el campo gravitatorio validado en MissionPhysics.js, manteniendo intacto el planificador impulsivo.
import { getComponent } from './ComponentCatalog.js';
import { calculateEngineering } from './ProbeEngineering.js';
import { designSignature } from './MissionPlanStore.js';
import { EARTH_MU_KM3_S2, EARTH_RADIUS_KM, LUNAR_COVERAGE, hasLunarCoverage, restrictedDerivative } from './MissionPhysics.js';
import { queryMoon } from '../science/PlanetaryMoons.js';
import { advanceJdTdb, gregorianTimestampToJdTdb } from '../science/Time.js';
import { integrateDopri54 } from '../science/NumericalIntegrator.js';
import { FiniteThrustError, MAX_BURNS, MIN_BURN_SECONDS, THRUST_DIRECTIONS, massFlowKgS, propagateFiniteThrust,
  thrustDirectionUnit, tsiolkovskyDeltaVMS, validateBurnSchedule } from './FiniteThrustDynamics.js';

export const FINITE_THRUST_MODEL_VERSION = 'earth-moon-restricted-finite-thrust-v1';
export const MAX_HORIZON_SECONDS = 30 * 86400;
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = v => Math.hypot(...v);
const subtract = (a, b) => a.map((x, i) => x - b[i]);

// ---- Lectura del sistema propulsivo del Hangar ----------------------------------
// Inspecciono el diseño sin mutarlo y compruebo que disponga de un motor válido, tanque compatible, propelente cargado y potencia suficiente.
export function getPropulsionSystem(design) {
  const engineering = calculateEngineering(design);
  const issues = [...engineering.structuralIssues];
  const engines = design.parts.map(part => ({ part, component: getComponent(part.componentId) })).filter(item => item.component?.category === 'engine');
  const tanks = design.parts.map(part => ({ part, component: getComponent(part.componentId) })).filter(item => item.component?.category === 'tank');
  if (!engines.length) issues.push('Falta un motor: el empuje finito no puede ejecutarse.');
  if (engines.length > 1) issues.push('Solo se admite un motor por diseño en esta etapa.');
  if (!tanks.length) issues.push('Falta un tanque de propelente.');
  const spec = engines.length === 1 ? engines[0].component : null;
  if (spec && tanks.length && tanks.some(item => item.component.propellant !== spec.propellant)) {
    issues.push(`Motor y tanque incompatibles: el motor usa propelente «${spec.propellant}».`);
  }
  if (spec && !(spec.thrustN > 0 && spec.ispS > 0)) issues.push('El motor carece de empuje o impulso específico válidos.');
  if (spec && !(engineering.fuelKg > 0)) issues.push('Empuje sin propelente: el tanque está vacío.');
  const requiredPowerW = engineering.idlePowerW + (spec?.activePowerW ?? 0);
  if (spec && engineering.generationW < requiredPowerW) {
    issues.push(`Potencia insuficiente: el encendido requiere ${requiredPowerW.toFixed(0)} W (reposo + motor) y la generación nominal es ${engineering.generationW.toFixed(0)} W. Encendido bloqueado; no se asume autonomía de batería.`);
  }
  return {
    issues, engineering, designSignature: designSignature(design),
    engine: spec ? { componentId: spec.id, name: spec.name, kind: spec.propellant === 'xenon' ? 'iónico' : 'químico',
      propellant: spec.propellant, thrustN: spec.thrustN, ispS: spec.ispS, activePowerW: spec.activePowerW,
      provenance: spec.provenance } : null,
    dryMassKg: engineering.dryMassKg, fuelKg: engineering.fuelKg, wetMassKg: engineering.wetMassKg,
    generationW: engineering.generationW, idlePowerW: engineering.idlePowerW, requiredPowerW,
    batteryWh: engineering.batteryWh, ready: issues.length === 0
  };
}

// ---- Normalización y validación de opciones ----------------------------------------
function canonicalDirection(direction) {
  return direction?.type === 'inertial' ? { type: 'inertial', vector: [...direction.vector] } : { type: direction?.type };
}
// Normalizo el orden de claves de las opciones para comparar configuraciones e invalidar cálculos obsoletos.
export function normalizeFiniteThrustOptions(options) {
  return {
    altitudeKm: options.altitudeKm, departureTdb: options.departureTdb, phaseDeg: options.phaseDeg, horizonSeconds: options.horizonSeconds,
    burns: (options.burns ?? []).map(burn => ({ startSeconds: burn.startSeconds, durationSeconds: burn.durationSeconds,
      throttle: burn.throttle, direction: canonicalDirection(burn.direction) }))
  };
}
export function validateFiniteThrustOptions(options) {
  const issues = [];
  if (!options || typeof options !== 'object' || Array.isArray(options)) return ['Opciones de empuje finito inválidas.'];
  if (!Number.isFinite(options.altitudeKm) || options.altitudeKm < 200 || options.altitudeKm > 150000) issues.push('Altitud inicial fuera de 200–150 000 km.');
  if (!Number.isFinite(options.phaseDeg) || options.phaseDeg < 0 || options.phaseDeg >= 360) issues.push('La fase orbital inicial debe estar en [0°, 360°).');
  if (!Number.isFinite(options.horizonSeconds) || options.horizonSeconds < 60 || options.horizonSeconds > MAX_HORIZON_SECONDS) issues.push('El horizonte debe estar entre 60 s y 30 días.');
  try {
    const jd = gregorianTimestampToJdTdb(options.departureTdb);
    if (jd < LUNAR_COVERAGE.startJd || jd > LUNAR_COVERAGE.endJd) issues.push('Salida fuera de cobertura lunar TDB.');
  } catch { issues.push('Fecha de salida TDB inválida.'); }
  if (!Array.isArray(options.burns) || !options.burns.length) issues.push('Programa al menos un encendido.');
  else if (options.burns.length > MAX_BURNS) issues.push(`Se admiten como máximo ${MAX_BURNS} encendidos.`);
  return issues;
}

// Construyo el estado inicial en una órbita circular directa situada en el plano orbital instantáneo de la Luna, midiendo la fase desde la dirección lunar.
export function circularParkingState({ dataset, departureJd, altitudeKm, phaseDeg = 0 }) {
  const moon = queryMoon(dataset, 'Luna', departureJd);
  if (!moon) throw new FiniteThrustError('COVERAGE', 'La salida no está cubierta por las efemérides lunares locales.');
  const h = cross(moon.positionKm, moon.velocityKmS);
  if (norm(h) < 1e-9) throw new FiniteThrustError('DEGENERATE_DIRECTION', 'No se puede definir el plano orbital inicial.');
  const e1 = moon.positionKm.map(x => x / norm(moon.positionKm));
  const n = h.map(x => x / norm(h));
  const e2 = cross(n, e1);
  const radiusKm = EARTH_RADIUS_KM + altitudeKm;
  const speedKmS = Math.sqrt(EARTH_MU_KM3_S2 / radiusKm);
  const phi = phaseDeg * Math.PI / 180;
  return {
    radiusKm, circularSpeedKmS: speedKmS,
    positionKm: e1.map((x, i) => radiusKm * (Math.cos(phi) * x + Math.sin(phi) * e2[i])),
    velocityKmS: e1.map((x, i) => speedKmS * (-Math.sin(phi) * x + Math.cos(phi) * e2[i]))
  };
}

// ---- Trayectorias de referencia para comparación -------------------------------
// Propago el vuelo puramente balístico bajo el mismo campo gravitatorio Tierra–Luna para medir el efecto neto de los encendidos.
function ballisticTo(gravityDerivative, position, velocity, startSeconds, targetSeconds) {
  const result = integrateDopri54({ derivative: gravityDerivative, initialState: [...position, ...velocity], startSeconds, targetSeconds,
    initialStepSeconds: 300, maxStepSeconds: 3600, absTol: [1e-5, 1e-5, 1e-5, 1e-8, 1e-8, 1e-8], relTol: 1e-11 });
  if (result.aborted) throw new FiniteThrustError('INTEGRATION_FAILED', `Referencia balística incompleta: ${result.abortReason}.`);
  return { positionKm: Array.from(result.finalState.slice(0, 3)), velocityKmS: Array.from(result.finalState.slice(3, 6)) };
}
// Genero una referencia impulsiva aplicando el Δv de Tsiolkovsky de forma instantánea al inicio de cada encendido;
// no equivale físicamente al empuje finito, pero me permite cuantificar la diferencia entre ambos modelos.
function impulsiveEquivalent(gravityDerivative, initial, burns, engine, endSeconds) {
  let t = 0, position = [...initial.positionKm], velocity = [...initial.velocityKmS];
  const u = new Float64Array(3);
  for (const burn of burns.filter(item => item.status !== 'skipped')) {
    if (burn.effectiveStartSeconds > t) { ({ positionKm: position, velocityKmS: velocity } = ballisticTo(gravityDerivative, position, velocity, t, burn.effectiveStartSeconds)); t = burn.effectiveStartSeconds; }
    thrustDirectionUnit(burn.direction, position, velocity, u);
    velocity = velocity.map((x, i) => x + burn.propulsiveDeltaVMS / 1000 * u[i]);
  }
  return ballisticTo(gravityDerivative, position, velocity, t, endSeconds);
}

// ---- Cálculo completo de la maniobra ---------------------------------------------------
// Valido ingeniería, opciones y cobertura lunar, propago con empuje finito y calculo las referencias balística e impulsiva.
export function calculateFiniteThrustManeuver({ dataset, design, options }) {
  if (!dataset?.moons?.Luna) throw new FiniteThrustError('COVERAGE', 'Falta la efeméride lunar local validada.');
  const system = getPropulsionSystem(design);
  if (!system.ready) throw new FiniteThrustError('NOT_READY', system.issues.join(' '), { issues: system.issues });
  const optionIssues = validateFiniteThrustOptions(options);
  if (optionIssues.length) throw new FiniteThrustError('INVALID_OPTIONS', optionIssues.join(' '), { issues: optionIssues });
  const normalized = normalizeFiniteThrustOptions(options);
  const burns = normalized.burns.map((burn, index) => ({ ...burn, id: `burn-${index + 1}` }));
  const scheduleIssues = validateBurnSchedule(burns, { endSeconds: normalized.horizonSeconds, engine: system.engine });
  if (scheduleIssues.length) throw new FiniteThrustError('INVALID_SCHEDULE', scheduleIssues.join(' '), { issues: scheduleIssues });
  const departureJd = gregorianTimestampToJdTdb(normalized.departureTdb);
  const endJd = advanceJdTdb(departureJd, normalized.horizonSeconds);
  if (!hasLunarCoverage(dataset, departureJd, endJd)) throw new FiniteThrustError('COVERAGE', 'La propagación necesita efemérides lunares fuera de la cobertura local (1 oct–1 nov 2026 TDB).');
  const initial = circularParkingState({ dataset, departureJd, altitudeKm: normalized.altitudeKm, phaseDeg: normalized.phaseDeg });
  const gravityDerivative = restrictedDerivative(dataset, departureJd);
  const propagation = propagateFiniteThrust({ gravityDerivative, initialPositionKm: initial.positionKm, initialVelocityKmS: initial.velocityKmS,
    initialMassKg: system.wetMassKg, dryMassKg: system.dryMassKg, engine: system.engine, burns, endSeconds: normalized.horizonSeconds });
  // Calculo las referencias balística e impulsiva en el mismo horizonte para contrastar posición y velocidad finales.
  const executed = propagation.burns.filter(burn => burn.status !== 'skipped');
  const lastBurnEnd = executed.length ? Math.max(...executed.map(burn => burn.effectiveEndSeconds)) : 0;
  const ballisticAtEnd = ballisticTo(gravityDerivative, initial.positionKm, initial.velocityKmS, 0, normalized.horizonSeconds);
  const ballisticAtLastBurn = lastBurnEnd > 0 ? ballisticTo(gravityDerivative, initial.positionKm, initial.velocityKmS, 0, lastBurnEnd) : null;
  const lastBurnKnot = lastBurnEnd > 0 ? propagation.knots.find(knot => Math.abs(knot.elapsedSeconds - lastBurnEnd) < 1e-6) : null;
  const impulsive = executed.length ? impulsiveEquivalent(gravityDerivative, initial, propagation.burns, system.engine, normalized.horizonSeconds) : ballisticAtEnd;
  const finalState = propagation.final;
  // Calculo el presupuesto ideal de Tsiolkovsky de los encendidos programados con masas secuenciales y sin tope de depósito.
  let plannedMassKg = system.wetMassKg, plannedDeltaVMS = 0;
  for (const burn of burns) {
    const after = plannedMassKg - massFlowKgS(system.engine.thrustN * burn.throttle, system.engine.ispS) * burn.durationSeconds;
    if (!(after > 0)) { plannedDeltaVMS = null; break; }
    plannedDeltaVMS += tsiolkovskyDeltaVMS(system.engine.ispS, plannedMassKg, after); plannedMassKg = after;
  }
  const comparison = {
    plannedDeltaVMS, // presupuesto ideal de Tsiolkovsky antes de aplicar límites de propelente
    accumulatedDeltaVMS: propagation.totals.propulsiveDeltaVMS, integratedDeltaVMS: propagation.totals.integratedDeltaVMS,
    burnSeconds: propagation.totals.burnSeconds, fuelConsumedKg: propagation.totals.fuelConsumedKg, finalMassKg: finalState.massKg,
    observedVelocityChangeMS: lastBurnKnot && ballisticAtLastBurn ? norm(subtract(lastBurnKnot.velocityKmS, ballisticAtLastBurn.velocityKmS)) * 1000 : null,
    ballisticFinalPositionKm: ballisticAtEnd.positionKm, ballisticFinalVelocityKmS: ballisticAtEnd.velocityKmS,
    positionDifferenceFromBallisticKm: norm(subtract(finalState.positionKm, ballisticAtEnd.positionKm)),
    impulsiveFinalPositionKm: impulsive.positionKm, impulsiveFinalVelocityKmS: impulsive.velocityKmS,
    positionDifferenceFromImpulsiveKm: norm(subtract(finalState.positionKm, impulsive.positionKm)),
    velocityDifferenceFromImpulsiveMS: norm(subtract(finalState.velocityKmS, impulsive.velocityKmS)) * 1000,
    note: 'La referencia impulsiva aplica el mismo Δv instantáneamente al inicio de cada encendido; no es físicamente equivalente al empuje finito.'
  };
  const moonEnd = queryMoon(dataset, 'Luna', endJd);
  return {
    kind: 'finite-thrust', model: FINITE_THRUST_MODEL_VERSION, status: 'PROPAGADA SEGÚN EL MODELO',
    designId: design.id, designSignature: system.designSignature, optionsKey: JSON.stringify(normalized), options: normalized,
    departureJd, endJd, system, initial: { ...initial, massKg: system.wetMassKg }, propagation, comparison,
    finalLunarDistanceKm: moonEnd ? norm(subtract(finalState.positionKm, moonEnd.positionKm)) : null,
    limitations: [
      'Órbita inicial circular directa en el plano orbital instantáneo de la Luna, ya adquirida; no se modela el lanzamiento.',
      'Gravedad terrestre y lunar restringida con efeméride lunar local; sin Sol, presión de radiación, achatamiento ni errores de navegación.',
      'Dirección del empuje ideal e instantánea: no hay dinámica de actitud ni control de orientación.',
      'Isp constante e independiente del acelerador; potencia solar nominal a 1 AU sin eclipses; la batería no se usa para habilitar encendidos.',
      'Esta propagación no certifica captura lunar, éxito operativo ni equivalencia con la planificación impulsiva.'
    ]
  };
}

export function isFiniteThrustResultCurrent(result, design, options) {
  return Boolean(result?.kind === 'finite-thrust' && design && result.designId === design.id
    && result.designSignature === designSignature(design)
    && result.optionsKey === JSON.stringify(normalizeFiniteThrustOptions(options))
    && result.model === FINITE_THRUST_MODEL_VERSION);
}
export { MIN_BURN_SECONDS, THRUST_DIRECTIONS };
