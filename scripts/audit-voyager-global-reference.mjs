// Targeted whole-span and native-center transition checks. Evidence only.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHistoricalEphemerisResolver} from '../src/science/HistoricalEphemerisResolver.js';
import {HISTORICAL_MISSIONS_CATALOG} from '../src/science/VoyagerHistoricalMissions.js';
import {gregorianTimestampToJdTdb} from '../src/science/Time.js';
import {output,readPublic,query,norm,sub,add,stateVector} from './voyager-reference-utils.mjs';

const spk=JSON.parse(await fs.readFile(path.join(output,'spk-audit.json'),'utf8'));
const catalog=await readPublic('data/historical-ephemerides-catalog-v1.json');
const resolver=createHistoricalEphemerisResolver({loadJson:readPublic,catalog});
const residual=(before,after,dt)=>norm(after.slice(0,3).map((v,i)=>v-before[i]-dt*(before[i+3]+after[i+3])/2));
const report={nativeBoundaries:[],handoffs:[],wholeSpan:[]};
for(let i=0;i<spk.nativeBoundaries.length;i++) {
  const b=spk.nativeBoundaries[i];
  const times=b.samples.map(r=>r.jdTdb);
  const center=String(b.fromCenter===10?b.toCenter:b.fromCenter);
  const label=`boundary-${b.probeId}-${i}`;
  const spacecraft=await query(`${label}-probeSun`,b.probeId,'10',times);
  let modern;
  if(center==='399') modern=(await query(`${label}-centerSun`,center,'10',times)).rows.map(r=>r.state);
  else {
    const planet={5:'599',6:'699',7:'799',8:'899'}[center];
    const ps=await query(`${label}-planetSun`,planet,'10',times);
    const pb=await query(`${label}-planetBary`,planet,center,times);
    modern=ps.rows.map((r,j)=>sub(r.state,pb.rows[j].state));
  }
  const rows=b.samples.map((r,j)=>({ ...r, horizonsProbeSun:spacecraft.rows[j].state,
    rebasedProbeSun:r.nativeCenter===10?r.oldProbeSun:add(r.oldProbeSun,sub(modern[j],r.oldCenterSun)) }));
  const dt=rows[3].et-rows[1].et;
  report.nativeBoundaries.push({...b,samples:rows,
    oldPositionJoinKm:residual(rows[1].oldProbeSun,rows[3].oldProbeSun,dt),
    oldVelocityJoinKmS:norm(sub(rows[3].oldProbeSun.slice(3),rows[1].oldProbeSun.slice(3))),
    horizonsPositionJoinKm:residual(rows[1].horizonsProbeSun,rows[3].horizonsProbeSun,dt),
    rebasedPositionJoinKm:residual(rows[1].rebasedProbeSun,rows[3].rebasedProbeSun,dt),
    rebasedVelocityJoinKmS:norm(sub(rows[3].rebasedProbeSun.slice(3),rows[1].rebasedProbeSun.slice(3)))});
}
for(const handoff of spk.handoffs) {
  const t=handoff.boundaryJdTdb;
  const offsets=[-60,-1,0,1,30,59,60];
  const times=offsets.map(s=>t+s/86400);
  const direct=await query(`handoff-${handoff.probeId}-sun`,handoff.probeId,'10',times);
  const mission=handoff.probeId==='-31'?'voyager-1':'voyager-2';
  const local=[];
  for(const jd of times) {
    const r=await resolver.resolveProbeState(mission,jd);
    local.push({jdTdb:jd,status:r.status,isRealData:r.isRealData,state:stateVector(r.state),
      stateJdTdb:r.state?.time.jdTdb??null,stateTimeMismatchSeconds:r.state?(jd-r.state.time.jdTdb)*86400:null});
  }
  report.handoffs.push({...handoff,direct,local,
    horizonsPositionJoinKm:residual(direct.rows[1].state,direct.rows[3].state,(times[3]-times[1])*86400),
    horizonsVelocityJoinKmS:norm(sub(direct.rows[3].state.slice(3),direct.rows[1].state.slice(3)))});
}
for(const mission of Object.values(HISTORICAL_MISSIONS_CATALOG)) {
  const times=[mission.firstValidJdTdb,mission.firstValidJdTdb+600/86400];
  for(let year=1978;year<=2026;year++) {
    times.push(gregorianTimestampToJdTdb(`${year}-07-02 12:34:56`));
    if(year<=(mission.naifId==='-31'?1981:1989)) {
      for(const month of ['01','04','10']) times.push(gregorianTimestampToJdTdb(`${year}-${month}-15 12:34:56`));
    }
  }
  for(const e of catalog.datasets.filter(e=>e.bodyIds.includes(mission.naifId))) {
    const c=e.bodyCoverage?.[mission.naifId]??e.coverage;
    for(const t of [c.startJdTdb,c.endJdTdb]) {
      for(const seconds of [-1,0,1]) if(t+seconds/86400>=mission.firstValidJdTdb && t+seconds/86400<=2461346.5) times.push(t+seconds/86400);
    }
  }
  const sorted=[...new Set(times)].sort((a,b)=>a-b);
  const rows=[];
  for(let start=0;start<sorted.length;start+=60) {
    const batch=sorted.slice(start,start+60);
    const reference=await query(`global-${mission.naifId}-${start}`,mission.naifId,'10',batch);
    for(let i=0;i<batch.length;i++) {
      const r=await resolver.resolveProbeState(mission.id,batch[i]);
      const local=stateVector(r.state),direct=reference.rows[i].state;
      rows.push({jdTdb:batch[i],labelTdb:reference.rows[i].labelTdb,datasetId:r.datasetId,
        status:r.status,stateTimeMismatchSeconds:r.state?(batch[i]-r.state.time.jdTdb)*86400:null,
        local,direct,positionResidualKm:local?norm(sub(local.slice(0,3),direct.slice(0,3))):null,
        velocityResidualKmS:local?norm(sub(local.slice(3),direct.slice(3))):null});
    }
  }
  const boundaryChecks=[];
  const boundaries=new Set(catalog.datasets.filter(e=>e.bodyIds.includes(mission.naifId)).flatMap(e=>{
    const c=e.bodyCoverage?.[mission.naifId]??e.coverage;
    return [c.startJdTdb,c.endJdTdb];
  }));
  for(const boundary of boundaries) {
    const a=rows.find(r=>r.jdTdb===boundary-1/86400);
    const b=rows.find(r=>r.jdTdb===boundary+1/86400);
    if(!a||!b) continue;
    const dt=(b.jdTdb-a.jdTdb)*86400;
    boundaryChecks.push({boundaryJdTdb:boundary,beforeDataset:a.datasetId??null,afterDataset:b.datasetId??null,
      beforeStatus:a.status,afterStatus:b.status,
      localPositionJoinKm:a.local&&b.local?residual(a.local,b.local,dt):null,
      localVelocityChangeOver2SecondsKmS:a.local&&b.local?norm(sub(b.local.slice(3),a.local.slice(3))):null,
      horizonsPositionJoinKm:residual(a.direct,b.direct,dt),
      horizonsVelocityChangeOver2SecondsKmS:norm(sub(b.direct.slice(3),a.direct.slice(3)))});
  }
  report.wholeSpan.push({missionId:mission.id,probeId:mission.naifId,rows,boundaryChecks});
}
await fs.writeFile(path.join(output,'global-continuity.json'),JSON.stringify(report,null,2)+'\n');
for(const b of report.nativeBoundaries) console.log(b.probeId,b.boundaryTdb,'old',b.oldPositionJoinKm.toFixed(6),'rebased',b.rebasedPositionJoinKm.toFixed(3),'km');
for(const h of report.handoffs) console.log('Horizons handoff',h.probeId,h.horizonsPositionJoinKm.toFixed(3),'km');
for(const g of report.wholeSpan) {
  const valid=g.rows.filter(r=>r.local&&Math.abs(r.stateTimeMismatchSeconds)<0.0001);
  console.log(g.probeId,'whole-span samples',g.rows.length,'worst same-time interpolation km',Math.max(...valid.map(r=>r.positionResidualKm)));
}
