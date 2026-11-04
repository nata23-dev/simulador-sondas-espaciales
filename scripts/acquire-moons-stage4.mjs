import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// Geometric moon-to-planet-center states. Never subtract separately queried
// heliocentric solutions: doing so can mix SPK chains as with Voyager.
const bodies = [
  ['Luna', '301', '399'], ['Europa', '502', '599'],
  ['Titan', '606', '699'], ['Titania', '703', '799'], ['Triton', '801', '899']
];
const root = path.resolve(import.meta.dirname, '..');
const rawDir = path.join(root, 'evidence', 'stage4', 'Horizons-original');
const output = path.join(root, 'public', 'data', 'moons-2026-10.json');
await fs.mkdir(rawDir, { recursive: true });
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function query(name, id, center, kind) {
  const rawPath = path.join(rawDir, `${name}-${kind === 'grid' ? 'grid-1h' : kind}.json`);
  const params = {
    format: 'json', OBJ_DATA: "'NO'", MAKE_EPHEM: "'YES'", EPHEM_TYPE: "'VECTORS'",
    COMMAND: `'${id}'`, CENTER: `'500@${center}'`,
    START_TIME: kind === 'grid' ? "'2026-10-01 00:00 TDB'" : "'2026-10-15 03:30 TDB'",
    STOP_TIME: kind === 'grid' ? "'2026-11-01 00:00'" : "'2026-10-15 03:31'",
    STEP_SIZE: "'1 h'", TIME_TYPE: "'TDB'",
    REF_PLANE: "'ECLIPTIC'", REF_SYSTEM: "'ICRF'", OUT_UNITS: "'KM-S'",
    VEC_TABLE: "'2'", VEC_LABELS: "'NO'", VEC_CORR: "'NONE'", CSV_FORMAT: "'YES'"
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
  if (raw.error || !raw.result?.includes('$$SOE')) throw Error(`${name}/${kind}: ${raw.error ?? raw.result?.slice(-600)}`);
  const result = raw.result;
  const targetHeader = result.match(/^Target body name:\s*(.+)$/m)?.[1] ?? '';
  const centerHeader = result.match(/^Center body name:\s*(.+)$/m)?.[1] ?? '';
  if (!targetHeader.includes(`(${id})`) || !centerHeader.includes(`(${center})`)) {
    throw Error(`${name}/${kind}: target/center mismatch: ${targetHeader} / ${centerHeader}`);
  }
  const lines = result.split('$$SOE')[1].split('$$EOE')[0].trim().split(/\r?\n/);
  const rows = lines.map(line => {
    const cols = line.split(',').map(s => s.trim());
    const values = [Number(cols[0]), ...cols.slice(2, 8).map(Number)];
    if (values.length !== 7 || values.some(v => !Number.isFinite(v))) throw Error(`${name}/${kind}: bad row ${line}`);
    return values;
  });
  console.log(`${name} ${kind}: ${rows.length} rows, ${targetHeader} / ${centerHeader}, ${sha256(bytes)}`);
  return { rows, source: { url, params, targetHeader, centerHeader, sha256: sha256(bytes), rawFile: path.relative(root, rawPath).replaceAll('\\', '/') } };
}

const data = { schema: 'planetocentric-moons-v1', frame: 'ICRF_ECLIPTIC_J2000', timeScale: 'TDB',
  units: ['JD_TDB', 'km', 'km', 'km', 'km/s', 'km/s', 'km/s'],
  coverage: ['2026-10-01 00:00 TDB', '2026-11-01 00:00 TDB'], stepHours: 1, moons: {} };
for (const [name, id, center] of bodies) {
  const grid = await query(name, id, center, 'grid');
  const check = await query(name, id, center, 'independent');
  if (grid.rows.length !== 745 || check.rows.length !== 1) throw Error(`${name}: unexpected coverage`);
  data.moons[name] = { id, center, rows: grid.rows, independent: check.rows, source: grid.source, independentSource: check.source };
}
await fs.writeFile(output, JSON.stringify(data) + '\n', { flag: 'wx' });
console.log(output);
