import { requireJdTdb } from './Time.js';

export const HISTORICAL_ENCOUNTER_CONTEXT_CATALOG_PATH = 'data/historical-encounter-contexts-v1.json';
const SECONDS_PER_DAY = 86400;

function validateCatalog(catalog) {
  if (catalog?.version !== 1 || catalog?.frame !== 'ICRF_ECLIPTIC_J2000'
    || catalog?.timeScale !== 'TDB' || catalog?.correction !== 'NONE'
    || catalog?.units !== 'km, km/s' || catalog?.origin !== 'planet-center'
    || !Array.isArray(catalog.contexts) || !Array.isArray(catalog.moonContexts)) {
    throw new Error('Catálogo de contextos Voyager incompatible.');
  }
  const keys = new Set();
  for (const c of catalog.contexts) {
    const key = `${c.missionId}:${c.planet}`;
    if (keys.has(key) || !Number.isFinite(c.startJdTdb) || !Number.isFinite(c.endJdTdb)
      || c.startJdTdb >= c.endJdTdb || !Number.isInteger(c.sampleCount)
      || c.sampleCount < 2 || c.maxIntervalSeconds > 300 || c.maxIntervalSeconds <= 0) {
      throw new Error(`Contexto Voyager inválido: ${key}`);
    }
    keys.add(key);
  }
  for (const c of catalog.moonContexts) {
    const key=`${c.missionId}:${c.moon}`;
    if(keys.has(key)||!Number.isFinite(c.startJdTdb)||!Number.isFinite(c.endJdTdb)
      ||c.startJdTdb>=c.endJdTdb||!Number.isInteger(c.sampleCount)
      ||c.sampleCount<2||c.maxIntervalSeconds>300||c.maxIntervalSeconds<=0) {
      throw new Error(`Contexto lunar Voyager inválido: ${key}`);
    }
    keys.add(key);
  }
}

function validateSeries(data, entry) {
  const moon=entry.moon!==undefined;
  if (data?.format !== (moon?'voyager-moon-relative-v1':'voyager-relative-v1')
    || data.missionId !== entry.missionId || data.probeNaifId !== entry.probeNaifId
    || data.planet !== entry.planet || (moon
      ? data.moon!==entry.moon||data.moonNaifId!==entry.moonNaifId||data.origin!=='probe-center'
      : data.planetNaifId!==entry.planetNaifId)
    || data.frame !== 'ICRF_ECLIPTIC_J2000'
    || data.timeScale !== 'TDB' || data.correction !== 'NONE'
    || data.units !== 'km, km/s' || data.series?.length !== entry.sampleCount
    || data.series[0]?.[0] !== entry.startJdTdb
    || data.series.at(-1)?.[0] !== entry.endJdTdb) {
    throw new Error(`Datos de encuentro incompatibles: ${entry.id}`);
  }
  for (let i = 0; i < data.series.length; i++) {
    const row = data.series[i];
    if (row.length !== 7 || row.some(x => !Number.isFinite(x))
      || (i > 0 && (row[0] <= data.series[i - 1][0]
        || (row[0] - data.series[i - 1][0]) * SECONDS_PER_DAY > entry.maxIntervalSeconds + 0.01))) {
      throw new Error(`Muestra relativa inválida: ${entry.id}, ${i}`);
    }
  }
}

function hermite(first, last, jdTdb) {
  const duration = (last[0] - first[0]) * SECONDS_PER_DAY;
  const u = (jdTdb - first[0]) / (last[0] - first[0]);
  const u2 = u * u;
  const h01 = u2 * (3 - 2 * u);
  const h10 = u * (1 - u) * (1 - u);
  const h11 = -u2 * (1 - u);
  const d00 = 6 * u * (u - 1);
  const d10 = (1 - u) * (1 - 3 * u);
  const d11 = u * (3 * u - 2);
  const result = [];
  for (let i = 0; i < 3; i++) {
    const p0 = first[i + 1], p1 = last[i + 1];
    const v0 = first[i + 4], v1 = last[i + 4];
    result.push(p0 + h01 * (p1 - p0) + duration * (h10 * v0 + h11 * v1));
  }
  for (let i = 0; i < 3; i++) {
    const p0 = first[i + 1], p1 = last[i + 1];
    const v0 = first[i + 4], v1 = last[i + 4];
    result.push(d00 * (p0 - p1) / duration + d10 * v0 + d11 * v1);
  }
  return result;
}

function freezeVector(values) {
  return Object.freeze({x:values[0],y:values[1],z:values[2]});
}

/** A geometric probe-minus-planet vector. It is never a global probe state. */
export function createHistoricalEncounterContextResolver({
  loadJson,
  catalogPath = HISTORICAL_ENCOUNTER_CONTEXT_CATALOG_PATH
}) {
  if (typeof loadJson !== 'function') throw new TypeError('Se requiere loadJson.');
  let catalogPromise = null;
  const seriesPromises = new Map();
  async function getCatalog() {
    catalogPromise ??= Promise.resolve(loadJson(catalogPath)).then(c => {validateCatalog(c); return c;});
    return catalogPromise;
  }
  async function getSeries(entry) {
    if (!seriesPromises.has(entry.id)) {
      seriesPromises.set(entry.id, Promise.resolve(loadJson(entry.file)).then(data => {
        validateSeries(data, entry);
        return data.series;
      }));
    }
    return seriesPromises.get(entry.id);
  }
  async function resolveEntry(entry,jdTdb,catalog) {
    if (!entry) return Object.freeze({status:'unavailable',state:null,reason:'No existe contexto local verificado para esta pareja nave–objetivo.'});
    if (jdTdb < entry.startJdTdb || jdTdb > entry.endJdTdb) {
      return Object.freeze({status:'out_of_coverage',state:null,reason:'Fuera de cobertura del vector directo de encuentro.',
        coverage:Object.freeze({startJdTdb:entry.startJdTdb,endJdTdb:entry.endJdTdb})});
    }
    const series = await getSeries(entry);
    let low=0,high=series.length;
    while(low<high) {const mid=(low+high)>>>1;if(series[mid][0]<jdTdb)low=mid+1;else high=mid;}
    const exact=series[low]?.[0]===jdTdb;
    const first=exact?series[low]:series[low-1],last=exact?series[low]:series[low];
    if(!first||!last || (!exact && (last[0]-first[0])*SECONDS_PER_DAY>entry.maxIntervalSeconds+0.01)) {
      return Object.freeze({status:'gap',state:null,reason:'Sin muestras compatibles que encierren este instante.'});
    }
    const values=exact?first.slice(1):hermite(first,last,jdTdb);
    const moon=entry.moon!==undefined;
    const state=Object.freeze({jdTdb,missionId:entry.missionId,planet:entry.planet,
      moon:entry.moon??null,probeNaifId:entry.probeNaifId,
      targetNaifId:moon?entry.moonNaifId:entry.planetNaifId,
      origin:moon?'probe-center':'planet-center',frame:catalog.frame,
      timeScale:'TDB',correction:'NONE',positionKm:freezeVector(values),
      velocityKmS:freezeVector(values.slice(3)),
      source:moon?'NASA/JPL Horizons, vector directo luna–nave':'NASA/JPL Horizons, vector directo nave–planeta',
      datasetId:entry.id,sourceFile:entry.file,sourceSha256:entry.sha256,
      sampleJdTdbs:Object.freeze(exact?[first[0]]:[first[0],last[0]])});
    return Object.freeze({status:exact?'exact':'interpolated',state});
  }
  async function resolve(missionId, planet, jdTdb) {
    requireJdTdb(jdTdb);
    const catalog=await getCatalog();
    return resolveEntry(catalog.contexts.find(c=>c.missionId===missionId&&c.planet===planet),jdTdb,catalog);
  }
  async function resolveMoon(missionId, moon, jdTdb) {
    requireJdTdb(jdTdb);
    const catalog=await getCatalog();
    return resolveEntry(catalog.moonContexts.find(c=>c.missionId===missionId&&c.moon===moon),jdTdb,catalog);
  }
  async function resolveAvailable(jdTdb) {
    requireJdTdb(jdTdb);
    const catalog=await getCatalog();
    const active=catalog.contexts.filter(c=>jdTdb>=c.startJdTdb&&jdTdb<=c.endJdTdb);
    const results=await Promise.all(active.map(c=>resolve(c.missionId,c.planet,jdTdb)));
    return Object.freeze(Object.fromEntries(results.map((r,i)=>[active[i].id,r])));
  }
  async function resolveAvailableMoons(jdTdb) {
    requireJdTdb(jdTdb);
    const catalog=await getCatalog();
    const active=catalog.moonContexts.filter(c=>jdTdb>=c.startJdTdb&&jdTdb<=c.endJdTdb);
    const results=await Promise.all(active.map(c=>resolveEntry(c,jdTdb,catalog)));
    return Object.freeze(Object.fromEntries(results.map((r,i)=>[active[i].id,r])));
  }
  return Object.freeze({getCatalog,resolve,resolveMoon,resolveAvailable,resolveAvailableMoons});
}
