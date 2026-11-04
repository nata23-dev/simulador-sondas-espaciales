import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { getHistoricalEventById } from '../src/science/VoyagerHistoricalEvents.js';

const encounters = [
  ['v1-jupiter-1979', '-31', '599'],
  ['v2-jupiter-1979', '-32', '599'],
  ['v1-saturn-1980', '-31', '699'],
  ['v2-saturn-1981', '-32', '699'],
  ['v2-uranus-1986', '-32', '799'],
  ['v2-neptune-1989', '-32', '899']
];
const outputDir = path.resolve(process.argv[2] || 'stage2-2-raw');
await fs.mkdir(outputDir, { recursive: true });

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const timeLabel = date => date.toISOString().replace('T', ' ').slice(0, 19);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function acquire(eventId, command, center, label, eventDateUtc) {
  const file = path.join(outputDir, `${eventId}-${label}.json`);
  const metadataFile = path.join(outputDir, `${eventId}-${label}.request.json`);
  try {
    const [bytes, metadata] = await Promise.all([
      fs.readFile(file), fs.readFile(metadataFile, 'utf8').then(JSON.parse)
    ]);
    if (sha256(bytes) !== metadata.sha256) throw Error(`SHA-256 inválido: ${file}`);
    console.log(`Verificada consulta existente: ${eventId}-${label}`);
    return;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if ((await fs.stat(file).catch(() => null)) || (await fs.stat(metadataFile).catch(() => null))) {
      throw Error(`Consulta incompleta, sin sobrescribir: ${eventId}-${label}`);
    }
  }
  const centerTime = Date.parse(eventDateUtc);
  const params = {
    format: 'json', OBJ_DATA: "'NO'", MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'VECTORS'", COMMAND: `'${command}'`, CENTER: `'${center}'`,
    START_TIME: `'${timeLabel(new Date(centerTime - 3600000))}'`,
    STOP_TIME: `'${timeLabel(new Date(centerTime + 3600000))}'`,
    STEP_SIZE: "'1 m'", TIME_TYPE: "'UT'", TIME_DIGITS: "'SECONDS'",
    REF_PLANE: "'ECLIPTIC'", REF_SYSTEM: "'ICRF'", OUT_UNITS: "'KM-S'",
    VEC_TABLE: "'2'", VEC_LABELS: "'NO'", VEC_CORR: "'NONE'", CSV_FORMAT: "'YES'"
  };
  const url = `https://ssd.jpl.nasa.gov/api/horizons.api?${new URLSearchParams(params)}`;
  let response, bytes, acquiredAtUtc;
  for (let attempt = 1; attempt <= 3; attempt++) {
    acquiredAtUtc = new Date().toISOString();
    try {
      response = await fetch(url, {
        headers: { 'User-Agent': 'VoyagerScientificAudit/1.0' },
        signal: AbortSignal.timeout(60000)
      });
      bytes = Buffer.from(await response.arrayBuffer());
      if (!response.ok) throw Error(`HTTP ${response.status}: ${bytes.subarray(0, 300)}`);
      const data = JSON.parse(bytes);
      if (data.error || !data.result?.includes('$$SOE') || !data.result?.includes('$$EOE')) {
        throw Error(`Horizons no devolvió vectores: ${data.error || data.result?.slice(-500)}`);
      }
      break;
    } catch (error) {
      if (attempt === 3) throw error;
      await wait(2000 * attempt);
    }
  }
  const metadata = {
    source: 'NASA/JPL Horizons API', url, parameters: params, acquiredAtUtc,
    httpStatus: response.status, contentType: response.headers.get('content-type'),
    sha256: sha256(bytes), bytes: bytes.length, eventId, eventDateUtc,
    targetId: command, centerId: center
  };
  await fs.writeFile(file, bytes, { flag: 'wx' });
  await fs.writeFile(metadataFile, `${JSON.stringify(metadata, null, 2)}\n`, { flag: 'wx' });
  console.log(`Adquirida: ${eventId}-${label}, ${bytes.length} bytes, SHA-256 ${metadata.sha256}`);
  await wait(1000);
}

for (const [eventId, probeId, planetId] of encounters) {
  const eventDateUtc = getHistoricalEventById(eventId).dateUtc;
  await acquire(eventId, probeId, `500@${planetId}`, 'relative-probe', eventDateUtc);
  await acquire(eventId, probeId, '500@10', 'heliocentric-probe', eventDateUtc);
  await acquire(eventId, planetId, '500@10', 'heliocentric-planet', eventDateUtc);
}
