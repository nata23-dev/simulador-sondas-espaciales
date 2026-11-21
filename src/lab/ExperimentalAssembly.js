// Etapa 17 — ensamblaje experimental: combina piezas de herencia de Voyager, Cassini, Dawn y Juno sobre el bus de una de ellas.
// Es un vehículo hipotético, separado de las configuraciones históricas (que no se pueden modificar). Reutiliza las reglas de la
// etapa 15 (puntos de montaje, envolventes, herrajes con adaptador, propelentes) y la verificación de ProbeEngineering.
// No incluye piezas ilustrativas, sistemas de aterrizaje ni herramientas de superficie.
import { getComponent, slotAccepts, fitsEnvelope, needsAdapter, adapterMassKg } from './ComponentCatalog.js';
import { HERITAGE_COMPONENTS, HISTORICAL_PROBES, getHistoricalProbe } from './HeritageCatalog.js';
import { historicalDesign, applyPartChange, validateDesign, DESIGN_FORMAT, DESIGN_VERSION } from './ProbeDesign.js';

export const EXPERIMENTAL_STORAGE_KEY = 'simulador:ensamblaje-experimental';
const EXCLUDED_CATEGORIES = new Set(['landing', 'tool', 'structure']);
export const EXPERIMENTAL_PARTS = Object.freeze(HERITAGE_COMPONENTS.filter(c => !EXCLUDED_CATEGORIES.has(c.category)));

const nameFor = baseProbeId => `Ensamblaje experimental (bus de ${getHistoricalProbe(baseProbeId)?.name ?? baseProbeId})`;

/** Parte de la configuración histórica de una sonda; desde ahí cada punto de montaje se puede cambiar por otra pieza de herencia. */
export function createExperimentalDesign(baseProbeId = 'cassini') {
  const base = historicalDesign(baseProbeId);
  const { basedOn, ...rest } = base;
  return { ...rest, id: `experimental-${baseProbeId}`, name: nameFor(baseProbeId), experimental: true, baseProbeId: basedOn };
}

/** Piezas que admite un punto de montaje del bus, con la indicación de si necesitan adaptador y su masa estimada. */
export function slotOptions(design, slotId) {
  const core = getComponent(design.coreId), slot = core?.slots.find(item => item.id === slotId);
  if (!slot) return [];
  return EXPERIMENTAL_PARTS.filter(c => slotAccepts(slot, c) && fitsEnvelope(slot, c))
    .map(c => ({ component: c, adapter: needsAdapter(slot, c), adapterMassKg: needsAdapter(slot, c) ? adapterMassKg(c) : 0 }));
}

/**
 * Cambia la pieza de un punto. `componentId` vacío deja el punto libre. Si el herraje no coincide se instala el adaptador
 * (masa estimada declarada); si el propelente choca con otra pieza, se sustituye por la equivalente compatible cuando existe.
 * Devuelve { design, notes } o lanza un error explicativo sin modificar el diseño recibido.
 */
export function changeSlot(design, slotId, componentId) {
  const notes = [];
  if (!componentId) {
    const next = { ...design, parts: design.parts.filter(part => part.socketId !== slotId) };
    const issues = validateDesign(stripExperimental(next));
    if (issues.length) throw Error(issues.join(' '));
    return { design: next, notes: ['Punto de montaje libre.'] };
  }
  const component = getComponent(componentId);
  if (!component || !EXPERIMENTAL_PARTS.includes(component)) throw Error('Solo se pueden montar piezas de herencia de la flota.');
  const plain = stripExperimental(design);
  let next;
  try { next = applyPartChange(plain, componentId, slotId, 'none', { adapter: true }); }
  catch (error) {
    if (!/Propelente incompatible/.test(error.message)) throw error;
    next = applyPartChange(plain, componentId, slotId, 'replace', { adapter: true });
    notes.push('Se sustituyeron las piezas con un propelente incompatible por equivalentes compatibles.');
  }
  const installed = next.parts.find(part => part.socketId === slotId);
  const slotName = getComponent(design.coreId)?.slots.find(item => item.id === slotId)?.name ?? slotId;
  notes.unshift(`${component.name}: montada en «${slotName}».`);
  if (installed?.adapter) notes.push(`${component.name}: adaptador estructural de ${adapterMassKg(component)} kg (estimado).`);
  return { design: { ...next, experimental: true, baseProbeId: design.baseProbeId, name: design.name }, notes };
}

// validateDesign no conoce los campos propios del ensamblaje experimental: se comprueban aparte.
function stripExperimental(design) {
  const { experimental, baseProbeId, ...rest } = design;
  return rest;
}
export function validateExperimental(value) {
  if (!value || value.experimental !== true || !HISTORICAL_PROBES.some(p => p.id === value.baseProbeId)) return ['No es un ensamblaje experimental válido.'];
  if (value.format !== DESIGN_FORMAT || value.version !== DESIGN_VERSION) return ['Formato de diseño no compatible.'];
  const errors = validateDesign(stripExperimental(value));
  for (const part of value.parts ?? []) if (!EXPERIMENTAL_PARTS.includes(getComponent(part.componentId))) errors.push('Pieza no permitida en el ensamblaje experimental.');
  return errors;
}

/** Diferencias con la configuración histórica del bus elegido (lo que hace «experimental» al vehículo). */
export function differencesFromBase(design) {
  const base = historicalDesign(design.baseProbeId), out = [];
  const core = getComponent(design.coreId);
  for (const slot of core?.slots ?? []) {
    const before = base.parts.find(p => p.socketId === slot.id)?.componentId ?? null;
    const now = design.parts.find(p => p.socketId === slot.id)?.componentId ?? null;
    if (before !== now) out.push({ slot, before: getComponent(before), now: getComponent(now), adapter: Boolean(design.parts.find(p => p.socketId === slot.id)?.adapter) });
  }
  return out;
}

export function loadExperimental(storage = globalThis.localStorage) {
  try { const value = JSON.parse(storage?.getItem(EXPERIMENTAL_STORAGE_KEY) ?? 'null'); return value && !validateExperimental(value).length ? value : null; }
  catch { return null; }
}
export function saveExperimental(design, storage = globalThis.localStorage) {
  try { storage?.setItem(EXPERIMENTAL_STORAGE_KEY, JSON.stringify(design)); } catch { /* preferencia opcional */ }
}
