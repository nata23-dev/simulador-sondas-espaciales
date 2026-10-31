import { HORIZONS_FRAME } from './Frames.js';
import { requireJdTdb } from './Time.js';
import { requireFiniteNumber } from './Units.js';
import { HORIZONS_PLANETS } from './HorizonsEphemerides.js';

const FORMATS = new Set(['horizons-daily-v1', 'scientific-states-v1', 'horizons-compact-v1']);

function nonempty(value, path) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${path} debe ser una cadena no vacía.`);
  }
  return value;
}

function object(value, path) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${path} debe ser un objeto.`);
  }
  return value;
}

/** Valida y copia un catálogo. Sus rutas son relativas a la base local del sitio. */
export function createEphemerisCatalog(input) {
  object(input, 'catalog');
  if (input.catalogVersion !== 1) throw new RangeError('catalog.catalogVersion debe ser 1.');
  if (!Array.isArray(input.datasets) || input.datasets.length === 0) {
    throw new TypeError('catalog.datasets debe ser una lista no vacía.');
  }
  const ids = new Set();
  const files = new Set();
  const entries = input.datasets.map((raw, index) => {
    const path = `catalog.datasets[${index}]`;
    object(raw, path);
    const id = nonempty(raw.id, `${path}.id`);
    if (ids.has(id)) throw new RangeError(`${path}.id duplicado: ${id}.`);
    ids.add(id);
    const file = nonempty(raw.file, `${path}.file`);
    if (!/^(?!\/)(?!.*(?:^|\/)\.\.?\/)[A-Za-z0-9_./-]+\.json$/.test(file)
      || file.includes('//') || file.includes('..') || file.includes('\\')) {
      throw new RangeError(`${path}.file debe ser una ruta JSON local relativa y sin ascensos.`);
    }
    if (files.has(file)) throw new RangeError(`${path}.file duplicado: ${file}.`);
    files.add(file);
    if (!FORMATS.has(raw.format)) throw new RangeError(`${path}.format desconocido: ${raw.format}.`);
    if (raw.formatVersion !== 1) throw new RangeError(`${path}.formatVersion debe ser 1.`);
    if (!Array.isArray(raw.bodyIds) || raw.bodyIds.length === 0
      || raw.bodyIds.some(bodyId => typeof bodyId !== 'string' || bodyId.trim() === '')
      || new Set(raw.bodyIds).size !== raw.bodyIds.length) {
      throw new RangeError(`${path}.bodyIds debe contener identificadores únicos no vacíos.`);
    }
    object(raw.coverage, `${path}.coverage`);
    requireJdTdb(raw.coverage.startJdTdb);
    requireJdTdb(raw.coverage.endJdTdb);
    if (raw.coverage.endJdTdb < raw.coverage.startJdTdb) {
      throw new RangeError(`${path}.coverage termina antes de empezar.`);
    }
    // Extensión opcional de v1: límites por cuerpo; coverage sigue siendo
    // la envolvente global del archivo para catálogos anteriores.
    let bodyCoverage = null;
    if (raw.bodyCoverage !== undefined) {
      object(raw.bodyCoverage, `${path}.bodyCoverage`);
      if (Object.keys(raw.bodyCoverage).length !== raw.bodyIds.length) {
        throw new RangeError(`${path}.bodyCoverage debe declarar todos los cuerpos.`);
      }
      bodyCoverage = Object.fromEntries(raw.bodyIds.map(bodyId => {
        const range = object(raw.bodyCoverage[bodyId], `${path}.bodyCoverage.${bodyId}`);
        requireJdTdb(range.startJdTdb);
        requireJdTdb(range.endJdTdb);
        if (range.startJdTdb > range.endJdTdb
          || range.startJdTdb < raw.coverage.startJdTdb
          || range.endJdTdb > raw.coverage.endJdTdb) {
          throw new RangeError(`${path}.bodyCoverage.${bodyId} fuera de coverage.`);
        }
        return [bodyId, Object.freeze({ startJdTdb: range.startJdTdb,
          endJdTdb: range.endJdTdb })];
      }));
      Object.freeze(bodyCoverage);
    }
    if (raw.cadenceSeconds !== null) {
      requireFiniteNumber(raw.cadenceSeconds, `${path}.cadenceSeconds`);
      if (raw.cadenceSeconds <= 0) throw new RangeError(`${path}.cadenceSeconds debe ser positivo o null.`);
      const stepDays = raw.cadenceSeconds / 86400;
      if (stepDays === 0 || raw.coverage.startJdTdb + stepDays === raw.coverage.startJdTdb) {
        throw new RangeError(`${path}.cadenceSeconds no es representable en JD TDB.`);
      }
    }
    if (raw.frameId !== HORIZONS_FRAME.id || raw.origin !== HORIZONS_FRAME.origin) {
      throw new RangeError(`${path}.frameId/origin incompatible con el contrato científico actual.`);
    }
    object(raw.fileUnits, `${path}.fileUnits`);
    const expectedUnits = raw.format === 'horizons-daily-v1'
      ? { position: 'AU', velocity: 'AU/dia' }
      : { position: 'km', velocity: 'km/s' };
    if (raw.fileUnits.position !== expectedUnits.position
      || raw.fileUnits.velocity !== expectedUnits.velocity) {
      throw new RangeError(`${path}.fileUnits incompatible con ${raw.format}.`);
    }
    const source = nonempty(raw.source, `${path}.source`);
    if (raw.sourceVersion !== null
      && (typeof raw.sourceVersion !== 'string' || raw.sourceVersion.trim() === '')) {
      throw new TypeError(`${path}.sourceVersion debe ser una cadena no vacía o null.`);
    }
    if (raw.format === 'horizons-daily-v1') {
      const expectedBodies = Object.values(HORIZONS_PLANETS);
      if (raw.bodyIds.length !== expectedBodies.length
        || expectedBodies.some(bodyId => !raw.bodyIds.includes(bodyId))
        || raw.cadenceSeconds !== 86400 || source !== 'NASA/JPL Horizons') {
        throw new RangeError(`${path} no coincide con el perfil estricto Horizons diario.`);
      }
    }
    return Object.freeze({ id, file, format: raw.format, formatVersion: 1,
      bodyIds: Object.freeze([...raw.bodyIds]),
      coverage: Object.freeze({ startJdTdb: raw.coverage.startJdTdb,
        endJdTdb: raw.coverage.endJdTdb }),
      bodyCoverage,
      cadenceSeconds: raw.cadenceSeconds,
      frameId: raw.frameId, origin: raw.origin,
      fileUnits: Object.freeze({ ...expectedUnits }), source, sourceVersion: raw.sourceVersion });
  });
  return Object.freeze({ catalogVersion: 1, datasets: Object.freeze(entries) });
}
