import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const rawDir = path.resolve(process.argv[2] || 'stage2-2-raw');
const localAuditPath = path.resolve(process.argv[3] || 'stage2-2-local-audit.json');
const outputPath = path.resolve(process.argv[4] || 'stage2-2-audit.json');
const localAudit = JSON.parse(await fs.readFile(localAuditPath, 'utf8'));
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const vector = row => row.slice(2, 5);
const subtract = (a, b) => a.map((value, index) => value - b[index]);
const norm = a => Math.hypot(...a);
const isoFromLabel = label => `${label.replace(/^A\.D\. /, '').replace(/^([0-9]{4})-([A-Za-z]{3})-([0-9]{2}) /, (_, year, month, day) => `${year}-${String(['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(month) + 1).padStart(2,'0')}-${day}T`)}Z`;

async function readVectors(eventId, label) {
  const stem = path.join(rawDir, `${eventId}-${label}`);
  const bytes = await fs.readFile(`${stem}.json`);
  const metadata = JSON.parse(await fs.readFile(`${stem}.request.json`, 'utf8'));
  if (metadata.sha256 !== sha256(bytes) || metadata.httpStatus !== 200) {
    throw Error(`Integridad/procedencia inválida: ${stem}`);
  }
  const result = JSON.parse(bytes).result;
  const match = result.match(/\$\$SOE\s*\n([\s\S]*?)\$\$EOE/);
  if (!match) throw Error(`Sin vectores: ${stem}`);
  const rows = match[1].trim().split(/\r?\n/).filter(Boolean).map(line => {
    const columns = line.split(',').map(column => column.trim());
    const numbers = columns.slice(2, 8).map(Number);
    if (columns.length < 8 || numbers.some(value => !Number.isFinite(value))) {
      throw Error(`Fila inválida: ${stem}: ${line}`);
    }
    return [Number(columns[0]), columns[1], ...numbers];
  });
  const header = result.slice(0, result.indexOf('$$SOE'));
  return { rows, metadata, header };
}

const results = [];
for (const local of localAudit.rows) {
  const eventId = local.eventId;
  const [relative, probe, planet] = await Promise.all([
    readVectors(eventId, 'relative-probe'),
    readVectors(eventId, 'heliocentric-probe'),
    readVectors(eventId, 'heliocentric-planet')
  ]);
  if (relative.rows.length !== 121 || probe.rows.length !== 121 || planet.rows.length !== 121) {
    throw Error(`Ventana no esperada en ${eventId}`);
  }
  for (let i = 0; i < 121; i++) {
    if (relative.rows[i][1] !== probe.rows[i][1] || relative.rows[i][1] !== planet.rows[i][1]) {
      throw Error(`Tiempos no sincronizados en ${eventId}, muestra ${i}`);
    }
  }
  const eventIndex = 60;
  const officialUtc = new Date(local.utc).getTime();
  if (Date.parse(isoFromLabel(relative.rows[eventIndex][1])) !== officialUtc) {
    throw Error(`La ventana no contiene el instante oficial en ${eventId}`);
  }
  const minimum = relative.rows.map((row, index) => ({
    index, utc: isoFromLabel(row[1]), distanceKm: norm(vector(row))
  })).reduce((best, row) => row.distanceKm < best.distanceKm ? row : best);
  const direct = vector(relative.rows[eventIndex]);
  const heliocentric = subtract(vector(probe.rows[eventIndex]), vector(planet.rows[eventIndex]));
  const nasaKm = local.official.distanceKm;
  results.push({
    eventId, eventUtc: local.utc, naif: { probe: local.source.solutionIds[0].bodyId, planet: local.source.solutionIds[1].bodyId },
    nssdc: { radiusMultiples: local.official.radii, referenceRadiusKm: local.official.radiusKm, centerDistanceKm: nasaKm },
    local: { distanceKm: local.local.km, deltaFromNssdcKm: local.local.km - nasaKm,
      deltaFromNssdcPercent: 100 * (local.local.km - nasaKm) / nasaKm,
      datasetId: local.local.probeDataset, hermiteMinusLinearKm: local.local.hermiteMinusLinearKm,
      utcConversionEffectKm: local.local.timeConversionEffectKm },
    horizons: {
      directCenterDistanceKm: norm(direct), directVectorKm: direct,
      heliocentricSubtractionKm: norm(heliocentric), heliocentricDifferenceVectorKm: heliocentric,
      vectorMismatchKm: norm(subtract(heliocentric, direct)),
      directDeltaFromNssdcKm: norm(direct) - nasaKm,
      directDeltaFromNssdcPercent: 100 * (norm(direct) - nasaKm) / nasaKm,
      minimumOneMinuteGrid: minimum,
      directCenterMinusSurfaceKm: norm(direct) - local.official.radiusKm,
      sourceHeaders: {
        direct: relative.header.match(/Target body name:.*\nCenter body name:.*/)?.[0],
        probeHeliocentric: probe.header.match(/Target body name:.*\nCenter body name:.*/)?.[0],
        planetHeliocentric: planet.header.match(/Target body name:.*\nCenter body name:.*/)?.[0]
      },
      files: [
        ['relative-probe', relative.metadata],
        ['heliocentric-probe', probe.metadata],
        ['heliocentric-planet', planet.metadata]
      ].map(([fileLabel, item]) => ({
        file: `${item.eventId}-${fileLabel}.json`,
        url: item.url, sha256: item.sha256, acquiredAtUtc: item.acquiredAtUtc
      }))
    }
  });
}
const output = {
  generatedAtUtc: new Date().toISOString(),
  sources: ['https://ssd.jpl.nasa.gov/api/horizons.api', 'https://nssdc.gsfc.nasa.gov/planetary/voyager-periapse.html'],
  method: 'Vectores geométricos KM-S ICRF/eclíptica J2000; Horizons TIME_TYPE=UT en el instante NSSDCA y una ventana ±60 min a 1 min. NSSDCA radios publicados multiplicados por radio de referencia; cifras redondeadas.',
  results
};
await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
for (const row of results) {
  console.log(`${row.eventId}: local=${row.local.distanceKm.toFixed(1)} Horizons-directo=${row.horizons.directCenterDistanceKm.toFixed(1)} heliocéntrico=${row.horizons.heliocentricSubtractionKm.toFixed(1)} NSSDCA=${row.nssdc.centerDistanceKm.toFixed(1)} mínimo=${row.horizons.minimumOneMinuteGrid.distanceKm.toFixed(1)} km @${row.horizons.minimumOneMinuteGrid.utc}`);
}
