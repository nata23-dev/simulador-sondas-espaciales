"""CSPICE comparison of official alternative Voyager kernels with preserved Horizons.

Run after audit-voyager-stage9b-alternatives.py with SpiceyPy 8.3.0.
No simulator ephemeris or kernel is modified.
"""
from pathlib import Path
import csv
import hashlib
import json
import math
import spiceypy as sp
from spiceypy.utils.exceptions import SpiceyError, NotFoundError

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'evidence/voyager-stage9b'
ALT = OUT / 'Kernels'
OLD = ROOT / 'evidence/stage2-3/Kernels'
REFIT = ROOT / 'evidence/voyager-reference-reconciliation/Kernels'
TLS = OLD / 'naif0012.tls'
OFFSETS = [-600, -60, -10, -1, 0, 1, 10, 60, 600]
PROBES = {
    '-31': {'boundary': '1981 JAN 01 00:00:00 TDB', 'old': OLD/'Voyager_1.a54206u_V0.2_merged.bsp',
            'refit': REFIT/'vgr1.x2100.bsp', 'nativeCenter': 10},
    '-32': {'boundary': '1989 AUG 29 08:00:00 TDB', 'old': OLD/'Voyager_2.m05016u.merged.bsp',
            'refit': REFIT/'vgr2.x2100.bsp', 'nativeCenter': 8},
}
CANDIDATES = [
    {'probe': '-31', 'name': '2013 merged a54418u', 'kernel': ALT/'voyager_1.ST+1991_a54418u.merged.bsp'},
    {'probe': '-31', 'name': '1999 supertrajectory', 'kernel': ALT/'vgr1_st.bsp'},
    {'probe': '-31', 'name': '1996 Saturn T801202', 'kernel': ALT/'vg1_sat.bsp'},
    {'probe': '-32', 'name': '2013 merged m05208u', 'kernel': ALT/'voyager_2.ST+1992_m05208u.merged.bsp'},
    {'probe': '-32', 'name': '1999 supertrajectory', 'kernel': ALT/'vgr2_st.bsp'},
    {'probe': '-32', 'name': '1999 Neptune T891004', 'kernel': ALT/'vg2_nep.bsp'},
    {'probe': '-32', 'name': '2009 Neptune NEP081 with DE421', 'kernel': ALT/'vgr2_nep081.bsp',
     'support': [ALT/'de421.bsp']},
    {'probe': '-32', 'name': '2022 Neptune NEP097', 'kernel': OLD/'vgr2_nep097.bsp'},
]
PLANETS = {'v1-jupiter-1979': 599, 'v2-jupiter-1979': 599,
           'v1-saturn-1980': 699, 'v2-saturn-1981': 699,
           'v2-uranus-1986': 799, 'v2-neptune-1989': 899}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(*paths):
    sp.kclear()
    sp.furnsh(str(TLS))
    for path in paths:
        sp.furnsh(str(path))


def state(target, center, et):
    try:
        return list(map(float, sp.spkezr(str(target), et, 'ECLIPJ2000', 'NONE', str(center))[0]))
    except (SpiceyError, NotFoundError) as error:
        if any(token in str(error) for token in ['SPICE(SPKINSUFFDATA)', 'SPICE(SPKNOTFOUND)']):
            return None
        raise


def segment(target, et):
    try:
        _, descriptor, ident = sp.spksfs(int(target), et, 80)
    except (SpiceyError, NotFoundError) as error:
        if isinstance(error, NotFoundError):
            return None
        if 'SPICE(SPKINSUFFDATA)' in str(error) or 'SPICE(SPKNOTFOUND)' in str(error):
            return None
        raise
    dc, ic = sp.dafus(descriptor, 2, 6)
    return {'id': ident.strip(), 'target': int(ic[0]), 'center': int(ic[1]),
            'frame': sp.frmnam(int(ic[2])), 'frameId': int(ic[2]), 'type': int(ic[3]),
            'startEt': float(dc[0]), 'endEt': float(dc[1])}


def minus(a,b):
    return [float(x-y) for x,y in zip(a,b)] if a is not None and b is not None else None


def metrics(v):
    return {'positionKm': math.hypot(*v[:3]), 'velocityKmS': math.hypot(*v[3:])} if v is not None else None


def sample_kernel(cfg, kernel, et, support=()):
    load(*support,kernel)
    selected = segment(cfg['probe'], et)
    if selected is None:
        return {'segment': None, 'state': None}
    spacecraft = state(cfg['probe'], 10, et)
    native = state(cfg['probe'], PROBES[cfg['probe']]['nativeCenter'], et)
    center = PROBES[cfg['probe']]['nativeCenter']
    parent = state(center, 10, et) if center != 10 else [0.0]*6
    closure = metrics(minus([a+b for a,b in zip(native,parent)],spacecraft)) if all(x is not None for x in (native,parent,spacecraft)) else None
    return {'segment': selected, 'state': spacecraft, 'nativeState': native,
            'parentState': parent, 'centerChainClosure': closure}


def read_horizons_rows(stem):
    source = ROOT / 'evidence/stage2-2/ConsultasOriginales' / (stem+'.json')
    metadata = json.loads(source.with_suffix('.request.json').read_text(encoding='utf8'))
    assert sha(source) == metadata['sha256'] and metadata['httpStatus'] == 200
    raw = json.loads(source.read_text(encoding='utf8'))['result']
    block = raw.split('$$SOE',1)[1].split('$$EOE',1)[0]
    rows = [[field.strip() for field in line.split(',')] for line in block.strip().splitlines()]
    return rows, {'file': str(source.relative_to(ROOT)).replace('\\','/'),
                  'sha256': metadata['sha256'], 'parameters': metadata.get('parameters',metadata.get('queryParameters'))}


def planetary_references():
    results = []
    for event_id, planet in PLANETS.items():
        direct, direct_meta = read_horizons_rows(event_id+'-relative-probe')
        probe, probe_meta = read_horizons_rows(event_id+'-heliocentric-probe')
        body, body_meta = read_horizons_rows(event_id+'-heliocentric-planet')
        assert len(direct)==len(probe)==len(body)==121
        row_a,row_b,row_c = direct[60],probe[60],body[60]
        assert abs(float(row_a[0])-float(row_b[0]))<1e-9 and abs(float(row_a[0])-float(row_c[0]))<1e-9
        assert all(meta['parameters']['TIME_TYPE']=="'UT'" for meta in (direct_meta,probe_meta,body_meta))
        et=sp.str2et(row_a[1].removeprefix('A.D. ').strip()+' UTC')
        results.append({'id':event_id,'probe': '-31' if event_id.startswith('v1') else '-32',
                        'planet':planet,'jdUtcPseudo':float(row_a[0]),'etTdb':et,'labelUtc':row_a[1],
                        'directState':list(map(float,row_a[2:8])),
                        'horizonsProbeSun':list(map(float,row_b[2:8])),
                        'horizonsPlanetSun':list(map(float,row_c[2:8])),
                        'sources':[direct_meta,probe_meta,body_meta]})
    return results


def final_horizons_state(probe):
    name='hist-cruise-v1-2011-2026' if probe=='-31' else 'hist-cruise-v2-2014-2026'
    path=ROOT/'public/data/historical/probes'/(name+'.json')
    metadata=json.loads(path.with_suffix('.metadata.json').read_text(encoding='utf8'))
    assert sha(path)==metadata['sha256']
    entry=json.loads(path.read_text(encoding='utf8'))['series'][probe][-1]
    return {'dataset':name,'jdTdb':entry[0],'label':entry[1],'state':entry[2:8],
            'file':str(path.relative_to(ROOT)).replace('\\','/'),'sha256':metadata['sha256']}


def main():
    load()
    inventory=json.loads((OUT/'alternative-kernel-inventory.json').read_text(encoding='utf8'))
    inventory_by_file={item['file']:item for item in inventory['kernels']}
    for kernel in inventory['kernels']:
        assert sha(ROOT/kernel['file'])==kernel['sha256']
    events=json.loads((ROOT/'evidence/voyager-reference-reconciliation/encounters.json').read_text(encoding='utf8'))['events']
    planetary=planetary_references()
    final_refs={probe:final_horizons_state(probe) for probe in PROBES}
    report={'toolkit':sp.tkvrsn('TOOLKIT'),'spiceypy':sp.__version__,
            'frame':'ECLIPJ2000','center':10,'timeScale':'TDB/ET','aberration':'NONE',
            'positionUnit':'km','velocityUnit':'km/s','offsetSeconds':OFFSETS,
            'planetaryReferences':planetary,'finalHorizonsReferences':final_refs,'candidates':[]}
    for cfg in CANDIDATES:
        request_path=cfg['kernel'].with_name(cfg['kernel'].name+'.request.json')
        assert sha(cfg['kernel'])==json.loads(request_path.read_text(encoding='utf8'))['sha256']
        for support_path in cfg.get('support',[]):
            support_request=support_path.with_name(support_path.name+'.request.json')
            assert sha(support_path)==json.loads(support_request.read_text(encoding='utf8'))['sha256']
        info=PROBES[cfg['probe']]
        load(info['old'])
        boundary=sp.str2et(info['boundary'])
        row={'probe':cfg['probe'],'name':cfg['name'],
             'kernel':str(cfg['kernel'].relative_to(ROOT)).replace('\\','/'),
             'sha256':sha(cfg['kernel']),
             'support':[str(p.relative_to(ROOT)).replace('\\','/') for p in cfg.get('support',[])],
             'boundaryEt':boundary,'samples':[],'planetaryEncounters':[],'lunarEncounters':[]}
        inventory_entry=inventory_by_file.get(row['kernel'])
        if inventory_entry:
            spacecraft_segments=[s for s in inventory_entry['segments'] if str(s['target'])==cfg['probe']]
            coverage_start=min(s['startEt'] for s in spacecraft_segments)
            coverage_end=max(s['endEt'] for s in spacecraft_segments)
            row['spacecraftCoverage']={'startEt':coverage_start,'endEt':coverage_end,
                                       'startTdb':sp.etcal(coverage_start),'endTdb':sp.etcal(coverage_end)}
            for edge in [coverage_start,coverage_end]:
                candidate_edge=sample_kernel(cfg,cfg['kernel'],edge,cfg.get('support',[]))
                old_edge=sample_kernel(cfg,info['old'],edge)
                refit_edge=sample_kernel(cfg,info['refit'],edge)
                row.setdefault('coverageEdgeComparisons',[]).append({'et':edge,'tdb':sp.etcal(edge),
                    'candidateSegment':candidate_edge['segment'],
                    'candidateMinusOld':metrics(minus(candidate_edge['state'],old_edge['state'])),
                    'candidateMinusRefit':metrics(minus(candidate_edge['state'],refit_edge['state']))})
            for seg in spacecraft_segments:
                if not seg['segmentId'].startswith('pfile_'):
                    continue
                et=seg['startEt']
                a=sample_kernel(cfg,cfg['kernel'],et-1,cfg.get('support',[]))['state']
                b=sample_kernel(cfg,cfg['kernel'],et+1,cfg.get('support',[]))['state']
                if a is None or b is None:continue
                excess=[b[i]-a[i]-a[i+3]-b[i+3] for i in range(3)]
                row.setdefault('internalPfileJunctions',[]).append({'tdb':sp.etcal(et),
                    'excessDisplacementKm':math.hypot(*excess),
                    'velocityDifferenceKmS':math.hypot(*minus(b,a)[3:])})
        for offset in OFFSETS:
            et=boundary+offset
            current=sample_kernel(cfg,cfg['kernel'],et,cfg.get('support',[]))
            old=sample_kernel(cfg,info['old'],et)
            refit=sample_kernel(cfg,info['refit'],et) if offset>=0 else None
            diff_old=minus(current['state'],old['state'])
            diff_refit=minus(current['state'],refit['state']) if refit else None
            row['samples'].append({'offsetSeconds':offset,'tdb':sp.etcal(et),
                                   'candidate':current,'old':old,'refit':refit,
                                   'candidateMinusOld':diff_old,'candidateMinusOldNorm':metrics(diff_old),
                                   'candidateMinusRefit':diff_refit,'candidateMinusRefitNorm':metrics(diff_refit)})
        # Same solution across the minute: endpoint motion against its own velocities.
        by_offset={x['offsetSeconds']:x for x in row['samples']}
        for left,right in [(-1,1),(0,60)]:
            a=by_offset[left]['candidate']['state'];b=by_offset[right]['candidate']['state']
            if a is None or b is None:
                continue
            dt=right-left
            residual=[b[i]-a[i]-(a[i+3]+b[i+3])*dt/2 for i in range(3)]
            row.setdefault('internalMotion',[]).append({'fromOffset':left,'toOffset':right,
                    'excessDisplacementKm':math.hypot(*residual),'positionDifferenceKm':math.hypot(*minus(b,a)[:3]),
                    'velocityDifferenceKmS':math.hypot(*minus(b,a)[3:])})
        # Actual file loading precedence, with the candidate before/after the 2022 refit.
        for offset in [0,60]:
            et=boundary+offset
            load(info['old'],cfg['kernel'],info['refit'])
            last_refit=segment(cfg['probe'],et)
            load(info['old'],info['refit'],cfg['kernel'])
            last_candidate=segment(cfg['probe'],et)
            row.setdefault('loadOrder',[]).append({'offsetSeconds':offset,
                  'oldCandidateRefit':last_refit,'oldRefitCandidate':last_candidate})
        for event in planetary:
            if event['probe']!=cfg['probe']:continue
            et=event['etTdb']
            check=sample_kernel(cfg,cfg['kernel'],et,cfg.get('support',[]))
            if check['state'] is None:
                row['planetaryEncounters'].append({'id':event['id'],'covered':False})
                continue
            delta=minus(check['state'],event['horizonsProbeSun'])
            relative=minus(check['state'],event['horizonsPlanetSun'])
            direct_range=math.hypot(*event['directState'][:3])
            row['planetaryEncounters'].append({'id':event['id'],'covered':True,'etTdb':et,
                'segment':check['segment'],'probeMinusHorizons':delta,'probeMinusHorizonsNorm':metrics(delta),
                'distanceToHorizonsPlanetKm':math.hypot(*relative[:3]),
                'directHorizonsDistanceKm':direct_range,
                'distanceMinusDirectKm':math.hypot(*relative[:3])-direct_range})
        for event in events:
            if event['probeId']!=cfg['probe']:continue
            lunar=[]
            for sample in event['samples']:
                et=(sample['jdTdb']-2451545.0)*86400
                check=sample_kernel(cfg,cfg['kernel'],et,cfg.get('support',[]))
                if check['state'] is None:
                    lunar.append({'jdTdb':sample['jdTdb'],'covered':False});continue
                native=state(cfg['probe'],event['barycenterId'],et)
                reference=sample['references']
                distance=math.hypot(*minus(native,reference['moonBary'])[:3])
                lunar.append({'jdTdb':sample['jdTdb'],'covered':True,'segment':check['segment'],
                    'probeSunMinusHorizons':metrics(minus(check['state'],reference['probeSun'])),
                    'probeBaryMinusHorizons':metrics(minus(native,reference['probeBary'])),
                    'candidateMoonDistanceKm':distance,
                    'directHorizonsMoonDistanceKm':sample['directDistanceKm'],
                    'distanceMinusDirectKm':distance-sample['directDistanceKm']})
            row['lunarEncounters'].append({'id':event['id'],'samples':lunar})
        final=final_refs[cfg['probe']]
        et=(final['jdTdb']-2451545.0)*86400
        late=sample_kernel(cfg,cfg['kernel'],et,cfg.get('support',[]))
        row['late2026']={'jdTdb':final['jdTdb'],'label':final['label'],'covered':late['state'] is not None,
                         'selectedSegment':late['segment'],
                         'candidateMinusHorizons':minus(late['state'],final['state']),
                         'candidateMinusHorizonsNorm':metrics(minus(late['state'],final['state']))}
        report['candidates'].append(row)
        zero=by_offset[0]
        print(cfg['name'], '0s vs old',zero['candidateMinusOldNorm'],
              '0s vs refit',zero['candidateMinusRefitNorm'])
    (OUT/'spice-alternative-comparison.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
    columns=['probe','candidate','offsetSeconds','tdb','segmentId','center','frame','type',
             'comparison','dxKm','dyKm','dzKm','dvxKmS','dvyKmS','dvzKmS','positionKm','velocityKmS']
    with (OUT/'all-offset-comparisons.csv').open('w',newline='',encoding='utf8') as stream:
        writer=csv.DictWriter(stream,fieldnames=columns)
        writer.writeheader()
        for candidate in report['candidates']:
            for sample in candidate['samples']:
                seg=sample['candidate']['segment']
                for reference,key in [('old','candidateMinusOld'),('refit','candidateMinusRefit')]:
                    values=sample[key]
                    norm=sample[key+'Norm']
                    writer.writerow({'probe':candidate['probe'],'candidate':candidate['name'],
                        'offsetSeconds':sample['offsetSeconds'],'tdb':sample['tdb'],
                        'segmentId':seg['id'] if seg else '', 'center':seg['center'] if seg else '',
                        'frame':seg['frame'] if seg else '', 'type':seg['type'] if seg else '',
                        'comparison':reference,
                        **({name:value for name,value in zip(columns[9:15],values)} if values else {}),
                        'positionKm':norm['positionKm'] if norm else '',
                        'velocityKmS':norm['velocityKmS'] if norm else ''})


if __name__=='__main__':
    main()
