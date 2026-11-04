// Capture direct geometric probe/planet states for separate local encounter frames.
// This never alters the global spacecraft, planet or moon datasets.
import fs from 'node:fs/promises';
import path from 'node:path';
import {getHistoricalEventById} from '../src/science/VoyagerHistoricalEvents.js';
import {utcTimestampToTdb} from '../src/science/HistoricalTime.js';
import {root,query,hash} from './voyager-reference-utils.mjs';

const evidence=path.join(root,'evidence/voyager-encounter-context');
const raw=path.join(evidence,'Horizons-original');
const publicFolder=path.join(root,'public/data/historical/encounter-relative');
const catalogPath=path.join(root,'public/data/historical-encounter-contexts-v1.json');
const definitions=[
  {id:'v1-jupiter',missionId:'voyager-1',probeNaifId:'-31',planet:'Jupiter',planetNaifId:'599',events:[
    'v1-callisto-1979','v1-europa-1979','v1-io-encounter-1979','v1-ganymede-1979']},
  {id:'v2-jupiter',missionId:'voyager-2',probeNaifId:'-32',planet:'Jupiter',planetNaifId:'599',events:['v2-europa-1979']},
  {id:'v1-saturn',missionId:'voyager-1',probeNaifId:'-31',planet:'Saturno',planetNaifId:'699',events:['v1-titan-1980']},
  {id:'v2-uranus',missionId:'voyager-2',probeNaifId:'-32',planet:'Urano',planetNaifId:'799',events:['v2-titania-1986','v2-miranda-1986']},
  {id:'v2-neptune',missionId:'voyager-2',probeNaifId:'-32',planet:'Neptuno',planetNaifId:'899',events:['v2-triton-1989']}
];
await fs.mkdir(evidence,{recursive:true});
await fs.mkdir(publicFolder,{recursive:true});
const catalog={version:1,frame:'ICRF_ECLIPTIC_J2000',timeScale:'TDB',units:'km, km/s',correction:'NONE',
  origin:'planet-center',source:'NASA/JPL Horizons direct geometric vectors',contexts:[]};
for(const def of definitions) {
  const dates=def.events.map(id=>{
    const event=getHistoricalEventById(id);
    if(!event)throw Error(`Missing historical event ${id}`);
    return {id,jdTdb:utcTimestampToTdb(event.dateUtc).jdTdb};
  });
  const min=Math.min(...dates.map(x=>x.jdTdb))-1,max=Math.max(...dates.map(x=>x.jdTdb))+1;
  // Grid epochs are TDB minutes from J2000; event times are held out for audit.
  const startMinute=Math.floor((min-2451545)*1440),endMinute=Math.ceil((max-2451545)*1440);
  const minuteIndexes=[];
  for(let minute=startMinute;minute<=endMinute;minute++) {
    const jd=2451545+minute/1440;
    const near=dates.some(x=>Math.abs(jd-x.jdTdb)<=((def.id==='v1-saturn'||def.id==='v2-neptune')?8:3)/24);
    if(near||minute%5===0||minute===startMinute||minute===endMinute) minuteIndexes.push(minute);
  }
  const times=minuteIndexes.map(m=>2451545+m/1440);
  const rows=[];const original=[];
  for(let start=0;start<times.length;start+=60) {
    const batch=times.slice(start,start+60);
    const result=await query(`encounter-${def.id}-${String(start).padStart(5,'0')}`,
      def.probeNaifId,def.planetNaifId,batch,{folder:raw});
    original.push({file:result.rawFile,sha256:result.rawSha256,epochs:batch.length,
      targetHeader:result.targetHeader,centerHeader:result.centerHeader});
    for(const row of result.rows)rows.push([row.jdTdb,...row.state]);
  }
  if(rows.length!==times.length||rows.some((r,i)=>Math.abs(r[0]-times[i])>1e-9))throw Error('Incomplete acquisition');
  const file=`${def.id}.json`;
  const data={format:'voyager-relative-v1',missionId:def.missionId,probeNaifId:def.probeNaifId,
    planet:def.planet,planetNaifId:def.planetNaifId,frame:catalog.frame,
    timeScale:catalog.timeScale,correction:catalog.correction,units:catalog.units,
    source:'JPL Horizons',sourceUrl:'https://ssd.jpl.nasa.gov/api/horizons.api',
    sourceRequests:original,events:dates,series:rows};
  const bytes=Buffer.from(JSON.stringify(data)+'\n');
  const target=path.join(publicFolder,file);
  if(await fs.stat(target).catch(()=>null)) {
    if(hash(await fs.readFile(target))!==hash(bytes))throw Error(`Refusing to overwrite ${target}`);
  } else await fs.writeFile(target,bytes,{flag:'wx'});
  catalog.contexts.push({id:def.id,missionId:def.missionId,probeNaifId:def.probeNaifId,
    planet:def.planet,planetNaifId:def.planetNaifId,eventIds:def.events,
    file:`data/historical/encounter-relative/${file}`,sha256:hash(bytes),
    startJdTdb:rows[0][0],endJdTdb:rows.at(-1)[0],sampleCount:rows.length,
    minIntervalSeconds:60,maxIntervalSeconds:300});
  await fs.writeFile(path.join(evidence,'acquisition-progress.json'),JSON.stringify(catalog,null,2)+'\n');
  console.log(def.id,rows.length,'direct samples');
}
const bytes=Buffer.from(JSON.stringify(catalog,null,2)+'\n');
if(await fs.stat(catalogPath).catch(()=>null)) {
  if(hash(await fs.readFile(catalogPath))!==hash(bytes))throw Error('Refusing to overwrite encounter catalog');
}else await fs.writeFile(catalogPath,bytes,{flag:'wx'});
