import { COMPONENTS, getComponent } from './ComponentCatalog.js';

export const DESIGN_FORMAT = 'simulador-sondas-probe-design';
export const DESIGN_VERSION = 1;

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

export function validateDesign(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['El archivo no contiene un diseño válido.'];
  if (value.format !== DESIGN_FORMAT || value.version !== DESIGN_VERSION) errors.push('Formato o versión de diseño no compatible.');
  if (typeof value.id !== 'string' || !/^[\w-]{1,80}$/.test(value.id)) errors.push('Identificador de diseño inválido.');
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80) errors.push('Nombre de diseño inválido (1–80 caracteres).');
  if (value.coreId !== null && typeof value.coreId !== 'string') errors.push('Identificador de estructura inválido.');
  const core = value.coreId === null ? null : getComponent(value.coreId);
  if (value.coreId !== null && core?.category !== 'structure') errors.push('Estructura principal desconocida.');
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
    if (!socket || socket.category !== component.category) errors.push(`${component.name}: conexión incompatible (${entry.socketId ?? 'sin punto'}).`);
    if (sockets.has(entry.socketId)) errors.push(`Punto ${entry.socketId} ocupado por más de una pieza.`);
    sockets.add(entry.socketId);
    attachedMass += component.dryMassKg;
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

export function addPart(design, componentId, socketId) {
  const component = getComponent(componentId);
  if (!component) throw Error('Componente desconocido.');
  if (component.category === 'structure') {
    const next = { ...design, coreId: componentId };
    const issues = validateDesign(next);
    if (issues.length) throw Error(issues.join(' '));
    return next;
  }
  const entry = { id: crypto.randomUUID(), componentId, socketId,
    ...(component.category === 'tank' ? { fuelKg: component.fuelCapacityKg } : {}) };
  const next = { ...design, parts: [...design.parts.filter(part => part.socketId !== socketId), entry] };
  const issues = validateDesign(next);
  if (issues.length) throw Error(issues.join(' '));
  return next;
}

// Prepara una sustitución sin modificar el diseño. La interfaz debe mostrar
// los conflictos y solicitar una decisión explícita antes de llamar a apply.
export function planPartChange(design, componentId, socketId) {
  const previousIssues = validateDesign(design);
  if (previousIssues.length) throw Error(previousIssues.join(' '));
  const component = getComponent(componentId);
  if (!component) throw Error('Componente desconocido.');
  if (component.category === 'structure') return { component, socketId: null, conflicts: [] };
  const core = getComponent(design.coreId);
  const socket = core?.slots.find(item => item.id === socketId);
  if (!socket || socket.category !== component.category) throw Error(`${component.name}: conexión incompatible (${socketId ?? 'sin punto'}).`);
  const conflicts = component.propellant ? design.parts
    .filter(entry => entry.socketId !== socketId)
    .map(entry => ({ entry, component: getComponent(entry.componentId) }))
    .filter(item => item.component?.propellant && item.component.propellant !== component.propellant)
    .map(item => ({
      entryId: item.entry.id, socketId: item.entry.socketId,
      componentId: item.component.id, name: item.component.name,
      propellant: item.component.propellant,
      replacement: COMPONENTS.find(candidate => candidate.category === item.component.category
        && candidate.propellant === component.propellant) ?? null
    })) : [];
  return { component, socketId, conflicts };
}

// Construye una única propuesta y la valida antes de devolverla. Si falla,
// la referencia y el contenido del diseño original permanecen intactos.
export function applyPartChange(design, componentId, socketId, resolution = 'none') {
  const plan = planPartChange(design, componentId, socketId);
  if (plan.component.category === 'structure') return addPart(design, componentId);
  if (plan.conflicts.length && !['replace', 'remove'].includes(resolution)) {
    throw Error(`Propelente incompatible: ${plan.component.name} requiere ${plan.component.propellant}. Elige reemplazar o retirar los componentes en conflicto.`);
  }
  if (!['none', 'replace', 'remove'].includes(resolution)) throw Error('Resolución de sustitución desconocida.');
  if (resolution === 'replace' && plan.conflicts.some(item => !item.replacement)) {
    throw Error('No existe una pieza compatible para reemplazar todos los conflictos.');
  }
  const conflictIds = new Set(plan.conflicts.map(item => item.entryId));
  const retained = design.parts.filter(entry => entry.socketId !== socketId && !conflictIds.has(entry.id));
  const replacements = resolution === 'replace' ? plan.conflicts.map(item => ({
    id: crypto.randomUUID(), componentId: item.replacement.id, socketId: item.socketId,
    ...(item.replacement.category === 'tank' ? { fuelKg: item.replacement.fuelCapacityKg } : {})
  })) : [];
  const selected = { id: crypto.randomUUID(), componentId, socketId,
    ...(plan.component.category === 'tank' ? { fuelKg: plan.component.fuelCapacityKg } : {}) };
  const next = { ...design, parts: [...retained, ...replacements, selected] };
  const issues = validateDesign(next);
  if (issues.length) throw Error(issues.join(' '));
  return next;
}

export function parseDesign(text) {
  if (typeof text !== 'string' || text.length > 100_000) throw Error('Archivo demasiado grande o inválido.');
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw Error('El archivo no contiene JSON válido.'); }
  const errors = validateDesign(parsed);
  if (errors.length) throw Error(errors.join(' '));
  // Limita la representación persistida a campos conocidos.
  return { format: DESIGN_FORMAT, version: DESIGN_VERSION, id: parsed.id, name: parsed.name.trim(), coreId: parsed.coreId,
    parts: parsed.parts.map(p => ({ id: p.id, componentId: p.componentId, socketId: p.socketId,
      ...(p.fuelKg !== undefined ? { fuelKg: p.fuelKg } : {}) })) };
}

const STORAGE_KEY = 'probe-laboratory-designs-v1';
export function loadSavedDesigns() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.slice(0, 30).filter(item => !validateDesign(item).length) : [];
  } catch { return []; }
}
export function saveDesign(design) {
  const issues = validateDesign(design);
  if (issues.length) throw Error(issues.join(' '));
  const saved = loadSavedDesigns().filter(item => item.id !== design.id);
  saved.unshift(design);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved.slice(0, 30)));
  return saved.slice(0, 30);
}
