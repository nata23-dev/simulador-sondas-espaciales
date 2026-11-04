import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// Direct planet-centered vectors avoid introducing a fabricated satellite orbit.
const bodies = [
  ['Io', '501', '599'], ['Ganymede', '503', '599'], ['Callisto', '504', '599'],
  ['Enceladus', '602', '699'], ['Miranda', '705', '799']
];
const root = path.resolve(import.meta.dirname, '..');
const rawDir = path.join(root, 'evidence', 'stage6', 'Horizons-original');
const output = path.join(root, 'public', 'data', 'moons-stage6-2026-10.json');
await fs.mkdir(rawDir, { recursive: true });
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function query(name, id, center, kind) {
  const rawPath = path.join(rawDir, `${name}-${kind}.json`);
  const params = {
    format: 'json', OBJ_DATA: "'NO'", MAKE_EPHEM: "'YES'", EPHEM_TYPE: "'VECTORS'",
    COMMAND: `'${id}'`, CENTER: `'500@${center}'`,
    START_TIME: kind === 'grid' ? "'2026-10-01 00:00 TDB'" : "'2026-10-15 03:30 TDB'",
    STOP_TIME: kind === 'grid' ? "'2026-11-01 00:00'" : "'2026-10-15 03:31'",
    STEP_SIZE: "'1 h'", TIME_TYPE: "'TDB'", REF_PLANE: "'ECLIPTIC'",
    REF_SYSTEM: "'ICRF'", OUT_UNITS: "'KM-S'", VEC_TABLE: "'2'",
    VEC_LABELS: "'NO'", VEC_CORR: "'NONE'", CSV_FORMAT: "'YES'"
  };
  const url = `https://ssd.jpl.nasa.gov/api/horizons.api?${new URLSearchParams(params)}`;
  let bytes;
  try { bytes = await fs.readFile(rawPath); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
    if (!response.ok) throw Error(`${name}: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(rawPath, bytes, { flag: 'wx' });
    await wait(800);
  }
  const raw = JSON.parse(bytes);
  if (raw.error || !raw.result?.includes('$$SOE')) throw Error(`${name}: ${raw.error ?? 'no vectors'}`);
  const result = raw.result;
  const targetHeader = result.match(/^Target body name:\s*(.+)$/m)?.[1] ?? '';
  const centerHeader = result.match(/^Center body name:\s*(.+)$/m)?.[1] ?? '';
  if (!targetHeader.includes(`(${id})`) || !centerHeader.includes(`(${center})`)) {
    throw Error(`${name}: target/center mismatch: ${targetHeader} / ${centerHeader}`);
  }
  const rows = result.split('$$SOE')[1].split('$$EOE')[0].trim().split(/\r?\n/).map(line => {
    const cols = line.split(',').map(s => s.trim());
    const values = [Number(cols[0]), ...cols.slice(2, 8).map(Number)];
    if (values.length !== 7 || values.some(v => !Number.isFinite(v))) throw Error(`${name}: bad row ${line}`);
    return values;
  });
  return { rows, source: { url, params, targetHeader, centerHeader, sha256: sha256(bytes),
    rawFile: path.relative(root, rawPath).replaceAll('\\', '/') } };
}

const data = { schema: 'planetocentric-moons-v1', frame: 'ICRF_ECLIPTIC_J2000', timeScale: 'TDB',
  units: ['JD_TDB', 'km', 'km', 'km', 'km/s', 'km/s', 'km/s'],
  coverage: ['2026-10-01 00:00 TDB', '2026-11-01 00:00 TDB'], stepHours: 1, moons: {} };
for (const [name, id, center] of bodies) {
  const grid = await query(name, id, center, 'grid');
  const independent = await query(name, id, center, 'independent');
  if (grid.rows.length !== 745 || independent.rows.length !== 1) throw Error(`${name}: coverage mismatch`);
  data.moons[name] = { id, center, rows: grid.rows, independent: independent.rows,
    source: grid.source, independentSource: independent.source };
  console.log(`${name}: ${grid.rows.length} direct planet-centered states`);
}
await fs.writeFile(output, JSON.stringify(data) + '\n', { flag: 'wx' });
console.log(output);
