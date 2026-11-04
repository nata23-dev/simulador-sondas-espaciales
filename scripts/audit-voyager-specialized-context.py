"""Independently compare archived NAIF encounter kernels with current direct Horizons.

Requires spiceypy. Reads verified original kernels, writes evidence only.
"""
from pathlib import Path
import hashlib
import json
import math
import spiceypy as sp

ROOT=Path(__file__).resolve().parents[1]
OLD=ROOT/'evidence/stage2-3/Kernels'
NEW=ROOT/'evidence/voyager-encounter-context/Kernels'
OUT=ROOT/'evidence/voyager-encounter-context/specialized-audit.json'
EVENTS=ROOT/'evidence/voyager-reference-reconciliation/encounters.json'
KERNELS={
    'v1-io-encounter-1979':['vgr1_jup230.bsp'],
    'v1-europa-1979':['vgr1_jup230.bsp'],
    'v1-ganymede-1979':['vgr1_jup230.bsp'],
    'v1-callisto-1979':['vgr1_jup230.bsp'],
    'v1-titan-1980':['vgr1_sat337.bsp','sat337.bsp'],
    'v2-europa-1979':['vgr2_jup230.bsp'],
    'v2-titania-1986':['vgr2.ura182.bsp'],
    'v2-miranda-1986':['vgr2.ura182.bsp'],
    'v2-triton-1989':['vgr2_nep097.bsp']
}

def verified(name):
    path=(NEW if name=='sat337.bsp' else OLD)/name
    metadata=json.loads(Path(str(path)+'.request.json').read_text(encoding='utf8'))
    actual=hashlib.sha256(path.read_bytes()).hexdigest()
    if actual!=metadata['sha256'] or metadata['httpStatus']!=200:
        raise ValueError(f'Kernel hash/HTTP mismatch: {path}')
    return path,{'file':str(path.relative_to(ROOT)).replace('\\','/'),
                 'url':metadata['url'],'sha256':actual,'bytes':path.stat().st_size}

def segments(path):
    handle=sp.dafopr(str(path));sp.dafbfs(handle);rows=[]
    while sp.daffna():
        bounds,ids=sp.dafus(sp.dafgs(),2,6)
        rows.append({'target':int(ids[0]),'center':int(ids[1]),
                     'frameId':int(ids[2]),'type':int(ids[3]),
                     'startEt':float(bounds[0]),'endEt':float(bounds[1])})
    sp.dafcls(handle)
    return rows

def norm(values):return math.hypot(*values)

def main():
    events=json.loads(EVENTS.read_text(encoding='utf8'))['events']
    source={};results=[]
    for event in events:
        names=KERNELS[event['id']]
        paths=[]
        for name in names:
            path,meta=verified(name);paths.append(path)
            if name not in source:source[name]={**meta,'segments':segments(path)}
        sp.kclear()
        sp.furnsh(str(OLD/'naif0012.tls'))
        for path in paths:sp.furnsh(str(path))
        # A direct state is computable only if the kernel chain includes the moon.
        sample=next(row for row in event['samples'] if row['offsetSeconds']==0)
        et=(sample['jdTdb']-2451545)*86400
        try:
            actual=list(sp.spkezr(event['moonId'],et,'ECLIPJ2000','NONE',event['probeId'])[0])
            expected=sample['references']['direct']
            delta=[a-b for a,b in zip(actual,expected)]
            result={'status':'computable','distanceKm':norm(actual[:3]),
                    'distanceDifferenceKm':norm(actual[:3])-sample['directDistanceKm'],
                    'positionErrorKm':norm(delta[:3]),'velocityErrorKmS':norm(delta[3:])}
        except sp.utils.exceptions.SpiceyError as exc:
            result={'status':'missing_compatible_moon_segment',
                    'reason':str(exc).splitlines()[0],
                    'note':'jup230-short.bsp is ~98.75 MB; direct Horizons vector retained as smaller verified derivative'}
        results.append({'eventId':event['id'],'dateUtc':event['dateUtc'],
                        'probeId':event['probeId'],'moonId':event['moonId'],
                        'loadOrder':names,'horizonsDistanceKm':sample['directDistanceKm'],**result})
    report={'toolkit':sp.tkvrsn('TOOLKIT'),'spiceypy':sp.__version__,
            'frame':'ECLIPJ2000','timeScale':'TDB/ET','aberration':'NONE',
            'units':'km, km/s','source':source,'events':results,
            'comparison':'Specialized SPK relative moon-probe versus independent current Horizons direct at identical catalog epoch'}
    OUT.write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
    for row in results:
        print(row['eventId'],row['status'],row.get('positionErrorKm'),row.get('velocityErrorKmS'))

if __name__=='__main__':main()
