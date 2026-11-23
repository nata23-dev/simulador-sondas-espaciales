// Aquí gestiono las firmas de diseño, la validación de opciones y la persistencia local de planes de misión lunar.
// Me aseguro de que cada plan guardado conserve una instantánea coherente de la sonda y de la versión del modelo físico.
import { parseDesign, validateDesign } from './ProbeDesign.js';
import { gregorianTimestampToJdTdb } from '../science/Time.js';
import { LUNAR_COVERAGE, TRANSFER_MODEL_VERSION } from './MissionPhysics.js';

export const PLAN_FORMAT = 'simulador-sondas-mission-plan';
export const PLAN_VERSION = 1;
const STORAGE_KEY = 'probe-laboratory-mission-plans-v1';
export const DESTINATIONS = Object.freeze([
  { id: 'moon', name: 'Luna', available: true },
  { id: 'mars', name: 'Marte', available: false },
  { id: 'venus', name: 'Venus', available: false },
  { id: 'europa', name: 'Europa', available: false },
  { id: 'titan', name: 'Titán', available: false }
]);

// Genero una firma determinista del bus, las piezas montadas y su carga de propelente para detectar cambios en la sonda.
export function designSignature(design) {
  const signature = { coreId: design.coreId, parts: design.parts.map(p => [p.socketId, p.componentId, p.fuelKg ?? null]).sort((a, b) => a[0].localeCompare(b[0])) };
  // Distingo cualquier ensamblaje experimental como un vehículo aparte aunque conserve todavía las mismas piezas,
  // evitando reutilizar cálculos de la sonda histórica de origen sin alterar las firmas históricas.
  return JSON.stringify(design.experimental ? { ...signature, experimental: true } : signature);
}

// Compruebo si un resultado lunar calculado sigue vigente para la sonda, las opciones y la versión del modelo actuales.
export function isMissionResultCurrent(result, design, options) {
  return Boolean(result && design && result.designId === design.id
    && result.designSignature === designSignature(design)
    && result.options === JSON.stringify(options)
    && result.modelVersion === TRANSFER_MODEL_VERSION);
}

// Valido el destino, el objetivo, la altitud inicial (km), la distancia lunar nominal (km) y la fecha TDB de salida.
export function validatePlanOptions(options) {
  const errors = [];
  if (!options || typeof options !== 'object' || Array.isArray(options)) return ['Opciones de misión inválidas.'];
  if (options.destination !== 'moon') errors.push('El destino aún no dispone de un modelo de planificación.');
  if (!['approach', 'flyby'].includes(options.objective)) errors.push('Objetivo lunar no admitido.');
  if (!Number.isFinite(options.altitudeKm) || options.altitudeKm < 200 || options.altitudeKm > 150000) errors.push('Altitud inicial fuera de 200–150 000 km.');
  const distanceRange = options.objective === 'flyby' ? [5000, 25000] : [30000, 100000];
  if (!Number.isFinite(options.targetDistanceKm) || options.targetDistanceKm < distanceRange[0] || options.targetDistanceKm > distanceRange[1]) errors.push(`Distancia lunar nominal fuera de ${distanceRange[0]}–${distanceRange[1]} km.`);
  try {
    const jd = gregorianTimestampToJdTdb(options.departureTdb);
    if (jd < LUNAR_COVERAGE.startJd || jd > LUNAR_COVERAGE.endJd) errors.push('Salida fuera de cobertura lunar TDB.');
  } catch { errors.push('Fecha de salida TDB inválida.'); }
  return errors;
}

// Creo un plan de misión validado con copia inmutable del diseño y la versión actual del modelo de transferencia.
export function createMissionPlan(design, options, name = 'Plan lunar') {
  const issues = [...validateDesign(design), ...validatePlanOptions(options)];
  if (issues.length) throw Error(issues.join(' '));
  if (typeof name !== 'string' || !name.trim() || name.length > 80) throw Error('Nombre de plan inválido.');
  return { format: PLAN_FORMAT, version: PLAN_VERSION, id: crypto.randomUUID(), name: name.trim(),
    designId: design.id, designSignature: designSignature(design), designSnapshot: structuredClone(design),
    options: { destination: options.destination, objective: options.objective,
      altitudeKm: options.altitudeKm, targetDistanceKm: options.targetDistanceKm, departureTdb: options.departureTdb },
    modelVersion: TRANSFER_MODEL_VERSION };
}

// Parseo y valido estrictamente un plan serializado en JSON comprobando formato, opciones y firma de diseño.
export function parseMissionPlan(text) {
  if (typeof text !== 'string' || text.length > 150000) throw Error('Archivo de plan demasiado grande.');
  let raw;
  try { raw = JSON.parse(text); } catch { throw Error('JSON de plan inválido.'); }
  if (!raw || raw.format !== PLAN_FORMAT || raw.version !== PLAN_VERSION) throw Error('Formato o versión de plan no compatible.');
  if (typeof raw.id !== 'string' || !/^[\w-]{1,80}$/.test(raw.id)) throw Error('Identificador de plan inválido.');
  if (typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 80) throw Error('Nombre de plan inválido.');
  const optionsIssues = validatePlanOptions(raw.options);
  if (optionsIssues.length) throw Error(optionsIssues.join(' '));
  const design = parseDesign(JSON.stringify(raw.designSnapshot));
  if (raw.designId !== design.id || raw.designSignature !== designSignature(design)) throw Error('La asociación con el diseño no coincide.');
  if (typeof raw.modelVersion !== 'string' || !/^[\w-]{1,80}$/.test(raw.modelVersion)) throw Error('Versión del modelo científico inválida.');
  return { format: PLAN_FORMAT, version: PLAN_VERSION, id: raw.id, name: raw.name.trim(),
    designId: design.id, designSignature: raw.designSignature, designSnapshot: design,
    options: { destination: raw.options.destination, objective: raw.options.objective,
      altitudeKm: raw.options.altitudeKm, targetDistanceKm: raw.options.targetDistanceKm, departureTdb: raw.options.departureTdb },
    modelVersion: raw.modelVersion };
}

// Recupero hasta 30 planes válidos guardados en localStorage descartando entradas corruptas.
export function loadSavedPlans() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(raw) ? raw.slice(0, 30).flatMap(item => {
      try { return [parseMissionPlan(JSON.stringify(item))]; } catch { return []; }
    }) : [];
  } catch { return []; }
}

// Valido y guardo un plan al principio del historial local manteniendo un máximo de 30 entradas.
export function saveMissionPlan(plan) {
  const clean = parseMissionPlan(JSON.stringify(plan));
  const plans = [clean, ...loadSavedPlans().filter(item => item.id !== clean.id)].slice(0, 30);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
  return plans;
}
