import { getComponent, needsAdapter, adapterMassKg, ADAPTER_MASS_RULE, ILLUSTRATIVE_PROGRAM } from './ComponentCatalog.js';
import { validateDesign } from './ProbeDesign.js';
import { HERITAGE_SOURCES, DATA_QUALITY } from './HeritageCatalog.js';
import { STANDARD_GRAVITY_M_S2, generationAt, electricThrust, breakEvenDistanceAu } from './SpacecraftPower.js';

// Aceleración normal convencional, no gravedad local del cuerpo central.
// NIST SP 811, B.9: https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b9
export { STANDARD_GRAVITY_M_S2 };

// Distancias de referencia (AU, semiejes mayores redondeados) para el perfil de potencia del Hangar; la misión usa las efemérides.
export const POWER_REFERENCE_POINTS = Object.freeze([
  ['Tierra', 1], ['Marte', 1.52], ['Júpiter', 5.2], ['Saturno', 9.54], ['Urano', 19.2]
]);
// Criterio ORIENTATIVO del simulador para el par del empuje: distancia del centro de masas a la línea de empuje (m).
// Con las masas por pieza estimadas, el centro de masas es aproximado (orden de 10 cm).
export const THRUST_ALIGNMENT_LIMIT_M = Object.freeze({ fixed: 0.1, gimbaled: 0.25 });

export const ENGINEERING_STATUS = Object.freeze({
  incomplete: 'INCOMPLETA', modify: 'REQUIERE MODIFICACIONES', warnings: 'COHERENTE SEGÚN EL MODELO, CON ADVERTENCIAS', coherent: 'COHERENTE SEGÚN EL MODELO'
});

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = a => Math.hypot(a[0], a[1], a[2]);

/** Centroide de una pieza montada: en el punto si es interna; si es exterior, a media longitud a lo largo de la normal del punto. */
export function partCentroidM(slot, component) {
  const base = slot?.position ?? [0, 0, 0];
  if (!slot?.direction || component.mount === 'internal') return [...base];
  const n = Math.hypot(...slot.direction) || 1; // dirección del catálogo como normal unitaria
  return add(base, scale(slot.direction, component.dimensionsM[1] / (2 * n)));
}

export function calculateEngineering(design) {
  const structuralIssues = validateDesign(design);
  const core = getComponent(design.coreId);
  const mounted = design.parts.map(entry => ({ entry, component: getComponent(entry.componentId), slot: core?.slots.find(s => s.id === entry.socketId) ?? null }))
    .filter(item => item.component);
  const adapterKg = mounted.reduce((n, item) => n + (item.entry.adapter && item.slot && needsAdapter(item.slot, item.component) ? adapterMassKg(item.component) : 0), 0);
  const rcsItems = mounted.filter(item => item.component.category === 'rcs');
  const rcsPropellantKg = rcsItems.reduce((n, item) => n + (item.component.rcsPropellantKg ?? 0), 0);
  const structuralDryMassKg = (core?.dryMassKg ?? 0) + mounted.reduce((n, item) => n + item.component.dryMassKg, 0) + adapterKg;
  // «Masa seca» para la propulsión principal: estructura + adaptadores + propelente de actitud (no lo quema el motor principal).
  const dryMassKg = structuralDryMassKg + rcsPropellantKg;
  const tanks = mounted.filter(item => item.component.category === 'tank');
  const engines = mounted.filter(item => item.component.category === 'engine');
  const fuelCapacityKg = tanks.reduce((n, item) => n + item.component.fuelCapacityKg, 0);
  const fuelKg = tanks.reduce((n, item) => n + item.entry.fuelKg, 0);
  const wetMassKg = dryMassKg + fuelKg;
  const powered = [core, ...mounted.map(item => item.component)].filter(Boolean);
  const generationW = powered.reduce((n, c) => n + c.generationW, 0);
  const idlePowerW = powered.reduce((n, c) => n + c.idlePowerW, 0);
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
  if (generationW > 0) notes.push('Potencia a 1 AU en el lanzamiento con iluminación directa; la variación con la distancia y el tiempo se muestra en el perfil de energía (sin sombras ni orientación).');
  if (engines.some(item => item.component.activePowerW > 0) && generationW < activePowerW + idlePowerW) {
    notes.push('La potencia nominal no basta para operar todos los equipos activos; no se calcula tiempo de encendido.');
  }

  // ---- 15: centro de masas, energía, propulsión eléctrica, compatibilidades y calidad de datos -------------------------------
  const compatibility = [];
  const issue = (type, severity, message) => compatibility.push({ type, severity, message });
  for (const message of structuralIssues) issue('estructural', 'error', message);
  const heritageCore = Boolean(core && core.heritage && core.heritage !== ILLUSTRATIVE_PROGRAM);

  let centerOfMassM = null, thrustAlignment = null;
  if (core) {
    let massSum = core.dryMassKg, moment = scale(core.centroidM ?? [0, 0, 0], core.dryMassKg);
    for (const item of mounted) {
      const c = partCentroidM(item.slot, item.component);
      const m = item.component.dryMassKg + (item.entry.adapter ? adapterMassKg(item.component) : 0) + (item.component.rcsPropellantKg ?? 0) + (item.entry.fuelKg ?? 0);
      massSum += m; moment = add(moment, scale(c, m));
    }
    centerOfMassM = scale(moment, 1 / massSum);
    const engine = engines[0];
    if (engine?.slot?.direction) {
      const toCom = sub(centerOfMassM, engine.slot.position), axial = -dot(toCom, engine.slot.direction);
      const lateral = norm(sub(toCom, scale(engine.slot.direction, dot(toCom, engine.slot.direction))));
      const angleDeg = Math.atan2(lateral, Math.max(1e-6, Math.abs(axial))) * 180 / Math.PI;
      const limit = engine.component.gimbaled ? THRUST_ALIGNMENT_LIMIT_M.gimbaled : THRUST_ALIGNMENT_LIMIT_M.fixed;
      thrustAlignment = { lateralOffsetM: lateral, axialDistanceM: axial, angleDeg, limitM: limit, gimbaled: Boolean(engine.component.gimbaled) };
      if (lateral > limit) issue('masa y centro de masas', 'warning', `El centro de masas queda a ${lateral.toFixed(2)} m de la línea de empuje de ${engine.component.name} (criterio orientativo ${limit} m): el par del motor exigiría ${engine.component.gimbaled ? 'más recorrido de cardán' : 'control de actitud continuo'}.`);
    }
  }

  for (const item of mounted) if (item.entry.adapter && item.slot) {
    issue('mecánica', 'warning', `${item.component.name} se monta en «${item.slot.name}» con un adaptador estructural (+${adapterMassKg(item.component)} kg estimados: ${ADAPTER_MASS_RULE}).`);
  }

  const components = powered;
  const powerProfile = POWER_REFERENCE_POINTS.map(([label, distanceAu]) => {
    const g = generationAt(components, { distanceAu, yearsSinceLaunch: 0 });
    return { label, distanceAu, solarW: g.solarW, rtgW: g.rtgW, totalW: g.totalW, marginW: g.totalW - idlePowerW };
  });
  const rtgTenYearsW = generationAt(components.filter(c => c.category === 'rtg' || c.powerSource === 'rtg'), { distanceAu: 1, yearsSinceLaunch: 10 }).rtgW;
  const serviceBreakEvenAu = generationW > 0 ? breakEvenDistanceAu(components, idlePowerW, 0) : 0;
  const power = { generationAt1AuW: generationW, solarAt1AuW: powerProfile[0].solarW, rtgAtLaunchW: powerProfile[0].rtgW, rtgAfter10YearsW: rtgTenYearsW,
    serviceW: idlePowerW, batteryWh, profile: powerProfile, serviceBreakEvenAu };
  if (core && !(generationW > 0)) issue('eléctrica', 'error', 'Sin generación eléctrica: añade paneles solares o un RTG.');
  else if (core && idlePowerW > generationW) issue('eléctrica', 'error', `El consumo de servicio (${idlePowerW.toFixed(0)} W) supera la generación a 1 AU (${generationW.toFixed(0)} W).`);
  else if (core && Number.isFinite(serviceBreakEvenAu)) issue('eléctrica', 'info', `La generación cubre el consumo de servicio hasta ≈ ${serviceBreakEvenAu.toFixed(2)} AU del Sol (al lanzamiento).`);

  let electric = null;
  const electricEngine = engines.find(item => item.component.electric);
  if (electricEngine) {
    const engine = electricEngine.component;
    const availableW = Math.max(0, generationW - idlePowerW), at1Au = electricThrust(engine, availableW);
    const operatingLimitAu = generationW > 0 ? breakEvenDistanceAu(components, idlePowerW + engine.electric.minInputPowerW, 0) : 0;
    electric = { engineName: engine.name, maxInputPowerW: engine.electric.maxInputPowerW, minInputPowerW: engine.electric.minInputPowerW, efficiency: engine.electric.efficiency,
      availableInputAt1AuW: availableW, thrustAt1AuN: at1Au.thrustN, operableAt1Au: at1Au.operable, throttleAt1Au: at1Au.throttle, operatingLimitAu,
      maxThrustN: engine.thrustN, ispS: engine.ispS };
    if (!at1Au.operable) issue('eléctrica', 'error', `${engine.name} necesita al menos ${engine.electric.minInputPowerW} W y solo quedan ${availableW.toFixed(0)} W a 1 AU tras el consumo de servicio: no puede operar.`);
    else if (at1Au.throttle < 0.999) issue('eléctrica', 'warning', `${engine.name} opera al ${(at1Au.throttle * 100).toFixed(0)} % a 1 AU (${(at1Au.thrustN * 1000).toFixed(1)} mN de ${(engine.thrustN * 1000).toFixed(1)} mN).`);
    if (at1Au.operable && Number.isFinite(operatingLimitAu)) issue('eléctrica', 'info', `La propulsión eléctrica puede encenderse hasta ≈ ${operatingLimitAu.toFixed(2)} AU del Sol.`);
  }
  for (const item of engines) if (!item.component.electric && item.component.activePowerW > 0 && generationW < idlePowerW + item.component.activePowerW && !batteryWh) {
    issue('eléctrica', 'warning', `${item.component.name}: la generación a 1 AU no cubre servicio + encendido (${(idlePowerW + item.component.activePowerW).toFixed(0)} W) y no hay batería.`);
  }
  if (engines.length && tanks.length && !compatible) issue('propelente', 'error', 'Motor y depósito usan propelentes distintos.');
  else if (core && !engines.length) issue('propelente', heritageCore ? 'error' : 'warning', 'Sin motor: la sonda no puede maniobrar.');
  else if (engines.length && !tanks.length) issue('propelente', 'error', 'Motor sin depósito de propelente.');
  else if (compatible && !fuelKg) issue('propelente', 'error', 'El depósito está vacío.');
  const rcs = rcsItems.length ? { count: rcsItems.reduce((n, item) => n + (item.component.rcsCount ?? 0), 0) || null, thrustN: rcsItems[0].component.rcsThrustN ?? null,
    propellantKg: rcsPropellantKg, sharesMainPropellant: rcsItems.some(item => item.component.sharesMainPropellant) } : null;
  if (heritageCore) {
    if (!rcs) issue('control de actitud', 'error', 'Sin propulsores de control de actitud: la sonda no puede orientarse ni apuntar el motor.');
    else if (rcs.sharesMainPropellant && !tanks.some(item => item.component.propellant?.includes('hydrazine'))) issue('control de actitud', 'error', 'Los propulsores de actitud de modo dual necesitan hidracina en el depósito principal.');
    if (!mounted.some(item => item.component.category === 'avionics')) issue('control', 'error', 'Sin computadora de mando y control.');
  }
  if (core && !mounted.some(item => item.component.category === 'antenna')) issue('comunicaciones', 'warning', 'Sin antena: no hay enlace con la Tierra.');

  const programs = [...new Set([core, ...mounted.map(item => item.component)].filter(Boolean).map(c => c.heritage ?? ILLUSTRATIVE_PROGRAM))];
  const quality = Object.fromEntries(Object.values(DATA_QUALITY).map(q => [q, 0]));
  let illustrativeCount = 0;
  const sourceIds = new Set();
  for (const c of [core, ...mounted.map(item => item.component)].filter(Boolean)) {
    if (!c.heritage || c.heritage === ILLUSTRATIVE_PROGRAM) { illustrativeCount++; continue; }
    for (const entry of Object.values(c.data ?? {})) { quality[entry.quality] = (quality[entry.quality] ?? 0) + 1; if (entry.source) sourceIds.add(entry.source); }
    for (const id of c.sources ?? []) sourceIds.add(id);
  }
  const dataQuality = { counts: quality, illustrativeComponents: illustrativeCount, sources: [...sourceIds].filter(id => HERITAGE_SOURCES[id]).map(id => ({ id, ...HERITAGE_SOURCES[id] })),
    dependsOnEstimates: quality[DATA_QUALITY.estimated] > 0 || quality[DATA_QUALITY.unknown] > 0 || illustrativeCount > 0 };
  const mixed = programs.filter(p => p !== ILLUSTRATIVE_PROGRAM).length > 1 || (programs.length > 1 && programs.includes(ILLUSTRATIVE_PROGRAM));
  const errors = compatibility.filter(item => item.severity === 'error').length, warnings = compatibility.filter(item => item.severity === 'warning').length;
  const status = !core ? ENGINEERING_STATUS.incomplete : errors ? ENGINEERING_STATUS.modify : warnings ? ENGINEERING_STATUS.warnings : ENGINEERING_STATUS.coherent;
  const assessment = { status, errors, warnings, programs, mixed,
    explanation: !core ? 'Elige una estructura para evaluar el diseño.'
      : errors ? 'Hay incompatibilidades que impiden operar la sonda; corrígelas antes de planificar.'
        : 'Las restricciones modeladas se cumplen. Coherencia de diseño no equivale a que pueda fabricarse o volar: la viabilidad de una misión se evalúa en el Planificador.',
    nature: mixed ? 'Variante experimental inspirada en tecnología real: no es una reconstrucción histórica certificada.'
      : design.basedOn && programs.length === 1 && programs[0] === design.basedOn ? 'Configuración de herencia de un solo programa (reparto de masas y consumos estimado).' : null };

  return { structuralIssues, dryMassKg, wetMassKg, fuelCapacityKg, fuelKg, thrustN,
    effectiveIspS, deltaVMS, generationW, idlePowerW, activePowerW,
    batteryWh, netIdleW, autonomyHours, notes,
    structuralDryMassKg, adapterMassKg: adapterKg, rcsPropellantKg, rcs, mainPropellant: compatible ? enginePropellant : null,
    propulsionType: electricEngine ? 'electric' : engines.length ? 'chemical' : null,
    centerOfMassM, thrustAlignment, power, electric, compatibility, assessment, dataQuality };
}
