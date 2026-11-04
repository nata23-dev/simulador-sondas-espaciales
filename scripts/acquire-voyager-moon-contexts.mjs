// Direct moon-minus-spacecraft vectors, kept apart from the global trajectory.
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
  ['v1-io-encounter-1979','voyager-1','-31','Io','501','Jupiter'],
  ['v1-europa-1979','voyager-1','-31','Europa','502','Jupiter'],
  ['v1-ganymede-1979','voyager-1','-31','Ganymede','503','Jupiter'],
  ['v1-callisto-1979','voyager-1','-31','Callisto','504','Jupiter'],
  ['v1-titan-1980','voyager-1','-31','Titan','606','Saturno'],
  ['v2-europa-1979','voyager-2','-32','Europa','502','Jupiter'],
  ['v2-titania-1986','voyager-2','-32','Titania','703','Urano'],
  ['v2-miranda-1986','voyager-2','-32','Miranda','705','Urano'],
  ['v2-triton-1989','voyager-2','-32','Triton','801','Neptuno']
];
const catalog=JSON.parse(await fs.readFile(catalogPath,'utf8'));
if(catalog.version!==1||catalog.origin!=='planet-center'||!Array.isArray(catalog.contexts))throw Error('Existing catalog changed');
catalog.moonContexts=[];
await fs.mkdir(publicFolder,{recursive:true});
for(const [eventId,missionId,probeNaifId,moon,moonNaifId,planet] of definitions) {
  const event=getHistoricalEventById(eventId);
  if(!event)throw Error(`Missing event ${eventId}`);
  const eventJdTdb=utcTimestampToTdb(event.dateUtc).jdTdb;
  const denseHours=['v1-titan-1980','v2-triton-1989'].includes(eventId)?8:4;
  const startMinute=Math.floor((eventJdTdb-1-2451545)*1440);
  const endMinute=Math.ceil((eventJdTdb+1-2451545)*1440);
  const times=[];
  for(let minute=startMinute;minute<=endMinute;minute++) {
    const jd=2451545+minute/1440;
    if(Math.abs(jd-eventJdTdb)<=denseHours/24||minute%5===0||minute===startMinute||minute===endMinute)times.push(jd);
  }
  const rows=[],requests=[];
  for(let start=0;start<times.length;start+=60) {
    const batch=times.slice(start,start+60);
    const result=await query(`moon-${eventId}-${String(start).padStart(5,'0')}`,
      moonNaifId,probeNaifId,batch,{folder:raw});
    requests.push({file:result.rawFile,sha256:result.rawSha256,epochs:batch.length,
      targetHeader:result.targetHeader,centerHeader:result.centerHeader});
    for(const r of result.rows)rows.push([r.jdTdb,...r.state]);
  }
  if(rows.length!==times.length||rows.some((r,i)=>Math.abs(r[0]-times[i])>1e-9))throw Error(`Incomplete ${eventId}`);
  const data={format:'voyager-moon-relative-v1',eventId,missionId,probeNaifId,
    moon,moonNaifId,planet,origin:'probe-center',frame:catalog.frame,
    timeScale:catalog.timeScale,correction:catalog.correction,units:catalog.units,
    source:'JPL Horizons',sourceUrl:'https://ssd.jpl.nasa.gov/api/horizons.api',
    sourceRequests:requests,series:rows};
  const bytes=Buffer.from(JSON.stringify(data)+'\n');
  const file=`moon-${eventId}.json`,dest=path.join(publicFolder,file);
  if(await fs.stat(dest).catch(()=>null)) {
    if(hash(await fs.readFile(dest))!==hash(bytes))throw Error(`Refusing to overwrite ${file}`);
  } else await fs.writeFile(dest,bytes,{flag:'wx'});
  catalog.moonContexts.push({id:eventId,eventId,missionId,probeNaifId,moon,moonNaifId,planet,
    file:`data/historical/encounter-relative/${file}`,sha256:hash(bytes),
    startJdTdb:rows[0][0],endJdTdb:rows.at(-1)[0],sampleCount:rows.length,
    minIntervalSeconds:60,maxIntervalSeconds:300});
  await fs.writeFile(path.join(evidence,'moon-acquisition-progress.json'),JSON.stringify(catalog.moonContexts,null,2)+'\n');
  console.log(eventId,rows.length,'direct moon–probe states');
}
const previous=JSON.parse(await fs.readFile(catalogPath,'utf8'));
if(JSON.stringify(previous.contexts)!==JSON.stringify(catalog.contexts))throw Error('Planet context changed during moon acquisition');
await fs.writeFile(catalogPath,JSON.stringify(catalog,null,2)+'\n');
