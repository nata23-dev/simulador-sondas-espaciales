// Offline evidence summary and preservation check. Never writes public data.
import fs from 'node:fs/promises';
import path from 'node:path';
import {root,output,hash} from './voyager-reference-utils.mjs';

const read=async file=>JSON.parse(await fs.readFile(path.join(output,file),'utf8'));
const inventory=await read('input-inventory.json');
const encounters=await read('encounters.json');
const spk=await read('spk-audit.json');
const global=await read('global-continuity.json');
const interpolation=await read('interpolation.json');
const dataPreservation=[];
for(const entry of inventory) {
  const actual=hash(await fs.readFile(path.join(root,'public',entry.file)));
  if(actual!==entry.sha256) throw Error(`Changed production ephemeris: ${entry.file}`);
  dataPreservation.push({file:entry.file,sha256:actual,unchanged:true});
}
const requests=[];
for(const folder of ['Horizons-original','Kernels','Sources']) {
  for(const name of (await fs.readdir(path.join(output,folder))).filter(n=>n.endsWith('.request.json'))) {
    const meta=JSON.parse(await fs.readFile(path.join(output,folder,name),'utf8'));
    const rawName=name.replace(/\.request\.json$/,folder==='Horizons-original'?'.json':'');
    const bytes=await fs.readFile(path.join(output,folder,rawName));
    if(hash(bytes)!==meta.sha256||meta.httpStatus!==200) throw Error(`Invalid original: ${name}`);
    requests.push({file:`${folder}/${name}`,sha256:meta.sha256,url:meta.url});
  }
}
const names=['V1–Ío','V1–Europa','V1–Ganímedes','V1–Calisto','V1–Titán','V2–Europa','V2–Titania','V2–Miranda','V2–Tritón'];
const rows=encounters.events.map((e,i)=>{
  const r=e.samples.find(r=>r.offsetSeconds===0);
  return {encounter:names[i],eventId:e.id,utc:e.dateUtc,jdTdb:e.time.jdTdb,labelTdb:r.labelTdb,
    probeNaifId:e.probeId,targetNaifId:e.moonId,localDistanceKm:r.local.distanceKm,
    horizonsDistanceKm:r.directDistanceKm,differenceKm:r.signedDistanceErrorKm,vectorErrorKm:r.residual.positionKm,
    localRelativeSpeedKmS:r.local.relativeSpeedKmS,horizonsRelativeSpeedKmS:r.directRelativeSpeedKmS,
    velocityErrorKmS:r.residual.velocityKmS,status:'PENDIENTE: trayectoria de producción sin reconciliar'};
});
const fields=Object.keys(rows[0]);
const csv=[fields.join(','),...rows.map(r=>fields.map(f=>JSON.stringify(r[f])).join(','))].join('\n')+'\n';
await fs.writeFile(path.join(output,'encounter-comparison.csv'),csv);
const samples=encounters.events.flatMap(e=>e.samples);
const max=(rows,fn)=>Math.max(...rows.map(fn));
async function logText(file) {
  const bytes=await fs.readFile(path.join(output,file));
  return bytes.toString(bytes[0]===255&&bytes[1]===254?'utf16le':'utf8');
}
const testLog=await logText('focused-tests.txt'),buildLog=await logText('build.txt');
if(!/pass 4\b/.test(testLog)||!/fail 0\b/.test(testLog)||!/built in /.test(buildLog)) {
  throw Error('Expected successful focused-test/build logs are missing');
}
const summary={status:'NOT_RECONCILED',dataPreservation,verifiedOriginalRequests:requests,
  encounterRows:rows,
  diagnostics:{encounterEpochs:samples.length,
    commonBarycenterClosureKm:max(samples,r=>r.commonBarycenterClosure.positionKm),
    commonBarycenterClosureKmS:max(samples,r=>r.commonBarycenterClosure.velocityKmS),
    spkHorizonsDirectMaxKm:max(spk.encounters.flatMap(e=>e.samples),r=>r.spkVsHorizonsDirect.positionKm),
    spkHorizonsDirectMaxKmS:max(spk.encounters.flatMap(e=>e.samples),r=>r.spkVsHorizonsDirect.velocityKmS),
    utcTdbMaxSeconds:max(spk.encounters,e=>Math.abs(e.utcTdbResidualSeconds)),
    sourceChainClosureMaxKm:max(spk.encounters.flatMap(e=>e.samples),r=>r.sourceShiftClosure.positionKm),
    wholeSpanEpochs:global.wholeSpan.reduce((n,g)=>n+g.rows.length,0),
    nativeCenterBoundaries:global.nativeBoundaries.length,
    refitHandoffs:global.handoffs.length,alternativeKernels:spk.alternativeSolutions.length,
    hermiteInteriorComparisons:interpolation.summaries.reduce((n,s)=>n+s.count,0)},
  acceptance:{sameChainComparison:'PASS at the 81 checked encounter epochs',
    productionRelativeVectors:'FAIL for all nine event epochs',
    globalContinuousReconciliation:'FAIL for tested native-center rebasing and specialized-kernel overlays',
    gapStateEpoch:'PASS: transition returns null, never a different-epoch state'},
  checks:{focusedTests:{count:4,passed:4,log:'focused-tests.txt'},
    build:{exitCode:0,warning:'Existing bundle size exceeds 500 kB',log:'build.txt'},
    independentGeminiValidation:'not performed in this task'}};
await fs.writeFile(path.join(output,'summary.json'),JSON.stringify(summary,null,2)+'\n');
const table=['| Encuentro | UTC | Local km | Horizons km | Diferencia km | Error vectorial km | Estado |',
  '|---|---|---:|---:|---:|---:|---|',...rows.map(r=>`| ${r.encounter} | ${r.utc.replace('T',' ').replace('Z','')} | ${r.localDistanceKm.toFixed(3)} | ${r.horizonsDistanceKm.toFixed(3)} | ${r.differenceKm.toFixed(3)} | ${r.vectorErrorKm.toFixed(3)} | Pendiente |`)].join('\n');
await fs.writeFile(path.join(output,'encounter-comparison.md'),table+'\n');
console.log(table);
console.log(JSON.stringify(summary.diagnostics,null,2));
console.log(`Preserved production datasets: ${dataPreservation.length}; verified original requests: ${requests.length}`);
