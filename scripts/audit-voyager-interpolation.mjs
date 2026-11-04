// Compare the actual production interpolator to interior SPICE states.
import fs from 'node:fs/promises';
import path from 'node:path';
import {interpolateHermiteState} from '../src/science/HermiteInterpolation.js';
import {HORIZONS_FRAME} from '../src/science/Frames.js';
import {output,stateVector,sub,norm,hash} from './voyager-reference-utils.mjs';

const bytes=await fs.readFile(path.join(output,'spk-interpolation-inputs.json'));
const inputs=JSON.parse(bytes);
function state(probeId,jdTdb,v) {
  return {identity:{id:probeId,type:'probe',origin:HORIZONS_FRAME.origin},
    time:{jdTdb,scale:'TDB'},reference:HORIZONS_FRAME,
    position:{x:v[0],y:v[1],z:v[2],unit:'km'},velocity:{x:v[3],y:v[4],z:v[5],unit:'km/s'},
    provenance:{source:'NAIF original SPK / CSPICE',sourceUrl:null,version:'CSPICE_N0067',
      queriedAtUtc:null,precision:null,uncertainty:null,sourceMetadata:{}}};
}
const summaries=[];
for(const group of inputs) {
  const rows=[];
  for(const interval of group.intervals) {
    const a=state(group.probeId,interval.firstJdTdb,interval.first);
    const b=state(group.probeId,interval.lastJdTdb,interval.last);
    for(const check of interval.checks) {
      const value=stateVector(interpolateHermiteState(a,b,check.jdTdb));
      const delta=sub(value,check.state);
      rows.push({jdTdb:check.jdTdb,positionResidualKm:norm(delta.slice(0,3)),velocityResidualKmS:norm(delta.slice(3))});
    }
  }
  const worst=rows.reduce((a,b)=>a.positionResidualKm>b.positionResidualKm?a:b);
  summaries.push({eventId:group.eventId,probeId:group.probeId,stepSeconds:group.stepSeconds,
    productionStepSeconds:group.productionStepSeconds,count:rows.length,worstPosition:worst,
    maxVelocityResidualKmS:Math.max(...rows.map(r=>r.velocityResidualKmS)),
    checkedStartJdTdb:rows[0].jdTdb,checkedEndJdTdb:rows.at(-1).jdTdb});
  console.log(group.eventId,group.stepSeconds,'seconds',worst.positionResidualKm.toFixed(6),'km');
}
await fs.writeFile(path.join(output,'interpolation.json'),JSON.stringify({
  method:'Production JS Hermite vs original SPICE heliocentric states, 1/4, 1/2, 3/4 of each interval within +/-2h; alternate cadences are diagnostic only.',
  sourceInputSha256:hash(bytes),summaries},null,2)+'\n');
