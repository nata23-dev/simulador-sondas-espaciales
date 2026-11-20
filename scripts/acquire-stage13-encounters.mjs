// Etapa 13 — adquisición reproducible de efemérides para encuentros planetarios (NASA/JPL Horizons).
//
// Uso:  node scripts/acquire-stage13-encounters.mjs              (adquiere lo que falte; nunca sobrescribe)
//       node scripts/acquire-stage13-encounters.mjs --dry-run    (solo muestra las consultas)
//
// Qué se adquiere y por qué (solo lo necesario):
//  1. Baricentros de los sistemas de Júpiter, Saturno, Urano y Neptuno (NAIF 5, 6, 7, 8) respecto al centro del Sol,
//     cadencia 4 d, 2026-11-18 → 2046-01-01. Resuelve OBS-12G-02: el CENTRO de Júpiter (599) oscila ~10² km alrededor del
//     baricentro por sus satélites y la cadencia de 4 d lo submuestrea; el baricentro sigue una órbita suave. En cónicas
//     parcheadas el sistema joviano se trata como una masa puntual (GM del sistema) en su baricentro.
//  2. Control: estados de los baricentros en instantes que NO son nodos, para medir el error de interpolación.
//  3. Satélites galileanos respecto al baricentro joviano (CENTER 500@5) solo en la ventana de llegada de la misión de
//     demostración B: Europa a 1 h (encuentro), Ío a 2 h y Ganímedes/Calisto a 6 h (cribado de encuentros próximos y
//     visualización). Fuera de esa ventana la fase lunar declara «Efemérides no disponibles para el intervalo solicitado».
// Contrato común: VECTORS, REF_SYSTEM=ICRF, REF_PLANE=ECLIPTIC, TIME_TYPE=TDB, OUT_UNITS=KM-S, VEC_CORR=NONE (geométricos).
// Peticiones secuenciales (≥ 1,5 s), reintentos acotados e identificador de cliente genérico sin datos personales.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { acquireAndWrite, HORIZONS_API, queryParameters, validateAcquisitionConfig } from './HorizonsAcquisition.mjs';

const CLIENT = '13 (cliente cientifico)';
const MIN_INTERVAL_MS = 1500;
const DRY = process.argv.includes('--dry-run');
const sha256 = text => createHash('sha256').update(text).digest('hex');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// El contrato ScientificState no tiene una categoría «baricentro»: se registra como 'planet' y la identidad real
// (baricentro del sistema, NAIF 5–8) queda en el nombre de Horizons y en la documentación.
const BARYCENTERS = [{ id: '5', type: 'planet' }, { id: '6', type: 'planet' }, { id: '7', type: 'planet' }, { id: '8', type: 'planet' }];
export const STAGE13_BARYCENTER_DATASET = Object.freeze({
  datasetId: 'ip-barycenters-outer-2026-2046', bodies: BARYCENTERS, startTdb: '2026-11-18', endTdb: '2046-01-01', cadenceSeconds: 345600,
  origin: 'SUN_CENTER', frameId: 'ICRF_ECLIPTIC_J2000', timeScale: 'TDB', format: 'horizons-compact-v1', fileUnits: { position: 'km', velocity: 'km/s' },
  minIntervalMs: MIN_INTERVAL_MS, maxRetries: 4, outputFile: 'public/data/interplanetary/ip-barycenters-outer-2026-2046.json'
});
export const ENCOUNTER_CATALOG_FILE = 'public/data/encounter-ephemerides-catalog-v1.json';
const HOLDOUT_FILE = 'tests/fixtures/stage13-encounter-holdout-v1.json';
const HOLDOUT_JD = [2461362.5 + 2.25, 2461362.5 + 4 * 300 + 2.0, 2461362.5 + 4 * 700 + 1.0, 2461362.5 + 4 * 1100 + 3.0, 2461362.5 + 4 * 1500 + 2.5, 2461362.5 + 4 * 1745 + 2.0];

// Ventana de llegada de la misión B (Tierra → Júpiter → Europa). Se fijó tras calcular la oportunidad 2028–2031 con los
// baricentros: entrada en la esfera de influencia ≈ 2031-09 y fase joviana hasta ≈ 2032-05 (ver docs/STAGE13_INTEGRATED_MISSIONS.md).
export const GALILEAN_WINDOW = Object.freeze({ startTdb: '2031-08-01', endTdb: '2032-06-01' });
export const GALILEAN_DATASETS = Object.freeze([
  { key: 'Europa', id: '502', stepHours: 1 }, { key: 'Io', id: '501', stepHours: 2 }, { key: 'Ganymede', id: '503', stepHours: 6 }, { key: 'Callisto', id: '504', stepHours: 6 }
]);
export const GALILEAN_FILE = 'public/data/interplanetary/galilean-moons-jsb-2031-2032.json';
const GALILEAN_HOLDOUT_FILE = 'tests/fixtures/stage13-galilean-holdout-v1.json';
// Instantes de control (JD TDB) que no son nodos de ninguna cadencia (desfases de 17, 29 y 41 min y 3 h 17 min).
const GALILEAN_HOLDOUT_JD = [2463089.5 + 17 / 1440, 2463130.5 + 197 / 1440, 2463200.25 + 29 / 1440, 2463240.5 + 41 / 1440, 2463290.75 + 197 / 1440, 2463350.5 + 17 / 1440];

function vectorParameters(command, extra) {
  return { format: 'json', OBJ_DATA: "'NO'", MAKE_EPHEM: "'YES'", EPHEM_TYPE: "'VECTORS'", COMMAND: `'${command}'`, TIME_TYPE: "'TDB'", REF_SYSTEM: "'ICRF'",
    REF_PLANE: "'ECLIPTIC'", OUT_UNITS: "'KM-S'", VEC_TABLE: "'2'", VEC_LABELS: "'NO'", VEC_CORR: "'NONE'", CSV_FORMAT: "'YES'", ...extra };
}

async function fetchJson(parameters, label) {
  const url = `${HORIZONS_API}?${new URLSearchParams(parameters)}`;
  for (let attempt = 0; attempt <= 4; attempt++) {
    await wait(MIN_INTERVAL_MS * (attempt + 1));
    let response;
    try { response = await fetch(url, { headers: { 'User-Agent': `simulador-sondas-espaciales/${CLIENT}` }, signal: AbortSignal.timeout(90000) }); }
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
    return numbers;
  });
}
const headerLine = (result, prefix) => result.split(/\r?\n/).find(line => line.trim().startsWith(prefix))?.trim() ?? null;

async function acquireHoldout() {
  try { await readFile(HOLDOUT_FILE, 'utf8'); console.log(`Reutilizado: ${HOLDOUT_FILE}`); return; } catch {}
  const holdout = { format: 'stage13-encounter-holdout-v1', purpose: 'Referencias Horizons no usadas como nodos (13): baricentros y desplazamiento 599 − 5.',
    sourceUrl: HORIZONS_API, client: CLIENT, acquiredAtUtc: new Date().toISOString(), states: {}, jupiterCenterFromBarycenter: null, responses: [] };
  for (const body of BARYCENTERS) {
    const parameters = vectorParameters(body.id, { CENTER: "'500@10'", TLIST_TYPE: "'JD'", TLIST: `'${HOLDOUT_JD.join(' ')}'` });
    const data = await fetchJson(parameters, `control ${body.id}`);
    holdout.states[body.id] = { target: headerLine(data.result, 'Target body name'), center: headerLine(data.result, 'Center body name'), rows: vectorRows(data.result, body.id) };
    holdout.responses.push({ kind: 'holdout', bodyId: body.id, apiVersion: data.apiVersion, parameters, responseSha256: sha256(data.result) });
    console.log(`Control ${body.id}: ${holdout.states[body.id].rows.length} estados`);
  }
  const offset = vectorParameters('599', { CENTER: "'500@5'", TLIST_TYPE: "'JD'", TLIST: `'${HOLDOUT_JD.join(' ')}'` });
  const data = await fetchJson(offset, '599 respecto a 5');
  holdout.jupiterCenterFromBarycenter = { target: headerLine(data.result, 'Target body name'), center: headerLine(data.result, 'Center body name'), rows: vectorRows(data.result, '599@5') };
  holdout.responses.push({ kind: 'center-offset', apiVersion: data.apiVersion, parameters: offset, responseSha256: sha256(data.result) });
  await writeFile(HOLDOUT_FILE, `${JSON.stringify(holdout, null, 1)}\n`, { encoding: 'utf8', flag: 'wx' });
  console.log(`Escrito: ${HOLDOUT_FILE}`);
}

async function acquireGalilean() {
  try { await readFile(GALILEAN_FILE, 'utf8'); console.log(`Reutilizado: ${GALILEAN_FILE}`); return null; } catch {}
  const out = { schema: 'planetocentric-window-v1', centerId: '5', centerName: 'Baricentro del sistema de Júpiter (5)', centerCode: '500@5', frame: 'ICRF_ECLIPTIC_J2000',
    timeScale: 'TDB', units: { position: 'km', velocity: 'km/s' }, vectorType: 'geométrico (VEC_CORR=NONE)', coverage: { startTdb: GALILEAN_WINDOW.startTdb, endTdb: GALILEAN_WINDOW.endTdb },
    sourceUrl: HORIZONS_API, client: CLIENT, acquiredAtUtc: new Date().toISOString(), bodies: {} };
  for (const moon of GALILEAN_DATASETS) {
    const parameters = vectorParameters(moon.id, { CENTER: "'500@5'", START_TIME: `'${GALILEAN_WINDOW.startTdb}'`, STOP_TIME: `'${GALILEAN_WINDOW.endTdb}'`, STEP_SIZE: `'${moon.stepHours} h'` });
    const data = await fetchJson(parameters, `satélite ${moon.id}`);
    const target = headerLine(data.result, 'Target body name'), center = headerLine(data.result, 'Center body name');
    if (!target?.includes(`(${moon.id})`) || !/\(5\)/.test(center ?? '')) throw new Error(`${moon.id}: encabezado inesperado (${target} / ${center}).`);
    const rows = vectorRows(data.result, moon.id);
    for (let i = 1; i < rows.length; i++) if (Math.abs((rows[i][0] - rows[i - 1][0]) * 24 - moon.stepHours) > 1e-6) throw new Error(`${moon.id}: cadencia irregular en la fila ${i}.`);
    out.bodies[moon.key] = { id: moon.id, stepHours: moon.stepHours, target, center, solutionId: /\{source:\s*([^}]+)\}/i.exec(target)?.[1]?.trim() ?? null,
      apiVersion: data.apiVersion, queryParameters: parameters, responseSha256: sha256(data.result), rows };
    console.log(`Satélite ${moon.id}: ${rows.length} estados`);
  }
  const text = `${JSON.stringify(out)}\n`;
  await writeFile(GALILEAN_FILE, text, { encoding: 'utf8', flag: 'wx' });
  console.log(`Escrito: ${GALILEAN_FILE} sha256=${sha256(text)}`);
  return sha256(text);
}

async function acquireGalileanHoldout() {
  try { await readFile(GALILEAN_HOLDOUT_FILE, 'utf8'); console.log(`Reutilizado: ${GALILEAN_HOLDOUT_FILE}`); return; } catch {}
  const holdout = { format: 'stage13-galilean-holdout-v1', purpose: 'Estados Horizons de los galileanos (500@5) fuera de los nodos del conjunto de ventana.', sourceUrl: HORIZONS_API, client: CLIENT,
    acquiredAtUtc: new Date().toISOString(), jdTdb: GALILEAN_HOLDOUT_JD, states: {}, responses: [] };
  for (const moon of GALILEAN_DATASETS) {
    const parameters = vectorParameters(moon.id, { CENTER: "'500@5'", TLIST_TYPE: "'JD'", TLIST: `'${GALILEAN_HOLDOUT_JD.join(' ')}'` });
    const data = await fetchJson(parameters, `control ${moon.id}`);
    holdout.states[moon.key] = { id: moon.id, target: headerLine(data.result, 'Target body name'), rows: vectorRows(data.result, moon.id) };
    holdout.responses.push({ bodyId: moon.id, apiVersion: data.apiVersion, parameters, responseSha256: sha256(data.result) });
  }
  await writeFile(GALILEAN_HOLDOUT_FILE, `${JSON.stringify(holdout, null, 1)}
`, { encoding: 'utf8', flag: 'wx' });
  console.log(`Escrito: ${GALILEAN_HOLDOUT_FILE}`);
}

async function main() {
  if (DRY) {
    const config = validateAcquisitionConfig(STAGE13_BARYCENTER_DATASET);
    for (const body of config.bodies) console.log(config.datasetId, body.id, JSON.stringify(queryParameters(config, body.id)));
    for (const moon of GALILEAN_DATASETS) console.log('galileanos', moon.id, `${GALILEAN_WINDOW.startTdb} → ${GALILEAN_WINDOW.endTdb} cada ${moon.stepHours} h, CENTER 500@5`);
    return;
  }
  const result = await acquireAndWrite(STAGE13_BARYCENTER_DATASET, { clientName: CLIENT });
  console.log(`${result.reused ? 'Reutilizado' : 'Adquirido'}: ${result.outputFile} sha256=${result.sha256}`);
  const catalogText = `${JSON.stringify({ catalogVersion: 1, datasets: [result.catalogEntry] }, null, 2)}\n`;
  let previous = null;
  try { previous = await readFile(ENCOUNTER_CATALOG_FILE, 'utf8'); } catch {}
  if (previous !== null && previous !== catalogText) throw new Error(`${ENCOUNTER_CATALOG_FILE} existe con otro contenido; no se sobrescribe.`);
  if (previous === null) await writeFile(ENCOUNTER_CATALOG_FILE, catalogText, { encoding: 'utf8', flag: 'wx' });
  await acquireHoldout();
  if (!process.argv.includes('--skip-galilean')) { await acquireGalilean(); await acquireGalileanHoldout(); }
}

if (process.argv[1]?.endsWith('acquire-stage13-encounters.mjs')) main().catch(error => { console.error(error); process.exitCode = 1; });
