// Etapa 12G — proveedor de estados heliocéntricos para planificación interplanetaria.
// Reutiliza EphemerisProvider (validación de formato, cobertura, conflictos) y la interpolación cúbica de Hermite
// (posición + velocidad). Nunca extrapola: fuera de cobertura devuelve «Efemérides no disponibles para el intervalo
// solicitado». Módulo puro: `loadJson` se inyecta (fetch en el navegador, lectura de disco en pruebas).
import { createEphemerisProvider } from './EphemerisProvider.js';
import { interpolateHermiteState } from './HermiteInterpolation.js';
import { requireJdTdb } from './Time.js';

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

function describe(bodyId, jdTdb, state, entry, method, interval, nodes, sourceState = state) {
  const md = sourceState.provenance.sourceMetadata ?? {};
  return Object.freeze({
    status: 'available', bodyId, name: PLANET_NAMES[bodyId] ?? bodyId, epoch: Object.freeze({ jdTdb, scale: 'TDB' }),
    positionKm: vec(state.position), velocityKmS: vec(state.velocity), origin: INTERPLANETARY_FRAME.originLabel, frame: INTERPLANETARY_FRAME,
    units: INTERPLANETARY_FRAME.units, vectorType: INTERPLANETARY_FRAME.vectorType,
    dataset: Object.freeze({ id: entry.id, file: entry.file, source: entry.source, apiVersion: entry.sourceVersion, solutionId: md.solutionId ?? null }),
    coverage: Object.freeze({ ...(entry.bodyCoverage?.[bodyId] ?? entry.coverage) }),
    interpolation: Object.freeze({ method, intervalSeconds: interval, nodeJdTdb: nodes }),
    quality: Object.freeze({ extrapolated: false, cadenceSeconds: entry.cadenceSeconds, measuredMaxError: MEASURED_INTERPOLATION_ERROR[bodyId] ?? null })
  });
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
      const cov = coverage(bodyId), cadence = cadenceFor(bodyId) / 86400;
      if (!cov) { tables.set(bodyId, { cov: null, nodes: [] }); continue; }
      const from = Math.max(cov.startJdTdb, startJdTdb - cadence), to = Math.min(cov.endJdTdb, endJdTdb + cadence);
      const resolved = from <= to ? await provider.getRange(bodyId, from, to) : [];
      const nodes = [];
      for (const item of resolved) {
        if (item.status !== 'found') throw new RangeError(`Efemérides en conflicto para ${bodyId} en JD ${item.jdTdb}: no se mezclan.`);
        nodes.push({ state: item.state, entry: entryById.get(item.datasetId) });
      }
      for (let i = 1; i < nodes.length; i++) {
        const step = (nodes[i].state.time.jdTdb - nodes[i - 1].state.time.jdTdb) * 86400;
        if (step > cadenceFor(bodyId) + 1e-3) throw new RangeError(`Hueco en las efemérides de ${bodyId}: no se interpola a través de él.`);
      }
      tables.set(bodyId, { cov, nodes, cadenceSeconds: cadenceFor(bodyId) });
    }
    function stateAt(bodyId, jdTdb) {
      if (bodyId === '10') return sunState(jdTdb);
      const table = tables.get(bodyId);
      if (!table) throw new RangeError(`Cuerpo ${bodyId} no cargado en la ventana.`);
      if (!table.cov || jdTdb < table.cov.startJdTdb || jdTdb > table.cov.endJdTdb) return unavailable(bodyId, jdTdb, 'Fuera de la cobertura real; no se extrapola.', table.cov);
      const nodes = table.nodes;
      if (!nodes.length || jdTdb < nodes[0].state.time.jdTdb || jdTdb > nodes.at(-1).state.time.jdTdb) return unavailable(bodyId, jdTdb, 'Instante fuera de la ventana cargada.', table.cov);
      let lo = 0, hi = nodes.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (nodes[mid].state.time.jdTdb <= jdTdb) lo = mid; else hi = mid; }
      const a = nodes[lo], b = nodes[hi];
      if (a.state.time.jdTdb === jdTdb) return describe(bodyId, jdTdb, a.state, a.entry, 'exact-node', 0, [jdTdb]);
      if (b.state.time.jdTdb === jdTdb) return describe(bodyId, jdTdb, b.state, b.entry, 'exact-node', 0, [jdTdb]);
      const state = interpolateHermiteState(a.state, b.state, jdTdb, { maxIntervalSeconds: table.cadenceSeconds });
      return describe(bodyId, jdTdb, state, a.entry, 'cubic-hermite', (b.state.time.jdTdb - a.state.time.jdTdb) * 86400, [a.state.time.jdTdb, b.state.time.jdTdb], a.state);
    }
    return Object.freeze({ startJdTdb, endJdTdb, stateAt, bodyIds: Object.freeze([...bodyIds]) });
  }

  return Object.freeze({ getBodyState, loadWindow, coverage, listDatasets: () => entries, frame: INTERPLANETARY_FRAME });
}
