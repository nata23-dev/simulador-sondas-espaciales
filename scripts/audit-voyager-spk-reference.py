"""Read original NAIF segments and compare them with the Horizons audit.

Requires spiceypy==8.3.0. Writes evidence only; never changes simulator data.
Run before audit-voyager-global-reference.mjs to export native-center boundaries.
"""
from pathlib import Path
import hashlib
import json
import math
import urllib.request
from datetime import datetime, timezone
import spiceypy as sp

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'evidence/voyager-reference-reconciliation'
OLD = ROOT / 'evidence/stage2-3/Kernels'
NEW = OUT / 'Kernels'
TLS = OLD / 'naif0012.tls'
MERGED = {'-31': 'Voyager_1.a54206u_V0.2_merged.bsp', '-32': 'Voyager_2.m05016u.merged.bsp'}
REFIT = {'-31': 'vgr1.x2100.bsp', '-32': 'vgr2.x2100.bsp'}
HANDOFF = {'-31': '1981 JAN 01 00:00:00 TDB', '-32': '1989 AUG 29 08:00:00 TDB'}
SPECIAL = {'-31':['vgr1_jup230.bsp','vgr1_sat337.bsp'],
           '-32':['vgr2_jup230.bsp','vgr2_sat337.bsp','vgr2.ura182.bsp','vgr2_nep097.bsp']}

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def verified(p):
    metadata = json.loads(p.with_name(p.name+'.request.json').read_text(encoding='utf8'))
    if sha(p) != metadata['sha256'] or metadata['httpStatus'] != 200:
        raise ValueError(f'Kernel verification failed: {p}')

def acquire(name):
    NEW.mkdir(parents=True, exist_ok=True)
    dest=NEW/name
    if not dest.exists():
        url='https://naif.jpl.nasa.gov/pub/naif/VOYAGER/kernels/spk/'+name
        with urllib.request.urlopen(url, timeout=90) as response:
            data=response.read()
            meta={'url':url,'httpStatus':response.status,'bytes':len(data),
                  'sha256':hashlib.sha256(data).hexdigest(),'acquiredAtUtc':datetime.now(timezone.utc).isoformat()}
        dest.write_bytes(data)
        dest.with_name(dest.name+'.request.json').write_text(json.dumps(meta,indent=2)+'\n',encoding='utf8')
    verified(dest)
    return dest

def load(*paths):
    sp.kclear()
    sp.furnsh(str(TLS))
    for p in paths: sp.furnsh(str(p))

def state(target, center, et):
    return list(sp.spkezr(str(target),et,'ECLIPJ2000','NONE',str(center))[0])

def sub(a,b): return [x-y for x,y in zip(a,b)]
def metrics(v): return {'positionKm':math.hypot(*v[:3]),'velocityKmS':math.hypot(*v[3:])}

def inventory(p):
    h=sp.dafopr(str(p))
    comments=[]
    while True:
        n,lines,done=sp.dafec(h,100,1000)
        comments.extend(lines[:n])
        if done: break
    sp.dafbfs(h)
    segments=[]
    while sp.daffna():
        dc,ic=sp.dafus(sp.dafgs(),2,6)
        segments.append({'target':int(ic[0]),'center':int(ic[1]),'frameId':int(ic[2]),
                         'frameName':sp.frmnam(int(ic[2])),'type':int(ic[3]),'startEt':float(dc[0]),
                         'endEt':float(dc[1]),'startTdb':sp.etcal(dc[0]),'endTdb':sp.etcal(dc[1]),'id':sp.dafgn()})
    sp.dafcls(h)
    (OUT/(p.name+'.comments.txt')).write_text('\n'.join(comments)+'\n',encoding='utf8')
    return {'file':str(p.relative_to(ROOT)).replace('\\','/'),'sha256':sha(p),'segments':segments}

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    for p in [TLS,*(OLD/n for n in MERGED.values()),*(OLD/n for names in SPECIAL.values() for n in names)]: verified(p)
    for name in REFIT.values(): acquire(name)
    load()
    kernels=[inventory(p) for p in [*(OLD/n for n in MERGED.values()),*(NEW/n for n in REFIT.values())]]
    report={'toolkit':sp.tkvrsn('TOOLKIT'),'spiceypy':sp.__version__,'frame':'ECLIPJ2000','correction':'NONE',
            'kernels':kernels,'encounters':[],'nativeBoundaries':[],'handoffs':[],'alternativeSolutions':[]}
    events=json.loads((OUT/'encounters.json').read_text(encoding='utf8'))['events']
    for event in events:
        probe=event['probeId']; load(OLD/MERGED[probe])
        et_utc=sp.str2et(event['dateUtc'])
        converted=(event['time']['jdTdb']-2451545.0)*86400
        samples=[]
        for row in event['samples']:
            et=(row['jdTdb']-2451545.0)*86400
            old=state(probe,'10',et); bary=state(event['barycenterId'],'10',et)
            native=state(probe,event['barycenterId'],et)
            ref=row['references']
            direct=[x-y for x,y in zip(ref['moonBary'],native)]
            samples.append({'jdTdb':row['jdTdb'],'spkProbeSun':old,'spkBarySun':bary,'spkProbeBary':native,
              'spkVsHorizonsProbe':metrics(sub(old,ref['probeSun'])),
              'spkVsHorizonsNative':metrics(sub(native,ref['probeBary'])),
              'spkVsHorizonsDirect':metrics(sub(direct,ref['direct'])),
              'sourceShiftFromKernels':sub(sub(ref['planetSun'],ref['planetBary']),bary),
              'sourceShiftClosure':metrics(sub(sub(sub(ref['planetSun'],ref['planetBary']),bary),row['sourceShift']))})
        report['encounters'].append({'id':event['id'],'dateUtc':event['dateUtc'],
            'utcTdbResidualSeconds':converted-et_utc,'samples':samples})
    for probe,name in MERGED.items():
        load(OLD/name)
        cutoff=sp.str2et(HANDOFF[probe])
        relevant=sorted([s for k in kernels if k['file'].endswith(name) for s in k['segments'] if str(s['target'])==probe],key=lambda s:s['startEt'])
        for a,b in zip(relevant,relevant[1:]):
            boundary=a['endEt']
            if boundary>=cutoff or a['center']==b['center']: continue
            times=[boundary-60,boundary-1,boundary,boundary+1,boundary+60]
            rows=[]
            for et in times:
                active=sp.dafus(sp.spksfs(int(probe),et,80)[1],2,6)[1]
                rows.append({'et':et,'jdTdb':2451545+et/86400,'nativeCenter':int(active[1]),
                             'oldProbeSun':state(probe,'10',et),
                             'oldCenterSun':state(active[1],'10',et) if active[1]!=10 else [0.0]*6})
            report['nativeBoundaries'].append({'probeId':probe,'fromCenter':a['center'],'toCenter':b['center'],
                'boundaryEt':boundary,'boundaryUtc':sp.et2utc(boundary,'ISOC',6),'boundaryTdb':sp.etcal(boundary),'samples':rows})
        # Reproduce the actual Horizons 2022 solution selection, independently.
        before=state(probe,'10',cutoff-1)
        load(OLD/name,NEW/REFIT[probe])
        after=state(probe,'10',cutoff+1)
        report['handoffs'].append({'probeId':probe,'boundaryJdTdb':2451545+cutoff/86400,
            'labelTdb':HANDOFF[probe],'before':before,'after':after,
            'positionJumpResidualKm':math.hypot(*[after[i]-before[i]-(after[i+3]+before[i+3]) for i in range(3)]),
            'velocityJumpKmS':math.hypot(*sub(after[3:],before[3:]))})
    for probe,names in SPECIAL.items():
        for name in names:
            kernel=inventory(OLD/name)
            kernels.append(kernel)
            segments=[s for s in kernel['segments'] if str(s['target'])==probe]
            joins=[]
            for edge in [min(s['startEt'] for s in segments),max(s['endEt'] for s in segments)]:
                load(OLD/MERGED[probe],OLD/name)
                a=state(probe,'10',edge-1); b=state(probe,'10',edge+1)
                joins.append({'boundaryTdb':sp.etcal(edge),
                  'positionJoinResidualKm':math.hypot(*[b[i]-a[i]-a[i+3]-b[i+3] for i in range(3)]),
                  'velocityChangeOver2SecondsKmS':math.hypot(*sub(b[3:],a[3:]))})
            report['alternativeSolutions'].append({'probeId':probe,'kernel':name,
                'startTdb':sp.etcal(min(s['startEt'] for s in segments)),
                'endTdb':sp.etcal(max(s['endEt'] for s in segments)),
                'loadOrder':[MERGED[probe],name],'overlayJoins':joins})
    # The independent Uranus encounter kernel explicitly embeds DE442. Compare
    # that parent state to the chain implicit in today's URA184 center query.
    load(OLD/'vgr2.ura182.bsp')
    report['uranusDe442ParentChecks']=[]
    for event in events:
        if event['planetId']!='799': continue
        for row in event['samples']:
            et=(row['jdTdb']-2451545)*86400
            parent=sub(row['references']['planetSun'],row['references']['planetBary'])
            report['uranusDe442ParentChecks'].append({'eventId':event['id'],'jdTdb':row['jdTdb'],
                'residual':metrics(sub(state('7','10',et),parent))})
    (OUT/'spk-audit.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
    for e in report['encounters']:
        print(e['id'],'SPK-Horizons direct km',max(s['spkVsHorizonsDirect']['positionKm'] for s in e['samples']),
              'UTC/TDB seconds',e['utcTdbResidualSeconds'])
    for h in report['handoffs']: print('Handoff',h['probeId'],h['positionJumpResidualKm'],'km')
    print('Native center boundaries:',len(report['nativeBoundaries']))

    # Independent SPICE truth at interior points, for the production JS Hermite.
    # The smaller cadences are experiments only, never installed as ephemerides.
    catalog=json.loads((OUT/'input-inventory.json').read_text(encoding='utf8'))
    interpolation=[]
    for event in events:
        load(OLD/MERGED[event['probeId']])
        dataset=next(d for d in catalog if d['id']==event['samples'][4]['local']['probeDataset'])
        cadence=dataset['cadenceSeconds']
        anchor=dataset['coverage']['startJdTdb']
        for step in sorted(set([cadence,300,60]),reverse=True):
            center_index=math.floor((event['time']['jdTdb']-anchor)*86400/step)
            half=math.ceil(7200/step)
            intervals=[]
            for index in range(center_index-half,center_index+half+1):
                first=anchor+index*step/86400; last=anchor+(index+1)*step/86400
                def at(jd): return state(event['probeId'],'10',(jd-2451545)*86400)
                checks=[{'jdTdb':first+f*(last-first),'state':at(first+f*(last-first))} for f in [0.25,0.5,0.75]]
                intervals.append({'firstJdTdb':first,'lastJdTdb':last,'first':at(first),'last':at(last),'checks':checks})
            interpolation.append({'eventId':event['id'],'probeId':event['probeId'],
                'stepSeconds':step,'productionStepSeconds':cadence,'kernel':MERGED[event['probeId']],
                'intervals':intervals})
    (OUT/'spk-interpolation-inputs.json').write_text(json.dumps(interpolation,separators=(',',':'))+'\n',encoding='utf8')

if __name__=='__main__': main()
