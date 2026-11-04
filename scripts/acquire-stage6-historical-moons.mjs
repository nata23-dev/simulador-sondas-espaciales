import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// Encounter-local coverage only. No states are invented between these windows.
const windows = [
  ['hist-launch-v2-injection-1977', ['301']],
  ['hist-launch-v2-departure-1977', ['301']],
  ['hist-launch-v1-injection-1977', ['301']],
  ['hist-launch-v1-departure-1977', ['301']],
  ['hist-flyby-v1-jupiter-1979', ['502', '503', '504']],
  ['hist-flyby-v2-jupiter-1979', ['502', '503', '504']],
  ['hist-flyby-v1-saturn-1980', ['602']],
  ['hist-flyby-v2-saturn-1981', ['602']],
  ['hist-flyby-v2-uranus-1986', ['703', '705']]
];
const root = path.resolve(import.meta.dirname, '..');
const publicDir = path.join(root, 'public');
const catalogPath = path.join(publicDir, 'data/historical-ephemerides-catalog-v1.json');
const rawDir = path.join(root, 'evidence/stage6/Horizons-original');
const outDir = path.join(publicDir, 'data/historical/moons');
await fs.mkdir(rawDir, { recursive: true });
await fs.mkdir(outDir, { recursive: true });
const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

for (const [windowId, bodyIds] of windows) {
  const parentEntry = catalog.datasets.find(d => d.id === windowId);
  if (!parentEntry) throw Error(`Missing parent dataset ${windowId}`);
  const parentData = JSON.parse(await fs.readFile(path.join(publicDir, parentEntry.file), 'utf8'));
  const parentMeta = Object.values(parentData.acquisition.bodies)[0];
  const template = JSON.parse(parentMeta.queryParameters);
  for (const bodyId of bodyIds) {
    const datasetId = `${windowId}-moon-${bodyId}`;
    if (catalog.datasets.some(d => d.id === datasetId)) continue;
    const params = { ...template, COMMAND: `'${bodyId}'`, CENTER: "'500@10'" };
    const url = `https://ssd.jpl.nasa.gov/api/horizons.api?${new URLSearchParams(params)}`;
    const rawPath = path.join(rawDir, `${datasetId}.json`);
    let bytes;
    try { bytes = await fs.readFile(rawPath); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
      if (!response.ok) throw Error(`${datasetId}: HTTP ${response.status}`);
      bytes = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(rawPath, bytes, { flag: 'wx' });
      await sleep(800);
    }
    const raw = JSON.parse(bytes);
    if (raw.error || !raw.result?.includes('$$SOE')) throw Error(`${datasetId}: ${raw.error ?? 'no vectors'}`);
    const target = raw.result.match(/^Target body name:\s*(.+)$/m)?.[1] ?? '';
    const center = raw.result.match(/^Center body name:\s*(.+)$/m)?.[1] ?? '';
    if (!target.includes(`(${bodyId})`) || !center.includes('(10)')) {
      throw Error(`${datasetId}: target/center mismatch ${target} / ${center}`);
    }
    const rows = raw.result.split('$$SOE')[1].split('$$EOE')[0].trim().split(/\r?\n/).map(line => {
      const columns = line.split(',').map(s => s.trim());
      const tuple = [Number(columns[0]), columns[1], ...columns.slice(2, 8).map(Number)];
      if (tuple.length !== 8 || tuple.slice(2).some(n => !Number.isFinite(n))) throw Error(`${datasetId}: invalid row`);
      return tuple;
    });
    if (rows.length < 2 || rows[0][0] !== parentEntry.coverage.startJdTdb
      || rows.at(-1)[0] !== parentEntry.coverage.endJdTdb) {
      throw Error(`${datasetId}: coverage mismatch`);
    }
    const file = `data/historical/moons/${datasetId}.json`;
    const compact = {
      format: 'horizons-compact-v1', formatVersion: 1,
      acquisition: {
        datasetId, apiVersion: raw.signature?.version ?? '1.2',
        sourceUrl: 'https://ssd.jpl.nasa.gov/api/horizons.api',
        origin: 'SUN_CENTER', originCode: '500@10', frameId: 'ICRF_ECLIPTIC_J2000',
        referencePlane: 'ECLIPTIC', referenceSystem: 'ICRF', timeScale: 'TDB', correction: 'NONE',
        bodies: { [bodyId]: { type: 'moon', acquiredAtUtc: new Date().toISOString(),
          solutionId: target.match(/\{source:\s*([^}]+)\}/)?.[1] ?? null,
          responseSha256: hash(bytes), sourceDistanceUnit: 'km', sourceVelocityUnit: 'km/s',
          queryParameters: JSON.stringify(params) } }
      }, series: { [bodyId]: rows }
    };
    await fs.writeFile(path.join(publicDir, file), JSON.stringify(compact) + '\n', { flag: 'wx' });
    catalog.datasets.push({ id: datasetId, file, format: 'horizons-compact-v1', formatVersion: 1,
      bodyIds: [bodyId], coverage: { ...parentEntry.coverage },
      bodyCoverage: { [bodyId]: { ...parentEntry.coverage } }, cadenceSeconds: parentEntry.cadenceSeconds,
      frameId: 'ICRF_ECLIPTIC_J2000', origin: 'SUN_CENTER',
      fileUnits: { position: 'km', velocity: 'km/s' }, source: 'NASA/JPL Horizons',
      sourceVersion: raw.signature?.version ?? '1.2' });
    console.log(`${datasetId}: ${rows.length} heliocentric states; ${target}`);
  }
}
const temp = `${catalogPath}.stage6.tmp`;
await fs.writeFile(temp, JSON.stringify(catalog, null, 2) + '\n', { flag: 'wx' });
await fs.rename(temp, catalogPath);
