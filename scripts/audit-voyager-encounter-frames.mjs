import fs from 'node:fs/promises';
import path from 'node:path';
import {createHistoricalEncounterContextResolver} from '../src/science/HistoricalEncounterContext.js';
import {createHistoricalEphemerisResolver} from '../src/science/HistoricalEphemerisResolver.js';
import {root,readPublic,query,hash,norm,sub,stateVector} from './voyager-reference-utils.mjs';

const evidence=path.join(root,'evidence/voyager-encounter-context');
const prior=JSON.parse(await fs.readFile(path.join(root,'evidence/voyager-reference-reconciliation/encounters.json'),'utf8'));
const inventory=JSON.parse(await fs.readFile(path.join(root,'evidence/voyager-reference-reconciliation/input-inventory.json'),'utf8'));
for(const item of inventory) {
  if(hash(await fs.readFile(path.join(root,'public',item.file)))!==item.sha256)throw Error(`Production data changed: ${item.file}`);
}
const resolver=createHistoricalEncounterContextResolver({loadJson:readPublic});
const globalResolver=createHistoricalEphemerisResolver({loadJson:readPublic});
const catalog=await resolver.getCatalog();
let verifiedRequests=0;
for(const c of [...catalog.contexts,...catalog.moonContexts]) {
  const bytes=await fs.readFile(path.join(root,'public',c.file));
  if(hash(bytes)!==c.sha256)throw Error(`Invalid local frame: ${c.id}`);
  const data=JSON.parse(bytes);
  if(data.sourceRequests.reduce((n,r)=>n+r.epochs,0)!==c.sampleCount)throw Error(`Incomplete raw requests: ${c.id}`);
  for(const request of data.sourceRequests) {
    if(!request.file.startsWith('evidence/voyager-encounter-context/Horizons-original/'))throw Error(`Invalid raw path: ${request.file}`);
    const original=await fs.readFile(path.join(root,request.file));
    const metadata=JSON.parse(await fs.readFile(path.join(root,request.file.replace(/\.json$/,'.request.json')),'utf8'));
    if(hash(original)!==request.sha256||metadata.sha256!==request.sha256||metadata.httpStatus!==200)throw Error(`Invalid raw response: ${request.file}`);
    verifiedRequests++;
  }
}
const rows=[];
const moonRows=[];
for(const event of prior.events) {
  const missionId=event.probeId==='-31'?'voyager-1':'voyager-2';
  const planet=catalog.contexts.find(c=>c.missionId===missionId&&c.planetNaifId===event.planetId)?.planet;
  if(!planet)throw Error(`No local context for ${event.id}`);
  const moonName=catalog.moonContexts.find(c=>c.id===event.id)?.moon;
  if(!moonName)throw Error(`No moon context for ${event.id}`);
  for(const sample of event.samples) {
    const [relative,moonRelative]=await Promise.all([
      resolver.resolve(missionId,planet,sample.jdTdb),
      resolver.resolveMoon(missionId,moonName,sample.jdTdb)
    ]);
    if(!relative.state)throw Error(`No local vector for ${event.id} ${sample.offsetSeconds}`);
    if(!moonRelative.state)throw Error(`No moon vector for ${event.id} ${sample.offsetSeconds}`);
    const p=relative.state.positionKm,v=relative.state.velocityKmS;
    const probePlanet=[p.x,p.y,p.z,v.x,v.y,v.z];
    const moonPlanet=sub(sample.local.moon,sample.local.planet);
    const localMoonMinusProbe=sub(moonPlanet,probePlanet);
    const delta=sub(localMoonMinusProbe,sample.references.direct);
    const directProbePlanet=sub(sample.references.probeBary,sample.references.planetBary);
    const sourceDelta=sub(probePlanet,directProbePlanet);
    rows.push({eventId:event.id,utc:event.dateUtc,jdTdb:sample.jdTdb,
      offsetSeconds:sample.offsetSeconds,contextId:relative.state.datasetId,
      planetNaifId:event.planetId,moonNaifId:event.moonId,probeNaifId:event.probeId,
      sampleJdTdbs:relative.state.sampleJdTdbs,
      previousLocalDistanceKm:sample.local.distanceKm,
      horizonsDistanceKm:sample.directDistanceKm,
      localContextDistanceKm:norm(localMoonMinusProbe.slice(0,3)),
      distanceDifferenceKm:norm(localMoonMinusProbe.slice(0,3))-sample.directDistanceKm,
      vectorErrorKm:norm(delta.slice(0,3)),velocityErrorKmS:norm(delta.slice(3)),
      probePlanetVectorErrorKm:norm(sourceDelta.slice(0,3)),
      probePlanetVelocityErrorKmS:norm(sourceDelta.slice(3)),
      localRelativeSpeedKmS:norm(localMoonMinusProbe.slice(3)),
      horizonsRelativeSpeedKmS:sample.directRelativeSpeedKmS});
    const m=moonRelative.state;
    const direct=[m.positionKm.x,m.positionKm.y,m.positionKm.z,
      m.velocityKmS.x,m.velocityKmS.y,m.velocityKmS.z];
    const directDelta=sub(direct,sample.references.direct);
    moonRows.push({eventId:event.id,jdTdb:sample.jdTdb,offsetSeconds:sample.offsetSeconds,
      contextId:m.datasetId,sampleJdTdbs:m.sampleJdTdbs,
      previousLocalDistanceKm:sample.local.distanceKm,
      horizonsDistanceKm:sample.directDistanceKm,
      correctedDistanceKm:norm(direct.slice(0,3)),
      distanceDifferenceKm:norm(direct.slice(0,3))-sample.directDistanceKm,
      vectorErrorKm:norm(directDelta.slice(0,3)),
      velocityErrorKmS:norm(directDelta.slice(3)),
      correctedRelativeSpeedKmS:norm(direct.slice(3)),
      horizonsRelativeSpeedKmS:sample.directRelativeSpeedKmS});
  }
}
const max=(f)=>Math.max(...rows.map(f));
const holdouts=[];
const moonHoldouts=[];
for(const event of prior.events) {
  const missionId=event.probeId==='-31'?'voyager-1':'voyager-2';
  const planet=catalog.contexts.find(c=>c.missionId===missionId&&c.planetNaifId===event.planetId)?.planet;
  const moonName=catalog.moonContexts.find(c=>c.id===event.id)?.moon;
  const offsets=[-86400,-43200,-21600,-10800,-5400,-2700,-1350,-675,-337.5,337.5,675,1350,2700,5400,10800,21600,43200,86400];
  const times=offsets.map(s=>event.time.jdTdb+s/86400);
  const direct=await query(`holdout-${event.id}`,event.moonId,event.probeId,times,
    {folder:path.join(evidence,'Horizons-original')});
  for(let i=0;i<times.length;i++) {
    const jdTdb=times[i];
    const [context,moon,planetState,moonContext]=await Promise.all([
      resolver.resolve(missionId,planet,jdTdb),
      globalResolver.resolveBodyState(event.moonId,jdTdb),
      globalResolver.resolveBodyState(event.planetId,jdTdb),
      resolver.resolveMoon(missionId,moonName,jdTdb)
    ]);
    if(!context.state||!moon.state||!planetState.state||!moonContext.state)throw Error(`Missing holdout ${event.id}: ${offsets[i]}`);
    const v=context.state;
    const probePlanet=[v.positionKm.x,v.positionKm.y,v.positionKm.z,
      v.velocityKmS.x,v.velocityKmS.y,v.velocityKmS.z];
    const relative=sub(sub(stateVector(moon.state),stateVector(planetState.state)),probePlanet);
    const delta=sub(relative,direct.rows[i].state);
    holdouts.push({eventId:event.id,offsetSeconds:offsets[i],jdTdb,
      positionErrorKm:norm(delta.slice(0,3)),velocityErrorKmS:norm(delta.slice(3)),
      scalarDistanceErrorKm:norm(relative.slice(0,3))-norm(direct.rows[i].state.slice(0,3)),
      directSha256:direct.rawSha256});
    const mc=moonContext.state;
    const moonVector=[mc.positionKm.x,mc.positionKm.y,mc.positionKm.z,
      mc.velocityKmS.x,mc.velocityKmS.y,mc.velocityKmS.z];
    const moonDelta=sub(moonVector,direct.rows[i].state);
    moonHoldouts.push({eventId:event.id,offsetSeconds:offsets[i],jdTdb,
      positionErrorKm:norm(moonDelta.slice(0,3)),velocityErrorKmS:norm(moonDelta.slice(3)),
      scalarDistanceErrorKm:norm(moonVector.slice(0,3))-norm(direct.rows[i].state.slice(0,3)),
      directSha256:direct.rawSha256});
  }
}
const report={geometry:'Direct moon minus probe context validated independently; global trajectory untouched',
  frame:'ECLIPJ2000/ICRF',timeScale:'TDB',units:'km,km/s',aberration:'NONE',
  verifiedOriginalResponses:verifiedRequests,
  testedOffsetsSeconds:[-86400,-3600,-900,-60,0,60,900,3600,86400],
  rows,moonRows,holdouts,moonHoldouts,maxima:{vectorErrorKm:max(r=>r.vectorErrorKm),velocityErrorKmS:max(r=>r.velocityErrorKmS),
    probePlanetVectorErrorKm:max(r=>r.probePlanetVectorErrorKm),
    probePlanetVelocityErrorKmS:max(r=>r.probePlanetVelocityErrorKmS),
    holdoutPositionErrorKm:Math.max(...holdouts.map(r=>r.positionErrorKm)),
    holdoutVelocityErrorKmS:Math.max(...holdouts.map(r=>r.velocityErrorKmS)),
    moonVectorErrorKm:Math.max(...moonRows.map(r=>r.vectorErrorKm)),
    moonVelocityErrorKmS:Math.max(...moonRows.map(r=>r.velocityErrorKmS)),
    moonHoldoutPositionErrorKm:Math.max(...moonHoldouts.map(r=>r.positionErrorKm)),
    moonHoldoutVelocityErrorKmS:Math.max(...moonHoldouts.map(r=>r.velocityErrorKmS))}};
await fs.writeFile(path.join(evidence,'relative-audit.json'),JSON.stringify(report,null,2)+'\n');
for(const r of rows.filter(x=>x.offsetSeconds===0))console.log(r.eventId,r.localContextDistanceKm.toFixed(6),
  'direct',r.horizonsDistanceKm.toFixed(6),'vector m',(r.vectorErrorKm*1000).toFixed(3),
  'velocity m/s',(r.velocityErrorKmS*1000).toFixed(6));
for(const r of moonRows.filter(x=>x.offsetSeconds===0))console.log('direct moon',r.eventId,
  r.correctedDistanceKm.toFixed(6),'vector m',(r.vectorErrorKm*1000).toFixed(3),
  'velocity m/s',(r.velocityErrorKmS*1000).toFixed(6));
console.log('81-epoch maxima',report.maxima);
