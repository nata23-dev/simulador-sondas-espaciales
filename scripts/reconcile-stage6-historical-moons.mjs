import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// The parent planet's existing heliocentric vector defines the scene origin.
// Add a DIRECT moon-minus-planet vector from Horizons at each identical TDB
// sample. This preserves moon/parent geometry without blending SPK chains.
// It does not resolve the separate Voyager/planet SPK-chain discrepancy.
const parentByMoon = { '301': '399', '501': '599', '502': '599', '503': '599', '504': '599',
  '602': '699', '606': '699', '703': '799', '705': '799', '801': '899' };
const root = path.resolve(import.meta.dirname, '..');
const publicDir = path.join(root, 'public');
const rawDir = path.join(root, 'evidence/stage6/Horizons-original');
const catalog = JSON.parse(await fs.readFile(path.join(publicDir, 'data/historical-ephemerides-catalog-v1.json'), 'utf8'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

const newEntries = catalog.datasets.filter(e => !e.id.includes('-moon-') && e.id.startsWith('hist-'))
  .flatMap(parent => parent.bodyIds
    .filter(id => ['501', '606', '801'].includes(id))
    .map(id => ({
      id: `${parent.id}-moon-${id}`, file: `data/historical/moons/${parent.id}-moon-${id}.json`,
      format: 'horizons-compact-v1', formatVersion: 1, bodyIds: [id],
      coverage: { ...parent.coverage }, bodyCoverage: { [id]: { ...parent.coverage } },
      cadenceSeconds: parent.cadenceSeconds, frameId: parent.frameId, origin: 'SUN_CENTER',
      fileUnits: { ...parent.fileUnits }, source: parent.source, sourceVersion: parent.sourceVersion,
      referencePriority: 1
    })))
  .filter(e => !catalog.datasets.some(existing => existing.id === e.id));
const entries = [...catalog.datasets.filter(e => e.id.includes('-moon-') && e.id.startsWith('hist-')), ...newEntries];

for (const entry of entries) {
  const moonId = entry.bodyIds[0];
  const parentId = parentByMoon[moonId];
  if (!parentId) continue;
  const parentEntry = catalog.datasets.find(e => e.id === entry.id.replace(/-moon-\d+$/, ''));
  if (!parentEntry?.bodyIds.includes(parentId)) throw Error(`${entry.id}: parent dataset missing ${parentId}`);
  const parentBytes = await fs.readFile(path.join(publicDir, parentEntry.file));
  const parentData = JSON.parse(parentBytes);
  const parentSeries = parentData.series[parentId];
  const template = JSON.parse(parentData.acquisition.bodies[parentId].queryParameters);
  const params = { ...template, COMMAND: `'${moonId}'`, CENTER: `'500@${parentId}'` };
  const url = `https://ssd.jpl.nasa.gov/api/horizons.api?${new URLSearchParams(params)}`;
  const rawPath = path.join(rawDir, `${entry.id}-planetocentric.json`);
  let bytes;
  try { bytes = await fs.readFile(rawPath); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
    if (!response.ok) throw Error(`${entry.id}: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(rawPath, bytes, { flag: 'wx' });
    await new Promise(resolve => setTimeout(resolve, 800));
  }
  const raw = JSON.parse(bytes);
  if (raw.error || !raw.result?.includes('$$SOE')) throw Error(`${entry.id}: ${raw.error ?? 'no vectors'}`);
  const target = raw.result.match(/^Target body name:\s*(.+)$/m)?.[1] ?? '';
  const center = raw.result.match(/^Center body name:\s*(.+)$/m)?.[1] ?? '';
  if (!target.includes(`(${moonId})`) || !center.includes(`(${parentId})`)) {
    throw Error(`${entry.id}: identity ${target} / ${center}`);
  }
  const relative = raw.result.split('$$SOE')[1].split('$$EOE')[0].trim().split(/\r?\n/).map(line => {
    const cols = line.split(',').map(s => s.trim());
    return [Number(cols[0]), cols[1], ...cols.slice(2, 8).map(Number)];
  });
  if (relative.length !== parentSeries.length) throw Error(`${entry.id}: cadence mismatch`);
  const series = relative.map((row, i) => {
    const parent = parentSeries[i];
    if (Math.abs(row[0] - parent[0]) > 1e-9 || row.slice(2).some(n => !Number.isFinite(n))) {
      throw Error(`${entry.id}: time/number mismatch row ${i}`);
    }
    return [row[0], row[1], ...row.slice(2).map((n, j) => n + parent[j + 2])];
  });
  const file = path.join(publicDir, entry.file);
  let previous;
  try { previous = JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    previous = {
      format: 'horizons-compact-v1', formatVersion: 1,
      acquisition: { ...parentData.acquisition, datasetId: entry.id, bodies: {} },
      series: {}
    };
  }
  previous.acquisition.bodies[moonId] = {
    ...previous.acquisition.bodies[moonId],
    solutionId: target.match(/\{source:\s*([^}]+)\}/)?.[1] ?? null,
    responseSha256: hash(bytes), queryParameters: JSON.stringify(params),
    composition: {
      method: 'parent_heliocentric_plus_direct_moon_minus_parent',
      parentId, parentDatasetId: parentEntry.id, parentDatasetSha256: hash(parentBytes),
      relativeOriginal: path.relative(root, rawPath).replaceAll('\\', '/')
    }
  };
  previous.series[moonId] = series;
  await fs.writeFile(file, JSON.stringify(previous) + '\n');
  if (newEntries.includes(entry)) catalog.datasets.push(entry);
  console.log(`${entry.id}: ${series.length} consistent moon/parent states`);
}
if (newEntries.length) {
  const catalogFile = path.join(publicDir, 'data/historical-ephemerides-catalog-v1.json');
  await fs.writeFile(catalogFile, JSON.stringify(catalog, null, 2) + '\n');
}
