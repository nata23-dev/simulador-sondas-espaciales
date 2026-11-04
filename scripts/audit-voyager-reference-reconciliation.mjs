import fs from 'node:fs/promises';
import path from 'node:path';
import { createHistoricalEphemerisResolver } from '../src/science/HistoricalEphemerisResolver.js';
import { getHistoricalEventById } from '../src/science/VoyagerHistoricalEvents.js';
import { utcTimestampToTdb } from '../src/science/HistoricalTime.js';
import { root, output, readPublic, query, hash, norm, sub, add, stateVector } from './voyager-reference-utils.mjs';

const catalog = await readPublic('data/historical-ephemerides-catalog-v1.json');
const resolver = createHistoricalEphemerisResolver({ loadJson: readPublic, catalog });
const definitions = [
  ['v1-io-encounter-1979','501','599','5'], ['v1-europa-1979','502','599','5'],
  ['v1-ganymede-1979','503','599','5'], ['v1-callisto-1979','504','599','5'],
  ['v1-titan-1980','606','699','6'], ['v2-europa-1979','502','599','5'],
  ['v2-titania-1986','703','799','7'], ['v2-miranda-1986','705','799','7'],
  ['v2-triton-1989','801','899','8']
];
await fs.mkdir(output, { recursive: true });
const inventory = [];
for (const entry of catalog.datasets) {
  const bytes = await fs.readFile(path.join(root, 'public', entry.file));
  const raw = JSON.parse(bytes);
  inventory.push({ id: entry.id, file: entry.file, bodyIds: entry.bodyIds, cadenceSeconds: entry.cadenceSeconds,
    coverage: entry.coverage, bodyCoverage: entry.bodyCoverage, sha256: hash(bytes), acquisition: raw.acquisition });
}
await fs.writeFile(path.join(output, 'input-inventory.json'), JSON.stringify(inventory, null, 2)+'\n');
const events = [];
for (const [id, moonId, planetId, barycenterId] of definitions) {
  const event = getHistoricalEventById(id);
  if (!event) throw Error(`Unknown catalog event ${id}`);
  const probeId = event.missionId === 'voyager-1' ? '-31' : '-32';
  const time = utcTimestampToTdb(event.dateUtc);
  const offsets = [-86400,-3600,-900,-60,0,60,900,3600,86400];
  const times = offsets.map(s => time.jdTdb+s/86400);
  const requests = {
    direct: [moonId,probeId], probeSun: [probeId,'10'], planetSun: [planetId,'10'],
    moonPlanet: [moonId,planetId], probeBary: [probeId,barycenterId],
    moonBary: [moonId,barycenterId], planetBary: [planetId,barycenterId], barySun: [barycenterId,'10']
  };
  const refs = {};
  for (const [name,pair] of Object.entries(requests)) refs[name] = await query(`${id}-${name}`, ...pair, times);
  const samples = [];
  for (let i=0;i<times.length;i++) {
    const jdTdb=times[i];
    const p=await resolver.resolveProbeState(event.missionId,jdTdb);
    const m=await resolver.resolveBodyState(moonId,jdTdb);
    const pl=await resolver.resolveBodyState(planetId,jdTdb);
    if(!p.state || !m.state || !pl.state) throw Error(`Missing state: ${id} ${jdTdb}`);
    const probe=stateVector(p.state), moon=stateVector(m.state), planet=stateVector(pl.state);
    const ref=Object.fromEntries(Object.entries(refs).map(([k,v])=>[k,v.rows[i].state]));
    const localRelative=sub(moon,probe);
    const modernBaryInPlanetChain=sub(ref.planetSun,ref.planetBary);
    const coherentProbe=add(modernBaryInPlanetChain,ref.probeBary);
    const exactMoon=add(ref.planetSun,ref.moonPlanet);
    const directByCommonBary=sub(ref.moonBary,ref.probeBary);
    const interpolatorResidual=sub(localRelative,sub(exactMoon,ref.probeSun));
    const sourceChainResidual=sub(sub(exactMoon,ref.probeSun),ref.direct);
    const counterfactual=sub(moon,coherentProbe);
    const metrics = v => ({positionKm:norm(v.slice(0,3)),velocityKmS:norm(v.slice(3))});
    samples.push({ jdTdb, labelTdb:refs.direct.rows[i].labelTdb, offsetSeconds:offsets[i],
      local:{probe,moon,planet,relativeMoonMinusProbe:localRelative,distanceKm:norm(localRelative.slice(0,3)),
        relativeSpeedKmS:norm(localRelative.slice(3)), probeDataset:p.datasetId,moonDataset:m.datasetId,planetDataset:pl.datasetId},
      references:ref,
      directDistanceKm:norm(ref.direct.slice(0,3)),directRelativeSpeedKmS:norm(ref.direct.slice(3)),
      signedDistanceErrorKm:norm(localRelative.slice(0,3))-norm(ref.direct.slice(0,3)),
      residual:metrics(sub(localRelative,ref.direct)),
      sourceChainResidual:metrics(sourceChainResidual),interpolationResidual:metrics(interpolatorResidual),
      probeInterpolationResidual:metrics(sub(probe,ref.probeSun)),
      commonBarycenterClosure:metrics(sub(directByCommonBary,ref.direct)),
      planetMoonClosure:metrics(sub(exactMoon,add(modernBaryInPlanetChain,ref.moonBary))),
      genericBaryVsPlanetChain:metrics(sub(modernBaryInPlanetChain,ref.barySun)),
      counterfactualProbe:coherentProbe,counterfactualResidual:metrics(sub(counterfactual,ref.direct)),
      sourceShift:sub(coherentProbe,ref.probeSun),
      residualDecompositionClosure:metrics(sub(sub(localRelative,ref.direct),add(sourceChainResidual,interpolatorResidual)))
    });
  }
  events.push({id,dateUtc:event.dateUtc,displayDateUtc:event.displayDateUtc,kind:event.kind,
    probeId,moonId,planetId,barycenterId,time,refs,samples});
  await fs.writeFile(path.join(output,'encounters.json'),JSON.stringify({frame:'ECLIPJ2000 / ICRF',timeScale:'TDB',units:'km, km/s',aberration:'NONE',events},null,2)+'\n');
  const r=samples[4];
  console.log(`${id}: local ${r.local.distanceKm.toFixed(3)}, direct ${r.directDistanceKm.toFixed(3)}, vector ${r.residual.positionKm.toFixed(3)}, interpolation ${r.interpolationResidual.positionKm.toFixed(6)} km`);
}
