import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createHistoricalEphemerisResolver } from '../src/science/HistoricalEphemerisResolver.js';
import { utcTimestampToTdb } from '../src/science/HistoricalTime.js';
import { queryMoon, validateMoonDataset } from '../src/science/PlanetaryMoons.js';

const root = path.resolve(import.meta.dirname, '..');
const publicDir = path.join(root, 'public');
const rawDir = path.join(root, 'evidence/stage6/Horizons-original');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const norm = v => Math.hypot(...v);
const subtract = (a, b) => a.map((x, i) => x - b[i]);
const xyz = state => [state.position.x, state.position.y, state.position.z];
const velocity = state => [state.velocity.x, state.velocity.y, state.velocity.z];
const readPublic = async file => JSON.parse(await fs.readFile(path.join(publicDir, file), 'utf8'));
const previous = await readPublic('data/moons-2026-10.json');
const added = await readPublic('data/moons-stage6-2026-10.json');
const current = { ...previous, moons: { ...previous.moons, ...added.moons } };
validateMoonDataset(current);
const contemporary = {};
for (const [name, body] of Object.entries(current.moons)) {
  const exact = body.independent?.[0];
  if (!exact) continue;
  const interpolated = queryMoon(current, name, exact[0]);
  contemporary[name] = {
    positionResidualKm: norm(subtract(interpolated.positionKm, exact.slice(1, 4))),
    velocityResidualKmS: norm(subtract(interpolated.velocityKmS, exact.slice(4, 7))),
    independentJdTdb: exact[0]
  };
}

const catalog = await readPublic('data/historical-ephemerides-catalog-v1.json');
const localConsistency = {};
for (const entry of catalog.datasets.filter(e => e.id.includes('-moon-'))) {
  const moonId = entry.bodyIds[0];
  const derived = await readPublic(entry.file);
  const origin = derived.acquisition.bodies[moonId].composition;
  const parentEntry = catalog.datasets.find(e => e.id === origin.parentDatasetId);
  const parent = await readPublic(parentEntry.file);
  const raw = JSON.parse(await fs.readFile(path.join(root, origin.relativeOriginal), 'utf8'));
  const direct = raw.result.split('$$SOE')[1].split('$$EOE')[0].trim().split(/\r?\n/)
    .map(line => line.split(',').map(s => s.trim()))
    .map(cols => [Number(cols[0]), ...cols.slice(2, 8).map(Number)]);
  const source = parent.series[origin.parentId];
  const local = derived.series[moonId];
  let maxPositionResidualKm = 0, maxVelocityResidualKmS = 0;
  for (let i = 0; i < local.length; i++) {
    const relative = local[i].slice(2).map((n, j) => n - source[i][j + 2]);
    maxPositionResidualKm = Math.max(maxPositionResidualKm, norm(subtract(relative.slice(0, 3), direct[i].slice(1, 4))));
    maxVelocityResidualKmS = Math.max(maxVelocityResidualKmS, norm(subtract(relative.slice(3, 6), direct[i].slice(4, 7))));
  }
  localConsistency[entry.id] = { samples: local.length, parentId: origin.parentId,
    maxPositionResidualKm, maxVelocityResidualKmS };
}

const resolver = createHistoricalEphemerisResolver({ loadJson: readPublic, catalog });
const encounters = [
  ['v1-io-1979', '1979-03-05T12:05:26Z', 'voyager-1', '-31', 'Io', '501'],
  ['v1-europa-1979', '1979-03-04T18:00:00Z', 'voyager-1', '-31', 'Europa', '502'],
  ['v2-europa-1979', '1979-07-09T12:00:00Z', 'voyager-2', '-32', 'Europa', '502'],
  ['v1-titan-1980', '1980-11-12T05:41:21Z', 'voyager-1', '-31', 'Titan', '606'],
  ['v2-titania-1986', '1986-01-24T06:00:00Z', 'voyager-2', '-32', 'Titania', '703'],
  ['v2-miranda-1986', '1986-01-24T12:00:00Z', 'voyager-2', '-32', 'Miranda', '705'],
  ['v2-triton-1989', '1989-08-25T09:10:00Z', 'voyager-2', '-32', 'Triton', '801']
];
const flybys = {};
for (const [name, dateUtc, missionId, probeId, moonName, moonId] of encounters) {
  const jdTdb = utcTimestampToTdb(dateUtc).jdTdb;
  const snapshot = await resolver.queryHistoricalSnapshot(jdTdb);
  const probe = snapshot.probes[missionId]?.state;
  const moon = snapshot.moons[moonName]?.state;
  if (!probe || !moon) throw Error(`${name}: missing local state`);
  const localRelative = subtract(xyz(probe), xyz(moon));
  const localRelativeVelocity = subtract(velocity(probe), velocity(moon));
  const params = {
    format: 'json', OBJ_DATA: "'NO'", MAKE_EPHEM: "'YES'", EPHEM_TYPE: "'VECTORS'",
    COMMAND: `'${probeId}'`, CENTER: `'500@${moonId}'`,
    TLIST: `'${jdTdb.toFixed(11)}'`, TLIST_TYPE: "'JD'", TIME_TYPE: "'TDB'",
    REF_PLANE: "'ECLIPTIC'", REF_SYSTEM: "'ICRF'", OUT_UNITS: "'KM-S'",
    VEC_TABLE: "'2'", VEC_LABELS: "'NO'", VEC_CORR: "'NONE'", CSV_FORMAT: "'YES'"
  };
  const url = `https://ssd.jpl.nasa.gov/api/horizons.api?${new URLSearchParams(params)}`;
  const rawFile = path.join(rawDir, `${name}-probe-direct.json`);
  let bytes;
  try { bytes = await fs.readFile(rawFile); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
    if (!response.ok) throw Error(`${name}: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(rawFile, bytes, { flag: 'wx' });
  }
  const raw = JSON.parse(bytes);
  if (raw.error || !raw.result?.includes('$$SOE')) throw Error(`${name}: ${raw.error ?? 'no vectors'}`);
  const row = raw.result.split('$$SOE')[1].split('$$EOE')[0].trim().split(',').map(s => s.trim());
  const directPosition = row.slice(2, 5).map(Number);
  const directVelocity = row.slice(5, 8).map(Number);
  if ([...directPosition, ...directVelocity].some(n => !Number.isFinite(n))) throw Error(`${name}: invalid direct vector`);
  flybys[name] = { dateUtc, jdTdb, probeId, moonId,
    localDistanceKm: norm(localRelative), directDistanceKm: norm(directPosition),
    signedDistanceErrorKm: norm(localRelative) - norm(directPosition),
    vectorResidualKm: norm(subtract(localRelative, directPosition)),
    velocityResidualKmS: norm(subtract(localRelativeVelocity, directVelocity)),
    rawSha256: hash(bytes), rawFile: path.relative(root, rawFile).replaceAll('\\', '/') };
  console.log(name, flybys[name].signedDistanceErrorKm.toFixed(3), 'km');
}

const report = { generatedAtUtc: new Date().toISOString(),
  method: 'Independent 2026 samples; direct planet-centered local composition; direct Voyager-to-moon Horizons vectors',
  contemporary, localConsistency, flybys };
await fs.writeFile(path.join(root, 'evidence/stage6/moon-numeric-audit.json'), JSON.stringify(report, null, 2) + '\n');
