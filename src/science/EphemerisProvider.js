import { createEphemerisCatalog } from './EphemerisCatalog.js';
import { adaptHorizonsSample, HORIZONS_PLANETS, validateHorizonsDataset } from './HorizonsEphemerides.js';
import { createScientificState } from './ScientificState.js';
import { requireJdTdb, secondsBetweenJdTdb } from './Time.js';
import { requireFiniteNumber } from './Units.js';
import { HERMITE_ALGORITHM, HERMITE_ALGORITHM_VERSION,
  interpolateHermiteState } from './HermiteInterpolation.js';

const DAY_SECONDS = 86400;
const TIME_TOLERANCE_DAYS = 1e-8;

function enrichedState(state, entry) {
  // state ya pasó createScientificState/adaptHorizonsSample en rawStates.
  return Object.freeze({ ...state, provenance: Object.freeze({ ...state.provenance,
    sourceMetadata: Object.freeze({ ...state.provenance.sourceMetadata,
      ephemerisDatasetId: entry.id, ephemerisFile: entry.file,
      ephemerisFormat: entry.format, ephemerisFormatVersion: entry.formatVersion,
      filePositionUnit: entry.fileUnits.position, fileVelocityUnit: entry.fileUnits.velocity }) }) });
}

function adaptCompactDatasetStates(data, entry, maxStatesPerDataset) {
  if (!data || typeof data !== 'object' || Array.isArray(data)
    || data.format !== 'horizons-compact-v1' || data.formatVersion !== 1
    || !data.acquisition || typeof data.acquisition !== 'object'
    || !data.series || typeof data.series !== 'object' || Array.isArray(data.series)) {
    throw new TypeError(`${entry.file}: se requiere formato horizons-compact-v1 válido.`);
  }
  const acq = data.acquisition;
  const bodiesMeta = acq.bodies;
  if (!bodiesMeta || typeof bodiesMeta !== 'object' || Array.isArray(bodiesMeta)) {
    throw new TypeError(`${entry.file}: acquisition.bodies inválido.`);
  }
  const totalCount = Object.values(data.series).reduce(
    (acc, rows) => acc + (Array.isArray(rows) ? rows.length : 0),
    0
  );
  if (totalCount === 0) {
    throw new TypeError(`${entry.file}: series vacías en horizons-compact-v1.`);
  }
  if (totalCount > maxStatesPerDataset) {
    throw new RangeError(`${entry.file}: excede el límite de ${maxStatesPerDataset} estados.`);
  }
  const sourceUrl = acq.sourceUrl ?? 'https://ssd.jpl.nasa.gov/api/horizons.api';
  const apiVersion = acq.apiVersion ?? null;
  const configSha256 = acq.configSha256 ?? null;
  const out = [];
  for (const bodyId of entry.bodyIds) {
    const meta = bodiesMeta[bodyId];
    const rows = data.series[bodyId];
    if (!meta || typeof meta !== 'object' || !Array.isArray(rows) || rows.length === 0) {
      throw new RangeError(`${entry.file}: faltan metadatos o muestras compactas para ${bodyId}.`);
    }
    const baseSourceMetadata = {
      sourceDistanceUnit: meta.sourceDistanceUnit ?? 'km',
      sourceVelocityUnit: meta.sourceVelocityUnit ?? 'km/s',
      originCode: acq.originCode ?? '500@10',
      referencePlane: acq.referencePlane ?? 'ECLIPTIC',
      referenceSystem: acq.referenceSystem ?? 'ICRF',
      timeScale: acq.timeScale ?? 'TDB',
      correction: acq.correction ?? 'NONE',
      queryParameters: meta.queryParameters ?? null,
      solutionId: meta.solutionId ?? null,
      responseSha256: meta.responseSha256 ?? null,
      acquisitionConfigSha256: configSha256
    };
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!Array.isArray(row) || row.length < 8) {
        throw new TypeError(`${entry.file}: fila compacta inválida en ${bodyId}[${i}].`);
      }
      const [jdTdb, labelTdb, x, y, z, vx, vy, vz] = row;
      out.push(createScientificState({
        identity: { id: bodyId, type: meta.type, origin: entry.origin },
        time: { jdTdb, scale: 'TDB' },
        position: { x, y, z, unit: 'km' },
        velocity: { x: vx, y: vy, z: vz, unit: 'km/s' },
        reference: {
          origin: entry.origin,
          originCode: '500@10',
          id: entry.frameId,
          referenceSystem: 'ICRF',
          referencePlane: 'ECLIPTIC_J2000',
          axes: '+X along ICRF X; +Z ecliptic north; +Y completes a right-handed system',
          correction: 'NONE'
        },
        provenance: {
          source: entry.source,
          sourceUrl,
          version: apiVersion,
          queriedAtUtc: meta.acquiredAtUtc ?? null,
          precision: null,
          uncertainty: null,
          sourceMetadata: {
            ...baseSourceMetadata,
            sourceRecordDateTdb: labelTdb
          }
        }
      }));
    }
  }
  return out;
}

function rawStates(data, entry, maxStatesPerDataset) {
  if (entry.format === 'horizons-daily-v1') {
    const count = Object.values(data?.planetas ?? {}).reduce((total, series) =>
      total + (Array.isArray(series) ? series.length : 0), 0);
    if (count > maxStatesPerDataset) {
      throw new RangeError(`${entry.file}: excede el límite de ${maxStatesPerDataset} estados.`);
    }
    validateHorizonsDataset(data);
    return Object.keys(HORIZONS_PLANETS).flatMap(name =>
      data.planetas[name].map((_, index) => adaptHorizonsSample(data, name, index)));
  }
  if (entry.format === 'horizons-compact-v1') {
    return adaptCompactDatasetStates(data, entry, maxStatesPerDataset);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)
    || data.formatVersion !== 1 || !Array.isArray(data.states) || data.states.length === 0) {
    throw new TypeError(`${entry.file}: se requiere {formatVersion:1, states:[...]}.`);
  }
  if (data.states.length > maxStatesPerDataset) {
    throw new RangeError(`${entry.file}: excede el límite de ${maxStatesPerDataset} estados.`);
  }
  return data.states.map(state => createScientificState(state));
}

function validateAndIndex(data, entry, maxStatesPerDataset) {
  const states = rawStates(data, entry, maxStatesPerDataset);
  const series = new Map(entry.bodyIds.map(id => [id, []]));
  const byTime = new Map(entry.bodyIds.map(id => [id, new Map()]));
  const lastJd = new Map();
  const bodyTypes = new Map();
  let first = Infinity;
  let last = -Infinity;
  for (const state of states) {
    const id = state.identity.id;
    if (!series.has(id)) throw new RangeError(`${entry.file}: cuerpo no declarado ${id}.`);
    if (state.identity.origin !== entry.origin || state.reference.id !== entry.frameId) {
      throw new RangeError(`${entry.file}: origen o marco incompatible para ${id}.`);
    }
    if (state.provenance.source !== entry.source
      || state.provenance.version !== entry.sourceVersion) {
      throw new RangeError(`${entry.file}: fuente o versión incompatible para ${id}.`);
    }
    if (bodyTypes.has(id) && bodyTypes.get(id) !== state.identity.type) {
      throw new RangeError(`${entry.file}: tipo de cuerpo inconsistente para ${id}.`);
    }
    bodyTypes.set(id, state.identity.type);
    const jd = state.time.jdTdb;
    if (lastJd.has(id) && jd <= lastJd.get(id)) {
      throw new RangeError(`${entry.file}: tiempos duplicados o desordenados para ${id}.`);
    }
    if (lastJd.has(id) && entry.cadenceSeconds !== null) {
      const stepDays = entry.cadenceSeconds / DAY_SECONDS;
      const steps = (jd - lastJd.get(id)) / stepDays;
      if (steps < 1 - TIME_TOLERANCE_DAYS / stepDays
        || Math.abs(steps - Math.round(steps)) * stepDays > TIME_TOLERANCE_DAYS) {
        throw new RangeError(`${entry.file}: cadencia declarada incompatible para ${id}.`);
      }
    }
    lastJd.set(id, jd);
    first = Math.min(first, jd);
    last = Math.max(last, jd);
    const enriched = enrichedState(state, entry);
    series.get(id).push(enriched);
    byTime.get(id).set(jd, enriched);
  }
  for (const [id, items] of series) {
    if (items.length === 0) throw new RangeError(`${entry.file}: faltan muestras del cuerpo ${id}.`);
    Object.freeze(items);
    const actual = { startJdTdb: items[0].time.jdTdb,
      endJdTdb: items.at(-1).time.jdTdb };
    const declared = entry.bodyCoverage?.[id];
    if (declared && (actual.startJdTdb !== declared.startJdTdb
      || actual.endJdTdb !== declared.endJdTdb)) {
      throw new RangeError(`${entry.file}: cobertura real del cuerpo ${id} distinta de la declarada.`);
    }
  }
  if (first !== entry.coverage.startJdTdb || last !== entry.coverage.endJdTdb) {
    throw new RangeError(`${entry.file}: cobertura real distinta de la declarada.`);
  }
  return Object.freeze({ entry, series, byTime, stateCount: states.length });
}

function samePhysicalState(a, b) {
  if (a.identity.type !== b.identity.type) return false;
  return ['position', 'velocity'].every(field =>
    ['x', 'y', 'z'].every(axis => a[field][axis] === b[field][axis]));
}

function resolvedAt(bodyId, jdTdb, loaded) {
  const candidates = [];
  for (const dataset of loaded) {
    const state = dataset.byTime.get(bodyId)?.get(jdTdb);
    if (state) candidates.push(Object.freeze({ datasetId: dataset.entry.id,
      file: dataset.entry.file, state }));
  }
  if (candidates.length === 0) return Object.freeze({ status: 'missing', bodyId, jdTdb,
    reason: loaded.some(dataset => {
      const items = dataset.series.get(bodyId);
      return items && jdTdb >= items[0].time.jdTdb
        && jdTdb <= items.at(-1).time.jdTdb;
    }) ? 'no_exact_sample' : 'outside_coverage' });
  if (candidates.some(candidate => !samePhysicalState(candidate.state, candidates[0].state))) {
    return Object.freeze({ status: 'conflict', bodyId, jdTdb,
      candidates: Object.freeze(candidates) });
  }
  return Object.freeze({ status: 'found', bodyId, jdTdb,
    state: candidates[0].state, datasetId: candidates[0].datasetId,
    file: candidates[0].file,
    alternates: Object.freeze(candidates.slice(1)) });
}

function intervalGaps(items, cadenceSeconds, datasetId) {
  if (cadenceSeconds === null) return [];
  const stepDays = cadenceSeconds / DAY_SECONDS;
  const gaps = [];
  for (let index = 1; index < items.length; index++) {
    const before = items[index - 1].time.jdTdb;
    const after = items[index].time.jdTdb;
    if (after - before > stepDays + TIME_TOLERANCE_DAYS) {
      gaps.push(Object.freeze({ kind: 'within_dataset', datasetId,
        afterJdTdb: before, beforeJdTdb: after,
        expectedCadenceSeconds: cadenceSeconds }));
    }
  }
  return gaps;
}

function neighbors(items, jdTdb) {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (items[middle].time.jdTdb < jdTdb) low = middle + 1;
    else high = middle;
  }
  return low > 0 && low < items.length ? [items[low - 1], items[low]] : null;
}

/**
 * Proveedor local de muestras exactas JD TDB. No interpola ni extrapola.
 * loadJson recibe una ruta relativa del catálogo y devuelve el JSON leído.
 */
export function createEphemerisProvider({ catalog, loadJson,
  maxStatesPerDataset = 100000, maxCachedDatasets = 8 }) {
  const validatedCatalog = createEphemerisCatalog(catalog);
  if (typeof loadJson !== 'function') throw new TypeError('loadJson debe ser una función asíncrona.');
  if (!Number.isSafeInteger(maxStatesPerDataset) || maxStatesPerDataset < 1
    || !Number.isSafeInteger(maxCachedDatasets) || maxCachedDatasets < 1) {
    throw new RangeError('Los límites de memoria deben ser enteros positivos.');
  }
  const cache = new Map();

  function trimCache() {
    for (const [id, item] of cache) {
      if (cache.size <= maxCachedDatasets) break;
      if (item.settled) cache.delete(id);
    }
  }

  function loadEntry(entry) {
    const cached = cache.get(entry.id);
    if (cached) {
      cache.delete(entry.id);
      cache.set(entry.id, cached);
      return cached.promise;
    }
    const item = { settled: false, promise: null };
    item.promise = Promise.resolve().then(() => loadJson(entry.file))
      .then(data => validateAndIndex(data, entry, maxStatesPerDataset))
      .then(dataset => { item.settled = true; trimCache(); return dataset; }, error => {
        cache.delete(entry.id);
        throw error;
      });
    cache.set(entry.id, item);
    trimCache();
    return item.promise;
  }

  function entriesFor(bodyId, startJdTdb = -Infinity, endJdTdb = Infinity) {
    return validatedCatalog.datasets.filter(entry => entry.bodyIds.includes(bodyId)
      && (entry.bodyCoverage?.[bodyId] ?? entry.coverage).startJdTdb <= endJdTdb
      && (entry.bodyCoverage?.[bodyId] ?? entry.coverage).endJdTdb >= startJdTdb);
  }

  function assertBodyId(bodyId) {
    if (typeof bodyId !== 'string' || bodyId.trim() === '') {
      throw new TypeError('bodyId debe ser una cadena no vacía.');
    }
  }

  async function loadRelevant(bodyId, startJdTdb, endJdTdb) {
    return Promise.all(entriesFor(bodyId, startJdTdb, endJdTdb).map(loadEntry));
  }

  return Object.freeze({
    listDatasets: () => validatedCatalog.datasets,
    listBodies: () => Object.freeze([...new Set(validatedCatalog.datasets.flatMap(entry => entry.bodyIds))]),
    async getExact(bodyId, jdTdb) {
      assertBodyId(bodyId);
      requireJdTdb(jdTdb);
      return resolvedAt(bodyId, jdTdb, await loadRelevant(bodyId, jdTdb, jdTdb));
    },
    async getInterpolated(bodyId, jdTdb, options = {}) {
      assertBodyId(bodyId);
      requireJdTdb(jdTdb);
      const { datasetId = null, maxIntervalSeconds = 86400,
        allowGap = false, allowIrregular = false } = options;
      requireFiniteNumber(maxIntervalSeconds, 'maxIntervalSeconds');
      if (maxIntervalSeconds <= 0 || (datasetId !== null &&
        (typeof datasetId !== 'string' || datasetId.trim() === ''))
        || typeof allowGap !== 'boolean' || typeof allowIrregular !== 'boolean') {
        throw new TypeError('Opciones de interpolación inválidas.');
      }
      const loaded = await Promise.all(entriesFor(bodyId, jdTdb, jdTdb)
        .filter(entry => datasetId === null || entry.id === datasetId).map(loadEntry));
      const exact = resolvedAt(bodyId, jdTdb, loaded);
      if (exact.status === 'found') return Object.freeze({ ...exact, status: 'exact' });
      if (exact.status === 'conflict') return exact;
      if (loaded.length === 0 || exact.reason === 'outside_coverage') return exact;
      const rejectedReasons = [];
      const candidates = [];
      for (const dataset of loaded) {
        const pair = neighbors(dataset.series.get(bodyId), jdTdb);
        if (!pair) continue;
        const [first, last] = pair;
        const intervalSeconds = secondsBetweenJdTdb(first.time.jdTdb, last.time.jdTdb);
        if (intervalSeconds > maxIntervalSeconds) {
          rejectedReasons.push('interval_exceeds_limit');
          continue;
        }
        if (dataset.entry.cadenceSeconds === null && !allowIrregular) {
          rejectedReasons.push('irregular_sampling_requires_authorization');
          continue;
        }
        const gap = dataset.entry.cadenceSeconds !== null
          && intervalSeconds > dataset.entry.cadenceSeconds + TIME_TOLERANCE_DAYS * DAY_SECONDS;
        if (gap && !allowGap) {
          rejectedReasons.push('gap_requires_authorization');
          continue;
        }
        candidates.push({ dataset, first, last, intervalSeconds,
          warnings: gap ? ['intervalo con muestras faltantes']
            : dataset.entry.cadenceSeconds === null ? ['cadencia irregular o desconocida'] : [] });
      }
      if (candidates.length === 0) {
        return Object.freeze({ status: 'interpolation_rejected', bodyId, jdTdb,
          reason: rejectedReasons[0] ?? 'no_bracketing_samples' });
      }
      const chosen = candidates[0];
      if (candidates.some(candidate =>
        candidate.first.time.jdTdb !== chosen.first.time.jdTdb
        || candidate.last.time.jdTdb !== chosen.last.time.jdTdb
        || !samePhysicalState(candidate.first, chosen.first)
        || !samePhysicalState(candidate.last, chosen.last))) {
        return Object.freeze({ status: 'interpolation_rejected', bodyId, jdTdb,
          reason: 'ambiguous_overlap', datasetIds: Object.freeze(candidates.map(item => item.dataset.entry.id)) });
      }
      if (datasetId === null) {
        for (const endpoint of [chosen.first.time.jdTdb, chosen.last.time.jdTdb]) {
          const endpointResult = resolvedAt(bodyId, endpoint,
            await loadRelevant(bodyId, endpoint, endpoint));
          if (endpointResult.status === 'conflict') {
            return Object.freeze({ ...endpointResult, reason: 'conflicting_endpoint' });
          }
        }
      }
      const state = interpolateHermiteState(chosen.first, chosen.last, jdTdb,
        { maxIntervalSeconds });
      return Object.freeze({ status: 'interpolated', bodyId, jdTdb, state,
        datasetId: chosen.dataset.entry.id, file: chosen.dataset.entry.file,
        algorithm: HERMITE_ALGORITHM, algorithmVersion: HERMITE_ALGORITHM_VERSION,
        intervalSeconds: chosen.intervalSeconds,
        samples: Object.freeze([chosen.first, chosen.last].map(source => Object.freeze({
          jdTdb: source.time.jdTdb, datasetId: chosen.dataset.entry.id,
          file: chosen.dataset.entry.file, provenance: source.provenance }))),
        warnings: Object.freeze(chosen.warnings) });
    },
    async getProvenance(bodyId, jdTdb) {
      assertBodyId(bodyId);
      requireJdTdb(jdTdb);
      const result = resolvedAt(bodyId, jdTdb, await loadRelevant(bodyId, jdTdb, jdTdb));
      if (result.status === 'missing') return result;
      const candidates = result.status === 'conflict'
        ? result.candidates
        : [{ datasetId: result.datasetId, file: result.file, state: result.state },
          ...result.alternates];
      return Object.freeze({ status: result.status, bodyId, jdTdb,
        sources: Object.freeze(candidates.map(candidate => Object.freeze({
          datasetId: candidate.datasetId, file: candidate.file,
          provenance: candidate.state.provenance }))) });
    },
    async getRange(bodyId, startJdTdb, endJdTdb) {
      assertBodyId(bodyId);
      requireJdTdb(startJdTdb);
      requireJdTdb(endJdTdb);
      if (endJdTdb < startJdTdb) throw new RangeError('El rango termina antes de empezar.');
      const loaded = await loadRelevant(bodyId, startJdTdb, endJdTdb);
      const times = new Set(loaded.flatMap(dataset => dataset.series.get(bodyId)
        .map(state => state.time.jdTdb)
        .filter(jd => jd >= startJdTdb && jd <= endJdTdb)));
      return Object.freeze([...times].sort((a, b) => a - b)
        .map(jd => resolvedAt(bodyId, jd, loaded)));
    },
    async getCoverage(bodyId) {
      assertBodyId(bodyId);
      const loaded = await loadRelevant(bodyId, -Infinity, Infinity);
      const intervals = loaded.map(dataset => {
        const items = dataset.series.get(bodyId);
        return Object.freeze({ datasetId: dataset.entry.id, file: dataset.entry.file,
          startJdTdb: items[0].time.jdTdb,
          endJdTdb: items[items.length - 1].time.jdTdb,
          cadenceSeconds: dataset.entry.cadenceSeconds,
          sampleCount: items.length });
      }).sort((a, b) => a.startJdTdb - b.startJdTdb);
      const segments = loaded.flatMap(dataset => {
        const items = dataset.series.get(bodyId);
        const cadence = dataset.entry.cadenceSeconds;
        const result = [];
        let first = items[0];
        for (let i = 1; i <= items.length; i++) {
          if (i < items.length && (cadence === null
            || secondsBetweenJdTdb(items[i - 1].time.jdTdb, items[i].time.jdTdb)
              <= cadence + TIME_TOLERANCE_DAYS * DAY_SECONDS)) continue;
          result.push(Object.freeze({ datasetId: dataset.entry.id,
            startJdTdb: first.time.jdTdb, endJdTdb: items[i - 1].time.jdTdb }));
          first = items[i];
        }
        return result;
      }).sort((a, b) => a.startJdTdb - b.startJdTdb);
      const gaps = loaded.flatMap(dataset => intervalGaps(dataset.series.get(bodyId),
        dataset.entry.cadenceSeconds, dataset.entry.id));
      const overlaps = [];
      for (let i = 0; i < segments.length; i++) {
        for (let j = i + 1; j < segments.length; j++) {
          const a = segments[i];
          const b = segments[j];
          if (a.datasetId !== b.datasetId && b.startJdTdb <= a.endJdTdb) {
            overlaps.push(Object.freeze({ datasetIds: Object.freeze([a.datasetId, b.datasetId]),
              startJdTdb: b.startJdTdb,
              endJdTdb: Math.min(a.endJdTdb, b.endJdTdb) }));
          }
        }
      }
      let coveredUntil = -Infinity;
      for (const interval of intervals) {
        if (coveredUntil !== -Infinity && interval.startJdTdb > coveredUntil) {
          gaps.push(Object.freeze({ kind: 'between_datasets',
            afterJdTdb: coveredUntil, beforeJdTdb: interval.startJdTdb }));
        }
        coveredUntil = Math.max(coveredUntil, interval.endJdTdb);
      }
      const times = new Set(loaded.flatMap(dataset =>
        dataset.series.get(bodyId).map(state => state.time.jdTdb)));
      const conflicts = [...times].sort((a, b) => a - b)
        .map(jd => resolvedAt(bodyId, jd, loaded))
        .filter(result => result.status === 'conflict');
      return Object.freeze({ bodyId, intervals: Object.freeze(intervals),
        segments: Object.freeze(segments),
        gaps: Object.freeze(gaps), overlaps: Object.freeze(overlaps),
        conflicts: Object.freeze(conflicts) });
    },
    async getDatasetInfo(id) {
      const entry = validatedCatalog.datasets.find(item => item.id === id);
      if (!entry) throw new RangeError(`Dataset no registrado: ${id}.`);
      const dataset = await loadEntry(entry);
      return Object.freeze({ ...entry, stateCount: dataset.stateCount,
        sampleCounts: Object.freeze(Object.fromEntries([...dataset.series]
          .map(([bodyId, series]) => [bodyId, series.length]))) });
    }
  });
}
