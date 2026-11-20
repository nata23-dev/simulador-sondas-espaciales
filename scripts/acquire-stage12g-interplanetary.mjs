// Etapa 12G — adquisición reproducible de efemérides planetarias de cobertura amplia (NASA/JPL Horizons).
//
// Uso:  node scripts/acquire-stage12g-interplanetary.mjs            (adquiere lo que falte; nunca sobrescribe)
//       node scripts/acquire-stage12g-interplanetary.mjs --dry-run  (solo muestra las consultas)
//
// Contrato de los conjuntos (idéntico a los históricos `horizons-compact-v1`): vectores geométricos (VEC_CORR=NONE),
// centro 500@10 (centro del Sol), REF_SYSTEM=ICRF, REF_PLANE=ECLIPTIC (eclíptica y equinoccio J2000 de Horizons),
// TIME_TYPE=TDB, OUT_UNITS=KM-S. Las peticiones son secuenciales con un intervalo mínimo de 1,5 s, reintentos acotados
// (HTTP 429/5xx) y un identificador genérico de cliente sin datos personales.
//
// Además adquiere, en un archivo de control separado (tests/fixtures), estados en instantes que NO son nodos de los
// conjuntos (12:00 TDB o días intermedios), estados de la Tierra en ejes ecuatoriales ICRF (REF_PLANE=FRAME) para
// comprobar la rotación de marco, y ΔT = TDB − UT de Horizons para contrastar la conversión UTC→TDB.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { acquireAndWrite, HORIZONS_API, queryParameters, validateAcquisitionConfig } from './HorizonsAcquisition.mjs';

const CLIENT = '12G (cliente cientifico)';
const MIN_INTERVAL_MS = 1500;
const DRY = process.argv.includes('--dry-run');
const sha256 = text => createHash('sha256').update(text).digest('hex');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const INNER = [{ id: '199', type: 'planet' }, { id: '299', type: 'planet' }, { id: '399', type: 'planet' }, { id: '499', type: 'planet' }];
const OUTER = [{ id: '599', type: 'planet' }, { id: '699', type: 'planet' }, { id: '799', type: 'planet' }, { id: '899', type: 'planet' }];
const common = { origin: 'SUN_CENTER', frameId: 'ICRF_ECLIPTIC_J2000', timeScale: 'TDB', format: 'horizons-compact-v1',
  fileUnits: { position: 'km', velocity: 'km/s' }, minIntervalMs: MIN_INTERVAL_MS, maxRetries: 4 };
// Segmentos contiguos que comparten el nodo frontera (misma respuesta física): el proveedor puede interpolar en
// cualquier instante sin cruzar archivos. La meta de cobertura termina el 31-12-2045; el último nodo es 2046-01-01 00:00 TDB.
export const STAGE12G_DATASETS = Object.freeze([
  { datasetId: 'ip-planets-inner-2026-2031', bodies: INNER, startTdb: '2026-11-18', endTdb: '2031-06-01', cadenceSeconds: 86400 },
  { datasetId: 'ip-planets-inner-2031-2036', bodies: INNER, startTdb: '2031-06-01', endTdb: '2036-01-01', cadenceSeconds: 86400 },
  { datasetId: 'ip-planets-inner-2036-2041', bodies: INNER, startTdb: '2036-01-01', endTdb: '2041-01-01', cadenceSeconds: 86400 },
  { datasetId: 'ip-planets-inner-2041-2046', bodies: INNER, startTdb: '2041-01-01', endTdb: '2046-01-01', cadenceSeconds: 86400 },
  { datasetId: 'ip-planets-outer-2026-2046', bodies: OUTER, startTdb: '2026-11-18', endTdb: '2046-01-01', cadenceSeconds: 345600 }
].map(item => Object.freeze({ ...common, ...item, outputFile: `public/data/interplanetary/${item.datasetId}.json` })));

export const CATALOG_FILE = 'public/data/interplanetary-ephemerides-catalog-v1.json';
const HOLDOUT_FILE = 'tests/fixtures/interplanetary-horizons-holdout-v1.json';

// Instantes de control (JD TDB) fuera de los nodos: 12:00 TDB para los internos (cadencia 1 d) y +2 d 06:00 para los
// externos (cadencia 4 d). Repartidos en toda la cobertura y en todos los segmentos.
const HOLDOUT_INNER_JD = [2461363.0, 2461700.25, 2462502.0, 2463180.75, 2463600.5 + 0.5, 2464693.75, 2465500.0, 2466520.5 + 0.25, 2467500.0, 2468345.75];
const HOLDOUT_OUTER_JD = [2461362.5 + 2.25, 2461362.5 + 4 * 300 + 2.0, 2461362.5 + 4 * 700 + 1.0, 2461362.5 + 4 * 1100 + 3.0, 2461362.5 + 4 * 1500 + 2.5, 2461362.5 + 4 * 1745 + 2.0];
const FRAME_CHECK_JD = [2462502.5, 2465000.5, 2468000.5];
const DELTA_T_UTC = ['2026-11-18 00:00', '2030-01-01 00:00', '2035-07-01 12:00', '2045-12-31 00:00'];

function bodyParameters(command, extra) {
  return { format: 'json', OBJ_DATA: "'NO'", MAKE_EPHEM: "'YES'", COMMAND: `'${command}'`, ...extra };
}

async function fetchJson(parameters, label) {
  const url = `${HORIZONS_API}?${new URLSearchParams(parameters)}`;
  for (let attempt = 0; attempt <= 4; attempt++) {
    await wait(MIN_INTERVAL_MS * (attempt + 1));
    let response;
    try { response = await fetch(url, { headers: { 'User-Agent': `simulador-sondas-espaciales/${CLIENT}` }, signal: AbortSignal.timeout(60000) }); }
    catch (error) { if (attempt === 4) throw new Error(`${label}: sin respuesta (${error.message}).`); continue; }
    if (!response.ok) { if ((response.status === 429 || response.status >= 500) && attempt < 4) continue; throw new Error(`${label}: HTTP ${response.status}.`); }
    const data = await response.json();
    if (data.error || typeof data.result !== 'string') throw new Error(`${label}: ${data.error ?? 'respuesta sin tabla'}.`);
    return { result: data.result, apiVersion: data.signature?.version ?? null, url, parameters };
  }
  throw new Error(`${label}: reintentos agotados.`);
}

function vectorRows(result, label) {
  const begin = result.indexOf('$$SOE'), end = result.indexOf('$$EOE');
  if (begin < 0 || end <= begin) throw new Error(`${label}: sin tabla de vectores.`);
  return result.slice(begin + 5, end).trim().split(/\r?\n/).filter(Boolean).map(line => {
    const f = line.split(',').map(value => value.trim());
    const numbers = [f[0], ...f.slice(2, 8)].map(Number);
    if (numbers.some(value => !Number.isFinite(value))) throw new Error(`${label}: fila no numérica.`);
    return { jdTdb: numbers[0], labelTdb: f[1], positionKm: numbers.slice(1, 4), velocityKmS: numbers.slice(4, 7) };
  });
}

function headerLine(result, prefix) { return result.split(/\r?\n/).find(line => line.trim().startsWith(prefix))?.trim() ?? null; }

async function acquireHoldout() {
  try { await readFile(HOLDOUT_FILE, 'utf8'); console.log(`Reutilizado: ${HOLDOUT_FILE}`); return; } catch {}
  const vectorBase = { EPHEM_TYPE: "'VECTORS'", CENTER: "'500@10'", TLIST_TYPE: "'JD'", TIME_TYPE: "'TDB'", REF_SYSTEM: "'ICRF'",
    OUT_UNITS: "'KM-S'", VEC_TABLE: "'2'", VEC_LABELS: "'NO'", VEC_CORR: "'NONE'", CSV_FORMAT: "'YES'" };
  const holdout = { format: 'interplanetary-holdout-v1', purpose: 'Referencias Horizons no usadas como nodos de interpolación (12G).',
    sourceUrl: HORIZONS_API, client: CLIENT, acquiredAtUtc: new Date().toISOString(), states: {}, frameCheck: null, deltaT: null, responses: [] };
  for (const body of [...INNER, ...OUTER]) {
    const list = INNER.includes(body) ? HOLDOUT_INNER_JD : HOLDOUT_OUTER_JD;
    const parameters = bodyParameters(body.id, { ...vectorBase, REF_PLANE: "'ECLIPTIC'", TLIST: `'${list.join(' ')}'` });
    const data = await fetchJson(parameters, `control ${body.id}`);
    holdout.states[body.id] = { referencePlane: 'ECLIPTIC', target: headerLine(data.result, 'Target body name'), rows: vectorRows(data.result, body.id) };
    holdout.responses.push({ kind: 'holdout', bodyId: body.id, apiVersion: data.apiVersion, parameters, responseSha256: sha256(data.result) });
    console.log(`Control ${body.id}: ${holdout.states[body.id].rows.length} estados`);
  }
  const frameParameters = bodyParameters('399', { ...vectorBase, REF_PLANE: "'FRAME'", TLIST: `'${FRAME_CHECK_JD.join(' ')}'` });
  const frame = await fetchJson(frameParameters, 'marco ICRF ecuatorial');
  holdout.frameCheck = { bodyId: '399', referencePlane: 'FRAME (ejes ecuatoriales ICRF)', referenceFrameLine: headerLine(frame.result, 'Reference frame'),
    rows: vectorRows(frame.result, 'FRAME') };
  holdout.responses.push({ kind: 'frame-check', bodyId: '399', apiVersion: frame.apiVersion, parameters: frameParameters, responseSha256: sha256(frame.result) });
  try {
    const dtParameters = bodyParameters('10', { EPHEM_TYPE: "'OBSERVER'", CENTER: "'500@399'", TIME_TYPE: "'UT'", QUANTITIES: "'30'", CSV_FORMAT: "'YES'",
      TLIST_TYPE: "'CAL'", TLIST: DELTA_T_UTC.map(value => `'${value}'`).join(' ') });
    const dt = await fetchJson(dtParameters, 'TDB-UT');
    const begin = dt.result.indexOf('$$SOE'), end = dt.result.indexOf('$$EOE');
    const rows = dt.result.slice(begin + 5, end).trim().split(/\r?\n/).filter(Boolean).map(line => line.split(',').map(value => value.trim()));
    holdout.deltaT = { quantity: '30 (TDB - UT)', columns: dt.result.slice(0, begin).split(/\r?\n/).filter(line => line.includes('Date__(UT)')).at(-1)?.trim() ?? null,
      requestedUtc: DELTA_T_UTC, rows };
    holdout.responses.push({ kind: 'delta-t', apiVersion: dt.apiVersion, parameters: dtParameters, responseSha256: sha256(dt.result) });
  } catch (error) { holdout.deltaT = { unavailable: error.message }; }
  await writeFile(HOLDOUT_FILE, `${JSON.stringify(holdout, null, 1)}\n`, { encoding: 'utf8', flag: 'wx' });
  console.log(`Escrito: ${HOLDOUT_FILE}`);
}

async function main() {
  if (DRY) {
    for (const spec of STAGE12G_DATASETS) {
      const config = validateAcquisitionConfig(spec);
      for (const body of config.bodies) console.log(spec.datasetId, body.id, JSON.stringify(queryParameters(config, body.id)));
    }
    return;
  }
  const entries = [];
  for (const spec of STAGE12G_DATASETS) {
    const result = await acquireAndWrite(spec, { clientName: CLIENT });
    console.log(`${result.reused ? 'Reutilizado' : 'Adquirido'}: ${result.outputFile} sha256=${result.sha256}`);
    entries.push(result.catalogEntry);
  }
  const catalogText = `${JSON.stringify({ catalogVersion: 1, datasets: entries }, null, 2)}\n`;
  let previous = null;
  try { previous = await readFile(CATALOG_FILE, 'utf8'); } catch {}
  if (previous !== null && previous !== catalogText) throw new Error(`${CATALOG_FILE} existe con otro contenido; no se sobrescribe.`);
  if (previous === null) await writeFile(CATALOG_FILE, catalogText, { encoding: 'utf8', flag: 'wx' });
  await acquireHoldout();
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('acquire-stage12g-interplanetary.mjs')) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
