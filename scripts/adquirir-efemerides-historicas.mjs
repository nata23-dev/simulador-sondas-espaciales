import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  HORIZONS_API,
  acquireAndWrite,
  responseHeader,
  validateAcquisitionConfig
} from './HorizonsAcquisition.mjs';
import { HORIZONS_FRAME } from '../src/science/Frames.js';
import { createEphemerisCatalog } from '../src/science/EphemerisCatalog.js';
import { gregorianLabelToJulianMidnight, jdToGregorianComponents } from '../src/science/Time.js';

const SHA256 = text => createHash('sha256').update(text).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function addDaysLabel(dateIso, days) {
  const jd = gregorianLabelToJulianMidnight(dateIso) + days;
  return jdToGregorianComponents(jd).dateIso;
}

const INNER_BODIES = [
  { id: '199', type: 'planet' },
  { id: '299', type: 'planet' },
  { id: '399', type: 'planet' },
  { id: '499', type: 'planet' }
];

const OUTER_BODIES = [
  { id: '599', type: 'planet' },
  { id: '699', type: 'planet' },
  { id: '799', type: 'planet' },
  { id: '899', type: 'planet' }
];

const ALL_PLANETS = [...INNER_BODIES, ...OUTER_BODIES];

function buildHistoricalDatasetSpecs() {
  const base = {
    format: 'horizons-compact-v1',
    origin: HORIZONS_FRAME.origin,
    frameId: HORIZONS_FRAME.id,
    timeScale: 'TDB',
    fileUnits: { position: 'km', velocity: 'km/s' },
    minIntervalMs: 1050,
    maxRetries: 3
  };

  // 1. Ventanas de alta resolución: lanzamientos, sobrevuelos planetarios y Pale Blue Dot
  const encounterSpecs = [
    {
      ...base,
      datasetId: 'hist-launch-v2-injection-1977',
      bodies: [{ id: '-32', type: 'probe' }, { id: '399', type: 'planet' }],
      startTdb: '1977-08-20 15:33',
      endTdb: '1977-08-21 00:00',
      cadenceSeconds: 180,
      outputFile: 'public/data/historical/encounters/hist-launch-v2-injection-1977.json'
    },
    {
      ...base,
      datasetId: 'hist-launch-v2-departure-1977',
      bodies: [{ id: '-32', type: 'probe' }, { id: '399', type: 'planet' }],
      startTdb: '1977-08-21 00:00',
      endTdb: '1977-08-29 00:00',
      cadenceSeconds: 3600,
      outputFile: 'public/data/historical/encounters/hist-launch-v2-departure-1977.json'
    },
    {
      ...base,
      datasetId: 'hist-launch-v1-injection-1977',
      bodies: [{ id: '-31', type: 'probe' }, { id: '-32', type: 'probe' }, { id: '399', type: 'planet' }],
      startTdb: '1977-09-05 14:00',
      endTdb: '1977-09-06 00:00',
      cadenceSeconds: 300,
      outputFile: 'public/data/historical/encounters/hist-launch-v1-injection-1977.json'
    },
    {
      ...base,
      datasetId: 'hist-launch-v1-departure-1977',
      bodies: [{ id: '-31', type: 'probe' }, { id: '-32', type: 'probe' }, { id: '399', type: 'planet' }],
      startTdb: '1977-09-06 00:00',
      endTdb: '1977-09-14 00:00',
      cadenceSeconds: 3600,
      outputFile: 'public/data/historical/encounters/hist-launch-v1-departure-1977.json'
    },
    {
      ...base,
      datasetId: 'hist-flyby-v1-jupiter-1979',
      bodies: [{ id: '-31', type: 'probe' }, { id: '599', type: 'planet' }, { id: '501', type: 'moon' }],
      startTdb: '1979-03-01 00:00',
      endTdb: '1979-03-10 00:00',
      cadenceSeconds: 1800,
      outputFile: 'public/data/historical/encounters/hist-flyby-v1-jupiter-1979.json'
    },
    {
      ...base,
      datasetId: 'hist-flyby-v2-jupiter-1979',
      bodies: [{ id: '-32', type: 'probe' }, { id: '599', type: 'planet' }, { id: '501', type: 'moon' }],
      startTdb: '1979-07-05 00:00',
      endTdb: '1979-07-14 00:00',
      cadenceSeconds: 1800,
      outputFile: 'public/data/historical/encounters/hist-flyby-v2-jupiter-1979.json'
    },
    {
      ...base,
      datasetId: 'hist-flyby-v1-saturn-1980',
      bodies: [{ id: '-31', type: 'probe' }, { id: '699', type: 'planet' }, { id: '606', type: 'moon' }],
      startTdb: '1980-11-08 00:00',
      endTdb: '1980-11-17 00:00',
      cadenceSeconds: 1200,
      outputFile: 'public/data/historical/encounters/hist-flyby-v1-saturn-1980.json'
    },
    {
      ...base,
      datasetId: 'hist-flyby-v2-saturn-1981',
      bodies: [{ id: '-32', type: 'probe' }, { id: '699', type: 'planet' }, { id: '606', type: 'moon' }],
      startTdb: '1981-08-22 00:00',
      endTdb: '1981-08-30 00:00',
      cadenceSeconds: 1200,
      outputFile: 'public/data/historical/encounters/hist-flyby-v2-saturn-1981.json'
    },
    {
      ...base,
      datasetId: 'hist-flyby-v2-uranus-1986',
      bodies: [{ id: '-32', type: 'probe' }, { id: '799', type: 'planet' }],
      startTdb: '1986-01-20 00:00',
      endTdb: '1986-01-29 00:00',
      cadenceSeconds: 1200,
      outputFile: 'public/data/historical/encounters/hist-flyby-v2-uranus-1986.json'
    },
    {
      ...base,
      datasetId: 'hist-flyby-v2-neptune-1989',
      bodies: [{ id: '-32', type: 'probe' }, { id: '899', type: 'planet' }, { id: '801', type: 'moon' }],
      startTdb: '1989-08-21 00:00',
      endTdb: '1989-08-29 08:00',
      cadenceSeconds: 900,
      outputFile: 'public/data/historical/encounters/hist-flyby-v2-neptune-1989.json'
    },
    {
      ...base,
      datasetId: 'hist-event-v1-palebluedot-1990',
      bodies: [{ id: '-31', type: 'probe' }, ...ALL_PLANETS],
      startTdb: '1990-02-13 00:00',
      endTdb: '1990-02-15 00:00',
      cadenceSeconds: 3600,
      outputFile: 'public/data/historical/encounters/hist-event-v1-palebluedot-1990.json'
    }
  ];

  // 2. Crucero Voyager 1 (-31), respetando la unión SPK 1981-01-01 00:00 -> 00:01 TDB
  const v1Era1End = addDaysLabel('1981-01-02', 5580); // 1996-04-13
  const v1Era2End = addDaysLabel(v1Era1End, 5580);    // 2011-07-24
  const v1Era3End = addDaysLabel(v1Era2End, 5580);    // 2026-11-02
  const v1Specs = [
    {
      ...base,
      datasetId: 'hist-cruise-v1-1977-1981',
      bodies: [{ id: '-31', type: 'probe' }],
      startTdb: '1977-09-06',
      endTdb: '1981-01-01',
      cadenceSeconds: 86400,
      outputFile: 'public/data/historical/probes/hist-cruise-v1-1977-1981.json'
    },
    {
      ...base,
      datasetId: 'hist-bridge-v1-1981-min',
      bodies: [{ id: '-31', type: 'probe' }],
      startTdb: '1981-01-01 00:01',
      endTdb: '1981-01-01 01:00',
      cadenceSeconds: 60,
      outputFile: 'public/data/historical/probes/hist-bridge-v1-1981-min.json'
    },
    {
      ...base,
      datasetId: 'hist-bridge-v1-1981-hours',
      bodies: [{ id: '-31', type: 'probe' }],
      startTdb: '1981-01-01 01:00',
      endTdb: '1981-01-02 00:00',
      cadenceSeconds: 3600,
      outputFile: 'public/data/historical/probes/hist-bridge-v1-1981-hours.json'
    },
    {
      ...base,
      datasetId: 'hist-cruise-v1-1981-1996',
      bodies: [{ id: '-31', type: 'probe' }],
      startTdb: '1981-01-02',
      endTdb: v1Era1End,
      cadenceSeconds: 432000,
      outputFile: 'public/data/historical/probes/hist-cruise-v1-1981-1996.json'
    },
    {
      ...base,
      datasetId: 'hist-cruise-v1-1996-2011',
      bodies: [{ id: '-31', type: 'probe' }],
      startTdb: v1Era1End,
      endTdb: v1Era2End,
      cadenceSeconds: 432000,
      outputFile: 'public/data/historical/probes/hist-cruise-v1-1996-2011.json'
    },
    {
      ...base,
      datasetId: 'hist-cruise-v1-2011-2026',
      bodies: [{ id: '-31', type: 'probe' }],
      startTdb: v1Era2End,
      endTdb: v1Era3End,
      cadenceSeconds: 432000,
      outputFile: 'public/data/historical/probes/hist-cruise-v1-2011-2026.json'
    }
  ];

  // 3. Crucero Voyager 2 (-32), respetando la unión SPK 1989-08-29 08:00 -> 08:01 TDB
  const v2Era1End = addDaysLabel('1989-09-02', 4525);
  const v2Era2End = addDaysLabel(v2Era1End, 4525);
  const v2Era3End = addDaysLabel(v2Era2End, 4525); // 2026-11-02
  const v2Specs = [
    {
      ...base,
      datasetId: 'hist-cruise-v2-1977-1989',
      bodies: [{ id: '-32', type: 'probe' }],
      startTdb: '1977-08-21',
      endTdb: '1989-08-29',
      cadenceSeconds: 86400,
      outputFile: 'public/data/historical/probes/hist-cruise-v2-1977-1989.json'
    },
    {
      ...base,
      datasetId: 'hist-bridge-v2-1989-min',
      bodies: [{ id: '-32', type: 'probe' }],
      startTdb: '1989-08-29 08:01',
      endTdb: '1989-08-29 09:00',
      cadenceSeconds: 60,
      outputFile: 'public/data/historical/probes/hist-bridge-v2-1989-min.json'
    },
    {
      ...base,
      datasetId: 'hist-bridge-v2-1989-hours',
      bodies: [{ id: '-32', type: 'probe' }],
      startTdb: '1989-08-29 09:00',
      endTdb: '1989-09-02 00:00',
      cadenceSeconds: 3600,
      outputFile: 'public/data/historical/probes/hist-bridge-v2-1989-hours.json'
    },
    {
      ...base,
      datasetId: 'hist-cruise-v2-1989-2002',
      bodies: [{ id: '-32', type: 'probe' }],
      startTdb: '1989-09-02',
      endTdb: v2Era1End,
      cadenceSeconds: 432000,
      outputFile: 'public/data/historical/probes/hist-cruise-v2-1989-2002.json'
    },
    {
      ...base,
      datasetId: 'hist-cruise-v2-2002-2014',
      bodies: [{ id: '-32', type: 'probe' }],
      startTdb: v2Era1End,
      endTdb: v2Era2End,
      cadenceSeconds: 432000,
      outputFile: 'public/data/historical/probes/hist-cruise-v2-2002-2014.json'
    },
    {
      ...base,
      datasetId: 'hist-cruise-v2-2014-2026',
      bodies: [{ id: '-32', type: 'probe' }],
      startTdb: v2Era2End,
      endTdb: v2Era3End,
      cadenceSeconds: 432000,
      outputFile: 'public/data/historical/probes/hist-cruise-v2-2014-2026.json'
    }
  ];

  // 4. Efemérides planetarias 1977-08-20 -> 2026-11-03+ (carga progresiva por décadas/eras)
  const pOutMid = addDaysLabel('1977-08-20', 8985); // 2002-03-27
  const pOutEnd = addDaysLabel(pOutMid, 8990);      // 2026-11-06
  const outerPlanetSpecs = [
    {
      ...base,
      datasetId: 'hist-planets-outer-1977-2002',
      bodies: OUTER_BODIES,
      startTdb: '1977-08-20',
      endTdb: pOutMid,
      cadenceSeconds: 432000,
      outputFile: 'public/data/historical/planets/hist-planets-outer-1977-2002.json'
    },
    {
      ...base,
      datasetId: 'hist-planets-outer-2002-2026',
      bodies: OUTER_BODIES,
      startTdb: pOutMid,
      endTdb: pOutEnd,
      cadenceSeconds: 432000,
      outputFile: 'public/data/historical/planets/hist-planets-outer-2002-2026.json'
    }
  ];

  const innerBounds = [
    '1977-08-20',
    addDaysLabel('1977-08-20', 3594),
    addDaysLabel('1977-08-20', 3594 * 2),
    addDaysLabel('1977-08-20', 3594 * 3),
    addDaysLabel('1977-08-20', 3594 * 4),
    addDaysLabel('1977-08-20', 3594 * 4 + 3596) // 2026-11-03
  ];
  const innerIds = [
    'hist-planets-inner-1977-1987',
    'hist-planets-inner-1987-1997',
    'hist-planets-inner-1997-2007',
    'hist-planets-inner-2007-2016',
    'hist-planets-inner-2016-2026'
  ];
  const innerPlanetSpecs = innerIds.map((datasetId, idx) => ({
    ...base,
    datasetId,
    bodies: INNER_BODIES,
    startTdb: innerBounds[idx],
    endTdb: innerBounds[idx + 1],
    cadenceSeconds: 172800,
    outputFile: `public/data/historical/planets/${datasetId}.json`
  }));

  return [...encounterSpecs, ...v1Specs, ...v2Specs, ...outerPlanetSpecs, ...innerPlanetSpecs];
}

// Muestras independientes fuera de malla (no registradas en el catálogo de interpolación)
const HOLDOUT_CHECKPOINTS = [
  { label: 'v1-cruise-inner-1978', bodyId: '-31', type: 'probe', startTdb: '1978-06-15 12:00', stopTdb: '1978-06-15 13:00', step: '1 h' },
  { label: 'v1-jupiter-flyby-1979', bodyId: '-31', type: 'probe', startTdb: '1979-03-05 12:15', stopTdb: '1979-03-05 12:45', step: '30 m' },
  { label: 'v1-saturn-flyby-1980', bodyId: '-31', type: 'probe', startTdb: '1980-11-12 23:50', stopTdb: '1980-11-13 00:10', step: '20 m' },
  { label: 'v1-palebluedot-1990', bodyId: '-31', type: 'probe', startTdb: '1990-02-14 04:30', stopTdb: '1990-02-14 05:30', step: '1 h' },
  { label: 'v1-heliopause-2012', bodyId: '-31', type: 'probe', startTdb: '2012-08-25 12:00', stopTdb: '2012-08-26 12:00', step: '1 d' },
  { label: 'v1-interstellar-2025', bodyId: '-31', type: 'probe', startTdb: '2025-06-15 12:00', stopTdb: '2025-06-16 12:00', step: '1 d' },
  { label: 'v2-solo-postlaunch-1977', bodyId: '-32', type: 'probe', startTdb: '1977-08-25 12:30', stopTdb: '1977-08-25 13:30', step: '1 h' },
  { label: 'v2-jupiter-flyby-1979', bodyId: '-32', type: 'probe', startTdb: '1979-07-09 22:15', stopTdb: '1979-07-09 22:45', step: '30 m' },
  { label: 'v2-saturn-flyby-1981', bodyId: '-32', type: 'probe', startTdb: '1981-08-26 03:30', stopTdb: '1981-08-26 03:50', step: '20 m' },
  { label: 'v2-uranus-flyby-1986', bodyId: '-32', type: 'probe', startTdb: '1986-01-24 18:10', stopTdb: '1986-01-24 18:30', step: '20 m' },
  { label: 'v2-neptune-flyby-1989', bodyId: '-32', type: 'probe', startTdb: '1989-08-25 03:50', stopTdb: '1989-08-25 04:05', step: '15 m' },
  { label: 'v2-heliopause-2018', bodyId: '-32', type: 'probe', startTdb: '2018-11-05 12:00', stopTdb: '2018-11-06 12:00', step: '1 d' },
  { label: 'v2-interstellar-2025', bodyId: '-32', type: 'probe', startTdb: '2025-06-15 12:00', stopTdb: '2025-06-16 12:00', step: '1 d' }
];

async function acquireHoldoutSamples(contact, outputPath = 'tests/fixtures/voyager-horizons-holdout-v1.json') {
  try {
    const existing = await readFile(outputPath, 'utf8');
    const parsed = JSON.parse(existing);
    if (Array.isArray(parsed.samples) && parsed.samples.length === HOLDOUT_CHECKPOINTS.length) {
      console.log(`[holdout] Reutilizando ${outputPath} (${parsed.samples.length} muestras independientes).`);
      return;
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  const ua = `simulador-sondas-espaciales/1B (contact: ${contact})`;
  const samples = [];
  for (let i = 0; i < HOLDOUT_CHECKPOINTS.length; i++) {
    const item = HOLDOUT_CHECKPOINTS[i];
    if (i > 0) await sleep(1100);
    const params = {
      format: 'json',
      OBJ_DATA: "'NO'",
      MAKE_EPHEM: "'YES'",
      EPHEM_TYPE: "'VECTORS'",
      COMMAND: `'${item.bodyId}'`,
      CENTER: "'500@10'",
      START_TIME: `'${item.startTdb}'`,
      STOP_TIME: `'${item.stopTdb}'`,
      STEP_SIZE: `'${item.step}'`,
      TIME_TYPE: "'TDB'",
      REF_PLANE: "'ECLIPTIC'",
      REF_SYSTEM: "'ICRF'",
      OUT_UNITS: "'KM-S'",
      VEC_TABLE: "'2'",
      VEC_LABELS: "'NO'",
      VEC_CORR: "'NONE'",
      CSV_FORMAT: "'YES'"
    };
    const url = `${HORIZONS_API}?${new URLSearchParams(params)}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': ua },
      signal: AbortSignal.timeout(60000)
    });
    if (!response.ok) throw new Error(`Holdout HTTP ${response.status} en ${item.label}`);
    const data = await response.json();
    const header = responseHeader(data.result, item.bodyId);
    const s = data.result.indexOf('$$SOE');
    const e = data.result.indexOf('$$EOE');
    const firstLine = data.result.slice(s + 5, e).trim().split(/\r?\n/)[0];
    const cols = firstLine.split(',').map(v => v.trim());
    samples.push({
      id: item.label,
      bodyId: item.bodyId,
      type: item.type,
      jdTdb: Number(cols[0]),
      labelTdb: cols[1],
      positionKm: { x: Number(cols[2]), y: Number(cols[3]), z: Number(cols[4]) },
      velocityKmPerS: { x: Number(cols[5]), y: Number(cols[6]), z: Number(cols[7]) },
      apiVersion: data.signature?.version ?? null,
      solutionId: header.solutionId,
      responseSha256: SHA256(data.result),
      acquiredAtUtc: new Date().toISOString()
    });
    console.log(`[holdout ${i + 1}/${HOLDOUT_CHECKPOINTS.length}] ${item.label} -> ${cols[1]}`);
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({
    formatVersion: 1,
    purpose: 'Independent off-grid Horizons reference samples for quantitative Hermite validation',
    source: 'NASA/JPL Horizons',
    sourceUrl: HORIZONS_API,
    origin: HORIZONS_FRAME.origin,
    frameId: HORIZONS_FRAME.id,
    timeScale: 'TDB',
    samples
  }, null, 2)}\n`, 'utf8');
}

async function main(args) {
  const mode = args[0] ?? '--dry-run';
  if (!['--dry-run', '--execute'].includes(mode)) {
    throw new Error('Uso: node scripts/adquirir-efemerides-historicas.mjs [--dry-run|--execute]');
  }

  const specs = buildHistoricalDatasetSpecs();
  const validated = specs.map(spec => validateAcquisitionConfig(spec));
  const totalRequests = validated.reduce((sum, cfg) => sum + cfg.bodies.length, 0);
  const totalStates = validated.reduce((sum, cfg) => sum + cfg.expectedSamplesPerBody * cfg.bodies.length, 0);

  if (mode === '--dry-run') {
    console.log(JSON.stringify({
      datasetCount: validated.length,
      totalHorizonsRequests: totalRequests,
      holdoutRequests: HOLDOUT_CHECKPOINTS.length,
      totalScientificStates: totalStates,
      datasets: validated.map(cfg => ({
        datasetId: cfg.datasetId,
        bodies: cfg.bodies.map(b => b.id),
        startTdb: cfg.startTdb,
        endTdb: cfg.endTdb,
        cadenceSeconds: cfg.cadenceSeconds,
        samplesPerBody: cfg.expectedSamplesPerBody,
        outputFile: cfg.outputFile
      }))
    }, null, 2));
    return;
  }

  const contact = process.env.HORIZONS_CONTACT;
  const catalogEntries = [];
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    if (i > 0) await sleep(1050);
    console.log(`[${i + 1}/${specs.length}] Adquiriendo ${spec.datasetId} (${spec.startTdb} -> ${spec.endTdb}, paso ${spec.cadenceSeconds}s)...`);
    const result = await acquireAndWrite(spec, { contact });
    console.log(`  -> ${result.reused ? 'reutilizado' : 'descargado'} (${result.sha256.slice(0, 12)}…)`);
    catalogEntries.push(result.catalogEntry);
  }

  const catalogObj = {
    catalogVersion: 1,
    datasets: catalogEntries
  };
  createEphemerisCatalog(catalogObj);

  const catalogPath = 'public/data/historical-ephemerides-catalog-v1.json';
  await writeFile(catalogPath, `${JSON.stringify(catalogObj, null, 2)}\n`, 'utf8');
  console.log(`Catálogo histórico validado y escrito en ${catalogPath} (${catalogEntries.length} conjuntos).`);

  await sleep(1100);
  await acquireHoldoutSamples(contact);
  console.log('Adquisición histórica y muestras independientes completadas.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(err => {
    console.error(`Error en adquisición histórica: ${err.message}`);
    process.exitCode = 1;
  });
}
