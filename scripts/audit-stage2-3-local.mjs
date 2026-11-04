import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createHistoricalEphemerisResolver } from '../src/science/HistoricalEphemerisResolver.js';
import { getHistoricalEventById } from '../src/science/VoyagerHistoricalEvents.js';
import { utcTimestampToTdb } from '../src/science/HistoricalTime.js';
import { RADIOS_FISICOS_KM } from '../src/graphics/ScaleModeConfig.js';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const publicDir = path.join(projectRoot, 'public');
const rawDir = path.join(projectRoot, 'evidence/stage2-2/ConsultasOriginales');
const outputFile = path.resolve(process.argv[2] || 'stage2-3-local-audit.json');
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const loadJson = async relative => readJson(path.join(publicDir, relative));
const norm = values => Math.hypot(...values);
const xyz = obj => [obj.x, obj.y, obj.z];
const subtract = (a, b) => a.map((value, index) => value - b[index]);
const resolver = createHistoricalEphemerisResolver({ loadJson });
const catalog = await loadJson('data/historical-ephemerides-catalog-v1.json');
const inventory = [];
for (const entry of catalog.datasets) {
  const file = path.join(publicDir, entry.file);
  const [bytes, meta] = await Promise.all([
    fs.readFile(file), readJson(file.replace(/\.json$/, '.metadata.json'))
  ]);
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  if (hash !== meta.sha256) throw Error(`SHA-256 inválido: ${file}`);
  const data = JSON.parse(bytes);
  inventory.push({
    datasetId: entry.id, file: entry.file, sha256: hash,
    origin: data.acquisition.origin, originCode: data.acquisition.originCode,
    frameId: data.acquisition.frameId, referencePlane: data.acquisition.referencePlane,
    referenceSystem: data.acquisition.referenceSystem, timeScale: data.acquisition.timeScale,
    correction: data.acquisition.correction, fileUnits: entry.fileUnits,
    coverageJdTdb: entry.coverage, cadenceSeconds: entry.cadenceSeconds,
    sourceUrl: data.acquisition.sourceUrl, sourceVersion: entry.sourceVersion,
    solutionIds: data.acquisition.solutionIds,
    bodySamples: Object.fromEntries(Object.entries(data.series).map(([id, rows]) => [id, rows.length]))
  });
}

const events = [
  ['v1-jupiter-1979', '-31', '599', 'Jupiter'],
  ['v2-jupiter-1979', '-32', '599', 'Jupiter'],
  ['v1-saturn-1980', '-31', '699', 'Saturno'],
  ['v2-saturn-1981', '-32', '699', 'Saturno'],
  ['v2-uranus-1986', '-32', '799', 'Urano'],
  ['v2-neptune-1989', '-32', '899', 'Neptuno']
];
const encounters = [];
for (const [eventId, probeId, planetId, planetName] of events) {
  const event = getHistoricalEventById(eventId);
  const raw = await readJson(path.join(rawDir, `${eventId}-relative-probe.json`));
  const rows = raw.result.match(/\$\$SOE\s*\n([\s\S]*?)\$\$EOE/)?.[1]
    .trim().split(/\r?\n/).map(line => line.split(',').map(value => value.trim()));
  if (rows?.length !== 121) throw Error(`Ventana incompleta: ${eventId}`);
  const comparisons = [];
  for (let index = 0; index < 121; index++) {
    const utc = new Date(Date.parse(event.dateUtc) + (index - 60) * 60000).toISOString();
    const jd = utcTimestampToTdb(utc).jdTdb;
    const [probe, planet] = await Promise.all([
      resolver.resolveBodyState(probeId, jd),
      resolver.resolveBodyState(planetId, jd)
    ]);
    if (!probe.state || !planet.state) throw Error(`Estado local ausente: ${eventId} ${utc}`);
    const relativePosition = subtract(xyz(probe.state.position), xyz(planet.state.position));
    const relativeVelocity = subtract(xyz(probe.state.velocity), xyz(planet.state.velocity));
    const officialPosition = rows[index].slice(2, 5).map(Number);
    const officialVelocity = rows[index].slice(5, 8).map(Number);
    comparisons.push({
      utc, localDistanceKm: norm(relativePosition), directDistanceKm: norm(officialPosition),
      vectorResidualKm: norm(subtract(relativePosition, officialPosition)),
      velocityResidualKmS: norm(subtract(relativeVelocity, officialVelocity))
    });
  }
  const encounterData = await loadJson(`data/historical/encounters/hist-flyby-${eventId}.json`);
  const probeSamples = encounterData.series[probeId];
  const boundaries = [];
  for (const [side, jd] of [['start', probeSamples[0][0]], ['end', probeSamples.at(-1)[0]]]) {
    const samples = await Promise.all([-1, 0, 1].map(seconds =>
      resolver.resolveBodyState(probeId, jd + seconds / 86400)));
    const [before, at, after] = samples;
    const residualKm = before.state && after.state
      ? norm(['x', 'y', 'z'].map(axis => after.state.position[axis] - before.state.position[axis]
        - before.state.velocity[axis] - after.state.velocity[axis]))
      : null;
    const velocityChangeKmS = before.state && after.state
      ? norm(['x', 'y', 'z'].map(axis => after.state.velocity[axis] - before.state.velocity[axis]))
      : null;
    boundaries.push({ side, jdTdb: jd, residualKm, velocityChangeKmS,
      statuses: samples.map(item => item.status), datasets: samples.map(item => item.datasetId) });
  }
  const exact = comparisons[60];
  const radiusKm = RADIOS_FISICOS_KM[planetName];
  const angularDiameter = distanceKm => 2 * Math.asin(radiusKm / distanceKm) * 180 / Math.PI;
  encounters.push({
    eventId, eventUtc: event.dateUtc, probeId, planetId, planetName,
    radiusKm, exact, angularDiameterDeg: {
      local: angularDiameter(exact.localDistanceKm),
      direct: angularDiameter(exact.directDistanceKm)
    },
    window: {
      count: comparisons.length,
      maxVectorResidualKm: Math.max(...comparisons.map(item => item.vectorResidualKm)),
      minVectorResidualKm: Math.min(...comparisons.map(item => item.vectorResidualKm)),
      maxVelocityResidualKmS: Math.max(...comparisons.map(item => item.velocityResidualKmS)),
      samples: comparisons.filter((_, index) => index % 15 === 0)
    }, boundaries
  });
}
await fs.mkdir(path.dirname(outputFile), { recursive: true });
await fs.writeFile(outputFile, `${JSON.stringify({ generatedAtUtc: new Date().toISOString(), inventory, encounters }, null, 2)}\n`);
console.log(`${inventory.length} datasets, ${encounters.length} encuentros`);
for (const row of encounters) console.log(row.eventId,
  `vector residual ${row.exact.vectorResidualKm.toFixed(3)} km; ` +
  `speed residual ${row.exact.velocityResidualKmS.toFixed(6)} km/s; ` +
  `angular local/direct ${row.angularDiameterDeg.local.toFixed(3)}/${row.angularDiameterDeg.direct.toFixed(3)}°`);
