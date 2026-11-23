// En este módulo gestiono el ensamblaje experimental, donde combino piezas de herencia de Voyager, Cassini, Dawn y Juno
// sobre el bus de cualquiera de ellas para construir un vehículo hipotético sin alterar las configuraciones históricas.
// Reutilizo las reglas de puntos de montaje, envolventes, adaptadores de herraje, compatibilidad de propelentes y validación
// estructural, excluyendo piezas ilustrativas, trenes de aterrizaje y herramientas de superficie.
import { getComponent, slotAccepts, fitsEnvelope, needsAdapter, adapterMassKg } from './ComponentCatalog.js';
import { HERITAGE_COMPONENTS, HISTORICAL_PROBES, getHistoricalProbe } from './HeritageCatalog.js';
import { historicalDesign, applyPartChange, validateDesign, DESIGN_FORMAT, DESIGN_VERSION } from './ProbeDesign.js';

export const EXPERIMENTAL_STORAGE_KEY = 'simulador:ensamblaje-experimental';
const EXCLUDED_CATEGORIES = new Set(['landing', 'tool', 'structure']);
export const EXPERIMENTAL_PARTS = Object.freeze(HERITAGE_COMPONENTS.filter(c => !EXCLUDED_CATEGORIES.has(c.category)));

const nameFor = baseProbeId => `Ensamblaje experimental (bus de ${getHistoricalProbe(baseProbeId)?.name ?? baseProbeId})`;

// Creo un diseño experimental partiendo de la configuración histórica elegida para poder intercambiar piezas por punto de montaje.
export function createExperimentalDesign(baseProbeId = 'cassini') {
  const base = historicalDesign(baseProbeId);
  const { basedOn, ...rest } = base;
  return { ...rest, id: `experimental-${baseProbeId}`, name: nameFor(baseProbeId), experimental: true, baseProbeId: basedOn };
}

// Listo las piezas de herencia compatibles con un punto de montaje concreto, indicando si exigen adaptador y su masa estimada.
export function slotOptions(design, slotId) {
  const core = getComponent(design.coreId), slot = core?.slots.find(item => item.id === slotId);
  if (!slot) return [];
  return EXPERIMENTAL_PARTS.filter(c => slotAccepts(slot, c) && fitsEnvelope(slot, c))
    .map(c => ({ component: c, adapter: needsAdapter(slot, c), adapterMassKg: needsAdapter(slot, c) ? adapterMassKg(c) : 0 }));
}

// Sustituyo o libero la pieza de un punto de montaje sin mutar el diseño recibido.
// Si los herrajes difieren instalo el adaptador estructural; si el propelente choca con otra pieza, reintento sustituyendo equivalentes compatibles.
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

// Retiro los campos exclusivos del modo experimental antes de delegar en validateDesign, que solo espera el esquema base.
function stripExperimental(design) {
  const { experimental, baseProbeId, ...rest } = design;
  return rest;
}
// Verifico que el diseño experimental tenga formato vigente, bus histórico válido y solo piezas permitidas de herencia.
export function validateExperimental(value) {
  if (!value || value.experimental !== true || !HISTORICAL_PROBES.some(p => p.id === value.baseProbeId)) return ['No es un ensamblaje experimental válido.'];
  if (value.format !== DESIGN_FORMAT || value.version !== DESIGN_VERSION) return ['Formato de diseño no compatible.'];
  const errors = validateDesign(stripExperimental(value));
  for (const part of value.parts ?? []) if (!EXPERIMENTAL_PARTS.includes(getComponent(part.componentId))) errors.push('Pieza no permitida en el ensamblaje experimental.');
  return errors;
}

// Comparo cada punto de montaje contra la configuración histórica del bus base para listar las modificaciones activas.
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

// Cargo y guardo el ensamblaje experimental en almacenamiento local ignorando datos corruptos o restricciones del navegador.
export function loadExperimental(storage = globalThis.localStorage) {
  try { const value = JSON.parse(storage?.getItem(EXPERIMENTAL_STORAGE_KEY) ?? 'null'); return value && !validateExperimental(value).length ? value : null; }
  catch { return null; }
}
export function saveExperimental(design, storage = globalThis.localStorage) {
  try { storage?.setItem(EXPERIMENTAL_STORAGE_KEY, JSON.stringify(design)); } catch { /* preferencia opcional */ }
}
