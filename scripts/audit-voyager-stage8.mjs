// Reproducible, offline audit of the production catalog and preserved Horizons comparisons.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHistoricalEphemerisResolver, selectBestHistoricalDataset } from '../src/science/HistoricalEphemerisResolver.js';
import { HISTORICAL_MISSIONS_CATALOG } from '../src/science/VoyagerHistoricalMissions.js';
import { root, readPublic, hash } from './voyager-reference-utils.mjs';

const evidenceDir = path.join(root, 'evidence/voyager-stage8');
await fs.mkdir(evidenceDir, { recursive: true });
const catalog = await readPublic('data/historical-ephemerides-catalog-v1.json');
const inventory = JSON.parse(await fs.readFile(path.join(root, 'evidence/voyager-reference-reconciliation/input-inventory.json')));
const global = JSON.parse(await fs.readFile(path.join(root, 'evidence/voyager-reference-reconciliation/global-continuity.json')));
const spk = JSON.parse(await fs.readFile(path.join(root, 'evidence/voyager-reference-reconciliation/spk-audit.json')));
const resolver = createHistoricalEphemerisResolver({ loadJson: readPublic, catalog });
const provider = await resolver.getProvider();
const norm = v => Math.hypot(...v);
const vector = s => s && [s.position.x, s.position.y, s.position.z, s.velocity.x, s.velocity.y, s.velocity.z];
const sec = days => days * 86400;
const out = { generatedAtUtc: new Date().toISOString(), provenance: 'Offline comparison with preserved, hash-verified Horizons requests', sources: [], kernels: [], missions: [], planetaryEncounters: [] };
if (inventory.length !== catalog.datasets.length) throw new Error('Inventory does not cover every production dataset');

for (const item of inventory) {
  const bytes = await fs.readFile(path.join(root, 'public', item.file));
  if (hash(bytes) !== item.sha256) throw new Error(`Source hash differs: ${item.file}`);
  const entry = catalog.datasets.find(d => d.id === item.id);
  if (!entry || entry.file !== item.file) throw new Error(`Catalog mismatch: ${item.id}`);
  out.sources.push({ id: item.id, file: item.file, sha256: item.sha256, bodyIds: entry.bodyIds,
    coverage: item.bodyCoverage, cadenceSeconds: entry.cadenceSeconds, origin: entry.origin,
    frameId: entry.frameId, fileUnits: entry.fileUnits, acquisition: {
      sourceUrl: item.acquisition.sourceUrl, originCode: item.acquisition.originCode,
      referencePlane: item.acquisition.referencePlane, referenceSystem: item.acquisition.referenceSystem,
      timeScale: item.acquisition.timeScale, correction: item.acquisition.correction,
      solutionIds: item.acquisition.solutionIds
    } });
}
for (const kernel of spk.kernels) {
  const actual = hash(await fs.readFile(path.join(root, kernel.file)));
  if (actual !== kernel.sha256) throw new Error(`Kernel hash differs: ${kernel.file}`);
  out.kernels.push({ file: kernel.file, sha256: kernel.sha256, segments: kernel.segments });
}

for (const mission of Object.values(HISTORICAL_MISSIONS_CATALOG)) {
  const entries = catalog.datasets.filter(d => d.bodyIds.includes(mission.naifId));
  const coverage = entries.map(d => ({ datasetId: d.id, cadenceSeconds: d.cadenceSeconds,
    ...(d.bodyCoverage?.[mission.naifId] ?? d.coverage) })).sort((a, b) => a.startJdTdb - b.startJdTdb);
  const endpoints = [...new Set(coverage.flatMap(c => [c.startJdTdb, c.endJdTdb]))].sort((a, b) => a - b);
  const intervals = [];
  for (let i = 0; i < endpoints.length - 1; i++) {
    const startJdTdb = endpoints[i], endJdTdb = endpoints[i + 1], mid = (startJdTdb + endJdTdb) / 2;
    const active = entries.filter(e => {
      const c = e.bodyCoverage?.[mission.naifId] ?? e.coverage;
      return c.startJdTdb <= mid && c.endJdTdb >= mid;
    });
    const selected = selectBestHistoricalDataset(entries, mission.naifId, mid);
    intervals.push({ startJdTdb, endJdTdb, durationSeconds: sec(endJdTdb - startJdTdb),
      selectedDatasetId: selected?.id ?? null, overlappingDatasetIds: active.map(e => e.id) });
  }
  const overlaps = [];
  for (const interval of intervals.filter(x => x.overlappingDatasetIds.length > 1)) {
    const t = (interval.startJdTdb + interval.endJdTdb) / 2;
    const samples = [];
    for (const id of interval.overlappingDatasetIds) {
      const entry = entries.find(e => e.id === id);
      const r = await provider.getInterpolated(mission.naifId, t, { datasetId: id,
        maxIntervalSeconds: Math.max(entry.cadenceSeconds * 1.005, entry.cadenceSeconds + 2) });
      samples.push({ datasetId: id, status: r.status, vector: vector(r.state) });
    }
    const preferred = samples.find(s => s.datasetId === interval.selectedDatasetId);
    overlaps.push({ startJdTdb: interval.startJdTdb, endJdTdb: interval.endJdTdb,
      selectedDatasetId: interval.selectedDatasetId,
      comparisons: samples.map(s => ({ datasetId: s.datasetId, status: s.status,
        positionDifferenceKm: preferred?.vector && s.vector ? norm(s.vector.slice(0, 3).map((v, j) => v - preferred.vector[j])) : null,
        velocityDifferenceKmS: preferred?.vector && s.vector ? norm(s.vector.slice(3).map((v, j) => v - preferred.vector[j + 3])) : null })) });
  }
  const reference = global.wholeSpan.find(x => x.missionId === mission.id);
  const valid = reference.rows.filter(r => r.local && Math.abs(r.stateTimeMismatchSeconds ?? Infinity) < 0.0001);
  const sameTime = { sampleCount: valid.length,
    maxPositionKm: Math.max(...valid.map(r => r.positionResidualKm)),
    maxVelocityKmS: Math.max(...valid.map(r => r.velocityResidualKmS)),
    maxRelativePosition: Math.max(...valid.map(r => r.positionResidualKm / norm(r.direct.slice(0, 3)))),
    maxRelativeVelocity: Math.max(...valid.map(r => r.velocityResidualKmS / norm(r.direct.slice(3)))),
    worstPosition: valid.reduce((a, b) => a.positionResidualKm > b.positionResidualKm ? a : b) };
  out.missions.push({ missionId: mission.id, naifId: mission.naifId, firstValidJdTdb: mission.firstValidJdTdb,
    lastJdTdb: endpoints.at(-1), coverage, intervals, overlaps,
    gaps: intervals.filter(x => !x.selectedDatasetId), handoff: spk.handoffs.find(h => h.probeId === mission.naifId),
    sameTimeReference: sameTime,
    boundaryChecks: reference.boundaryChecks });
}
for (const id of ['v1-jupiter-1979', 'v2-jupiter-1979', 'v1-saturn-1980',
  'v2-saturn-1981', 'v2-uranus-1986', 'v2-neptune-1989']) {
  const readOriginal = async suffix => {
    const stem = path.join(root, 'evidence/stage2-2/ConsultasOriginales', `${id}-${suffix}`);
    const bytes = await fs.readFile(`${stem}.json`);
    const metadata = JSON.parse(await fs.readFile(`${stem}.request.json`));
    if (hash(bytes) !== metadata.sha256 || metadata.httpStatus !== 200) throw new Error(`Original Horizons response invalid: ${stem}`);
    const body = JSON.parse(bytes).result.match(/\$\$SOE\s*\n([\s\S]*?)\$\$EOE/)?.[1];
    if (!body) throw new Error(`No Horizons vector table: ${stem}`);
    return body.trim().split(/\r?\n/).map(line => line.split(',').map(field => field.trim()));
  };
  const [direct, spacecraft, planet] = await Promise.all([
    readOriginal('relative-probe'), readOriginal('heliocentric-probe'), readOriginal('heliocentric-planet')
  ]);
  if ([direct, spacecraft, planet].some(rows => rows.length !== 121)) throw new Error(`Encounter grid incomplete: ${id}`);
  const p = row => row.slice(2, 5).map(Number);
  const d = norm(p(direct[60]));
  const separate = norm(p(spacecraft[60]).map((x, i) => x - p(planet[60])[i]));
  out.planetaryEncounters.push({ id, labelUtc: direct[60][1], directDistanceKm: d,
    separateHeliocentricDistanceKm: separate, distanceDifferenceKm: separate - d });
}
await fs.writeFile(path.join(evidenceDir, 'audit.json'), JSON.stringify(out, null, 2) + '\n');
for (const m of out.missions) console.log(m.missionId, `${m.coverage.length} sources`, `${m.gaps.length} catalog gaps`,
  `${m.overlaps.length} overlap intervals`, `${m.sameTimeReference.sampleCount} same-time references`,
  `max ${m.sameTimeReference.maxPositionKm.toFixed(6)} km / ${m.sameTimeReference.maxVelocityKmS.toExponential(3)} km/s`);
console.log(`Verified ${out.sources.length} production dataset and ${out.kernels.length} SPK SHA-256 hashes; wrote evidence/voyager-stage8/audit.json`);
