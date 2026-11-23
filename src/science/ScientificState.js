// Aquí construyo y valido el contrato canónico e inmutable `ScientificState` para cualquier cuerpo o sonda del simulador.
// Unidades: posición en km, velocidad en km/s e instante en JD TDB.
// Marco de referencia: heliocéntrico eclíptico J2000/ICRF (estándar NASA/JPL Horizons), totalmente libre de Three.js o escalas de escena.
import { requireVector3, HORIZONS_FRAME } from './Frames.js';
import { requireJdTdb } from './Time.js';

const TYPES = new Set(['planet', 'probe', 'moon', 'star', 'sun']);

/** Verifico que la entrada sea un registro plano no nulo. */
function record(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} debe ser un objeto.`);
  }
  return value;
}

/** Verifico que una cadena requerida no esté vacía. */
function nonempty(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${name} debe ser una cadena no vacía.`);
  }
  return value;
}

/** Verifico un campo textual opcional (cadena no vacía o `null`). */
function optionalString(value, name) {
  if (value !== null && (typeof value !== 'string' || value.trim() === '')) {
    throw new TypeError(`${name} debe ser una cadena no vacía o null.`);
  }
  return value;
}

/** Valido un descriptor opcional de precisión o incertidumbre con descripción y fuente. */
function optionalDetail(value, name) {
  if (value === null) return null;
  record(value, name);
  return Object.freeze({ description: nonempty(value.description, `${name}.description`),
    source: nonempty(value.source, `${name}.source`) });
}

/** Valido y congelo los metadatos primitivos de procedencia sin permitir valores no finitos ni objetos anidados. */
function sourceMetadata(value) {
  record(value, 'provenance.sourceMetadata');
  const copy = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== null && typeof item !== 'string' && typeof item !== 'boolean'
      && !(typeof item === 'number' && Number.isFinite(item))) {
      throw new TypeError(`provenance.sourceMetadata.${key} debe ser un valor primitivo finito.`);
    }
    copy[key] = item;
  }
  return Object.freeze(copy);
}

/**
 * Aquí creo un estado científico inmutable con posición en km, velocidad en km/s, instante en JD TDB
 * y marco heliocéntrico eclíptico J2000/ICRF, garantizando la ausencia de unidades de escena u objetos de Three.js.
 */
export function createScientificState(input) {
  record(input, 'state');
  const identity = record(input.identity, 'identity');
  const time = record(input.time, 'time');
  const position = record(input.position, 'position');
  const velocity = record(input.velocity, 'velocity');
  const reference = record(input.reference, 'reference');
  const provenance = record(input.provenance, 'provenance');
  const id = nonempty(identity.id, 'identity.id');
  const type = nonempty(identity.type, 'identity.type');
  if (!TYPES.has(type)) throw new RangeError(`identity.type desconocido: ${type}.`);
  if (identity.origin !== HORIZONS_FRAME.origin) {
    throw new RangeError(`identity.origin incompatible: ${identity.origin}.`);
  }
  if (time.scale !== 'TDB') throw new RangeError(`time.scale desconocida: ${time.scale}.`);
  requireJdTdb(time.jdTdb);
  requireVector3(position, 'position');
  requireVector3(velocity, 'velocity');
  if (position.unit !== 'km') throw new RangeError(`position.unit desconocida: ${position.unit}.`);
  if (velocity.unit !== 'km/s') throw new RangeError(`velocity.unit desconocida: ${velocity.unit}.`);
  for (const key of ['id', 'referenceSystem', 'referencePlane', 'axes', 'correction']) {
    if (reference[key] !== HORIZONS_FRAME[key]) {
      throw new RangeError(`reference.${key} desconocido o incompatible: ${reference[key]}.`);
    }
  }
  if (reference.origin !== identity.origin || reference.originCode !== HORIZONS_FRAME.originCode) {
    throw new RangeError('reference.origin y reference.originCode deben coincidir con el origen heliocéntrico.');
  }
  const source = nonempty(provenance.source, 'provenance.source');
  const sourceUrl = optionalString(provenance.sourceUrl, 'provenance.sourceUrl');
  const version = optionalString(provenance.version, 'provenance.version');
  const queriedAtUtc = optionalString(provenance.queriedAtUtc, 'provenance.queriedAtUtc');
  const precision = optionalDetail(provenance.precision, 'provenance.precision');
  const uncertainty = optionalDetail(provenance.uncertainty, 'provenance.uncertainty');
  const metadata = sourceMetadata(provenance.sourceMetadata);
  return Object.freeze({
    identity: Object.freeze({ id, type, origin: identity.origin }),
    time: Object.freeze({ jdTdb: time.jdTdb, scale: 'TDB' }),
    position: Object.freeze({ x: position.x, y: position.y, z: position.z, unit: 'km' }),
    velocity: Object.freeze({ x: velocity.x, y: velocity.y, z: velocity.z, unit: 'km/s' }),
    reference: HORIZONS_FRAME,
    provenance: Object.freeze({ source, sourceUrl, version, queriedAtUtc,
      precision, uncertainty, sourceMetadata: metadata })
  });
}
