// Offline-first, traceable Horizons acquisition for the Voyager reference audit.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const root = path.resolve(import.meta.dirname, '..');
export const output = path.join(root, 'evidence/voyager-reference-reconciliation');
export const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export const norm = a => Math.hypot(...a);
export const sub = (a, b) => a.map((x, i) => x - b[i]);
export const add = (a, b) => a.map((x, i) => x + b[i]);
export const stateVector = state => state ? ['position', 'velocity'].flatMap(k => ['x', 'y', 'z'].map(a => state[k][a])) : null;
export const readPublic = async file => JSON.parse(await fs.readFile(path.join(root, 'public', file), 'utf8'));

export function parseVectors(raw, target, center, times) {
  const body = raw.result ?? '';
  if (raw.error || !body.includes('$$SOE')) throw Error(raw.error ?? 'Missing vector table');
  const header = body.slice(0, body.indexOf('$$SOE'));
  for (const [label, id] of [['Target', target], ['Center', center]]) {
    const line = header.match(new RegExp(`${label} body name:.*`))?.[0] ?? '';
    if (!line.includes(`(${id})`)) throw Error(`Wrong ${label}: ${line}`);
  }
  if (!/Reference frame\s*:\s*Ecliptic of J2000\.0/i.test(header)
    || !/Output type\s*:\s*GEOMETRIC cartesian states/i.test(header)
    || !/Output units\s*:\s*KM-S/i.test(header)) throw Error('Non-geometric/incompatible vector header');
  const rows = body.split('$$SOE')[1].split('$$EOE')[0].trim().split(/\r?\n/).map(line => {
    const c = line.split(',').map(s => s.trim());
    return { jdTdb: Number(c[0]), labelTdb: c[1], state: c.slice(2, 8).map(Number) };
  });
  if (rows.length !== times.length || rows.some((r, i) => Math.abs(r.jdTdb - times[i]) > 1e-9
    || r.state.length !== 6 || r.state.some(v => !Number.isFinite(v)))) throw Error('Wrong epoch/count/state');
  return { rows, targetHeader: header.match(/Target body name:.*/)?.[0], centerHeader: header.match(/Center body name:.*/)?.[0] };
}

export async function query(name, target, center, times, { folder = path.join(output, 'Horizons-original') } = {}) {
  await fs.mkdir(folder, { recursive: true });
  const file = path.join(folder, `${name}.json`);
  const requestFile = path.join(folder, `${name}.request.json`);
  const params = {
    format: 'json', OBJ_DATA: "'NO'", MAKE_EPHEM: "'YES'", EPHEM_TYPE: "'VECTORS'",
    COMMAND: `'${target}'`, CENTER: `'500@${center}'`,
    TLIST: `'${times.map(t => t.toFixed(11)).join('\n')}'`, TLIST_TYPE: "'JD'", TIME_TYPE: "'TDB'",
    REF_PLANE: "'ECLIPTIC'", REF_SYSTEM: "'ICRF'", OUT_UNITS: "'KM-S'",
    VEC_TABLE: "'2'", VEC_LABELS: "'NO'", VEC_CORR: "'NONE'", CSV_FORMAT: "'YES'"
  };
  const url = `https://ssd.jpl.nasa.gov/api/horizons.api?${new URLSearchParams(params)}`;
  let bytes, metadata;
  try {
    bytes = await fs.readFile(file);
    metadata = JSON.parse(await fs.readFile(requestFile, 'utf8'));
    if (metadata.sha256 !== hash(bytes) || metadata.url !== url) throw Error(`Cache mismatch: ${name}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (await fs.stat(file).catch(() => null)) throw Error(`Incomplete cached request: ${name}`);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
        if (!response.ok) throw Error(`HTTP ${response.status}`);
        bytes = Buffer.from(await response.arrayBuffer());
        parseVectors(JSON.parse(bytes), target, center, times);
        metadata = { url, parameters: params, acquiredAtUtc: new Date().toISOString(), httpStatus: response.status,
          target, center, sha256: hash(bytes), bytes: bytes.length };
        break;
      } catch (error) {
        if (attempt === 2) throw error;
        await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
    await fs.writeFile(file, bytes, { flag: 'wx' });
    await fs.writeFile(requestFile, JSON.stringify(metadata, null, 2) + '\n', { flag: 'wx' });
    await new Promise(r => setTimeout(r, 250));
    console.log(`Horizons ${name}: ${times.length} states`);
  }
  return { ...parseVectors(JSON.parse(bytes), target, center, times), rawSha256: hash(bytes),
    rawFile: path.relative(root, file).replaceAll('\\', '/') };
}
