import { createScientificState } from './ScientificState.js';
import { requireJdTdb, secondsBetweenJdTdb } from './Time.js';
import { requireFiniteNumber } from './Units.js';

export const HERMITE_ALGORITHM = 'cubic-hermite';
export const HERMITE_ALGORITHM_VERSION = '1';

/** Interpola posición y su derivada temporal; nunca extrapola. */
export function interpolateHermiteState(firstInput, lastInput, jdTdb,
  { maxIntervalSeconds = 86400 } = {}) {
  const first = createScientificState(firstInput);
  const last = createScientificState(lastInput);
  requireJdTdb(jdTdb);
  requireFiniteNumber(maxIntervalSeconds, 'maxIntervalSeconds');
  if (maxIntervalSeconds <= 0) throw new RangeError('maxIntervalSeconds debe ser positivo.');
  if (first.identity.id !== last.identity.id || first.identity.type !== last.identity.type
    || first.identity.origin !== last.identity.origin
    || first.reference.id !== last.reference.id
    || first.time.scale !== last.time.scale
    || first.position.unit !== last.position.unit
    || first.velocity.unit !== last.velocity.unit) {
    throw new RangeError('Las muestras no representan el mismo cuerpo, origen, marco y unidades.');
  }
  const start = first.time.jdTdb;
  const end = last.time.jdTdb;
  if (end <= start) throw new RangeError('Las muestras deben tener instantes crecientes y distintos.');
  if (jdTdb < start || jdTdb > end) throw new RangeError('No se permite extrapolar fuera de las muestras.');
  const duration = secondsBetweenJdTdb(start, end);
  if (duration > maxIntervalSeconds) throw new RangeError('El intervalo excede maxIntervalSeconds.');
  if (jdTdb === start) return first;
  if (jdTdb === end) return last;
  const u = secondsBetweenJdTdb(start, jdTdb) / duration;
  const u2 = u * u;
  const h01 = u2 * (3 - 2 * u);
  const h10 = u * (1 - u) * (1 - u);
  const h11 = -u2 * (1 - u);
  const d00 = 6 * u * (u - 1);
  const d10 = (1 - u) * (1 - 3 * u);
  const d11 = u * (3 * u - 2);
  const position = { unit: 'km' };
  const velocity = { unit: 'km/s' };
  for (const axis of ['x', 'y', 'z']) {
    const p0 = first.position[axis];
    const p1 = last.position[axis];
    const v0 = first.velocity[axis];
    const v1 = last.velocity[axis];
    // h00+h01=1 and d00+d01=0: use the small displacement directly.
    position[axis] = p0 + h01 * (p1 - p0) + duration * (h10 * v0 + h11 * v1);
    velocity[axis] = d00 * (p0 - p1) / duration + d10 * v0 + d11 * v1;
  }
  return createScientificState({
    identity: first.identity,
    time: { jdTdb, scale: 'TDB' },
    position, velocity, reference: first.reference,
    provenance: {
      source: 'Interpolación cúbica de Hermite', sourceUrl: null,
      version: HERMITE_ALGORITHM_VERSION, queriedAtUtc: null,
      precision: null, uncertainty: null,
      sourceMetadata: {
        algorithm: HERMITE_ALGORITHM,
        algorithmVersion: HERMITE_ALGORITHM_VERSION,
        firstDatasetId: first.provenance.sourceMetadata.ephemerisDatasetId ?? null,
        lastDatasetId: last.provenance.sourceMetadata.ephemerisDatasetId ?? null,
        firstFile: first.provenance.sourceMetadata.ephemerisFile ?? null,
        lastFile: last.provenance.sourceMetadata.ephemerisFile ?? null,
        firstSource: first.provenance.source,
        lastSource: last.provenance.source,
        firstSourceVersion: first.provenance.version,
        lastSourceVersion: last.provenance.version,
        firstJdTdb: start, lastJdTdb: end, intervalSeconds: duration
      }
    }
  });
}
