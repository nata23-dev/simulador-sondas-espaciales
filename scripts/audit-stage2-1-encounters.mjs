import fs from 'node:fs/promises';
import path from 'node:path';
import { createHistoricalEphemerisResolver } from '../src/science/HistoricalEphemerisResolver.js';
import { getHistoricalEventById } from '../src/science/VoyagerHistoricalEvents.js';
import { utcTimestampToTdb } from '../src/science/HistoricalTime.js';

// Radios y múltiplos publicados en la tabla NSSDCA, distintos de los radios
// volumétricos de la malla del simulador. No corrigen las efemérides locales.
const encounters = [
  ['v1-jupiter-1979', '599', '-31', 4.89, 71398],
  ['v2-jupiter-1979', '599', '-32', 10.11, 71398],
  ['v1-saturn-1980', '699', '-31', 3.09, 60330],
  ['v2-saturn-1981', '699', '-32', 2.67, 60330],
  ['v2-uranus-1986', '799', '-32', 4.19, 25559],
  ['v2-neptune-1989', '899', '-32', 1.18, 24760]
];
const publicDir = path.resolve('public');
const loadJson = async file => JSON.parse(await fs.readFile(path.join(publicDir, file), 'utf8'));
const resolver = createHistoricalEphemerisResolver({ loadJson });

async function distanceAt(probeId, bodyId, jdTdb) {
  const [probe, body] = await Promise.all([
    resolver.resolveBodyState(probeId, jdTdb),
    resolver.resolveBodyState(bodyId, jdTdb)
  ]);
  if (!probe.state || !body.state) throw Error(`Sin estados ${probeId}/${bodyId} en JD ${jdTdb}`);
  const p = probe.state.position, b = body.state.position;
  return {
    km: Math.hypot(p.x - b.x, p.y - b.y, p.z - b.z),
    probeStatus: probe.status, bodyStatus: body.status,
    probeDataset: probe.datasetId, bodyDataset: body.datasetId
  };
}

function sampleDistance(probe, body) {
  return Math.hypot(probe[2] - body[2], probe[3] - body[3], probe[4] - body[4]);
}

function linearState(first, last, jd) {
  const t = (jd - first[0]) / (last[0] - first[0]);
  return [0, '', ...[2, 3, 4].map(i => first[i] + t * (last[i] - first[i]))];
}

const rows = [];
for (const [eventId, bodyId, probeId, radiiNssdc, radiusNssdcKm] of encounters) {
  const event = getHistoricalEventById(eventId);
  const time = utcTimestampToTdb(event.dateUtc);
  const officialKm = radiiNssdc * radiusNssdcKm;
  const local = await distanceAt(probeId, bodyId, event.jdTdb);
  const utcMisreadAsTdb = await distanceAt(probeId, bodyId,
    event.jdTdb - time.tdbMinusUtcSeconds / 86400);
  const rawFile = `data/historical/encounters/hist-flyby-${eventId.replace(/^v([12])-/, 'v$1-')}.json`;
  const raw = await loadJson(rawFile);
  const probeSeries = raw.series[probeId], bodySeries = raw.series[bodyId];
  const nextIndex = probeSeries.findIndex(record => record[0] > event.jdTdb);
  if (nextIndex < 1 || bodySeries[nextIndex][0] !== probeSeries[nextIndex][0]) {
    throw Error(`Muestras no sincronizadas en ${rawFile}`);
  }
  const beforeIndex = nextIndex - 1;
  const linearKm = sampleDistance(
    linearState(probeSeries[beforeIndex], probeSeries[nextIndex], event.jdTdb),
    linearState(bodySeries[beforeIndex], bodySeries[nextIndex], event.jdTdb)
  );
  const samples = [beforeIndex, nextIndex].map(index => ({
    jdTdb: probeSeries[index][0], labelTdb: probeSeries[index][1],
    distanceKm: sampleDistance(probeSeries[index], bodySeries[index])
  }));
  let localMinimum = { km: Infinity, jdTdb: null };
  for (let seconds = -1800; seconds <= 1800; seconds += 30) {
    const jd = event.jdTdb + seconds / 86400;
    const measured = await distanceAt(probeId, bodyId, jd);
    if (measured.km < localMinimum.km) localMinimum = { km: measured.km, jdTdb: jd, secondsFromOfficialUtc: seconds };
  }
  rows.push({
    eventId, utc: event.dateUtc, jdTdb: event.jdTdb,
    tdbMinusUtcSeconds: time.tdbMinusUtcSeconds,
    official: { radii: radiiNssdc, radiusKm: radiusNssdcKm, distanceKm: officialKm },
    local: {
      ...local,
      differenceFromOfficialKm: local.km - officialKm,
      linearInterpolationKm: linearKm,
      hermiteMinusLinearKm: local.km - linearKm,
      utcMisreadAsTdbKm: utcMisreadAsTdb.km,
      timeConversionEffectKm: local.km - utcMisreadAsTdb.km,
      samples, minimumWithinHalfHour: localMinimum
    },
    source: {
      file: rawFile,
      frameId: raw.acquisition.frameId, origin: raw.acquisition.origin,
      originCode: raw.acquisition.originCode, timeScale: raw.acquisition.timeScale,
      correction: raw.acquisition.correction,
      solutionIds: raw.acquisition.solutionIds
    }
  });
}
const result = {
  sourceOfficial: 'https://nssdc.gsfc.nasa.gov/planetary/voyager-periapse.html',
  interpretation: 'NSSDCA: radios planetarios publicados y fecha/hora UTC de la nave. Local: distancia geométrica entre vectores heliocéntricos al mismo JD TDB.',
  rows
};
const output = process.env.AUDIT_OUTPUT;
if (output) {
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
}
for (const row of rows) {
  console.log(`${row.eventId}: local=${row.local.km.toFixed(1)} km, NSSDCA=${row.official.distanceKm.toFixed(1)} km, Δ=${row.local.differenceFromOfficialKm.toFixed(1)} km, Hermite-lineal=${row.local.hermiteMinusLinearKm.toFixed(1)} km`);
}
