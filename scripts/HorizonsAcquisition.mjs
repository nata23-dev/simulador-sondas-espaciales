import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { HORIZONS_FRAME } from '../src/science/Frames.js';
import { createScientificState } from '../src/science/ScientificState.js';
import { gregorianLabelToJulianMidnight, gregorianTimestampToJdTdb } from '../src/science/Time.js';
import { auToKm, auPerDayToKmPerSecond } from '../src/science/Units.js';
import { createEphemerisProvider } from '../src/science/EphemerisProvider.js';

export const HORIZONS_API = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const SHA256 = text => createHash('sha256').update(text).digest('hex');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const TYPES = new Set(['planet', 'probe', 'moon', 'star', 'sun']);
const MONTHS = Object.freeze({ Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 });

function nonempty(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name} debe ser texto no vacío.`);
  return value;
}

function configDigest(config) {
  const base = { datasetId: config.datasetId, bodies: config.bodies,
    startTdb: config.startTdb, endTdb: config.endTdb, cadenceSeconds: config.cadenceSeconds,
    origin: config.origin, frameId: config.frameId, timeScale: config.timeScale,
    fileUnits: config.fileUnits, outputFile: config.outputFile };
  if (config.format && config.format !== 'scientific-states-v1') {
    base.format = config.format;
  }
  return SHA256(JSON.stringify(base));
}

function formatHorizonsStepSize(cadenceSeconds) {
  if (cadenceSeconds % 86400 === 0) return `${cadenceSeconds / 86400} d`;
  if (cadenceSeconds % 3600 === 0) return `${cadenceSeconds / 3600} h`;
  if (cadenceSeconds % 60 === 0) return `${cadenceSeconds / 60} m`;
  return `${cadenceSeconds} s`;
}

export function validateAcquisitionConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('La configuración debe ser un objeto.');
  const datasetId = nonempty(input.datasetId, 'datasetId');
  if (!/^[A-Za-z0-9_-]+$/.test(datasetId)) throw new RangeError('datasetId debe ser seguro para rutas.');
  if (!Array.isArray(input.bodies) || input.bodies.length === 0) throw new TypeError('bodies debe ser una lista no vacía.');
  const bodies = input.bodies.map((body, index) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || typeof body.id !== 'string' || !/^-?[A-Za-z0-9_]+$/.test(body.id)
      || !TYPES.has(body.type)) throw new RangeError(`bodies[${index}] requiere id y type válidos.`);
    return Object.freeze({ id: body.id, type: body.type });
  });
  if (new Set(bodies.map(body => body.id)).size !== bodies.length) throw new RangeError('bodies contiene identificadores duplicados.');
  const format = input.format ?? 'scientific-states-v1';
  if (format !== 'scientific-states-v1' && format !== 'horizons-compact-v1') {
    throw new RangeError(`Formato de adquisición no soportado: ${format}.`);
  }
  const startTdb = nonempty(input.startTdb, 'startTdb');
  const endTdb = nonempty(input.endTdb, 'endTdb');
  const firstJdTdb = format === 'horizons-compact-v1'
    ? gregorianTimestampToJdTdb(startTdb)
    : gregorianLabelToJulianMidnight(startTdb);
  const lastJdTdb = format === 'horizons-compact-v1'
    ? gregorianTimestampToJdTdb(endTdb)
    : gregorianLabelToJulianMidnight(endTdb);
  if (lastJdTdb <= firstJdTdb) throw new RangeError('endTdb debe ser posterior a startTdb.');
  const cadenceSeconds = input.cadenceSeconds;
  if (!Number.isSafeInteger(cadenceSeconds) || cadenceSeconds < 1) throw new RangeError('cadenceSeconds debe ser un entero positivo.');
  const spanSeconds = Math.round((lastJdTdb - firstJdTdb) * 86400);
  const exactSpanSeconds = (lastJdTdb - firstJdTdb) * 86400;
  if (Math.abs(exactSpanSeconds - spanSeconds) > 1e-3 || spanSeconds % cadenceSeconds !== 0) {
    throw new RangeError('El intervalo debe contener pasos completos y como máximo 100000 estados.');
  }
  const intervals = spanSeconds / cadenceSeconds;
  if (!Number.isSafeInteger(intervals) || intervals < 1
    || (intervals + 1) * bodies.length > 100000) {
    throw new RangeError('El intervalo debe contener pasos completos y como máximo 100000 estados.');
  }
  const validUnits = format === 'horizons-compact-v1'
    ? (input.fileUnits?.position === 'km' && input.fileUnits?.velocity === 'km/s')
    : (input.fileUnits?.position === 'AU' && input.fileUnits?.velocity === 'AU/dia');
  if (input.origin !== HORIZONS_FRAME.origin || input.frameId !== HORIZONS_FRAME.id
    || input.timeScale !== 'TDB' || !validUnits) {
    throw new RangeError('Origen, marco, escala o unidades incompatibles con el contrato actual.');
  }
  const outputFile = nonempty(input.outputFile, 'outputFile');
  if (!/^public\/data\/[A-Za-z0-9_/-]+\.json$/.test(outputFile)
    || outputFile.includes('..') || outputFile.includes('//')) {
    throw new RangeError('outputFile debe estar bajo public/data/ y ser una ruta JSON segura.');
  }
  const minIntervalMs = input.minIntervalMs ?? 1000;
  const maxRetries = input.maxRetries ?? 3;
  if (!Number.isSafeInteger(minIntervalMs) || minIntervalMs < 1000
    || !Number.isSafeInteger(maxRetries) || maxRetries < 0 || maxRetries > 5) {
    throw new RangeError('minIntervalMs debe ser >=1000 y maxRetries debe estar entre 0 y 5.');
  }
  return Object.freeze({ datasetId, format, bodies: Object.freeze(bodies), startTdb, endTdb,
    firstJdTdb, lastJdTdb, cadenceSeconds, expectedSamplesPerBody: intervals + 1,
    origin: input.origin, frameId: input.frameId, timeScale: input.timeScale,
    fileUnits: Object.freeze(format === 'horizons-compact-v1'
      ? { position: 'km', velocity: 'km/s' }
      : { position: 'AU', velocity: 'AU/dia' }),
    outputFile, minIntervalMs, maxRetries });
}

export function queryParameters(config, bodyId) {
  if (!config.bodies.some(body => body.id === bodyId)) throw new RangeError(`Cuerpo no configurado: ${bodyId}.`);
  const outUnits = config.fileUnits.position === 'km' ? "'KM-S'" : "'AU-D'";
  return Object.freeze({ format: 'json', OBJ_DATA: "'NO'", MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'VECTORS'", COMMAND: `'${bodyId}'`, CENTER: "'500@10'",
    START_TIME: `'${config.startTdb}'`, STOP_TIME: `'${config.endTdb}'`,
    STEP_SIZE: `'${formatHorizonsStepSize(config.cadenceSeconds)}'`,
    TIME_TYPE: "'TDB'", REF_PLANE: "'ECLIPTIC'", REF_SYSTEM: "'ICRF'",
    OUT_UNITS: outUnits, VEC_TABLE: "'2'", VEC_LABELS: "'NO'",
    VEC_CORR: "'NONE'", CSV_FORMAT: "'YES'" });
}

function parseVectors(result, config, bodyId) {
  const begin = result.indexOf('$$SOE');
  const end = result.indexOf('$$EOE');
  if (begin < 0 || end <= begin) throw new Error(`Horizons no contiene tabla de vectores para ${bodyId}.`);
  const lines = result.slice(begin + 5, end).trim().split(/\r?\n/).filter(Boolean);
  if (lines.length !== config.expectedSamplesPerBody) {
    throw new RangeError(`${bodyId}: se esperaban ${config.expectedSamplesPerBody} muestras; recibidas ${lines.length}.`);
  }
  return lines.map((line, index) => {
    const fields = line.split(',').map(value => value.trim());
    if (fields.length < 8) throw new Error(`${bodyId}: fila Horizons incompleta.`);
    const jdTdb = Number(fields[0]);
    const numericFields = fields.slice(2, 8);
    const numbers = numericFields.map(Number);
    if (!Number.isFinite(jdTdb) || numbers.some(value => !Number.isFinite(value))
      || numericFields.some(value => value === '') || fields[1] === '') {
      throw new TypeError(`${bodyId}: componentes o fecha no válidos.`);
    }
    const labelJd = labelToJdTdb(fields[1]);
    if (Math.abs(jdTdb - labelJd) > 1e-8) {
      throw new RangeError(`${bodyId}: etiqueta TDB distinta del JD recibido.`);
    }
    const expected = config.firstJdTdb + index * config.cadenceSeconds / 86400;
    if (Math.abs(jdTdb - expected) > 1e-8) throw new RangeError(`${bodyId}: JD TDB fuera de la cadencia configurada.`);
    return { jdTdb, label: fields[1], p: numbers.slice(0, 3), v: numbers.slice(3) };
  });
}

function labelToJdTdb(label) {
  const match = /^A\.D\. ([0-9]{4})-([A-Z][a-z]{2})-([0-9]{2}) ([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]+))?$/.exec(label);
  if (!match || !MONTHS[match[2]]) throw new RangeError(`Etiqueta TDB Horizons inválida: ${label}.`);
  const [, year, monthName, day, hour, minute, second, fraction = '0'] = match;
  const h = Number(hour);
  const m = Number(minute);
  const s = Number(second);
  if (h > 23 || m > 59 || s > 59) throw new RangeError(`Hora TDB Horizons inválida: ${label}.`);
  const date = `${year}-${String(MONTHS[monthName]).padStart(2, '0')}-${day}`;
  return gregorianLabelToJulianMidnight(date)
    + (h * 3600 + m * 60 + s + Number(`0.${fraction}`)) / 86400;
}

function retryDelay(response, attempt, config) {
  const retryAfter = response?.headers?.get?.('retry-after');
  let requestedMs = 0;
  if (typeof retryAfter === 'string') {
    if (/^\d+$/.test(retryAfter)) requestedMs = Number(retryAfter) * 1000;
    else {
      const dateMs = Date.parse(retryAfter);
      if (Number.isFinite(dateMs)) requestedMs = Math.max(0, dateMs - Date.now());
    }
  }
  const delay = Math.max(config.minIntervalMs * 2 ** attempt,
    requestedMs);
  if (delay > 300000) throw new Error('Horizons solicita una espera superior a cinco minutos; revisar manualmente.');
  return delay;
}

export function responseHeader(result, bodyId) {
  const header = result.slice(0, result.indexOf('$$SOE'));
  const lines = header.split(/\r?\n/).map(line => line.trim());
  const targets = lines.filter(line => /^Target body name\s*:/i.test(line));
  if (targets.length !== 1 || !/^-?\d+$/.test(bodyId)) {
    throw new RangeError(`Horizons devolvió un encabezado de cuerpo ausente o ambiguo para ${bodyId}.`);
  }
  const targetLine = targets[0];
  const withoutSource = targetLine.replace(/\s*\{source:\s*[^}]+\}\s*$/i, '').trim();
  const groups = [...withoutSource.matchAll(/\(([^()]*)\)/g)];
  const numeric = groups.filter(match => /^-?\d+$/.test(match[1].trim()));
  const last = groups.at(-1);
  if (!last || numeric.length !== 1 || numeric[0] !== last
    || !withoutSource.endsWith(last[0]) || last[1].trim() !== bodyId
    || /[()]/.test(withoutSource.replace(/\([^()]*\)/g, ''))
    || !/^Target body name\s*:\s*\S/i.test(withoutSource)) {
    throw new RangeError(`Horizons devolvió un cuerpo distinto de ${bodyId} o sin identificación inequívoca.`);
  }
  const centers = lines.filter(line => /^Center body name\s*:/i.test(line));
  const centerWithoutSource = centers[0]?.replace(/\s*\{source:\s*[^}]+\}\s*$/i, '').trim() ?? '';
  if (centers.length !== 1 || !/^Center body name\s*:\s*Sun\s*\(10\)\s*$/i.test(centerWithoutSource)) {
    throw new RangeError(`Horizons devolvió un centro distinto del Sol para ${bodyId}.`);
  }
  return { solutionId: /\{source:\s*([^}]+)\}/i.exec(targetLine)?.[1]?.trim() ?? null };
}

async function fetchBody(config, body, { fetchImpl, sleep, contact, onRequest }) {
  const parameters = queryParameters(config, body.id);
  const url = `${HORIZONS_API}?${new URLSearchParams(parameters)}`;
  const userAgent = `simulador-sondas-espaciales/1B (contact: ${contact})`;
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    await onRequest(attempt);
    let response;
    try {
      response = await fetchImpl(url, { headers: { 'User-Agent': userAgent },
        signal: AbortSignal.timeout(60000) });
    } catch (error) {
      if (attempt === config.maxRetries) throw new Error(`Falló la solicitud de ${body.id}.`, { cause: error });
      await sleep(retryDelay(null, attempt, config));
      continue;
    }
    if (!response.ok) {
      if ((response.status === 429 || response.status >= 500) && attempt < config.maxRetries) {
        await sleep(retryDelay(response, attempt, config));
        continue;
      }
      throw new Error(`Horizons HTTP ${response.status} para ${body.id}.`);
    }
    const data = await response.json();
    if (!data || typeof data !== 'object' || data.error || typeof data.result !== 'string') {
      throw new Error(`Respuesta Horizons inválida para ${body.id}: ${data?.error ?? 'sin tabla'}.`);
    }
    const apiVersion = data.signature?.version ?? null;
    if (apiVersion !== null && (typeof apiVersion !== 'string' || apiVersion.trim() === '')) {
      throw new TypeError(`Versión de API inválida para ${body.id}.`);
    }
    const header = responseHeader(data.result, body.id);
    const solutionId = data.solutionId ?? header.solutionId;
    if (solutionId !== null && (typeof solutionId !== 'string' || solutionId.trim() === '')) {
      throw new TypeError(`Identificador de solución inválido para ${body.id}.`);
    }
    if (data.solutionId && header.solutionId && data.solutionId !== header.solutionId) {
      throw new RangeError(`Identificador de solución contradictorio para ${body.id}.`);
    }
    return { parameters, apiVersion, solutionId,
      responseSha256: SHA256(data.result), rows: parseVectors(data.result, config, body.id) };
  }
  throw new Error(`Sin respuesta para ${body.id}.`);
}

function serializeCompactDataset(dataset) {
  const headerJson = JSON.stringify({
    format: dataset.format,
    formatVersion: dataset.formatVersion,
    acquisition: dataset.acquisition
  }, null, 2);
  const bodyKeys = Object.keys(dataset.series);
  const seriesChunks = bodyKeys.map(bodyId => {
    const rows = dataset.series[bodyId].map(row => `      ${JSON.stringify(row)}`).join(',\n');
    return `    ${JSON.stringify(bodyId)}: [\n${rows}\n    ]`;
  }).join(',\n');
  return `${headerJson.slice(0, -2)},\n  "series": {\n${seriesChunks}\n  }\n}\n`;
}

/** Prepara datos sin escribir archivos; la red solo se usa al invocarla. */
export async function prepareHorizonsDataset(input, { fetchImpl = globalThis.fetch,
  sleep = wait, now = () => new Date(), contact } = {}) {
  const config = validateAcquisitionConfig(input);
  if (typeof fetchImpl !== 'function' || typeof sleep !== 'function') throw new TypeError('fetchImpl y sleep deben ser funciones.');
  if (typeof contact !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
    throw new TypeError('Se requiere un correo de contacto configurado por el responsable.');
  }
  const configSha256 = configDigest(config);
  const states = [];
  const compactBodies = {};
  const compactSeries = {};
  const responses = [];
  let requests = 0;
  let apiVersion = undefined;
  const isCompact = config.format === 'horizons-compact-v1';
  for (const body of config.bodies) {
    const data = await fetchBody(config, body, { fetchImpl, sleep, contact,
      onRequest: async () => { if (requests++ > 0) await sleep(config.minIntervalMs); } });
    const acquiredAtUtc = now().toISOString();
    if (apiVersion !== undefined && apiVersion !== data.apiVersion) {
      throw new RangeError('Las respuestas usan versiones de API diferentes; no se mezclarán.');
    }
    apiVersion = data.apiVersion;
    responses.push({ bodyId: body.id, parameters: data.parameters,
      acquiredAtUtc, apiVersion: data.apiVersion,
      solutionId: data.solutionId, responseSha256: data.responseSha256 });
    if (isCompact) {
      compactBodies[body.id] = {
        type: body.type,
        acquiredAtUtc,
        solutionId: data.solutionId,
        responseSha256: data.responseSha256,
        sourceDistanceUnit: 'km',
        sourceVelocityUnit: 'km/s',
        queryParameters: JSON.stringify(data.parameters)
      };
      compactSeries[body.id] = data.rows.map(row => [
        row.jdTdb,
        row.label,
        row.p[0],
        row.p[1],
        row.p[2],
        row.v[0],
        row.v[1],
        row.v[2]
      ]);
    } else {
      for (const row of data.rows) {
        states.push(createScientificState({
          identity: { id: body.id, type: body.type, origin: config.origin },
          time: { jdTdb: row.jdTdb, scale: 'TDB' },
          position: { x: auToKm(row.p[0]), y: auToKm(row.p[1]), z: auToKm(row.p[2]), unit: 'km' },
          velocity: { x: auPerDayToKmPerSecond(row.v[0]),
            y: auPerDayToKmPerSecond(row.v[1]), z: auPerDayToKmPerSecond(row.v[2]), unit: 'km/s' },
          reference: HORIZONS_FRAME,
          provenance: { source: 'NASA/JPL Horizons', sourceUrl: HORIZONS_API,
            version: data.apiVersion, queriedAtUtc: acquiredAtUtc,
            precision: null, uncertainty: null,
            sourceMetadata: { sourceRecordDateTdb: row.label,
              sourceDistanceUnit: 'AU', sourceVelocityUnit: 'AU/dia',
              originCode: '500@10', referencePlane: 'ECLIPTIC',
              referenceSystem: 'ICRF', timeScale: 'TDB', correction: 'NONE',
              queryParameters: JSON.stringify(data.parameters),
              solutionId: data.solutionId, responseSha256: data.responseSha256,
              acquisitionConfigSha256: configSha256 } }
        }));
      }
    }
  }
  let firstJdTdb = Infinity;
  let lastJdTdb = -Infinity;
  const bodyCoverage = {};
  if (isCompact) {
    for (const body of config.bodies) {
      const rows = compactSeries[body.id];
      const startJd = rows[0][0];
      const endJd = rows.at(-1)[0];
      firstJdTdb = Math.min(firstJdTdb, startJd);
      lastJdTdb = Math.max(lastJdTdb, endJd);
      bodyCoverage[body.id] = { startJdTdb: startJd, endJdTdb: endJd };
    }
  } else {
    for (const state of states) {
      firstJdTdb = Math.min(firstJdTdb, state.time.jdTdb);
      lastJdTdb = Math.max(lastJdTdb, state.time.jdTdb);
    }
    for (const body of config.bodies) {
      const rows = states.filter(state => state.identity.id === body.id);
      bodyCoverage[body.id] = { startJdTdb: rows[0].time.jdTdb,
        endJdTdb: rows.at(-1).time.jdTdb };
    }
  }
  const catalogEntry = { id: config.datasetId, file: config.outputFile.slice('public/'.length),
    format: config.format, formatVersion: 1,
    bodyIds: config.bodies.map(body => body.id),
    coverage: { startJdTdb: firstJdTdb, endJdTdb: lastJdTdb },
    bodyCoverage,
    cadenceSeconds: config.cadenceSeconds, frameId: config.frameId, origin: config.origin,
    fileUnits: { position: 'km', velocity: 'km/s' },
    source: 'NASA/JPL Horizons', sourceVersion: apiVersion };
  const dataset = isCompact
    ? {
        format: 'horizons-compact-v1',
        formatVersion: 1,
        acquisition: {
          datasetId: config.datasetId,
          configSha256,
          apiVersion,
          sourceUrl: HORIZONS_API,
          origin: config.origin,
          originCode: '500@10',
          frameId: config.frameId,
          referencePlane: 'ECLIPTIC',
          referenceSystem: 'ICRF',
          timeScale: 'TDB',
          correction: 'NONE',
          solutionIds: responses.map(item => ({ bodyId: item.bodyId, solutionId: item.solutionId })),
          bodies: compactBodies
        },
        series: compactSeries
      }
    : { formatVersion: 1,
        acquisition: { datasetId: config.datasetId, configSha256,
          apiVersion, solutionIds: responses.map(item => ({ bodyId: item.bodyId, solutionId: item.solutionId })),
          responses }, states };
  const provider = createEphemerisProvider({ catalog: { catalogVersion: 1, datasets: [catalogEntry] },
    loadJson: async () => dataset });
  await provider.getDatasetInfo(config.datasetId);
  const datasetText = isCompact ? serializeCompactDataset(dataset) : `${JSON.stringify(dataset, null, 2)}\n`;
  const sha256 = SHA256(datasetText);
  const metadata = { datasetId: config.datasetId, configSha256, sha256, catalogEntry,
    apiVersion, solutionIds: dataset.acquisition.solutionIds,
    responses };
  return Object.freeze({ config, dataset, catalogEntry, datasetText, sha256,
    metadataText: `${JSON.stringify(metadata, null, 2)}\n` });
}

async function readIfPresent(fs, path) {
  try { return await fs.readFile(path, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

/** No sobrescribe: reutiliza solo si configuración e integridad coinciden. */
export async function acquireAndWrite(input, options = {}) {
  const config = validateAcquisitionConfig(input);
  const fs = options.fs ?? { readFile, writeFile, mkdir };
  const sidecar = config.outputFile.replace(/\.json$/, '.metadata.json');
  const existing = await readIfPresent(fs, config.outputFile);
  if (existing !== null) {
    const metadataText = await readIfPresent(fs, sidecar);
    if (metadataText === null) throw new Error('Existe el conjunto sin metadatos de integridad; no se sobrescribe.');
    const metadata = JSON.parse(metadataText);
    if (metadata.configSha256 !== configDigest(config) || metadata.sha256 !== SHA256(existing)
      || metadata.catalogEntry?.id !== config.datasetId
      || metadata.catalogEntry?.file !== config.outputFile.slice('public/'.length)) {
      throw new Error('El archivo existente tiene otra configuración o integridad; no se sobrescribe.');
    }
    const priorDataset = JSON.parse(existing);
    const provider = createEphemerisProvider({ catalog: { catalogVersion: 1,
      datasets: [metadata.catalogEntry] }, loadJson: async () => priorDataset });
    await provider.getDatasetInfo(config.datasetId);
    return Object.freeze({ reused: true, outputFile: config.outputFile,
      sha256: metadata.sha256, catalogEntry: metadata.catalogEntry });
  }
  if (await readIfPresent(fs, sidecar) !== null) throw new Error('Existe metadata sin conjunto; revisar antes de adquirir.');
  const prepared = await prepareHorizonsDataset(input, options);
  await fs.mkdir(dirname(config.outputFile), { recursive: true });
  await fs.writeFile(config.outputFile, prepared.datasetText, { encoding: 'utf8', flag: 'wx' });
  await fs.writeFile(sidecar, prepared.metadataText, { encoding: 'utf8', flag: 'wx' });
  return Object.freeze({ reused: false, outputFile: config.outputFile,
    sha256: prepared.sha256, catalogEntry: prepared.catalogEntry });
}
