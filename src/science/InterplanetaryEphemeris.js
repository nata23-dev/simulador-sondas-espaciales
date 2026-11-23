// Etapa 12G — proveedor de estados heliocéntricos para planificación interplanetaria.
// Reutiliza EphemerisProvider (validación de formato, cobertura, conflictos) y la interpolación cúbica de Hermite
// (posición + velocidad). Nunca extrapola: fuera de cobertura devuelve «Efemérides no disponibles para el intervalo
// solicitado». Módulo puro: `loadJson` se inyecta (fetch en el navegador, lectura de disco en pruebas).
import { createEphemerisProvider } from './EphemerisProvider.js';
import { interpolateHermiteState } from './HermiteInterpolation.js';
import { requireJdTdb, secondsBetweenJdTdb } from './Time.js';

export const UNAVAILABLE_MESSAGE = 'Efemérides no disponibles para el intervalo solicitado';
export const INTERPLANETARY_FRAME = Object.freeze({
  id: 'ICRF_ECLIPTIC_J2000', origin: 'SUN_CENTER', originCode: '500@10', originLabel: 'Centro del Sol (500@10)',
  referenceSystem: 'ICRF', referencePlane: 'Eclíptica J2000 de Horizons (REF_PLANE=ECLIPTIC, ε = 84 381,448″)',
  axes: '+X hacia el equinoccio J2000 (eje X de ICRF); +Z polo norte de la eclíptica J2000; +Y completa el sistema dextrógiro',
  timeScale: 'TDB', units: Object.freeze({ position: 'km', velocity: 'km/s' }),
  vectorType: 'Vectores geométricos (VEC_CORR=NONE): sin tiempo de luz ni aberración', inertial: true
});
export const PLANET_NAMES = Object.freeze({ '199': 'Mercurio', '299': 'Venus', '399': 'Tierra', '499': 'Marte', '599': 'Júpiter', '699': 'Saturno', '799': 'Urano', '899': 'Neptuno' });
// Error máximo de la interpolación medido contra estados de Horizons NO usados como nodos (tests/fixtures/interplanetary-horizons-holdout-v1.json).
export const MEASURED_INTERPOLATION_ERROR = Object.freeze({
  '199': { positionKm: 18.72, velocityKmS: 6.5e-4 }, '299': { positionKm: 0.18, velocityKmS: 6.3e-6 }, '399': { positionKm: 0.088, velocityKmS: 3.1e-6 },
  '499': { positionKm: 0.0091, velocityKmS: 2.8e-7 }, '599': { positionKm: 94.5, velocityKmS: 1.34e-3 }, '699': { positionKm: 6.87, velocityKmS: 8.0e-5 },
  '799': { positionKm: 16.97, velocityKmS: 1.48e-4 }, '899': { positionKm: 47.4, velocityKmS: 4.2e-4 }
});

const vec = v => [v.x, v.y, v.z];

function crearMetadatosNodo(bodyId, entry, sourceState) {
  const md = sourceState.provenance?.sourceMetadata ?? {};
  return Object.freeze({
    dataset: Object.freeze({ id: entry.id, file: entry.file, source: entry.source, apiVersion: entry.sourceVersion, solutionId: md.solutionId ?? null }),
    coverage: Object.freeze({ ...(entry.bodyCoverage?.[bodyId] ?? entry.coverage) }),
    quality: Object.freeze({ extrapolated: false, cadenceSeconds: entry.cadenceSeconds, measuredMaxError: MEASURED_INTERPOLATION_ERROR[bodyId] ?? null })
  });
}

function describe(bodyId, jdTdb, state, entry, method, interval, nodes, sourceState = state) {
  const meta = crearMetadatosNodo(bodyId, entry, sourceState);
  return Object.freeze({
    status: 'available', bodyId, name: PLANET_NAMES[bodyId] ?? bodyId, epoch: Object.freeze({ jdTdb, scale: 'TDB' }),
    positionKm: vec(state.position), velocityKmS: vec(state.velocity), origin: INTERPLANETARY_FRAME.originLabel, frame: INTERPLANETARY_FRAME,
    units: INTERPLANETARY_FRAME.units, vectorType: INTERPLANETARY_FRAME.vectorType,
    dataset: meta.dataset,
    coverage: meta.coverage,
    interpolation: Object.freeze({ method, intervalSeconds: interval, nodeJdTdb: nodes }),
    quality: meta.quality
  });
}

function interpolarVectoresHermite(p0, v0, t0, p1, v1, t1, jdTdb) {
  const duration = secondsBetweenJdTdb(t0, t1);
  const u = secondsBetweenJdTdb(t0, jdTdb) / duration;
  const u2 = u * u;
  const h01 = u2 * (3 - 2 * u);
  const h10 = u * (1 - u) * (1 - u);
  const h11 = -u2 * (1 - u);
  const d00 = 6 * u * (u - 1);
  const d10 = (1 - u) * (1 - 3 * u);
  const d11 = u * (3 * u - 2);
  const positionKm = [
    p0[0] + h01 * (p1[0] - p0[0]) + duration * (h10 * v0[0] + h11 * v1[0]),
    p0[1] + h01 * (p1[1] - p0[1]) + duration * (h10 * v0[1] + h11 * v1[1]),
    p0[2] + h01 * (p1[2] - p0[2]) + duration * (h10 * v0[2] + h11 * v1[2])
  ];
  const velocityKmS = [
    d00 * (p0[0] - p1[0]) / duration + d10 * v0[0] + d11 * v1[0],
    d00 * (p0[1] - p1[1]) / duration + d10 * v0[1] + d11 * v1[1],
    d00 * (p0[2] - p1[2]) / duration + d10 * v0[2] + d11 * v1[2]
  ];
  return { positionKm, velocityKmS };
}

function construirEvaluadorVentana(tables, startJdTdb, endJdTdb, bodyIds) {
  function resolveSegmentIndex(table, jdTdb) {
    const times = table.times;
    const maxLo = times.length - 2;
    const last = table.lastLo;
    if (last >= 0 && last <= maxLo) {
      if (times[last] <= jdTdb && jdTdb <= times[last + 1]) return last;
      if (last < maxLo && times[last + 1] <= jdTdb && jdTdb <= times[last + 2]) {
        table.lastLo = last + 1;
        return last + 1;
      }
      if (last > 0 && times[last - 1] <= jdTdb && jdTdb <= times[last]) {
        table.lastLo = last - 1;
        return last - 1;
      }
    }
    let lo = 0, hi = times.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= jdTdb) lo = mid;
      else hi = mid;
    }
    table.lastLo = lo;
    return lo;
  }

  function stateAt(bodyId, jdTdb) {
    if (bodyId === '10') return sunState(jdTdb);
    const table = tables.get(bodyId);
    if (!table) throw new RangeError(`Cuerpo ${bodyId} no cargado en la ventana.`);
    if (!table.cov || jdTdb < table.cov.startJdTdb || jdTdb > table.cov.endJdTdb) return unavailable(bodyId, jdTdb, 'Fuera de la cobertura real; no se extrapola.', table.cov);
    const nodes = table.nodes;
    if (!nodes.length || jdTdb < table.times[0] || jdTdb > table.times[nodes.length - 1]) return unavailable(bodyId, jdTdb, 'Instante fuera de la ventana cargada.', table.cov);
    if (jdTdb === table.lastJd && table.lastResult) return table.lastResult;
    const lo = resolveSegmentIndex(table, jdTdb), hi = lo + 1;
    const a = nodes[lo], b = nodes[hi];
    let result;
    if (a.jdTdb === jdTdb) {
      result = Object.freeze({
        status: 'available', bodyId, name: PLANET_NAMES[bodyId] ?? bodyId, epoch: Object.freeze({ jdTdb, scale: 'TDB' }),
        positionKm: [...a.positionKm], velocityKmS: [...a.velocityKmS], origin: INTERPLANETARY_FRAME.originLabel, frame: INTERPLANETARY_FRAME,
        units: INTERPLANETARY_FRAME.units, vectorType: INTERPLANETARY_FRAME.vectorType,
        dataset: a.dataset, coverage: a.coverage, interpolation: a.exactInterpolation, quality: a.quality
      });
    } else if (b.jdTdb === jdTdb) {
      result = Object.freeze({
        status: 'available', bodyId, name: PLANET_NAMES[bodyId] ?? bodyId, epoch: Object.freeze({ jdTdb, scale: 'TDB' }),
        positionKm: [...b.positionKm], velocityKmS: [...b.velocityKmS], origin: INTERPLANETARY_FRAME.originLabel, frame: INTERPLANETARY_FRAME,
        units: INTERPLANETARY_FRAME.units, vectorType: INTERPLANETARY_FRAME.vectorType,
        dataset: b.dataset, coverage: b.coverage, interpolation: b.exactInterpolation, quality: b.quality
      });
    } else {
      const { positionKm, velocityKmS } = interpolarVectoresHermite(a.positionKm, a.velocityKmS, a.jdTdb, b.positionKm, b.velocityKmS, b.jdTdb, jdTdb);
      result = Object.freeze({
        status: 'available', bodyId, name: PLANET_NAMES[bodyId] ?? bodyId, epoch: Object.freeze({ jdTdb, scale: 'TDB' }),
        positionKm, velocityKmS, origin: INTERPLANETARY_FRAME.originLabel, frame: INTERPLANETARY_FRAME,
        units: INTERPLANETARY_FRAME.units, vectorType: INTERPLANETARY_FRAME.vectorType,
        dataset: a.dataset, coverage: a.coverage, interpolation: table.pairInterpolation[lo], quality: a.quality
      });
    }
    table.lastJd = jdTdb;
    table.lastResult = result;
    return result;
  }

  function serializeWindow() {
    const serializedTables = {};
    for (const [bodyId, table] of tables.entries()) {
      serializedTables[bodyId] = {
        cov: table.cov,
        cadenceSeconds: table.cadenceSeconds,
        nodes: table.nodes.map(n => ({
          jdTdb: n.jdTdb,
          positionKm: n.positionKm,
          velocityKmS: n.velocityKmS,
          dataset: n.dataset,
          coverage: n.coverage,
          quality: n.quality
        }))
      };
    }
    return { startJdTdb, endJdTdb, bodyIds: [...bodyIds], tables: serializedTables };
  }

  return Object.freeze({ startJdTdb, endJdTdb, stateAt, bodyIds: Object.freeze([...bodyIds]), serializeWindow });
}

/** Reconstruye un evaluador de ventana en un Web Worker a partir de `window.serializeWindow()`. */
export function createInterplanetaryWindowFromSerialized(serialized) {
  const tables = new Map();
  for (const [bodyId, raw] of Object.entries(serialized.tables ?? {})) {
    const nodes = (raw.nodes ?? []).map(n => ({
      jdTdb: n.jdTdb,
      positionKm: n.positionKm,
      velocityKmS: n.velocityKmS,
      dataset: Object.freeze({ ...n.dataset }),
      coverage: Object.freeze({ ...n.coverage }),
      quality: Object.freeze({ ...n.quality }),
      exactInterpolation: Object.freeze({ method: 'exact-node', intervalSeconds: 0, nodeJdTdb: [n.jdTdb] })
    }));
    const times = Float64Array.from(nodes, n => n.jdTdb);
    const pairInterpolation = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      pairInterpolation.push(Object.freeze({
        method: 'cubic-hermite',
        intervalSeconds: (nodes[i + 1].jdTdb - nodes[i].jdTdb) * 86400,
        nodeJdTdb: [nodes[i].jdTdb, nodes[i + 1].jdTdb]
      }));
    }
    tables.set(bodyId, {
      cov: raw.cov ? Object.freeze({ ...raw.cov }) : null,
      nodes,
      times,
      pairInterpolation,
      cadenceSeconds: raw.cadenceSeconds,
      lastLo: -1,
      lastJd: NaN,
      lastResult: null
    });
  }
  return construirEvaluadorVentana(tables, serialized.startJdTdb, serialized.endJdTdb, serialized.bodyIds ?? []);
}

function unavailable(bodyId, jdTdb, reason, coverage = null) {
  return Object.freeze({ status: 'unavailable', bodyId, name: PLANET_NAMES[bodyId] ?? bodyId, epoch: Object.freeze({ jdTdb, scale: 'TDB' }), message: UNAVAILABLE_MESSAGE, reason, coverage });
}

/** Sol: origen del marco por definición (no es un dato de efeméride). */
function sunState(jdTdb) {
  return Object.freeze({ status: 'available', bodyId: '10', name: 'Sol', epoch: Object.freeze({ jdTdb, scale: 'TDB' }), positionKm: [0, 0, 0], velocityKmS: [0, 0, 0],
    origin: INTERPLANETARY_FRAME.originLabel, frame: INTERPLANETARY_FRAME, units: INTERPLANETARY_FRAME.units, vectorType: 'Origen del marco por definición',
    dataset: null, coverage: null, interpolation: Object.freeze({ method: 'definition', intervalSeconds: 0, nodeJdTdb: [] }), quality: Object.freeze({ extrapolated: false }) });
}

export function createInterplanetaryEphemeris({ catalog, loadJson }) {
  const provider = createEphemerisProvider({ catalog, loadJson, maxCachedDatasets: 8 });
  const entries = provider.listDatasets();
  const entryById = new Map(entries.map(entry => [entry.id, entry]));
  function coverage(bodyId) {
    const ranges = entries.filter(entry => entry.bodyIds.includes(bodyId)).map(entry => entry.bodyCoverage?.[bodyId] ?? entry.coverage).sort((a, b) => a.startJdTdb - b.startJdTdb);
    if (!ranges.length) return null;
    let start = ranges[0].startJdTdb, end = ranges[0].endJdTdb;
    for (const range of ranges.slice(1)) { if (range.startJdTdb > end) break; end = Math.max(end, range.endJdTdb); } // solo el tramo contiguo inicial
    return Object.freeze({ startJdTdb: start, endJdTdb: end });
  }
  function cadenceFor(bodyId) { return Math.max(...entries.filter(entry => entry.bodyIds.includes(bodyId)).map(entry => entry.cadenceSeconds)); }

  async function getBodyState(bodyId, jdTdb) {
    requireJdTdb(jdTdb);
    if (bodyId === '10') return sunState(jdTdb);
    const cov = coverage(bodyId);
    if (!cov) return unavailable(bodyId, jdTdb, 'Cuerpo sin conjunto interplanetario registrado.');
    if (jdTdb < cov.startJdTdb || jdTdb > cov.endJdTdb) return unavailable(bodyId, jdTdb, 'Fuera de la cobertura real; no se extrapola.', cov);
    const result = await provider.getInterpolated(bodyId, jdTdb, { maxIntervalSeconds: cadenceFor(bodyId) });
    if (result.status === 'exact') return describe(bodyId, jdTdb, result.state, entryById.get(result.datasetId), 'exact-node', 0, [jdTdb]);
    if (result.status === 'interpolated') return describe(bodyId, jdTdb, result.state, entryById.get(result.datasetId), 'cubic-hermite', result.intervalSeconds, result.samples.map(s => s.jdTdb), { provenance: result.samples[0].provenance });
    return unavailable(bodyId, jdTdb, `Muestra no utilizable (${result.status}${result.reason ? `: ${result.reason}` : ''}).`, cov);
  }

  /**
   * Carga una ventana [start, end] para varios cuerpos y devuelve un evaluador SÍNCRONO (búsquedas y reproducción).
   * Incluye el nodo anterior y posterior para poder interpolar en los extremos; no extiende la cobertura.
   */
  async function loadWindow(bodyIds, startJdTdb, endJdTdb) {
    requireJdTdb(startJdTdb); requireJdTdb(endJdTdb);
    if (endJdTdb < startJdTdb) throw new RangeError('La ventana termina antes de empezar.');
    const tables = new Map();
    for (const bodyId of bodyIds) {
      if (bodyId === '10') continue;
      const cov = coverage(bodyId), cadenceSec = cadenceFor(bodyId), cadence = cadenceSec / 86400;
      if (!cov) { tables.set(bodyId, { cov: null, nodes: [], times: new Float64Array(0), pairInterpolation: [], cadenceSeconds: 0, lastLo: -1, lastJd: NaN, lastResult: null }); continue; }
      const from = Math.max(cov.startJdTdb, startJdTdb - cadence), to = Math.min(cov.endJdTdb, endJdTdb + cadence);
      const resolved = from <= to ? await provider.getRange(bodyId, from, to) : [];
      const nodes = [];
      for (const item of resolved) {
        if (item.status !== 'found') throw new RangeError(`Efemérides en conflicto para ${bodyId} en JD ${item.jdTdb}: no se mezclan.`);
        const entry = entryById.get(item.datasetId);
        const meta = crearMetadatosNodo(bodyId, entry, item.state);
        const jd = item.state.time.jdTdb;
        nodes.push({
          jdTdb: jd,
          positionKm: vec(item.state.position),
          velocityKmS: vec(item.state.velocity),
          dataset: meta.dataset,
          coverage: meta.coverage,
          quality: meta.quality,
          exactInterpolation: Object.freeze({ method: 'exact-node', intervalSeconds: 0, nodeJdTdb: [jd] })
        });
      }
      const pairInterpolation = [];
      for (let i = 1; i < nodes.length; i++) {
        const step = (nodes[i].jdTdb - nodes[i - 1].jdTdb) * 86400;
        if (step > cadenceSec + 1e-3) throw new RangeError(`Hueco en las efemérides de ${bodyId}: no se interpola a través de él.`);
        pairInterpolation.push(Object.freeze({
          method: 'cubic-hermite',
          intervalSeconds: step,
          nodeJdTdb: [nodes[i - 1].jdTdb, nodes[i].jdTdb]
        }));
      }
      tables.set(bodyId, {
        cov,
        nodes,
        times: Float64Array.from(nodes, n => n.jdTdb),
        pairInterpolation,
        cadenceSeconds: cadenceSec,
        lastLo: -1,
        lastJd: NaN,
        lastResult: null
      });
    }
    return construirEvaluadorVentana(tables, startJdTdb, endJdTdb, bodyIds);
  }

  return Object.freeze({ getBodyState, loadWindow, coverage, listDatasets: () => entries, frame: INTERPLANETARY_FRAME });
}
