// Etapa 13 — misiones interplanetarias integradas por tramos físicamente conectados (cónicas parcheadas + empuje finito).
//
// Cadena: inyección (condición inicial) → crucero heliocéntrico → entrada en la esfera de influencia (SOI) → aproximación
// hiperbólica → captura con empuje finito (o sobrevuelo) → órbita planetaria → [transferencia planetocéntrica → SOI del satélite
// → captura → órbita del satélite → descenso 12F]. Cada tramo empieza EXACTAMENTE en el estado final del anterior; los cambios
// de cuerpo central son traslaciones con la posición y velocidad de la efeméride en la misma época TDB (mismos ejes ICRF
// eclíptico J2000). Solo los encendidos (integrados) cambian la velocidad; la separación del módulo de propulsión cambia la masa.
// Nada se fuerza: si una fase no es viable, la cadena se detiene ahí o continúa en sobrevuelo, y el resultado lo registra.
//
// Datos: `helio.stateAt(id, jdTdb)` (InterplanetaryEphemeris.loadWindow, planetas y baricentros respecto al centro del Sol) y,
// para fases con satélites, `moons.stateAt(key, jdTdb)` (PlanetocentricWindow, satélites respecto al centro de su sistema).
import { SOLAR_SYSTEM_GM_CATALOG } from '../science/GravitationalParameters.js';
import { propagateKepler, conicSummary } from '../science/KeplerPropagator.js';
import { sphereOfInfluenceRadiusKm, osculatingOrbitOfBody, classicalElements, SOI_MODELS, impulsiveCaptureDeltaV, timeToNextPeriapsis } from '../science/PlanetaryEncounter.js';
import { tdbToTimeScales } from '../science/AstrodynamicsTime.js';
import { aimEncounter, AIM_STATUS, targetFiniteBurn, searchMoonTransfer, screenCloseApproaches } from './EncounterDesign.js';
import { simulateInsertion, impulsiveInsertionReference, INSERTION_STATUS, orbitDescription } from './OrbitalInsertion.js';
import { MU_SUN } from './InterplanetaryPlan.js';
import { calculateEngineering } from './ProbeEngineering.js';
import { designSignature } from './MissionPlanStore.js';
import { getBodyProfile, landingCapability, CAPABILITY } from './CelestialBodyMissionRegistry.js';
import { simulateLanding } from './BodyLandingSimulation.js';
import { createLandingEnvironment, initialOrbitState } from './BodyLandingDynamics.js';
import { landerStructuralMassKg, validateLander } from './BodyLandingVehicle.js';
import { tsiolkovskyDeltaVMS } from './FiniteThrustDynamics.js';
import { getComponent } from './ComponentCatalog.js';
import { AU_KM, JULIAN_YEAR_DAYS, generationAt, electricThrust } from './SpacecraftPower.js';
import { designEarthDeparture, EARTH_DEPARTURE_VERSION } from './EarthDeparture.js';
import { EARTH_GM_KM3_S2 } from './LaunchEarth.js';

// 20: la captura planetaria se apunta para compensar el desplazamiento del periapsis (resultados distintos de 13–17.1).
// 21: salida opcional desde la plataforma (lanzamiento 12E, aparcamiento e inyección de empuje finito); sin ella, como en 20.
export const INTEGRATED_MISSION_VERSION = '21-integrated-mission-3';
export const PHASE_STATUS = Object.freeze({ done: 'COMPLETADA SEGÚN EL MODELO', failed: 'NO VIABLE PARA EL ESCENARIO CONFIGURADO', partial: 'COMPLETADA CON OBJETIVO NO ALCANZADO',
  skipped: 'NO EVALUADA', pending: 'PENDIENTE (sin modelo en esta etapa)', noData: 'DATOS NO DISPONIBLES', initial: 'CONDICIÓN INICIAL (no simulada)' });
export const LEVEL = Object.freeze({ operational: 'OPERATIVO', experimental: 'EXPERIMENTAL', pending: 'PENDIENTE', notViable: 'NO VIABLE para el escenario configurado' });

const gm = id => SOLAR_SYSTEM_GM_CATALOG.getParameter(id);
// Destinos de encuentro. Los gigantes usan el BARICENTRO de su sistema (NAIF 5–8, cadencia 4 d con error medido ≤ 3 m) y el GM
// del sistema: resuelve OBS-12G-02 (el centro de Júpiter, 599, oscila ~10² km alrededor del baricentro y la cadencia de 4 d lo
// submuestrea). Mercurio, Venus y Marte usan el centro del planeta (cadencia 1 d).
const target = (id, ephemerisId, name, centerLabel, color) => Object.freeze({ id, ephemerisId, name, centerLabel, mu: gm(id).muKm3PerS2, radiusKm: gm(id).referenceRadiusKm,
  massScope: gm(id).massScope, gmSource: gm(id).source, color });
export const ENCOUNTER_TARGETS = Object.freeze({
  '199': target('199', '199', 'Mercurio', 'centro de Mercurio (199)', '#a39a91'), '299': target('299', '299', 'Venus', 'centro de Venus (299)', '#d8b979'),
  '499': target('499', '499', 'Marte', 'centro de Marte (499)', '#c46a43'), '599': target('599', '5', 'Júpiter', 'baricentro del sistema de Júpiter (5)', '#c9a77f'),
  '699': target('699', '6', 'Saturno', 'baricentro del sistema de Saturno (6)', '#d6c38f'), '799': target('799', '7', 'Urano', 'baricentro del sistema de Urano (7)', '#8fd0d8'),
  '899': target('899', '8', 'Neptuno', 'baricentro del sistema de Neptuno (8)', '#5b7fd6')
});
// Satélites con efemérides de ventana adquiridas en 13 (clave del conjunto planetocéntrico).
export const MOON_WINDOW_KEYS = Object.freeze({ '501': 'Io', '502': 'Europa', '503': 'Ganymede', '504': 'Callisto' });

// Módulo de propulsión ILUSTRATIVO (no es un vehículo real): orden de magnitud de una etapa bipropelente de inserción.
// La masa de depósitos escala con el propelente (fracción declarada). Editable en el planificador.
export const DEMO_PROPULSION_MODULE = Object.freeze({ id: 'demo-orbital-module-v1', name: 'Módulo de propulsión orbital demostrativo',
  provenance: 'Parámetros ilustrativos para entrenamiento (orden de magnitud de una etapa bipropelente de inserción orbital). No es un vehículo real ni una fuente verificada.',
  structureKg: 1500, tankFraction: 0.06, propellantKg: 80000, engine: Object.freeze({ name: 'Tres motores bipropelentes de inserción (ilustrativos)', thrustN: 270000, ispS: 323 }) });
export const moduleDryMassKg = module => module.structureKg + module.tankFraction * module.propellantKg;

export const DEFAULT_PROFILE = Object.freeze({
  soiModel: 'laplace',
  planet: Object.freeze({ mode: 'capture', periapsisAltitudeKm: 400, bPlane: Object.freeze({ mode: 'auto' }), captureBurns: Object.freeze([Object.freeze({ apoapsisAltitudeKm: 33000 })]), orbitCoastDays: 2, periapsisCompensation: true }),
  moon: null, landing: Object.freeze({ enabled: false }), flybyOutboundDays: 120,
  // 21: con `enabled`, la misión empieza en la plataforma de Cabo Cañaveral (EarthDeparture.js); si no, en la v∞ apuntada.
  launch: Object.freeze({ enabled: false, azimuthDeg: 'auto' })
});

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const norm = a => Math.hypot(a[0], a[1], a[2]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export class IntegratedMissionError extends Error { constructor(message, details = {}) { super(message); this.name = 'IntegratedMissionError'; this.details = details; } }

/** Pila del vehículo: sonda del Hangar (carga útil con su propelente), módulo de propulsión opcional y módulo de aterrizaje opcional. */
export function buildVehicleStack({ design, propulsionModule = null, lander = null }) {
  const eng = calculateEngineering(design), issues = [...eng.structuralIssues];
  if (!(eng.dryMassKg > 0)) issues.push('La sonda del Hangar no tiene masa: selecciona una estructura.');
  if (propulsionModule) {
    for (const key of ['structureKg', 'tankFraction', 'propellantKg']) if (!Number.isFinite(propulsionModule[key]) || propulsionModule[key] < 0) issues.push(`Módulo: ${key} debe ser finito y no negativo.`);
    if (!(propulsionModule.engine?.thrustN > 0) || !(propulsionModule.engine?.ispS > 0)) issues.push('Módulo: empuje e Isp deben ser positivos.');
  }
  if (lander) issues.push(...validateLander(lander));
  // 15: el motor conserva su modelo eléctrico (si lo tiene) para limitar el empuje con la potencia disponible en cada encendido.
  const electricPart = design.parts.map(p => getComponent(p.componentId)).find(c => c?.category === 'engine' && c.electric);
  const probe = { name: design.name, dryKg: eng.dryMassKg, propellantKg: eng.fuelKg, wetKg: eng.wetMassKg,
    engine: eng.thrustN > 0 && eng.effectiveIspS > 0 ? { name: electricPart ? `${electricPart.name} (Hangar)` : 'Motor de la sonda (Hangar)', thrustN: eng.thrustN, ispS: eng.effectiveIspS,
      ...(electricPart ? { electric: electricPart.electric, propulsionType: 'electric' } : { propulsionType: 'chemical' }) } : null, deltaVMS: eng.deltaVMS };
  const core = getComponent(design.coreId);
  const power = { sources: [core, ...design.parts.map(p => getComponent(p.componentId))].filter(c => c?.generationW > 0), serviceW: eng.idlePowerW, batteryWh: eng.batteryWh,
    engineActiveW: design.parts.map(p => getComponent(p.componentId)).filter(c => c?.category === 'engine').reduce((n, c) => n + c.activePowerW, 0) };
  const module = propulsionModule ? { ...propulsionModule, dryKg: moduleDryMassKg(propulsionModule), wetKg: moduleDryMassKg(propulsionModule) + propulsionModule.propellantKg } : null;
  const landerMass = lander ? { name: lander.name, dryKg: landerStructuralMassKg(lander), propellantKg: lander.propellantMassKg, wetKg: landerStructuralMassKg(lander) + lander.propellantMassKg } : null;
  const totalKg = probe.wetKg + (module?.wetKg ?? 0) + (landerMass?.wetKg ?? 0);
  return { probe, module, lander: landerMass, landerSpec: lander, totalKg, issues, captureEngine: module ? 'module' : 'probe', designSignature: designSignature(design), power };
}

function elapsedOf(departureJdTdb, jd) { return (jd - departureJdTdb) * 86400; }

/**
 * `input`: { destinationId, moonId?, opportunity: { departureJdTdb, arrivalJdTdb, label? }, design, propulsionModule?, lander?, profile }
 * `data`: { helio, moons? }. Devuelve la misión con tramos, eventos, fases, recursos y comprobaciones de continuidad.
 */
// 17.1: órbita resultante tras una captura de empuje finito. El encendido se corta al alcanzar el apoapsis objetivo; en un
// encendido largo el periapsis se desplaza respecto al apuntado en la llegada (p. ej. A1 con Cassini: 3000 → 315,5 km).
// Solo describe el estado ya calculado.
function resultingOrbitNote(insertion, aimedPeriapsisAltitudeKm, compensated = false) {
  const o = insertion.final?.orbit;
  if (!o?.bound || !Number.isFinite(o.apoapsisAltitudeKm)) return '';
  const km = x => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const shifted = Number.isFinite(aimedPeriapsisAltitudeKm) && Math.abs(o.periapsisAltitudeKm - aimedPeriapsisAltitudeKm) > Math.max(1, 0.01 * Math.abs(aimedPeriapsisAltitudeKm));
  const hours = insertion.burns?.reduce((acc, b) => acc + (b.durationSeconds ?? 0), 0) / 3600;
  return ` Órbita resultante: ${km(o.periapsisAltitudeKm)} × ${km(o.apoapsisAltitudeKm)} km de altitud${shifted && !compensated ? ` (periapsis apuntado ${km(aimedPeriapsisAltitudeKm)} km; el encendido de ${hours.toFixed(1)} h lo desplaza)` : ''}.`;
}

// ---- 20 · Captura apuntada -------------------------------------------------------------------------------------------------
// Un encendido de captura largo, centrado en el periapsis y retrógrado, baja la trayectoria mientras actúa: la órbita final
// tiene un periapsis más bajo que el apuntado en la llegada (A1 con Cassini: 3000 → 315,5 km). Un planificador apunta la llegada
// a otro periapsis para acabar en el pedido. Aquí se busca por secante sobre la cadena COMPLETA: cada prueba repite el apuntado
// (Lambert a la SOI con el plano B pedido) y la inserción de empuje finito con el mismo vehículo, motor y encendidos. No cambia
// ningún modelo físico: solo elige la condición de llegada. Si la relación no es monótona (subir el periapsis apuntado no sube el
// final), si el apuntado falla o si no converge, se conserva el apuntado sin compensar y se dice por qué.
export const PERIAPSIS_COMPENSATION = Object.freeze({ toleranceKm: 0.01, maxIterations: 12, minSlope: 0.2 });
export const COMPENSATION_STATUS = Object.freeze({ applied: 'aplicada', unnecessary: 'innecesaria', disabled: 'desactivada', failed: 'no aplicable' });
/**
 * `aimAt(rpKm)` → resultado de `aimEncounter`; `trial(aim)` → resultado de `simulateInsertion` desde `aim.soi.relative`.
 * Radios en km desde el centro del cuerpo. Devuelve { status, applied, aim, aimedRadiusKm, targetRadiusKm, uncompensatedRadiusKm,
 * iterations, residualKm, reason, history: [{ aimedRadiusKm, finalRadiusKm, reachedTarget }] }.
 */
export function compensateCapturePeriapsis({ aimAt, firstAim, trial, targetRadiusKm, bodyRadiusKm, soiRadiusKm, enabled = true,
  toleranceKm = PERIAPSIS_COMPENSATION.toleranceKm, maxIterations = PERIAPSIS_COMPENSATION.maxIterations, minSlope = PERIAPSIS_COMPENSATION.minSlope }) {
  const altitude = r => `${Math.round(r - bodyRadiusKm)}`;
  const evaluate = aim => {
    const ins = trial(aim), r = ins?.final?.orbit?.periapsisRadiusKm;
    return Number.isFinite(r) ? { finalRadiusKm: r, reachedTarget: ins.status === INSERTION_STATUS.target, status: ins.status } : null;
  };
  const history = [];
  const first = evaluate(firstAim);
  const base = { targetRadiusKm, uncompensatedRadiusKm: first?.finalRadiusKm ?? null, history };
  const keep = (status, reason, extra = {}) => ({ ...base, status, applied: false, aim: firstAim, aimedRadiusKm: targetRadiusKm, iterations: Math.max(0, history.length - 1), reason, ...extra });
  if (!first) return keep(COMPENSATION_STATUS.failed, 'La inserción sin compensar no deja una órbita evaluable.');
  history.push({ aimedRadiusKm: targetRadiusKm, ...first });
  const uncompensatedResidual = first.finalRadiusKm - targetRadiusKm;
  if (Math.abs(uncompensatedResidual) <= toleranceKm) return keep(COMPENSATION_STATUS.unnecessary, 'El encendido no desplaza el periapsis de forma apreciable.', { residualKm: uncompensatedResidual });
  if (!enabled) return keep(COMPENSATION_STATUS.disabled, 'Compensación desactivada: la llegada se apunta al periapsis pedido.', { residualKm: uncompensatedResidual });
  // Captura parcial o sobrevuelo (falta Δv o empuje): no hay órbita final que ajustar. Un impacto sí puede evitarse subiendo la llegada.
  if (!first.reachedTarget && first.status !== INSERTION_STATUS.impact) return keep(COMPENSATION_STATUS.failed, 'La captura no alcanza la órbita objetivo ni sin compensar (falta Δv o empuje): apuntar la llegada no lo cambia.', { residualKm: uncompensatedResidual });
  let x0 = targetRadiusKm, f0 = uncompensatedResidual, x1 = x0 - f0;
  for (let k = 1; k <= maxIterations; k++) {
    if (!(x1 > bodyRadiusKm) || !(x1 < soiRadiusKm)) return keep(COMPENSATION_STATUS.failed, `El periapsis de llegada necesario (${altitude(x1)} km de altitud) queda bajo la superficie o fuera de la esfera de influencia.`, { residualKm: uncompensatedResidual });
    const aim = aimAt(x1);
    if (aim.status !== AIM_STATUS.aimed) return keep(COMPENSATION_STATUS.failed, `El apuntado a ${altitude(x1)} km de altitud no converge (${aim.reason ?? aim.status}).`, { residualKm: uncompensatedResidual });
    const t = evaluate(aim);
    if (!t) return keep(COMPENSATION_STATUS.failed, `Con la llegada a ${altitude(x1)} km de altitud la inserción no deja una órbita evaluable.`, { residualKm: uncompensatedResidual });
    history.push({ aimedRadiusKm: x1, ...t });
    const f1 = t.finalRadiusKm - targetRadiusKm;
    if (Math.abs(f1) <= toleranceKm) {
      if (!t.reachedTarget) return keep(COMPENSATION_STATUS.failed, 'Con el periapsis compensado este vehículo no alcanza la órbita objetivo.', { residualKm: uncompensatedResidual });
      return { ...base, status: COMPENSATION_STATUS.applied, applied: true, aim, aimedRadiusKm: x1, iterations: k, residualKm: f1, reason: null };
    }
    const slope = (f1 - f0) / (x1 - x0);
    if (!(slope >= minSlope)) return keep(COMPENSATION_STATUS.failed, 'Subir el periapsis apuntado no sube el periapsis final en este escenario (relación no monótona): no se compensa.', { residualKm: uncompensatedResidual });
    x0 = x1; f0 = f1; x1 -= f1 / slope;
  }
  return keep(COMPENSATION_STATUS.failed, `Sin convergencia en ${maxIterations} iteraciones.`, { residualKm: uncompensatedResidual });
}
// Resumen serializable para el resultado (sin el objeto de apuntado). Altitudes en km sobre el radio medio del cuerpo.
function compensationSummary(c, bodyRadiusKm) {
  if (!c) return null;
  const alt = r => (Number.isFinite(r) ? r - bodyRadiusKm : null);
  return Object.freeze({ status: c.status, applied: c.applied, reason: c.reason, iterations: c.iterations, residualKm: c.residualKm ?? null,
    targetPeriapsisAltitudeKm: alt(c.targetRadiusKm), aimedPeriapsisAltitudeKm: alt(c.aimedRadiusKm), uncompensatedPeriapsisAltitudeKm: alt(c.uncompensatedRadiusKm),
    history: Object.freeze(c.history.map(h => Object.freeze({ aimedPeriapsisAltitudeKm: alt(h.aimedRadiusKm), finalPeriapsisAltitudeKm: alt(h.finalRadiusKm), reachedTarget: h.reachedTarget }))) });
}
function compensationNote(summary) {
  if (!summary || summary.status === COMPENSATION_STATUS.unnecessary) return '';
  const km = x => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  if (summary.applied) return ` Captura apuntada: la llegada se apuntó a ${km(summary.aimedPeriapsisAltitudeKm)} km de altitud para que el encendido, que baja el periapsis, termine en los ${km(summary.targetPeriapsisAltitudeKm)} km pedidos (sin compensar habría quedado en ${km(summary.uncompensatedPeriapsisAltitudeKm)} km; ${summary.iterations} iteraciones de secante).`;
  return ` Captura apuntada no aplicada. ${summary.reason}`;
}

export function computeIntegratedMission(input, data) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const tgt = ENCOUNTER_TARGETS[input.destinationId];
  if (!tgt) throw new IntegratedMissionError('Destino de encuentro no disponible: elige un planeta.');
  const profile = { ...DEFAULT_PROFILE, ...input.profile, planet: { ...DEFAULT_PROFILE.planet, ...input.profile?.planet }, launch: { ...DEFAULT_PROFILE.launch, ...input.profile?.launch } };
  if (!SOI_MODELS[profile.soiModel]) throw new IntegratedMissionError('Modelo de esfera de influencia desconocido.');
  const moonId = input.moonId ?? null, moonKey = moonId ? MOON_WINDOW_KEYS[moonId] : null;
  let moonProfile = null;
  if (moonId) {
    moonProfile = getBodyProfile(moonId);
    if (moonProfile.parentId !== input.destinationId) throw new IntegratedMissionError(`${moonProfile.name} no es un satélite de ${tgt.name}.`);
  }
  const vehicle = buildVehicleStack({ design: input.design, propulsionModule: input.propulsionModule ?? null, lander: input.lander ?? null });
  if (vehicle.issues.length) throw new IntegratedMissionError(vehicle.issues.join(' '));
  const engineKey = vehicle.captureEngine;
  let engine = engineKey === 'module' ? vehicle.module.engine : vehicle.probe.engine, electricBlocked = false;
  const { departureJdTdb: plannedDepartureJdTdb, arrivalJdTdb } = input.opportunity;
  if (!(arrivalJdTdb > plannedDepartureJdTdb)) throw new IntegratedMissionError('La llegada debe ser posterior a la salida.');
  // Época de la misión (t = 0): la salida prevista o, con lanzamiento (21), el despegue. Todos los tiempos se cuentan desde ella.
  let departureJdTdb = plannedDepartureJdTdb;

  const segments = [], events = [], phases = [], maneuvers = [], warnings = [], separations = [];
  const tanks = { probe: vehicle.probe.propellantKg, module: vehicle.module?.propellantKg ?? 0, lander: vehicle.lander?.propellantKg ?? 0 };
  let mass = vehicle.totalKg;
  // Se rellena al apuntar la llegada; si el apuntado falla, finish() devuelve la misión sin aproximación (antes: ReferenceError).
  let approachInfo = null;
  const phase = (id, label, status, level, detail = {}) => phases.push({ id, label, status, level, ...detail });
  const event = (id, kind, title, elapsedSeconds, extra = {}) => events.push({ id, kind, title, elapsedSeconds, ...extra });
  const pushSegment = s => { segments.push(Object.freeze({ ...s, startJdTdb: departureJdTdb + s.startSeconds / 86400, endJdTdb: departureJdTdb + s.endSeconds / 86400 })); };
  const helioState = (id, jd) => { const s = data.helio.stateAt(id, jd); return s?.status === 'available' ? s : null; };
  const moonState = (key, jd) => { if (!data.moons) return null; const s = data.moons.stateAt(key, jd); return s?.status === 'available' ? s : null; };

  // ---- 0. Salida: condición inicial (inyección externa) ---------------------------------------------------------------------
  const earth = helioState('399', departureJdTdb), planetAtArrival = helioState(tgt.ephemerisId, arrivalJdTdb);
  if (!earth || !planetAtArrival) throw new IntegratedMissionError('Efemérides no disponibles para el intervalo solicitado.');
  const orbitAtArrival = osculatingOrbitOfBody(planetAtArrival.positionKm, planetAtArrival.velocityKmS, MU_SUN + tgt.mu);
  const soiKm = sphereOfInfluenceRadiusKm({ model: profile.soiModel, semiMajorAxisKm: orbitAtArrival.semiMajorAxisKm, eccentricity: orbitAtArrival.eccentricity, muBody: tgt.mu, muPrimary: MU_SUN });
  const rpPlanet = tgt.radiusKm + profile.planet.periapsisAltitudeKm;
  // Orientación del plano B: 'auto' minimiza la inclinación respecto al plano orbital del satélite objetivo (si lo hay) o a la eclíptica.
  let bPlane = profile.planet.bPlane, bPlaneNote;
  if (bPlane.mode === 'auto') {
    const m = moonKey ? moonState(moonKey, arrivalJdTdb) : null;
    if (m) { bPlane = { mode: 'normal', normal: cross(m.positionKm, m.velocityKmS) }; bPlaneNote = `θ del plano B elegido para minimizar la inclinación respecto al plano orbital de ${moonProfile.name} (su efeméride en la llegada).`; }
    else { bPlane = { mode: 'normal', normal: [0, 0, 1] }; bPlaneNote = 'θ del plano B elegido para minimizar la inclinación respecto a la eclíptica J2000 (la orientación del ecuador del planeta no está en los datos del proyecto).'; }
  } else bPlaneNote = `θ del plano B fijado por el usuario: ${bPlane.angleDeg}°.`;
  const mu = tgt.mu, R = tgt.radiusKm;
  // 15: un motor eléctrico de la sonda solo dispone de la potencia que queda a la distancia solar del destino tras el consumo de
  // servicio. Dentro de la SOI la distancia al Sol se toma constante (la del planeta en la llegada).
  if (engine?.electric) {
    const rAu = norm(planetAtArrival.positionKm) / AU_KM, years = (arrivalJdTdb - departureJdTdb) / JULIAN_YEAR_DAYS;
    const availableW = generationAt(vehicle.power.sources, { distanceAu: rAu, yearsSinceLaunch: years }).totalW - vehicle.power.serviceW;
    const ep = electricThrust(engine, availableW);
    warnings.push(ep.operable
      ? `Propulsión eléctrica en ${tgt.name} (${rAu.toFixed(2)} AU): ${ep.inputW.toFixed(0)} W de entrada → ${(ep.thrustN * 1000).toFixed(2)} mN (${(ep.throttle * 100).toFixed(0)} % del máximo).`
      : `Propulsión eléctrica en ${tgt.name} (${rAu.toFixed(2)} AU): quedan ${Math.max(0, availableW).toFixed(0)} W tras el consumo de servicio, por debajo del mínimo de ${engine.electric.minInputPowerW} W; el motor no puede encenderse.`);
    if (ep.operable) engine = { ...engine, thrustN: ep.thrustN, inputPowerW: ep.inputW, distanceAu: rAu };
    else { engine = null; electricBlocked = true; }
  }
  const aimFrom = (departurePositionKm, fromJdTdb) => periapsisRadiusKm => aimEncounter({ departurePositionKm, departureJdTdb: fromJdTdb, periapsisJdTdb: arrivalJdTdb,
    targetStateAt: jd => helioState(tgt.ephemerisId, jd), muCentral: MU_SUN, muTarget: tgt.mu, targetRadiusKm: tgt.radiusKm, periapsisRadiusKm, bPlane, soiRadiusKm: soiKm });
  const burnSpecs = profile.planet.captureBurns.map((b, i) => ({ id: `planet-capture-${i + 1}`, label: i === 0 ? `Inserción en órbita de ${tgt.name}` : `Reducción de apoapsis ${i + 1}`, targetApoapsisRadiusKm: R + b.apoapsisAltitudeKm }));
  // 20: captura apuntada. Cada prueba usa la misma inserción que el cálculo (sin la espera posterior, que no cambia la órbita).
  const designArrival = aimAt => {
    let a = aimAt(rpPlanet), comp = null;
    if (a.status === AIM_STATUS.aimed && profile.planet.mode !== 'flyby' && engine) {
      comp = compensateCapturePeriapsis({ aimAt, firstAim: a, targetRadiusKm: rpPlanet, bodyRadiusKm: R, soiRadiusKm: soiKm, enabled: profile.planet.periapsisCompensation !== false,
        trial: x => simulateInsertion({ mu, bodyRadiusKm: R, bodyName: tgt.name, positionKm: x.soi.relative.positionKm, velocityKmS: x.soi.relative.velocityKmS,
          vehicle: { massKg: mass, propellantKg: tanks[engineKey], engine }, burns: burnSpecs, coastAfterSeconds: 0 }) });
      if (comp.applied) a = comp.aim;
    }
    return { aim: a, compensation: comp, rpAimKm: comp?.applied ? comp.aimedRadiusKm : rpPlanet };
  };
  let arrival = designArrival(aimFrom(earth.positionKm, departureJdTdb)), launch = null, launchRounds = 0;
  // 21: salida desde la plataforma. El crucero empieza en la salida de la SOI terrestre, así que la llegada (y su compensación) se
  // rediseña desde ese punto; se repite hasta que el periapsis de llegada apuntado cambia menos de 1 m (2–3 vueltas).
  if (profile.launch.enabled) {
    const earthOrbit = osculatingOrbitOfBody(earth.positionKm, earth.velocityKmS, MU_SUN + EARTH_GM_KM3_S2);
    const earthSoiKm = sphereOfInfluenceRadiusKm({ model: profile.soiModel, semiMajorAxisKm: earthOrbit.semiMajorAxisKm, eccentricity: earthOrbit.eccentricity, muBody: EARTH_GM_KM3_S2, muPrimary: MU_SUN });
    for (launchRounds = 1; launchRounds <= 4; launchRounds++) {
      const rp = arrival.rpAimKm;
      launch = designEarthDeparture({ payloadMassKg: mass, liftoffGuessJdTdb: plannedDepartureJdTdb, earthStateAt: jd => helioState('399', jd), soiRadiusKm: earthSoiKm,
        requiredVelocityAt: (pos, jd) => { const a = aimFrom(pos, jd)(rp); return a.status === AIM_STATUS.aimed ? a.departure.velocityKmS : null; },
        azimuthDeg: profile.launch.azimuthDeg, previous: launch?.ok ? launch : null });
      if (!launch.ok) break;
      arrival = designArrival(aimFrom(launch.exit.helioPositionKm, launch.exit.jdTdb));
      if (Math.abs(arrival.rpAimKm - rp) <= 1e-3) break;
    }
    launchRounds = Math.min(launchRounds, 4);
  }
  const aim = arrival.aim;
  const compensation = arrival.compensation, periapsisCompensation = compensationSummary(compensation, R);
  let departureVInf = null;
  if (launch && !launch.ok) {
    phase('launch', 'Lanzamiento desde Cabo Cañaveral (12E)', PHASE_STATUS.failed, LEVEL.notViable, { detail: launch.reason, startSeconds: 0, endSeconds: 0 });
    return finish();
  }
  if (launch) {
    departureJdTdb = launch.liftoffJdTdb;
    departureVInf = launch.exit.geocentric.velocityKmS;
    if (aim.status === AIM_STATUS.aimed) appendLaunch();
  } else {
    departureVInf = aim.departure ? sub(aim.departure.velocityKmS, earth.velocityKmS) : null;
    phase('departure', 'Inyección interplanetaria', PHASE_STATUS.initial, LEVEL.experimental, {
      detail: departureVInf ? `Estado heliocéntrico inicial = Tierra(t₀) + v∞ apuntada; C3 = ${(norm(departureVInf) ** 2).toFixed(3)} km²/s². La inyección la realiza un lanzador externo no modelado (con «Empezar en la plataforma» se simula desde Cabo Cañaveral).` : 'Sin apuntado convergente.' });
  }
  if (aim.status !== AIM_STATUS.aimed) {
    phase('cruise', 'Crucero heliocéntrico', aim.status === AIM_STATUS.noCoverage ? PHASE_STATUS.noData : PHASE_STATUS.failed, LEVEL.notViable, { detail: aim.reason ?? `${aim.status}: el periapsis apuntado queda por debajo de la superficie.` });
    return finish();
  }
  const tSoi = elapsedOf(departureJdTdb, aim.soi.jdTdb), tCruise = launch ? launch.exit.elapsedSeconds : 0;
  if (!launch) event('departure', 'departure', `Salida heliocéntrica desde la Tierra (C3 ${(norm(departureVInf) ** 2).toFixed(2)} km²/s²)`, 0, { centralBodyId: '10' });
  pushSegment({ id: 'cruise', phase: 'cruise', kind: 'kepler', label: 'Crucero heliocéntrico (balístico)', centralBodyId: '10', centralName: 'Sol', mu: MU_SUN, startSeconds: tCruise, endSeconds: tSoi,
    initial: { positionKm: [...(launch ? launch.exit.helioPositionKm : earth.positionKm)], velocityKmS: [...aim.departure.velocityKmS], massKg: mass }, massKg: mass });
  phase('cruise', 'Crucero heliocéntrico', PHASE_STATUS.done, LEVEL.operational, { detail: `Lambert apuntado a la SOI (${aim.iterations} iteraciones de Newton; desajuste ${aim.mismatchKmS.toExponential(1)} km/s). Sin correcciones de trayectoria ni perturbaciones planetarias.`,
    startSeconds: tCruise, endSeconds: tSoi });
  event('soi-entry', 'soi', `Entrada en la esfera de influencia de ${tgt.name} (${(soiKm / 1e6).toFixed(3)} millones de km)`, tSoi, { centralBodyId: tgt.id });

  // ---- 1. Aproximación y captura planetaria ----------------------------------------------------------------------------------
  const rel0 = aim.soi.relative;
  approachInfo = { soiRadiusKm: soiKm, soiModel: profile.soiModel, vInfKmS: aim.achieved.vInfKmS, BdotT: aim.achieved.BdotT, BdotR: aim.achieved.BdotR, bAngleDeg: aim.achieved.bAngleDeg,
    bMagnitudeKm: aim.achieved.bMagnitudeKm, periapsisTargetKm: compensation?.aimedRadiusKm ?? rpPlanet, orbitPeriapsisTargetKm: rpPlanet, periapsisCompensation, periapsisAchievedKm: aim.achieved.periapsisRadiusKm, periapsisAltitudeKm: aim.achieved.periapsisAltitudeKm,
    turnAngleDeg: aim.hyperbola.turnAngleDeg, eccentricity: aim.achieved.eccentricity, secondsSoiToPeriapsis: aim.soi.secondsToPeriapsis, bPlaneNote, minimumInclinationDeg: aim.minimumInclinationDeg };
  let planetFinal = null, captured = false;
  if (profile.planet.mode === 'flyby' || !engine) {
    if (!engine && profile.planet.mode !== 'flyby' && !electricBlocked) warnings.push('La configuración no tiene motor de captura: se calcula el sobrevuelo.');
    if (electricBlocked && profile.planet.mode !== 'flyby') phase('capture', `Captura en ${tgt.name}`, PHASE_STATUS.failed, LEVEL.notViable, { detail: `${warnings.at(-1)} La sonda continúa en sobrevuelo.` });
    else phase('capture', `Captura en ${tgt.name}`, PHASE_STATUS.skipped, LEVEL.experimental, { detail: 'Sobrevuelo sin encendido (elegido o sin motor).' });
    flybyAndOutbound(rel0, tSoi);
    return finish();
  }
  const propellantFor = key => tanks[key];
  const ins = simulateInsertion({ mu, bodyRadiusKm: R, bodyName: tgt.name, positionKm: rel0.positionKm, velocityKmS: rel0.velocityKmS,
    vehicle: { massKg: mass, propellantKg: propellantFor(engineKey), engine }, burns: burnSpecs, coastAfterSeconds: profile.planet.orbitCoastDays * 86400 });
  const reference = impulsiveInsertionReference({ mu, vInfKmS: aim.achieved.vInfKmS, periapsisRadiusKm: aim.achieved.periapsisRadiusKm, burns: burnSpecs, massKg: mass, ispS: engine.ispS });
  appendInsertion(ins, tSoi, tgt, 'planet');
  tanks[engineKey] -= ins.totals.propellantKg; mass = ins.final.massKg;
  const tAfterPlanet = tSoi + ins.durationSeconds;
  planetFinal = { ...ins.final, elapsedSeconds: tAfterPlanet };
  const insertionLabel = { [INSERTION_STATUS.target]: PHASE_STATUS.done, [INSERTION_STATUS.partial]: PHASE_STATUS.partial, [INSERTION_STATUS.flyby]: PHASE_STATUS.failed,
    [INSERTION_STATUS.impact]: PHASE_STATUS.failed, [INSERTION_STATUS.failed]: PHASE_STATUS.failed }[ins.status];
  phase('approach', `Aproximación hiperbólica a ${tgt.name}`, PHASE_STATUS.done, LEVEL.operational, { detail: `Periapsis apuntado ${(approachInfo.periapsisAltitudeKm).toFixed(2)} km de altitud; v∞ ${approachInfo.vInfKmS.toFixed(4)} km/s; plano B θ = ${approachInfo.bAngleDeg.toFixed(2)}°.`,
    startSeconds: tSoi, endSeconds: tSoi + (ins.segments[0]?.endSeconds ?? 0) });
  phase('capture', `Captura en ${tgt.name} (empuje finito)`, insertionLabel, ins.status === INSERTION_STATUS.target ? LEVEL.experimental : LEVEL.notViable, {
    detail: `${ins.status}. ${ins.failure ?? ''} Propelente ${ins.totals.propellantKg.toFixed(1)} kg · Δv ${(ins.totals.propulsiveDeltaVKmS * 1000).toFixed(1)} m/s (referencia impulsiva ${(reference.totalDeltaVKmS * 1000).toFixed(1)} m/s).${resultingOrbitNote(ins, approachInfo.periapsisAltitudeKm, periapsisCompensation?.applied)}${compensationNote(periapsisCompensation)}`,
    insertion: summarizeInsertion(ins, R), reference, periapsisCompensation, startSeconds: tSoi, endSeconds: tAfterPlanet,
    // 24: objetivo pedido y radio del cuerpo, para comparar en «Resultados» (solo descripción del cálculo ya hecho).
    objective: { periapsisAltitudeKm: profile.planet.periapsisAltitudeKm, apoapsisAltitudeKm: profile.planet.captureBurns.at(-1)?.apoapsisAltitudeKm ?? null }, bodyRadiusKm: R, bodyName: tgt.name });
  captured = ins.final.orbit.bound && ins.status !== INSERTION_STATUS.impact;
  if (ins.status === INSERTION_STATUS.flyby) { flybyAndOutbound(ins.final, tAfterPlanet, true); return finish(); }
  if (!captured) return finish();

  // ---- 2. Fase lunar: transferencia planetocéntrica → SOI del satélite → captura → descenso ----------------------------------
  if (moonId) {
    if (ins.status !== INSERTION_STATUS.target) phase('moon-transfer', `Transferencia hacia ${moonProfile.name}`, PHASE_STATUS.skipped, LEVEL.notViable, { detail: 'La órbita de captura planetaria no alcanzó el objetivo; no se planifica la fase lunar sobre una órbita distinta de la diseñada.' });
    else moonPhase();
  } else if (profile.landing?.enabled) {
    const cap = landingCapability(getBodyProfile(input.destinationId));
    phase('landing', `Descenso en ${tgt.name}`, PHASE_STATUS.pending, cap.state === CAPABILITY.notApplicable ? LEVEL.notViable : LEVEL.pending, { detail: cap.reason });
  }
  return finish();

  // ===========================================================================================================================
  // 21: lanzamiento (tramos de 12E girados a ejes eclípticos J2000), aparcamiento, inyección y escape, centrados en la Tierra.
  function appendLaunch() {
    const L = launch, earthBody = { centralBodyId: '399', centralName: 'Tierra', mu: EARTH_GM_KM3_S2 };
    const asc = L.ascent.segments.filter(sg => sg.endSeconds - sg.startSeconds > 1e-9);
    const sep1 = L.ascent.events.find(e => e.id === 'separation');
    asc.forEach((sg, i) => {
      const ks = L.ascentKnots.filter(k => k.elapsedSeconds >= sg.startSeconds - 1e-9 && k.elapsedSeconds <= sg.endSeconds + 1e-9).map(k => ({ ...k }));
      if (ks.length < 2) return;
      // Masas de frontera: la del inicio del tramo; al final, la del siguiente salvo que haya una separación declarada en esa frontera.
      ks[0].massKg = sg.massStartKg;
      const next = asc[i + 1], sepHere = sep1 && Math.abs(sep1.elapsedSeconds - sg.endSeconds) < 1e-6;
      ks.at(-1).massKg = next && !sepHere ? next.massStartKg : sg.massEndKg;
      pushSegment({ id: `launch-${i + 1}`, phase: 'launch', kind: sg.kind === 'burn' ? 'burn' : 'coast', label: `Lanzamiento · ${sg.label}`, ...earthBody,
        startSeconds: sg.startSeconds, endSeconds: sg.endSeconds, localOffsetSeconds: 0, initial: ks[0], final: ks.at(-1), knots: ks, engine: sg.kind === 'burn' ? `${L.launcherName} · ${sg.label}` : null,
        engineKey: 'launcher', massKg: sg.massStartKg });
    });
    if (sep1) separations.push({ elapsedSeconds: sep1.elapsedSeconds, massBeforeKg: sep1.massAfterKg + sep1.jettisonedMassKg, massAfterKg: sep1.massAfterKg, released: `Etapa 1 del lanzador (${sep1.jettisonedMassKg.toFixed(0)} kg)` });
    const stackKg = L.stackMassKg, tAsc = L.ascentEndSeconds, upper = L.upperStage;
    separations.push({ elapsedSeconds: tAsc, massBeforeKg: stackKg + L.stage2JettisonKg, massAfterKg: stackKg, released: `Etapa 2 del lanzador (${L.stage2JettisonKg.toFixed(0)} kg, con ${L.stage2PropellantLeftKg.toFixed(0)} kg de propelente sin usar)` });
    for (const e of L.ascent.events) {
      if (['end', 'ignition-1'].includes(e.id) || e.elapsedSeconds > tAsc + 1e-6) continue;
      const title = e.id === 'liftoff' ? `Despegue desde ${L.site.name}` : `Lanzamiento: ${e.title}`;
      event(`launch-${e.id}`, e.kind, title, e.elapsedSeconds, { centralBodyId: '399' });
    }
    const P = L.parking, I = L.injection, km = x => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    event('parking-orbit', 'orbit', `Órbita de aparcamiento: ${km(P.perigeeAltitudeKm)} × ${km(P.apogeeAltitudeKm)} km, ${P.inclinationDeg.toFixed(2)}° de inclinación`, tAsc, { centralBodyId: '399' });
    if (P.coastSeconds > 1e-6) {
      pushSegment({ id: 'parking-coast', phase: 'parking', kind: 'kepler', label: 'Órbita de aparcamiento', ...earthBody, startSeconds: tAsc, endSeconds: P.endSeconds,
        initial: { positionKm: [...P.state.positionKm], velocityKmS: [...P.state.velocityKmS], massKg: stackKg }, massKg: stackKg });
    }
    pushSegment({ id: 'injection', phase: 'injection', kind: 'burn', label: `Inyección interplanetaria (${upper.name})`, ...earthBody, startSeconds: I.startSeconds, endSeconds: I.endSeconds,
      localOffsetSeconds: 0, initial: I.knots[0], final: I.knots.at(-1), knots: I.knots, engine: upper.name, engineKey: 'upper', massKg: stackKg });
    event('injection-start', 'burn-start', `Encendido de inyección de la ${upper.name.split(' (')[0]}`, I.startSeconds, { centralBodyId: '399', massKg: stackKg });
    event('injection-end', 'burn-end', `Fin de la inyección: C3 = ${I.c3Km2S2.toFixed(2)} km²/s²`, I.endSeconds, { centralBodyId: '399', massKg: I.massAfterKg });
    maneuvers.push({ id: 'injection', label: 'Inyección interplanetaria', engineKey: 'upper', engine: upper.name, centralBodyId: '399', startSeconds: I.startSeconds, endSeconds: I.endSeconds,
      durationSeconds: I.durationSeconds, impulsiveDeltaVKmS: I.impulsiveDeltaVKmS, propulsiveDeltaVKmS: I.propulsiveDeltaVKmS, integratedDeltaVKmS: I.propulsiveDeltaVKmS,
      gravityLossKmS: I.gravityLossKmS, propellantKg: I.propellantKg, massAfterKg: I.massAfterKg, endEvent: 'targeted', kind: 'finite', orbitAfter: null });
    separations.push({ elapsedSeconds: I.endSeconds, massBeforeKg: I.massAfterKg, massAfterKg: mass, released: `${upper.name} (${(I.massAfterKg - mass).toFixed(0)} kg, con ${I.propellantLeftKg.toFixed(0)} kg de propelente sin usar)` });
    event('upper-separation', 'separation', `Separación de la ${upper.name.split(' (')[0]}`, I.endSeconds, { centralBodyId: '399', massKg: mass });
    pushSegment({ id: 'earth-escape', phase: 'earth-escape', kind: 'kepler', label: 'Hipérbola de escape terrestre', ...earthBody, startSeconds: L.escape.startSeconds, endSeconds: L.escape.endSeconds,
      initial: { positionKm: [...L.escape.initial.positionKm], velocityKmS: [...L.escape.initial.velocityKmS], massKg: mass }, massKg: mass });
    event('earth-soi-exit', 'soi', `Salida de la esfera de influencia terrestre (${(L.soiRadiusKm / 1e6).toFixed(3)} millones de km)`, L.exit.elapsedSeconds, { centralBodyId: '10' });
    const residualMmS = norm(sub(L.exit.helioVelocityAchievedKmS, aim.departure.velocityKmS)) * 1e6;
    phase('launch', 'Lanzamiento desde Cabo Cañaveral (12E)', PHASE_STATUS.done, LEVEL.experimental, { startSeconds: 0, endSeconds: tAsc,
      detail: `${L.launcherName} (ilustrativo) con ${(stackKg / 1000).toFixed(1)} t de carga (sonda y ${upper.name} llena). Despegue ${L.liftoffUtc}, ${Math.abs(L.liftoffShiftHours).toFixed(2)} h ${L.liftoffShiftHours < 0 ? 'antes' : 'después'} de la salida prevista (ventana del día para la asíntota). ${L.azimuthNote} Órbita de aparcamiento ${km(P.perigeeAltitudeKm)} × ${km(P.apogeeAltitudeKm)} km, ${P.inclinationDeg.toFixed(2)}°.` });
    phase('parking', 'Órbita de aparcamiento', PHASE_STATUS.done, LEVEL.operational, { startSeconds: tAsc, endSeconds: P.endSeconds,
      detail: `Espera de ${(P.coastSeconds / 60).toFixed(1)} min (periodo ${P.periodMinutes.toFixed(1)} min) hasta el punto de inyección.` });
    phase('injection', `Inyección interplanetaria (empuje finito, ${upper.name.split(' (')[0]})`, PHASE_STATUS.done, LEVEL.experimental, { startSeconds: I.startSeconds, endSeconds: I.endSeconds,
      detail: `Encendido progrado de ${I.durationSeconds.toFixed(1)} s: ${I.propellantKg.toFixed(0)} kg de propelente (quedan ${I.propellantLeftKg.toFixed(0)} kg), Δv ${(I.propulsiveDeltaVKmS * 1000).toFixed(1)} m/s (impulsivo equivalente ${(I.impulsiveDeltaVKmS * 1000).toFixed(1)} m/s; pérdidas por gravedad ${(I.gravityLossKmS * 1000).toFixed(1)} m/s). C3 = ${I.c3Km2S2.toFixed(3)} km²/s².` });
    phase('earth-escape', 'Salida de la esfera de influencia terrestre', PHASE_STATUS.done, LEVEL.operational, { startSeconds: L.escape.startSeconds, endSeconds: L.exit.elapsedSeconds,
      detail: `Hipérbola de escape de ${(L.escape.durationSeconds / 86400).toFixed(2)} d hasta ${km(L.soiRadiusKm)} km. Empalme con el crucero: la velocidad heliocéntrica difiere de la del Lambert en ${residualMmS.toExponential(1)} mm/s (${L.iterations} iteraciones de Newton; ${launchRounds} vuelta(s) con la llegada).` });
  }
  function appendInsertion(result, offset, body, context) {
    for (const s of result.segments) {
      pushSegment({ id: `${context}-${s.id}`, phase: s.kind === 'burn' ? `${context}-capture` : s.id.endsWith('final-coast') ? `${context}-orbit` : `${context}-approach`, kind: s.kind,
        label: s.label, centralBodyId: body.id, centralName: body.name, mu: s.mu, startSeconds: offset + s.startSeconds, endSeconds: offset + s.endSeconds, localOffsetSeconds: offset,
        initial: s.initial, final: s.final, knots: s.knots ?? null, engine: s.engine ?? null, engineKey, massKg: s.initial.massKg });
    }
    for (const e of result.events) event(`${context}-${e.id}`, e.kind, e.title, offset + e.elapsedSeconds, { centralBodyId: body.id, massKg: e.massKg });
    for (const b of result.burns) maneuvers.push({ id: `${context}-${b.id}`, label: b.label, engineKey, engine: b.engine, centralBodyId: body.id, startSeconds: offset + b.startSeconds, endSeconds: offset + b.endSeconds,
      durationSeconds: b.durationSeconds, impulsiveDeltaVKmS: b.impulsiveDeltaVKmS, propulsiveDeltaVKmS: b.propulsiveDeltaVKmS, integratedDeltaVKmS: b.integratedDeltaVKmS,
      gravityLossKmS: b.gravityLossKmS, propellantKg: b.propellantKg, massAfterKg: b.massAfterKg, endEvent: b.endEvent, orbitAfter: b.orbitAfter, kind: 'finite' });
  }
  function summarizeInsertion(result, radius) {
    const o = result.final.orbit;
    return { status: result.status, failure: result.failure, burns: result.burns.map(b => ({ label: b.label, durationSeconds: b.durationSeconds, propellantKg: b.propellantKg, propulsiveDeltaVKmS: b.propulsiveDeltaVKmS,
      impulsiveDeltaVKmS: b.impulsiveDeltaVKmS, gravityLossKmS: b.gravityLossKmS, endEvent: b.endEvent })),
      finalOrbit: { bound: o.bound, periapsisAltitudeKm: o.periapsisRadiusKm - radius, apoapsisAltitudeKm: o.bound ? o.apoapsisRadiusKm - radius : null, eccentricity: o.eccentricity,
        periodHours: o.periodSeconds ? o.periodSeconds / 3600 : null, inclinationDeg: o.inclinationDeg, vInfKmS: o.vInfKmS } };
  }
  // Sobrevuelo: rama hiperbólica hasta salir de la SOI y crucero heliocéntrico posterior (limitado por la cobertura).
  function flybyAndOutbound(state, offset, afterFailedCapture = false) {
    const c = conicSummary(state.positionKm, state.velocityKmS, mu);
    if (c.periapsisKm < R && norm(state.positionKm) > c.periapsisKm) { phase('flyby', 'Sobrevuelo', PHASE_STATUS.failed, LEVEL.notViable, { detail: 'La hipérbola corta la superficie: impacto.' }); return; }
    // Tiempo hasta |r| = r_SOI en la rama de salida (bisección sobre la cónica).
    const f = x => norm(propagateKepler(state.positionKm, state.velocityKmS, x, mu).positionKm) - soiKm;
    let a = 0, b = Math.max(86400, 2 * approachInfo.secondsSoiToPeriapsis + 86400);
    while (f(b) < 0 && b < 1e10) b *= 2;
    for (let i = 0; i < 200 && b - a > 1e-3; i++) { const m = (a + b) / 2; if (f(m) < 0) a = m; else b = m; }
    const tExit = offset + b;
    pushSegment({ id: 'flyby', phase: 'flyby', kind: 'kepler', label: afterFailedCapture ? 'Rama de salida tras la captura fallida' : `Sobrevuelo de ${tgt.name}`, centralBodyId: tgt.id, centralName: tgt.name, mu,
      startSeconds: offset, endSeconds: tExit, initial: { positionKm: [...state.positionKm], velocityKmS: [...state.velocityKmS], massKg: mass }, massKg: mass });
    const atExit = propagateKepler(state.positionKm, state.velocityKmS, b, mu), jdExit = departureJdTdb + tExit / 86400, p = helioState(tgt.ephemerisId, jdExit);
    event('soi-exit', 'soi', `Salida de la esfera de influencia de ${tgt.name}`, tExit, { centralBodyId: '10' });
    const peri = c.periapsisKm;
    phase('flyby', afterFailedCapture ? `Sobrevuelo de ${tgt.name} (captura fallida)` : `Sobrevuelo de ${tgt.name}`, afterFailedCapture ? PHASE_STATUS.failed : PHASE_STATUS.done, afterFailedCapture ? LEVEL.notViable : LEVEL.experimental,
      { detail: `Periapsis ${(peri - R).toFixed(1)} km de altitud; v∞ de salida ${Math.sqrt(2 * c.specificEnergyKm2S2).toFixed(4)} km/s; giro de la asíntota por la gravedad del planeta.`, startSeconds: offset, endSeconds: tExit });
    if (!p) { warnings.push('Efemérides no disponibles tras la salida de la SOI: no se propaga el crucero posterior.'); return; }
    let outbound = profile.flybyOutboundDays * 86400;
    const cov = data.helio.coverageEnd ?? data.helio.endJdTdb ?? null;
    if (cov) outbound = Math.min(outbound, (cov - jdExit) * 86400);
    if (outbound > 0) pushSegment({ id: 'outbound', phase: 'outbound', kind: 'kepler', label: 'Crucero heliocéntrico posterior (balístico)', centralBodyId: '10', centralName: 'Sol', mu: MU_SUN,
      startSeconds: tExit, endSeconds: tExit + outbound, initial: { positionKm: add(atExit.positionKm, p.positionKm), velocityKmS: add(atExit.velocityKmS, p.velocityKmS), massKg: mass }, massKg: mass });
  }
  function moonPhase() {
    const moon = moonProfile, moonMu = moon.gm.value, moonR = moon.radiusKm.value, mp = profile.moon ?? {};
    const startJd = departureJdTdb + tAfterPlanet / 86400;
    if (!moonState(moonKey, startJd)) { phase('moon-transfer', `Transferencia hacia ${moon.name}`, PHASE_STATUS.noData, LEVEL.pending, { detail: `Efemérides de satélites no disponibles para el intervalo solicitado (${moon.name} en ${tdbToTimeScales(startJd).labelUtc}).` }); return; }
    const period = planetFinal.orbit.periodSeconds;
    const offsets = [], tofs = [];
    const depSpan = Math.min(period, (mp.departureWindowDays ?? 60) * 86400), nDep = mp.departureSamples ?? 72;
    for (let i = 1; i <= nDep; i++) offsets.push(depSpan * i / nDep);
    const tofMin = (mp.tofMinDays ?? 0.5) * 86400, tofMax = (mp.tofMaxDays ?? 20) * 86400, nTof = mp.tofSamples ?? 48;
    for (let j = 0; j <= nTof; j++) tofs.push(tofMin + (tofMax - tofMin) * j / nTof);
    const rpMoon = moonR + (mp.periapsisAltitudeKm ?? 100), raMoon = moonR + ((mp.captureBurns ?? [{ apoapsisAltitudeKm: 100 }]).at(-1).apoapsisAltitudeKm);
    const search = searchMoonTransfer({ spacecraft: { positionKm: planetFinal.positionKm, velocityKmS: planetFinal.velocityKmS, jdTdb: startJd }, mu, centralRadiusKm: R,
      moonStateAt: jd => moonState(moonKey, jd), moon: { mu: moonMu, periapsisRadiusKm: rpMoon, apoapsisRadiusKm: raMoon }, departureOffsetsSeconds: offsets, tofSecondsList: tofs,
      objective: mp.mode === 'flyby' ? 'flyby' : 'capture' });
    if (!search.best) { phase('moon-transfer', `Transferencia hacia ${moon.name}`, PHASE_STATUS.failed, LEVEL.notViable, { detail: `Sin transferencia de cero revoluciones válida en la búsqueda (${search.evaluated} evaluadas).` }); return; }
    const best = search.best, tBurnLocal = best.departureOffsetSeconds;
    const moonNow = moonState(moonKey, startJd + (tBurnLocal + best.tofSeconds) / 86400);
    const moonOrbit = osculatingOrbitOfBody(moonNow.positionKm, moonNow.velocityKmS, mu + moonMu);
    const moonSoi = sphereOfInfluenceRadiusKm({ model: profile.soiModel, semiMajorAxisKm: moonOrbit.semiMajorAxisKm, eccentricity: moonOrbit.eccentricity, muBody: moonMu, muPrimary: mu });
    const scAtBurn = propagateKepler(planetFinal.positionKm, planetFinal.velocityKmS, tBurnLocal, mu);
    const moonAim = aimEncounter({ departurePositionKm: scAtBurn.positionKm, departureJdTdb: startJd + tBurnLocal / 86400, periapsisJdTdb: startJd + (tBurnLocal + best.tofSeconds) / 86400,
      targetStateAt: jd => moonState(moonKey, jd), muCentral: mu, muTarget: moonMu, targetRadiusKm: moonR, periapsisRadiusKm: rpMoon,
      bPlane: { mode: 'normal', normal: cross(moonNow.positionKm, moonNow.velocityKmS) }, soiRadiusKm: moonSoi, centralRadiusKm: R });
    if (moonAim.status !== AIM_STATUS.aimed) { phase('moon-transfer', `Transferencia hacia ${moon.name}`, moonAim.status === AIM_STATUS.noCoverage ? PHASE_STATUS.noData : PHASE_STATUS.failed, LEVEL.notViable, { detail: moonAim.reason }); return; }
    // Encendido FINITO que reproduce la salida apuntada (método de disparo hasta el punto de entrada en la SOI del satélite).
    const arrivalLocal = elapsedOf(startJd, moonAim.soi.jdTdb);
    const burn = targetFiniteBurn({ mu, positionKm: planetFinal.positionKm, velocityKmS: planetFinal.velocityKmS, massKg: mass, propellantKg: tanks[engineKey], engine,
      burnCenterSeconds: tBurnLocal, aimPositionKm: moonAim.soi.aimPositionKm, arrivalSeconds: arrivalLocal, initialDeltaVKmS: sub(moonAim.departure.velocityKmS, scAtBurn.velocityKmS), centralRadiusKm: R });
    const transferDetail = `Búsqueda: ${search.evaluated} transferencias evaluadas; mejor Δv impulsivo de salida ${(best.transferDeltaVKmS * 1000).toFixed(1)} m/s + captura ideal ${(best.captureDeltaVKmS * 1000).toFixed(1)} m/s (v∞ en ${moon.name} ${best.vInfMoonKmS.toFixed(3)} km/s). Sin asistencias gravitacionales de otros satélites.`;
    if (!burn.converged) { phase('moon-transfer', `Transferencia hacia ${moon.name}`, PHASE_STATUS.failed, LEVEL.notViable, { detail: `${burn.reason} ${transferDetail}`, search: { evaluated: search.evaluated, best } }); return; }
    const off = tAfterPlanet;
    // Tramos: órbita de captura (balística) → encendido de transferencia (DOPRI54) → arco balístico hasta la SOI del satélite.
    if (burn.startSeconds > 0) pushSegment({ id: 'planet-orbit-wait', phase: 'planet-orbit', kind: 'kepler', label: `Órbita de captura en ${tgt.name} (espera de la salida)`, centralBodyId: tgt.id, centralName: tgt.name, mu,
      startSeconds: off, endSeconds: off + burn.startSeconds, initial: { positionKm: [...planetFinal.positionKm], velocityKmS: [...planetFinal.velocityKmS], massKg: mass }, massKg: mass });
    const massBefore = mass;
    pushSegment({ id: 'moon-transfer-burn', phase: 'moon-transfer', kind: 'burn', label: `Encendido de transferencia hacia ${moon.name} (dirección inercial fija)`, centralBodyId: tgt.id, centralName: tgt.name, mu,
      startSeconds: off + burn.startSeconds, endSeconds: off + burn.endSeconds, localOffsetSeconds: off, knots: burn.knots, engine, engineKey,
      initial: { positionKm: burn.preBurn.positionKm, velocityKmS: burn.preBurn.velocityKmS, massKg: massBefore }, final: { positionKm: burn.postBurn.positionKm, velocityKmS: burn.postBurn.velocityKmS, massKg: burn.massAfterKg }, massKg: massBefore });
    mass = burn.massAfterKg; tanks[engineKey] -= burn.propellantKg;
    maneuvers.push({ id: 'moon-transfer-burn', label: `Transferencia hacia ${moon.name}`, engineKey, engine: engine.name, centralBodyId: tgt.id, startSeconds: off + burn.startSeconds, endSeconds: off + burn.endSeconds,
      durationSeconds: burn.durationSeconds, impulsiveDeltaVKmS: best.transferDeltaVKmS, propulsiveDeltaVKmS: burn.propulsiveDeltaVKmS, integratedDeltaVKmS: burn.integratedDeltaVKmS,
      gravityLossKmS: burn.propulsiveDeltaVKmS - norm(sub(moonAim.departure.velocityKmS, scAtBurn.velocityKmS)), propellantKg: burn.propellantKg, massAfterKg: burn.massAfterKg, endEvent: 'targeted', kind: 'finite', missKm: burn.missKm });
    event('moon-transfer-start', 'burn-start', `Encendido de transferencia hacia ${moon.name} · inicio`, off + burn.startSeconds, { centralBodyId: tgt.id });
    event('moon-transfer-end', 'burn-end', `Encendido de transferencia · fin (error de apuntado ${burn.missKm.toFixed(3)} km)`, off + burn.endSeconds, { centralBodyId: tgt.id });
    pushSegment({ id: 'moon-transfer-coast', phase: 'moon-transfer', kind: 'kepler', label: `Arco planetocéntrico hacia ${moon.name} (balístico)`, centralBodyId: tgt.id, centralName: tgt.name, mu,
      startSeconds: off + burn.endSeconds, endSeconds: off + arrivalLocal, initial: { positionKm: burn.postBurn.positionKm, velocityKmS: burn.postBurn.velocityKmS, massKg: mass }, massKg: mass });
    phase('planet-orbit', `Órbita de captura en ${tgt.name}`, PHASE_STATUS.done, LEVEL.experimental, { detail: `${((burn.startSeconds) / 86400).toFixed(2)} d de espera en la órbita de captura hasta la salida óptima de la búsqueda.`, startSeconds: off, endSeconds: off + burn.startSeconds });
    phase('moon-transfer', `Transferencia planetocéntrica hacia ${moon.name}`, PHASE_STATUS.done, LEVEL.experimental, { detail: `${transferDetail} Encendido finito ${burn.durationSeconds.toFixed(0)} s, ${burn.propellantKg.toFixed(0)} kg, Δv ${(burn.propulsiveDeltaVKmS * 1000).toFixed(1)} m/s; error en la SOI ${burn.missKm.toFixed(3)} km.`,
      startSeconds: off + burn.startSeconds, endSeconds: off + arrivalLocal, search: { evaluated: search.evaluated, rejected: search.rejected, best } });
    // Estado REAL en la SOI del satélite (tras el encendido finito), relativo al satélite con su efeméride en esa época.
    const tMoonSoi = off + arrivalLocal, jdMoonSoi = departureJdTdb + tMoonSoi / 86400, mNow = moonState(moonKey, jdMoonSoi);
    const relMoon = { positionKm: sub(burn.arrival.positionKm, mNow.positionKm), velocityKmS: sub(burn.arrival.velocityKmS, mNow.velocityKmS) };
    event('moon-soi-entry', 'soi', `Entrada en la esfera de influencia de ${moon.name} (${moonSoi.toFixed(0)} km)`, tMoonSoi, { centralBodyId: moon.id });
    const moonBody = { id: moon.id, name: moon.name };
    const moonBurns = (mp.captureBurns ?? [{ apoapsisAltitudeKm: 100 }]).map((b, i) => ({ id: `moon-capture-${i + 1}`, label: i === 0 ? `Inserción en órbita de ${moon.name}` : `Reducción de apoapsis en ${moon.name} ${i + 1}`, targetApoapsisRadiusKm: moonR + b.apoapsisAltitudeKm }));
    const relConic = conicSummary(relMoon.positionKm, relMoon.velocityKmS, moonMu);
    const moonApproach = { soiRadiusKm: moonSoi, vInfKmS: Math.sqrt(Math.max(0, 2 * relConic.specificEnergyKm2S2)), periapsisAltitudeKm: relConic.periapsisKm - moonR, periapsisTargetAltitudeKm: rpMoon - moonR, aimIterations: moonAim.iterations };
    if (mp.mode === 'flyby') { moonFlyby({ moon, moonMu, moonR, moonSoi, relMoon, relConic, moonApproach, tMoonSoi }); return; }
    const mins = simulateInsertion({ mu: moonMu, bodyRadiusKm: moonR, bodyName: moon.name, positionKm: relMoon.positionKm, velocityKmS: relMoon.velocityKmS,
      vehicle: { massKg: mass, propellantKg: tanks[engineKey], engine }, burns: moonBurns, coastAfterSeconds: (mp.orbitCoastHours ?? 2) * 3600 });
    const mRef = impulsiveInsertionReference({ mu: moonMu, vInfKmS: moonApproach.vInfKmS, periapsisRadiusKm: relConic.periapsisKm, burns: moonBurns, massKg: mass, ispS: engine.ispS });
    appendInsertion(mins, tMoonSoi, moonBody, 'moon');
    tanks[engineKey] -= mins.totals.propellantKg; mass = mins.final.massKg;
    const tAfterMoon = tMoonSoi + mins.durationSeconds;
    phase('moon-approach', `Aproximación a ${moon.name}`, PHASE_STATUS.done, LEVEL.experimental, { detail: `Periapsis resultante ${moonApproach.periapsisAltitudeKm.toFixed(2)} km (objetivo ${moonApproach.periapsisTargetAltitudeKm} km); v∞ ${moonApproach.vInfKmS.toFixed(4)} km/s.`, approach: moonApproach, startSeconds: tMoonSoi });
    const moonStatus = { [INSERTION_STATUS.target]: PHASE_STATUS.done, [INSERTION_STATUS.partial]: PHASE_STATUS.partial }[mins.status] ?? PHASE_STATUS.failed;
    phase('moon-capture', `Captura en ${moon.name} (empuje finito)`, moonStatus, mins.status === INSERTION_STATUS.target ? LEVEL.experimental : LEVEL.notViable, {
      detail: `${mins.status}. ${mins.failure ?? ''} Propelente ${mins.totals.propellantKg.toFixed(1)} kg · Δv ${(mins.totals.propulsiveDeltaVKmS * 1000).toFixed(1)} m/s (referencia impulsiva ${(mRef.totalDeltaVKmS * 1000).toFixed(1)} m/s).${resultingOrbitNote(mins, moonApproach.periapsisAltitudeKm)}`,
      insertion: summarizeInsertion(mins, moonR), reference: mRef, startSeconds: tMoonSoi, endSeconds: tAfterMoon,
      objective: { periapsisAltitudeKm: rpMoon - moonR, apoapsisAltitudeKm: raMoon - moonR }, bodyRadiusKm: moonR, bodyName: moon.name });
    approachInfo.moon = moonApproach;
    // Cribado de otros satélites durante la fase joviana (validez de la cónica parcheada).
    const others = Object.entries(MOON_WINDOW_KEYS).filter(([id]) => id !== moonId && data.moons?.coverage?.(MOON_WINDOW_KEYS[id])).map(([id, key]) => {
      const p = getBodyProfile(id), st = moonState(key, startJd);
      const o = st ? osculatingOrbitOfBody(st.positionKm, st.velocityKmS, mu + p.gm.value) : null;
      return { key, name: p.name, stateAt: jd => moonState(key, jd), soiKm: o ? sphereOfInfluenceRadiusKm({ model: profile.soiModel, semiMajorAxisKm: o.semiMajorAxisKm, muBody: p.gm.value, muPrimary: mu }) : 0 };
    });
    const jovian = segments.filter(s => s.centralBodyId === tgt.id);
    approachInfo.closeApproaches = screenCloseApproaches({ sampleSpacecraft: t => samplePlain(jovian, t).positionKm, startSeconds: jovian[0].startSeconds, endSeconds: jovian.at(-1).endSeconds,
      jdAt: t => departureJdTdb + t / 86400, moons: others, stepSeconds: 1200 });
    for (const c of approachInfo.closeApproaches) if (c.insideSoi) warnings.push(`El tramo planetocéntrico entra en la esfera de influencia de ${c.name} (mínimo ${c.minimumDistanceKm.toFixed(0)} km): la cónica parcheada respecto a ${tgt.name} no es válida allí y ese sobrevuelo no está modelado.`);
    if (!(mins.status === INSERTION_STATUS.target || mins.status === INSERTION_STATUS.partial) || !mins.final.orbit.bound) return;
    // ---- Descenso 12F: solo si el estado final es compatible con su órbita inicial ------------------------------------------
    if (!vehicle.landerSpec || !profile.landing?.enabled) { phase('landing', `Descenso en ${moon.name}`, PHASE_STATUS.skipped, LEVEL.experimental, { detail: 'Sin módulo de aterrizaje en la configuración.' }); return; }
    const cap = landingCapability(moon);
    if (![CAPABILITY.operational, CAPABILITY.experimental].includes(cap.state)) { phase('landing', `Descenso en ${moon.name}`, PHASE_STATUS.pending, LEVEL.pending, { detail: cap.reason }); return; }
    const fin = mins.final;
    let elements;
    try { elements = classicalElements(fin.positionKm, fin.velocityKmS, moonMu, moonR); }
    catch (error) { phase('landing', `Descenso en ${moon.name}`, PHASE_STATUS.failed, LEVEL.notViable, { detail: error.message }); return; }
    const env = createLandingEnvironment(moon), check = initialOrbitState(env, elements);
    const residual = { positionKm: norm(sub(check.positionKm, fin.positionKm)), velocityKmS: norm(sub(check.velocityKmS, fin.velocityKmS)) };
    if (residual.positionKm > 1e-6 || residual.velocityKmS > 1e-9) { phase('landing', `Descenso en ${moon.name}`, PHASE_STATUS.failed, LEVEL.notViable, { detail: `Estado final no representable como órbita inicial de 12F (residuo ${residual.positionKm} km).` }); return; }
    // Separación: el módulo de propulsión se queda en órbita; descienden la sonda (carga útil, con su propelente sin usar) y el módulo de aterrizaje.
    const descentMass = vehicle.probe.wetKg - (vehicle.probe.propellantKg - tanks.probe) + vehicle.lander.wetKg;
    separations.push({ elapsedSeconds: tAfterMoon, massBeforeKg: mass, massAfterKg: descentMass, released: vehicle.module ? `${vehicle.module.name} (${(mass - descentMass).toFixed(0)} kg, queda en órbita)` : 'nada' });
    event('separation', 'separation', `Separación del módulo de propulsión (queda en órbita de ${moon.name})`, tAfterMoon, { centralBodyId: moon.id });
    const payloadKg = vehicle.probe.wetKg - (vehicle.probe.propellantKg - tanks.probe);
    let sim;
    try { sim = simulateLanding({ profile: moon, lander: vehicle.landerSpec, payloadMassKg: payloadKg, options: { orbit: elements, epochUtc: tdbToTimeScales(departureJdTdb + tAfterMoon / 86400).labelUtc } }); }
    catch (error) { phase('landing', `Descenso en ${moon.name}`, PHASE_STATUS.failed, LEVEL.notViable, { detail: error.message }); return; }
    pushSegment({ id: 'landing', phase: 'landing', kind: 'landing', label: `Descenso propulsado en ${moon.name} (12F)`, centralBodyId: moon.id, centralName: moon.name, mu: moonMu,
      startSeconds: tAfterMoon, endSeconds: tAfterMoon + sim.endSeconds, localOffsetSeconds: tAfterMoon, simulation: sim, massKg: descentMass,
      initial: { positionKm: sim.knots[0].positionKm, velocityKmS: sim.knots[0].velocityKmS, massKg: sim.knots[0].massKg } });
    // Los títulos de 12F imprimen los elementos sin redondear; aquí se muestran con 3 decimales (el valor numérico no cambia).
    for (const e of sim.events) if (e.id !== 'end') event(`landing-${e.id}`, e.kind, e.title.replace(/(\d+\.\d{3})\d+/g, '$1'), tAfterMoon + e.elapsedSeconds, { centralBodyId: moon.id });
    mass = sim.final.massKg; tanks.lander = sim.final.fuelKg;
    maneuvers.push({ id: 'landing', label: `Descenso en ${moon.name}`, engineKey: 'lander', engine: vehicle.landerSpec.engine.name, centralBodyId: moon.id, startSeconds: tAfterMoon, endSeconds: tAfterMoon + sim.endSeconds,
      durationSeconds: sim.endSeconds, propulsiveDeltaVKmS: sim.totals.propulsiveDeltaVMS / 1000, propellantKg: sim.totals.propellantConsumedKg, massAfterKg: sim.final.massKg, endEvent: sim.outcome, kind: 'guided-finite' });
    phase('landing', `Descenso en ${moon.name} (12F, conectado)`, sim.outcome.startsWith('ATERRIZAJE SUAVE') ? PHASE_STATUS.done : PHASE_STATUS.failed, sim.outcome.startsWith('ATERRIZAJE SUAVE') ? LEVEL.experimental : LEVEL.notViable, {
      detail: `${sim.outcome}. Órbita inicial = estado final de la captura (residuo ${residual.positionKm.toExponential(1)} km). El modelo 12F es de un solo cuerpo: omite la marea de ${tgt.name} durante el descenso.`, startSeconds: tAfterMoon, endSeconds: tAfterMoon + sim.endSeconds,
      landing: { outcome: sim.outcome, contact: sim.contact, reasons: sim.reasons, propellantKg: sim.totals.propellantConsumedKg, elements, residual } });
  }
  // 15: sobrevuelo balístico del satélite (sin encendido de captura). La hipérbola relativa al satélite se propaga hasta la salida
  // de su SOI; después, el estado se traslada al marco del planeta con la efeméride del satélite en esa época y se propaga un arco
  // planetocéntrico balístico. Solo actúa el cuerpo central de cada tramo (cónicas parcheadas).
  function moonFlyby({ moon, moonMu, moonR, moonSoi, relMoon, relConic, moonApproach, tMoonSoi }) {
    const mp = profile.moon ?? {};
    phase('moon-approach', `Aproximación a ${moon.name}`, PHASE_STATUS.done, LEVEL.experimental, { detail: `Periapsis resultante ${moonApproach.periapsisAltitudeKm.toFixed(2)} km (objetivo ${moonApproach.periapsisTargetAltitudeKm} km); v∞ ${moonApproach.vInfKmS.toFixed(4)} km/s.`,
      approach: moonApproach, startSeconds: tMoonSoi });
    if (relConic.periapsisKm < moonR) { phase('moon-flyby', `Sobrevuelo de ${moon.name}`, PHASE_STATUS.failed, LEVEL.notViable, { detail: 'La hipérbola corta la superficie del satélite: impacto.' }); return; }
    const tPeri = timeToNextPeriapsis(relMoon.positionKm, relMoon.velocityKmS, moonMu).seconds ?? 0;
    const f = x => norm(propagateKepler(relMoon.positionKm, relMoon.velocityKmS, x, moonMu).positionKm) - moonSoi;
    let a = Math.max(0, tPeri), b = Math.max(2 * tPeri, tPeri + 3600);
    while (f(b) < 0 && b < 1e9) b *= 2;
    for (let i = 0; i < 200 && b - a > 1e-3; i++) { const m = (a + b) / 2; if (f(m) < 0) a = m; else b = m; }
    const tExit = tMoonSoi + b, jdExit = departureJdTdb + tExit / 86400;
    pushSegment({ id: 'moon-flyby', phase: 'moon-flyby', kind: 'kepler', label: `Sobrevuelo de ${moon.name} (balístico)`, centralBodyId: moon.id, centralName: moon.name, mu: moonMu,
      startSeconds: tMoonSoi, endSeconds: tExit, initial: { positionKm: [...relMoon.positionKm], velocityKmS: [...relMoon.velocityKmS], massKg: mass }, massKg: mass });
    const vPeri = Math.sqrt(moonApproach.vInfKmS ** 2 + 2 * moonMu / relConic.periapsisKm);
    event('moon-closest', 'periapsis', `Máxima aproximación a ${moon.name}: ${(relConic.periapsisKm - moonR).toFixed(1)} km de altitud`, tMoonSoi + tPeri, { centralBodyId: moon.id });
    event('moon-soi-exit', 'soi', `Salida de la esfera de influencia de ${moon.name}`, tExit, { centralBodyId: tgt.id });
    const turnDeg = 2 * Math.asin(Math.min(1, 1 / relConic.eccentricity)) * 180 / Math.PI;
    phase('moon-flyby', `Sobrevuelo de ${moon.name}`, PHASE_STATUS.done, LEVEL.experimental, {
      detail: `Altitud mínima ${(relConic.periapsisKm - moonR).toFixed(1)} km; velocidad relativa ${vPeri.toFixed(3)} km/s en el periapsis; v∞ ${moonApproach.vInfKmS.toFixed(3)} km/s; giro de la asíntota ${turnDeg.toFixed(2)}° por la gravedad de ${moon.name}. Sin encendido.`,
      startSeconds: tMoonSoi, endSeconds: tExit, flyby: { periapsisAltitudeKm: relConic.periapsisKm - moonR, periapsisSpeedKmS: vPeri, vInfKmS: moonApproach.vInfKmS, turnAngleDeg: turnDeg } });
    const mExit = moonState(moonKey, jdExit);
    if (!mExit) { warnings.push(`Efemérides de ${moon.name} no disponibles tras la salida de su SOI: no se propaga el arco posterior.`); return; }
    const atExit = propagateKepler(relMoon.positionKm, relMoon.velocityKmS, b, moonMu);
    const hours = (mp.outboundHours ?? 48) * 3600;
    pushSegment({ id: 'moon-outbound', phase: 'planet-orbit', kind: 'kepler', label: `Arco planetocéntrico tras el sobrevuelo de ${moon.name}`, centralBodyId: tgt.id, centralName: tgt.name, mu,
      startSeconds: tExit, endSeconds: tExit + hours, initial: { positionKm: add(atExit.positionKm, mExit.positionKm), velocityKmS: add(atExit.velocityKmS, mExit.velocityKmS), massKg: mass }, massKg: mass });
  }
  // 15: balance de energía de la sonda a lo largo de toda la cadena. Generación (solar a la distancia heliocéntrica calculada y
  // RTG según el tiempo transcurrido) frente a consumo de servicio, más el del motor de la sonda durante sus encendidos. El
  // déficit se integra en el tiempo y se compara con la batería (cargada al inicio y sin recarga posterior: criterio conservador).
  // Los módulos ilustrativos de propulsión y aterrizaje no declaran consumo y no se cargan a la sonda.
  function evaluateMissionPower(durationSeconds) {
    const p = vehicle.power;
    if (!segments.length || !(durationSeconds > 0) || !p) return null;
    const planetDistance = jd => { const s = helioState(tgt.ephemerisId, jd) ?? planetAtArrival; return norm(s.positionKm) / AU_KM; };
    const distanceAt = t => {
      let seg = segments[0];
      for (const s of segments) if (t >= s.startSeconds - 1e-9) seg = s;
      if (seg.centralBodyId === '10') return norm(sampleSegmentNative(seg, t).positionKm) / AU_KM;
      if (seg.centralBodyId === '399') { const e = helioState('399', departureJdTdb + t / 86400) ?? earth; return norm(e.positionKm) / AU_KM; }
      return planetDistance(departureJdTdb + t / 86400);
    };
    const sample = t => { const rAu = distanceAt(t), years = t / 86400 / JULIAN_YEAR_DAYS, g = generationAt(p.sources, { distanceAu: rAu, yearsSinceLaunch: years });
      return { elapsedSeconds: t, distanceAu: rAu, generationW: g.totalW, solarW: g.solarW, rtgW: g.rtgW, loadW: p.serviceW, marginW: g.totalW - p.serviceW }; };
    const N = 480, samples = [];
    for (let i = 0; i <= N; i++) samples.push(sample(durationSeconds * i / N));
    let deficitWh = 0;
    for (let i = 1; i <= N; i++) deficitWh += (Math.max(0, -samples[i - 1].marginW) + Math.max(0, -samples[i].marginW)) / 2 * (durationSeconds / N) / 3600;
    const burns = maneuvers.filter(m => m.engineKey === 'probe' && m.durationSeconds > 0).map(m => {
      const mid = sample((m.startSeconds + m.endSeconds) / 2), engineW = engine?.inputPowerW ?? p.engineActiveW;
      const extraWh = (Math.max(0, p.serviceW + engineW - mid.generationW) - Math.max(0, -mid.marginW)) * m.durationSeconds / 3600;
      deficitWh += extraWh;
      return { id: m.id, label: m.label, distanceAu: mid.distanceAu, generationW: mid.generationW, loadW: p.serviceW + engineW, marginW: mid.generationW - p.serviceW - engineW, extraDeficitWh: extraWh };
    });
    const worst = samples.reduce((a, b) => (b.marginW < a.marginW ? b : a));
    const sustainable = deficitWh <= p.batteryWh + 1e-9;
    const when = tdbToTimeScales(departureJdTdb + worst.elapsedSeconds / 86400).labelUtc.slice(0, 10);
    const detail = !(p.sources.length) ? 'La sonda no tiene generación eléctrica.'
      : `${sustainable ? 'Energía suficiente' : 'Energía insuficiente'} según el modelo: margen mínimo ${worst.marginW.toFixed(0)} W a ${worst.distanceAu.toFixed(2)} AU (${when}), con ${worst.generationW.toFixed(0)} W generados frente a ${p.serviceW.toFixed(0)} W de servicio. `
        + `Déficit acumulado ${deficitWh.toFixed(0)} Wh frente a ${p.batteryWh.toFixed(0)} Wh de batería${burns.length ? `; ${burns.length} encendido(s) de la sonda incluidos` : ''}.`;
    phase('power', 'Energía eléctrica (solar y RTG)', sustainable ? PHASE_STATUS.done : PHASE_STATUS.failed, sustainable ? LEVEL.experimental : LEVEL.notViable, { detail });
    const stride = Math.max(1, Math.round(N / 120));
    return { sustainable, deficitWh, batteryWh: p.batteryWh, serviceW: p.serviceW, worst, burns, samples: samples.filter((_, i) => i % stride === 0 || i === N),
      model: 'Solar P₁·r^(−k) a la distancia heliocéntrica calculada; RTG P₀·e^(−λt); sin eclipses, orientación ni recarga de batería.' };
  }
  function finish() {
    segments.sort((a, b) => a.startSeconds - b.startSeconds);
    events.sort((a, b) => a.elapsedSeconds - b.elapsedSeconds);
    const durationSeconds = segments.length ? segments.at(-1).endSeconds : 0;
    const power = evaluateMissionPower(durationSeconds);
    const continuity = checkContinuity(segments, separations, data, tgt, moonKey, departureJdTdb);
    const failed = phases.filter(p => p.status === PHASE_STATUS.failed || p.status === PHASE_STATUS.noData);
    const verdict = failed.length ? `NO VIABLE para el escenario configurado: ${failed[0].label} — ${failed[0].status.toLowerCase()}.`
      : phases.some(p => p.status === PHASE_STATUS.partial) ? 'CADENA CALCULADA CON OBJETIVOS NO ALCANZADOS.'
        : 'CADENA CALCULADA COMPLETA SEGÚN EL MODELO (cónicas parcheadas). Viabilidad operativa: no verificada.';
    return Object.freeze({ kind: 'integrated', model: INTEGRATED_MISSION_VERSION, destinationId: tgt.id, destinationName: tgt.name, target: tgt, moonId, moonName: moonProfile?.name ?? null,
      opportunity: { ...input.opportunity }, departureJdTdb, arrivalJdTdb, profile, vehicle, designSignature: vehicle.designSignature, aim: aim.status === AIM_STATUS.aimed ? aim : { status: aim.status, reason: aim.reason },
      approach: approachInfo, segments, events, phases, maneuvers, separations, tanks: { ...tanks }, finalMassKg: mass, durationSeconds, continuity, warnings, verdict, power,
      departure: launch?.ok ? { c3Km2S2: launch.injection.c3Km2S2, vInfKmS: launch.injection.vInfKmS, vInfVectorKmS: departureVInf, launchMassKg: vehicle.totalKg, fromPad: true }
        : departureVInf ? { c3Km2S2: norm(departureVInf) ** 2, vInfKmS: norm(departureVInf), vInfVectorKmS: departureVInf, launchMassKg: vehicle.totalKg, fromPad: false } : null,
      launch: launch ? launchSummary(launch, launchRounds, aim) : null, plannedDepartureJdTdb,
      computeMs: (typeof performance !== 'undefined' ? performance.now() : 0) - t0,
      limits: MISSION_LIMITS });
  }
}

/** 21: resumen del lanzamiento para el resultado (sin los nudos ni la simulación de 12E completa). */
function launchSummary(L, rounds, aim) {
  const base = { model: L.model, status: L.status, ok: L.ok, reason: L.reason, launcherName: L.launcherName, site: L.site, upperStage: L.upperStage, stackMassKg: L.stackMassKg,
    azimuthDeg: L.azimuthDeg ?? null, declinationDeg: L.declinationDeg ?? null };
  if (!L.ok) return Object.freeze(base);
  return Object.freeze({ ...base, azimuthNote: L.azimuthNote, liftoffJdTdb: L.liftoffJdTdb, liftoffUtc: L.liftoffUtc, liftoffShiftHours: L.liftoffShiftHours, gmstDeg: L.gmstDeg,
    ascentSeconds: L.ascentEndSeconds, liftoffThrustToWeight: L.ascent.stack.liftoffThrustToWeight, liftoffMassKg: L.ascent.stack.liftoffMassKg, maxQ: L.ascent.maxQ,
    stage2JettisonKg: L.stage2JettisonKg, stage2PropellantLeftKg: L.stage2PropellantLeftKg,
    parking: { perigeeAltitudeKm: L.parking.perigeeAltitudeKm, apogeeAltitudeKm: L.parking.apogeeAltitudeKm, inclinationDeg: L.parking.inclinationDeg, periodMinutes: L.parking.periodMinutes, coastSeconds: L.parking.coastSeconds },
    injection: { durationSeconds: L.injection.durationSeconds, propellantKg: L.injection.propellantKg, propellantLeftKg: L.injection.propellantLeftKg, propulsiveDeltaVKmS: L.injection.propulsiveDeltaVKmS,
      impulsiveDeltaVKmS: L.injection.impulsiveDeltaVKmS, gravityLossKmS: L.injection.gravityLossKmS, c3Km2S2: L.injection.c3Km2S2, burnoutAltitudeKm: L.injection.burnoutAltitudeKm, startSeconds: L.injection.startSeconds },
    soiRadiusKm: L.soiRadiusKm, soiExitSeconds: L.exit.elapsedSeconds, soiExitJdTdb: L.exit.jdTdb, escapeDays: L.escape.durationSeconds / 86400,
    handoffResidualKmS: aim?.departure ? norm(sub(L.exit.helioVelocityAchievedKmS, aim.departure.velocityKmS)) : null, iterations: L.iterations, rounds });
}

export const MISSION_LIMITS = Object.freeze([
  'Cónicas parcheadas: dentro de cada esfera de influencia solo actúa el cuerpo central (masa puntual). La gravedad del Sol dentro de la SOI planetaria, la de otros satélites, J2 y la presión de radiación se omiten.',
  'Salida: por defecto, la v∞ apuntada en el centro de la Tierra (lanzador externo no modelado). Con «Empezar en la plataforma» (21): ascenso de 12E desde LC-41 con un lanzador ilustrativo (×9 del demostrativo), órbita de aparcamiento, inyección de empuje finito progrado con la Centaur D-1T (datos de 1973) y escape hasta la SOI terrestre; Tierra puntual sin J2, sin la Luna ni el Sol dentro de la SOI; la Centaur no se enciende en el ascenso ni se evapora; nutación, movimiento del polo y UT1−UTC ignorados; no se comprueban las restricciones del campo de tiro. El empalme iguala la velocidad en la frontera de la SOI (trayectoria continua) e ignora la gravedad terrestre fuera de ella: el C3 de la inyección queda ≈ 2μ⊕/R_SOI ≈ 0,86 km²/s² por debajo del de la asíntota desde el centro de la Tierra. La comparación de n cuerpos (22) lo mide: con la Tierra actuando también fuera de su SOI, la llegada a Marte se aparta ≈ 13 millones de km del punto de la cónica, así que este C3 es demasiado bajo para el sistema solar real.',
  'Encendidos de captura con dirección retrógrada continua respecto al cuerpo central; transferencia planetocéntrica con dirección inercial fija. Sin control de actitud ni errores de ejecución.',
  'Sin correcciones de trayectoria en crucero, asistencias gravitacionales ni optimización global: la transferencia al satélite es la mejor de una búsqueda acotada. «Crucero de n cuerpos» (22) mide aparte, sin cambiar la cadena, cuánto se aparta el crucero con el Sol y los ocho planetas y cuánto costaría corregirlo.',
  'Captura apuntada (20): la llegada al planeta se apunta a un periapsis más alto para que el encendido de captura termine en el periapsis pedido. Si no es posible (relación no monótona, apuntado sin convergencia o falta de Δv), se dice y se apunta al periapsis pedido. La captura en el satélite no se compensa.',
  'El descenso conectado (12F) es de un solo cuerpo: omite la marea del planeta. Descenso atmosférico (Marte, Venus, Titán) pendiente: no se simula.',
  'Una cadena «completa según el modelo» no equivale a una misión operativa: capacidad del lanzador, comunicaciones, radiación y control térmico no se evalúan.',
  'Energía (15): generación solar a la distancia heliocéntrica calculada y RTG con su disminución temporal frente al consumo de servicio de las piezas; sin eclipses, orientación ni recarga de batería. La propulsión eléctrica usa la potencia restante en el destino; el crucero de bajo empuje no se modela.'
]);

// Estado nativo (marco del cuerpo central del tramo) en un instante de misión, sin conversión.
export function samplePlain(segments, t) {
  let s = segments[0];
  for (const seg of segments) if (t >= seg.startSeconds - 1e-9) s = seg;
  return sampleSegmentNative(s, t);
}
export function sampleSegmentNative(seg, t) {
  const tc = Math.min(seg.endSeconds, Math.max(seg.startSeconds, t));
  if (seg.kind === 'kepler') { const p = propagateKepler(seg.initial.positionKm, seg.initial.velocityKmS, tc - seg.startSeconds, seg.mu); return { positionKm: p.positionKm, velocityKmS: p.velocityKmS, massKg: seg.initial.massKg, engineOn: false }; }
  if (seg.kind === 'landing') {
    const k = seg.simulation.knots, local = tc - seg.startSeconds;
    let lo = 0, hi = k.length - 1;
    if (local <= k[0].elapsedSeconds) return { positionKm: k[0].positionKm, velocityKmS: k[0].velocityKmS, massKg: k[0].massKg, engineOn: false };
    if (local >= k[hi].elapsedSeconds) return { positionKm: k[hi].positionKm, velocityKmS: k[hi].velocityKmS, massKg: k[hi].massKg, engineOn: false };
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (k[m].elapsedSeconds <= local) lo = m; else hi = m; }
    return hermiteKnot(k[lo], k[hi], local);
  }
  const k = seg.knots, local = tc - (seg.localOffsetSeconds ?? 0);
  let lo = 0, hi = k.length - 1;
  if (local <= k[0].elapsedSeconds) return { ...k[0], engineOn: true };
  if (local >= k[hi].elapsedSeconds) return { ...k[hi], engineOn: false };
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (k[m].elapsedSeconds <= local) lo = m; else hi = m; }
  return { ...hermiteKnot(k[lo], k[hi], local), engineOn: true };
}
function hermiteKnot(a, b, t) {
  const h = b.elapsedSeconds - a.elapsedSeconds, u = (t - a.elapsedSeconds) / h, u2 = u * u, u3 = u2 * u, p = [], v = [];
  for (let i = 0; i < 3; i++) {
    p.push((2 * u3 - 3 * u2 + 1) * a.positionKm[i] + (u3 - 2 * u2 + u) * h * a.velocityKmS[i] + (-2 * u3 + 3 * u2) * b.positionKm[i] + (u3 - u2) * h * b.velocityKmS[i]);
    v.push(((6 * u2 - 6 * u) * a.positionKm[i] + (-6 * u2 + 6 * u) * b.positionKm[i]) / h + (3 * u2 - 4 * u + 1) * a.velocityKmS[i] + (3 * u2 - 2 * u) * b.velocityKmS[i]);
  }
  return { positionKm: p, velocityKmS: v, massKg: a.massKg + (b.massKg - a.massKg) * u };
}

/** Conversión de un estado nativo (relativo a `centralBodyId`) al marco heliocéntrico o al del planeta, con las efemérides en la época. */
export function convertState(state, fromCentral, toFrame, jdTdb, data, tgt, moonKey) {
  if (fromCentral === toFrame) return state;
  // 21: tramos centrados en la Tierra (lanzamiento, aparcamiento, inyección y escape): traslación con la efeméride de la Tierra.
  if (fromCentral === '399' || toFrame === '399') {
    const e = data.helio.stateAt('399', jdTdb);
    if (e?.status !== 'available') throw new RangeError('Efemérides de la Tierra no disponibles para el intervalo solicitado');
    if (fromCentral === '399') return convertState({ ...state, positionKm: add(state.positionKm, e.positionKm), velocityKmS: add(state.velocityKmS, e.velocityKmS) }, '10', toFrame, jdTdb, data, tgt, moonKey);
    const h = convertState(state, fromCentral, '10', jdTdb, data, tgt, moonKey);
    return { ...h, positionKm: sub(h.positionKm, e.positionKm), velocityKmS: sub(h.velocityKmS, e.velocityKmS) };
  }
  const planet = () => { const p = data.helio.stateAt(tgt.ephemerisId, jdTdb); if (p?.status !== 'available') throw new RangeError('Efemérides no disponibles para el intervalo solicitado'); return p; };
  const moon = () => { const m = data.moons?.stateAt(moonKey, jdTdb); if (m?.status !== 'available') throw new RangeError('Efemérides de satélites no disponibles para el intervalo solicitado'); return m; };
  let r = state.positionKm, v = state.velocityKmS, level = fromCentral;
  if (level !== '10' && level !== tgt.id) { const m = moon(); r = add(r, m.positionKm); v = add(v, m.velocityKmS); level = tgt.id; }
  if (level === toFrame) return { ...state, positionKm: r, velocityKmS: v };
  if (level === tgt.id && toFrame === '10') { const p = planet(); return { ...state, positionKm: add(r, p.positionKm), velocityKmS: add(v, p.velocityKmS) }; }
  if (level === '10' && toFrame === tgt.id) { const p = planet(); return { ...state, positionKm: sub(r, p.positionKm), velocityKmS: sub(v, p.velocityKmS) }; }
  if (toFrame !== '10' && toFrame !== tgt.id) { const base = level === '10' ? convertState({ ...state, positionKm: r, velocityKmS: v }, '10', tgt.id, jdTdb, data, tgt, moonKey) : { positionKm: r, velocityKmS: v };
    const m = moon(); return { ...state, positionKm: sub(base.positionKm, m.positionKm), velocityKmS: sub(base.velocityKmS, m.velocityKmS) }; }
  throw new RangeError('Conversión de marco no soportada.');
}

/** Continuidad en cada frontera: tiempo, posición y velocidad en el marco común de ambos tramos, y masa (salvo separaciones declaradas). */
export function checkContinuity(segments, separations, data, tgt, moonKey, departureJdTdb) {
  const boundaries = [];
  for (let i = 1; i < segments.length; i++) {
    const a = segments[i - 1], b = segments[i], t = b.startSeconds, jd = departureJdTdb + t / 86400;
    const end = sampleSegmentNative(a, a.endSeconds), start = b.kind === 'landing' ? { ...b.initial } : sampleSegmentNative(b, b.startSeconds);
    let common = a.centralBodyId === b.centralBodyId ? a.centralBodyId : (a.centralBodyId === '10' || b.centralBodyId === '10') ? '10' : tgt.id;
    let ea, eb;
    try { ea = convertState(end, a.centralBodyId, common, jd, data, tgt, moonKey); eb = convertState(start, b.centralBodyId, common, jd, data, tgt, moonKey); }
    catch (error) { boundaries.push({ from: a.id, to: b.id, error: error.message }); continue; }
    const separation = separations.find(s => Math.abs(s.elapsedSeconds - t) < 1e-6);
    boundaries.push({ from: a.id, to: b.id, elapsedSeconds: t, commonFrame: common === '10' ? 'heliocéntrico' : `centrado en ${common === tgt.id ? tgt.name : common}`,
      timeGapSeconds: b.startSeconds - a.endSeconds, positionErrorKm: norm(sub(ea.positionKm, eb.positionKm)), velocityErrorKmS: norm(sub(ea.velocityKmS, eb.velocityKmS)),
      massChangeKg: (start.massKg ?? b.massKg) - (end.massKg ?? a.massKg), separation: Boolean(separation), frameChange: a.centralBodyId !== b.centralBodyId });
  }
  const valid = boundaries.filter(b => !b.error);
  return { boundaries, maxPositionErrorKm: Math.max(0, ...valid.map(b => b.positionErrorKm)), maxVelocityErrorKmS: Math.max(0, ...valid.map(b => b.velocityErrorKmS)),
    maxTimeGapSeconds: Math.max(0, ...valid.map(b => Math.abs(b.timeGapSeconds))), undeclaredMassJumps: valid.filter(b => !b.separation && Math.abs(b.massChangeKg) > 1e-6).length };
}

/** Comprueba que un resultado sigue vigente para el diseño y la configuración actuales. */
export function isIntegratedMissionCurrent(mission, design) { return Boolean(mission && design && mission.model === INTEGRATED_MISSION_VERSION && mission.designSignature === designSignature(design)); }
export { tsiolkovskyDeltaVMS, impulsiveCaptureDeltaV, orbitDescription };
