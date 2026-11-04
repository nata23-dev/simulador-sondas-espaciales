import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { MOONS } from '../src/science/PlanetaryMoons.js';
import { KM_PER_AU } from '../src/science/Units.js';

const root=path.resolve(import.meta.dirname,'..');
const rawDir=path.join(root,'evidence/stage4/Horizons-original');
const planetData=JSON.parse(await fs.readFile(path.join(root,'public/data/efemerides-2026.json')));
const moonData=JSON.parse(await fs.readFile(path.join(root,'public/data/moons-2026-10.json')));
async function get(id,center,tag){
  const rawFile=path.join(rawDir,`${tag}-absolute-check.json`);
  const params={format:'json',OBJ_DATA:"'NO'",MAKE_EPHEM:"'YES'",EPHEM_TYPE:"'VECTORS'",COMMAND:`'${id}'`,CENTER:`'500@${center}'`,START_TIME:"'2026-10-10 00:00 TDB'",STOP_TIME:"'2026-10-10 00:01'",STEP_SIZE:"'1 m'",TIME_TYPE:"'TDB'",REF_PLANE:"'ECLIPTIC'",REF_SYSTEM:"'ICRF'",OUT_UNITS:"'KM-S'",VEC_TABLE:"'2'",VEC_LABELS:"'NO'",VEC_CORR:"'NONE'",CSV_FORMAT:"'YES'"};
  const url=`https://ssd.jpl.nasa.gov/api/horizons.api?${new URLSearchParams(params)}`;
  let bytes;
  try{bytes=await fs.readFile(rawFile);}catch(e){if(e.code!=='ENOENT')throw e;const r=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error(`HTTP ${r.status}`);bytes=Buffer.from(await r.arrayBuffer());await fs.writeFile(rawFile,bytes,{flag:'wx'});}
  const data=JSON.parse(bytes);if(data.error||!data.result?.includes('$$SOE'))throw Error(data.error??'No vectors');
  const t=data.result.match(/^Target body name:\s*(.+)$/m)?.[1],c=data.result.match(/^Center body name:\s*(.+)$/m)?.[1];
  if(!t?.includes(`(${id})`)||!c?.includes(`(${center})`))throw Error(`${tag}: ${t} / ${c}`);
  const line=data.result.split('$$SOE')[1].split('$$EOE')[0].trim().split(/\r?\n/)[0];
  const cols=line.split(',').map(s=>s.trim()),values=cols.slice(2,8).map(Number);
  if(values.length!==6||values.some(n=>!Number.isFinite(n)))throw Error(line);
  return {values,source:{url,rawFile:path.relative(root,rawFile).replaceAll('\\','/'),sha256:crypto.createHash('sha256').update(bytes).digest('hex'),target:t,center:c}};
}
const result={epoch:'2026-10-10 00:00 TDB',frame:'ICRF Ecliptic J2000',units:'km, km/s',rows:[]};
for(const [key,moon] of Object.entries(MOONS)){
  const target=await get(moon.id,'10',`${key}-sun`),planet=await get(moon.center,'10',`${key}-planet-sun`);
  const direct=moonData.moons[key].rows.find(row=>Math.abs(row[0]-2461323.5)<1e-8);
  if(!direct)throw Error(`Missing local ${key}`);
  const diff=target.values.map((v,i)=>v-planet.values[i]);
  const localPlanet=planetData.planetas[moon.parent][9];
  const local=[...Object.values(localPlanet.posicionAU).map(n=>n*KM_PER_AU),...Object.values(localPlanet.velocidadAUporDia).map(n=>n*KM_PER_AU/86400)];
  const norm=a=>Math.hypot(...a);
  const row={moon:key,naif:moon.id,parentCenter:moon.center,
    heliocentricDifferenceVsDirectRelativeKm:norm(diff.slice(0,3).map((v,i)=>v-direct[i+1])),
    heliocentricDifferenceVsDirectRelativeKmS:norm(diff.slice(3).map((v,i)=>v-direct[i+4])),
    localPlanetVsCurrentHorizonsPlanetKm:norm(local.slice(0,3).map((v,i)=>v-planet.values[i])),
    localPlanetVsCurrentHorizonsPlanetKmS:norm(local.slice(3).map((v,i)=>v-planet.values[i+3])),
    absoluteMoonPlacementVsCurrentHorizonsKm:norm(local.slice(0,3).map((v,i)=>v+direct[i+1]-target.values[i])),
    sources:[target.source,planet.source]};
  result.rows.push(row);console.log(key,row.heliocentricDifferenceVsDirectRelativeKm,row.localPlanetVsCurrentHorizonsPlanetKm,row.absoluteMoonPlacementVsCurrentHorizonsKm);
}
await fs.writeFile(path.join(root,'evidence/stage4/absolute-frame-audit.json'),JSON.stringify(result,null,2)+'\n');
