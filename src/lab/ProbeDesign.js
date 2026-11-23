// Aquí defino el modelo de datos y las operaciones inmutables sobre el diseño de una sonda del Hangar:
// preajustes ilustrativos e históricos, validación estructural/dimensional/propulsiva (m, kg), sustitución
// segura de piezas con resolución de conflictos de propelente y persistencia validada en JSON o localStorage.
import { ALL_COMPONENTS, getComponent, slotAccepts, needsAdapter, fitsEnvelope, adapterMassKg, maxDimensionM, interfaceOf } from './ComponentCatalog.js';
import { HISTORICAL_PROBES } from './HeritageCatalog.js';

export const DESIGN_FORMAT = 'simulador-sondas-probe-design';
export const DESIGN_VERSION = 1;

// Creo un diseño vacío con identificador único listo para asignar estructura y componentes.
export function newDesign(name = 'Nueva sonda', coreId = null) {
  return { format: DESIGN_FORMAT, version: DESIGN_VERSION, id: crypto.randomUUID(), name, coreId, parts: [] };
}

function preset(name, coreId, entries) {
  const design = newDesign(name, coreId);
  design.parts = entries.map(([socketId, componentId], index) => ({
    id: `preset-${index + 1}`, socketId, componentId,
    ...(getComponent(componentId).category === 'tank' ? { fuelKg: getComponent(componentId).fuelCapacityKg } : {})
  }));
  return design;
}

// Expongo las configuraciones iniciales ilustrativas disponibles para pruebas rápidas en el Hangar.
export const PRESETS = Object.freeze([
  { id: 'empty', name: 'Estructura vacía', create: () => newDesign('Nueva sonda') },
  { id: 'interplanetary', name: 'Exploración interplanetaria', create: () => preset('Exploración interplanetaria', 'bus-interplanetary', [
    ['engine', 'engine-chemical'], ['tank', 'tank-chemical'], ['solar-left', 'solar-wing'], ['solar-right', 'solar-wing'],
    ['battery', 'battery-pack'], ['antenna', 'antenna-high-gain'], ['camera', 'camera-multispectral'],
    ['sensor', 'sensor-navigation'], ['instrument', 'instrument-spectrometer'], ['storage', 'storage-module']
  ]) },
  { id: 'orbiter', name: 'Orbitador científico', create: () => preset('Orbitador científico', 'bus-orbiter', [
    ['engine', 'engine-ion'], ['tank', 'tank-xenon'], ['solar-left', 'solar-wing'], ['solar-right', 'solar-wing'],
    ['battery', 'battery-pack'], ['antenna', 'antenna-high-gain'], ['camera', 'camera-multispectral'],
    ['instrument', 'instrument-spectrometer'], ['storage', 'storage-module']
  ]) },
  { id: 'lander', name: 'Explorador lunar', create: () => preset('Explorador lunar', 'bus-lander', [
    ['engine', 'engine-chemical'], ['tank', 'tank-chemical'], ['solar-left', 'solar-wing'],
    ['battery', 'battery-pack'], ['antenna', 'antenna-high-gain'], ['camera', 'camera-multispectral'],
    ['sensor', 'sensor-navigation'], ['instrument', 'instrument-spectrometer'], ['landing', 'landing-legs'],
    ['tool', 'sampling-arm']
  ]) }
]);

// Mantengo las configuraciones históricas separadas de las ilustrativas para preservar el orden de ambas listas.
export const HISTORICAL_PRESETS = Object.freeze(HISTORICAL_PROBES.map(probe => Object.freeze({
  id: `hist-${probe.id}`, name: `${probe.name} (configuración histórica)`, historical: probe.id, create: () => historicalDesign(probe.id) })));

/** Construyo un diseño editable a partir de una sonda histórica documentada con sus piezas de herencia y propelente de lanzamiento. */
export function historicalDesign(probeId) {
  const probe = HISTORICAL_PROBES.find(item => item.id === probeId);
  if (!probe) throw Error('Sonda histórica desconocida.');
  const design = { ...newDesign(probe.name, probe.coreId), basedOn: probe.id };
  design.parts = probe.parts.map(([socketId, componentId, fuelKg], index) => ({
    id: `hist-${probe.id}-${index + 1}`, socketId, componentId,
    ...(getComponent(componentId).category === 'tank' ? { fuelKg: fuelKg ?? getComponent(componentId).fuelCapacityKg } : {})
  }));
  const issues = validateDesign(design);
  if (issues.length) throw Error(`Configuración histórica inconsistente: ${issues.join(' ')}`);
  return design;
}

const HISTORICAL_IDS = new Set(HISTORICAL_PROBES.map(item => item.id));

// Valido estructura, anclajes, envolventes (m), adaptadores, capacidad de carga (kg), tanques y compatibilidad de propelentes.
export function validateDesign(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['El archivo no contiene un diseño válido.'];
  if (value.format !== DESIGN_FORMAT || value.version !== DESIGN_VERSION) errors.push('Formato o versión de diseño no compatible.');
  if (typeof value.id !== 'string' || !/^[\w-]{1,80}$/.test(value.id)) errors.push('Identificador de diseño inválido.');
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80) errors.push('Nombre de diseño inválido (1–80 caracteres).');
  if (value.coreId !== null && typeof value.coreId !== 'string') errors.push('Identificador de estructura inválido.');
  const core = value.coreId === null ? null : getComponent(value.coreId);
  if (value.coreId !== null && core?.category !== 'structure') errors.push('Estructura principal desconocida.');
  if (value.basedOn !== undefined && !HISTORICAL_IDS.has(value.basedOn)) errors.push('Referencia histórica desconocida.');
  if (!Array.isArray(value.parts) || value.parts.length > 30) return [...errors, 'La lista de piezas no es válida.'];
  if (!core && value.parts.length) errors.push('Las piezas necesitan una estructura principal.');
  const ids = new Set(), sockets = new Set();
  let attachedMass = 0;
  const propellants = new Set();
  for (const entry of value.parts) {
    if (!entry || typeof entry !== 'object') { errors.push('Pieza inválida.'); continue; }
    const component = getComponent(entry.componentId);
    const socket = core?.slots.find(item => item.id === entry.socketId);
    if (typeof entry.id !== 'string' || !/^[\w-]{1,80}$/.test(entry.id) || ids.has(entry.id)) errors.push('Identificador de pieza duplicado o inválido.');
    ids.add(entry.id);
    if (!component || component.category === 'structure') { errors.push('Componente desconocido.'); continue; }
    if (!socket || !slotAccepts(socket, component)) errors.push(`${component.name}: conexión incompatible (${entry.socketId ?? 'sin punto'}).`);
    else {
      // Compruebo la envolvente geométrica del punto (m) y la compatibilidad mecánica de herrajes (el adaptador debe aprobarse explícitamente).
      if (!fitsEnvelope(socket, component)) errors.push(`${component.name}: ${maxDimensionM(component)} m exceden la envolvente de ${socket.envelopeM} m del punto «${socket.name}».`);
      if (needsAdapter(socket, component) && entry.adapter !== true) errors.push(`${component.name}: el herraje «${interfaceOf(component)}» no coincide con «${interfaceOf(socket)}» del punto «${socket.name}»; requiere adaptador estructural.`);
    }
    if (entry.adapter !== undefined && (entry.adapter !== true || !socket || !needsAdapter(socket, component))) errors.push(`${component.name}: adaptador innecesario o inválido.`);
    if (sockets.has(entry.socketId)) errors.push(`Punto ${entry.socketId} ocupado por más de una pieza.`);
    sockets.add(entry.socketId);
    attachedMass += component.dryMassKg + (entry.adapter ? adapterMassKg(component) : 0) + (component.rcsPropellantKg ?? 0);
    if (component.propellant) propellants.add(component.propellant);
    if (component.category === 'tank') {
      if (!Number.isFinite(entry.fuelKg) || entry.fuelKg < 0 || entry.fuelKg > component.fuelCapacityKg) errors.push(`${component.name}: combustible fuera de capacidad.`);
    } else if (entry.fuelKg !== undefined) errors.push(`${component.name}: no admite combustible.`);
  }
  if (core && attachedMass + value.parts.reduce((sum, p) => sum + (Number.isFinite(p?.fuelKg) ? p.fuelKg : 0), 0) > core.maxAttachedMassKg) {
    errors.push(`Carga sobre la estructura: máximo ${core.maxAttachedMassKg} kg de piezas y combustible.`);
  }
  if (propellants.size > 1) errors.push('Motor y tanque utilizan propelentes incompatibles.');
  return errors;
}

// Devuelvo una nueva copia del diseño tras instalar la estructura o pieza solicitada si supera la validación.
export function addPart(design, componentId, socketId, { adapter = false } = {}) {
  const component = getComponent(componentId);
  if (!component) throw Error('Componente desconocido.');
  if (component.category === 'structure') {
    const next = { ...design, coreId: componentId };
    const issues = validateDesign(next);
    if (issues.length) throw Error(issues.join(' '));
    return next;
  }
  const socket = getComponent(design.coreId)?.slots.find(item => item.id === socketId);
  const entry = { id: crypto.randomUUID(), componentId, socketId,
    ...(component.category === 'tank' ? { fuelKg: component.fuelCapacityKg } : {}),
    ...(socket && slotAccepts(socket, component) && needsAdapter(socket, component) && adapter ? { adapter: true } : {}) };
  const next = { ...design, parts: [...design.parts.filter(part => part.socketId !== socketId), entry] };
  const issues = validateDesign(next);
  if (issues.length) throw Error(issues.join(' '));
  return next;
}

// Preparo una propuesta de cambio sin mutar el diseño para que la interfaz muestre conflictos de propelente o adaptadores antes de aplicar.
export function planPartChange(design, componentId, socketId) {
  const previousIssues = validateDesign(design);
  if (previousIssues.length) throw Error(previousIssues.join(' '));
  const component = getComponent(componentId);
  if (!component) throw Error('Componente desconocido.');
  if (component.category === 'structure') return { component, socketId: null, conflicts: [], adapter: null };
  const core = getComponent(design.coreId);
  const socket = core?.slots.find(item => item.id === socketId);
  if (!socket || !slotAccepts(socket, component)) throw Error(`${component.name}: conexión incompatible (${socketId ?? 'sin punto'}).`);
  if (!fitsEnvelope(socket, component)) throw Error(`${component.name}: ${maxDimensionM(component)} m exceden la envolvente de ${socket.envelopeM} m del punto «${socket.name}».`);
  // Si los herrajes difieren, informo la necesidad del adaptador estructural y su masa estimada antes de instalarlo.
  const adapter = needsAdapter(socket, component) ? { required: true, massKg: adapterMassKg(component), from: interfaceOf(component), to: interfaceOf(socket) } : null;
  const conflicts = component.propellant ? design.parts
    .filter(entry => entry.socketId !== socketId)
    .map(entry => ({ entry, component: getComponent(entry.componentId) }))
    .filter(item => item.component?.propellant && item.component.propellant !== component.propellant)
    .map(item => ({
      entryId: item.entry.id, socketId: item.entry.socketId,
      componentId: item.component.id, name: item.component.name,
      propellant: item.component.propellant,
      replacement: replacementFor(core, item.entry.socketId, item.component, component)
    })) : [];
  return { component, socketId, conflicts, adapter };
}

// Busco la mejor pieza sustituta compatible con el nuevo propelente y la envolvente del punto, priorizando herencia y ausencia de adaptador.
function replacementFor(core, socketId, current, selected) {
  const socket = core.slots.find(item => item.id === socketId);
  const candidates = ALL_COMPONENTS.filter(candidate => candidate.category === current.category && candidate.propellant === selected.propellant
    && slotAccepts(socket, candidate) && fitsEnvelope(socket, candidate));
  const rank = candidate => (candidate.heritage === selected.heritage ? 0 : 4) + (candidate.heritage === current.heritage ? 0 : 2) + (needsAdapter(socket, candidate) ? 1 : 0);
  return candidates.sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

// Aplico una sustitución atómica y valido el diseño resultante; si falla, mantengo intacto el diseño original.
export function applyPartChange(design, componentId, socketId, resolution = 'none', { adapter = false } = {}) {
  const plan = planPartChange(design, componentId, socketId);
  if (plan.component.category === 'structure') return addPart(design, componentId);
  if (plan.adapter && !adapter) throw Error(`${plan.component.name}: requiere un adaptador estructural (+${plan.adapter.massKg} kg estimados) entre «${plan.adapter.from}» y «${plan.adapter.to}».`);
  if (plan.conflicts.length && !['replace', 'remove'].includes(resolution)) {
    throw Error(`Propelente incompatible: ${plan.component.name} requiere ${plan.component.propellant}. Elige reemplazar o retirar los componentes en conflicto.`);
  }
  if (!['none', 'replace', 'remove'].includes(resolution)) throw Error('Resolución de sustitución desconocida.');
  if (resolution === 'replace' && plan.conflicts.some(item => !item.replacement)) {
    throw Error('No existe una pieza compatible para reemplazar todos los conflictos.');
  }
  const conflictIds = new Set(plan.conflicts.map(item => item.entryId));
  const retained = design.parts.filter(entry => entry.socketId !== socketId && !conflictIds.has(entry.id));
  const core = getComponent(design.coreId);
  const adapterFor = (id, slotId) => needsAdapter(core.slots.find(item => item.id === slotId), getComponent(id)) ? { adapter: true } : {};
  const replacements = resolution === 'replace' ? plan.conflicts.map(item => ({
    id: crypto.randomUUID(), componentId: item.replacement.id, socketId: item.socketId,
    ...(item.replacement.category === 'tank' ? { fuelKg: item.replacement.fuelCapacityKg } : {}),
    ...adapterFor(item.replacement.id, item.socketId)
  })) : [];
  const selected = { id: crypto.randomUUID(), componentId, socketId,
    ...(plan.component.category === 'tank' ? { fuelKg: plan.component.fuelCapacityKg } : {}),
    ...(plan.adapter ? { adapter: true } : {}) };
  const next = { ...design, parts: [...retained, ...replacements, selected] };
  const issues = validateDesign(next);
  if (issues.length) throw Error(issues.join(' '));
  return next;
}

// Parseo y depuro un diseño JSON conservando únicamente los campos reconocidos y validados.
export function parseDesign(text) {
  if (typeof text !== 'string' || text.length > 100_000) throw Error('Archivo demasiado grande o inválido.');
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw Error('El archivo no contiene JSON válido.'); }
  const errors = validateDesign(parsed);
  if (errors.length) throw Error(errors.join(' '));
  // Acoto la representación persistida a los campos conocidos del esquema de diseño.
  return { format: DESIGN_FORMAT, version: DESIGN_VERSION, id: parsed.id, name: parsed.name.trim(), coreId: parsed.coreId,
    ...(parsed.basedOn !== undefined ? { basedOn: parsed.basedOn } : {}),
    parts: parsed.parts.map(p => ({ id: p.id, componentId: p.componentId, socketId: p.socketId,
      ...(p.fuelKg !== undefined ? { fuelKg: p.fuelKg } : {}), ...(p.adapter === true ? { adapter: true } : {}) })) };
}

const STORAGE_KEY = 'probe-laboratory-designs-v1';
// Cargo desde localStorage hasta 30 diseños guardados que superen la validación vigente.
export function loadSavedDesigns() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.slice(0, 30).filter(item => !validateDesign(item).length) : [];
  } catch { return []; }
}
