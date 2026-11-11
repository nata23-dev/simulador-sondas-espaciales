"""Independent CSPICE audit of the two Voyager historical/refit handoffs.

Run with SpiceyPy 8.3.0: python scripts/diagnose-voyager-stage9.py
Reads preserved kernels and Horizons exports; writes only Stage 09 evidence.
"""
from pathlib import Path
import hashlib
import json
import math
import spiceypy as sp

ROOT = Path(__file__).resolve().parents[1]
OLD = ROOT / 'evidence/stage2-3/Kernels'
NEW = ROOT / 'evidence/voyager-reference-reconciliation/Kernels'
OUT = ROOT / 'evidence/voyager-stage9'
TLS = OLD / 'naif0012.tls'
CONFIG = [
    {'id': '-31', 'label': 'Voyager 1', 'boundary': '1981 JAN 01 00:00:00 TDB',
     'old': OLD / 'Voyager_1.a54206u_V0.2_merged.bsp', 'new': NEW / 'vgr1.x2100.bsp',
     'before': 'hist-cruise-v1-1977-1981', 'after': 'hist-bridge-v1-1981-min',
     'center': '10'},
    {'id': '-32', 'label': 'Voyager 2', 'boundary': '1989 AUG 29 08:00:00 TDB',
     'old': OLD / 'Voyager_2.m05016u.merged.bsp', 'new': NEW / 'vgr2.x2100.bsp',
     'before': 'hist-flyby-v2-neptune-1989', 'after': 'hist-bridge-v2-1989-min',
     'center': '8'},
]
OFFSETS = [-600, -60, -10, -1, 0, 1, 10, 60, 600]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(*paths):
    sp.kclear()
    sp.furnsh(str(TLS))
    for path in paths:
        sp.furnsh(str(path))


def state(target, center, et, frame='ECLIPJ2000'):
    return list(map(float, sp.spkezr(str(target), et, frame, 'NONE', str(center))[0]))


def delta(a, b):
    return [float(x - y) for x, y in zip(a, b)]


def norms(values):
    return {'positionKm': math.hypot(*values[:3]), 'velocityKmS': math.hypot(*values[3:])}


def selected(target, et):
    handle, descr, ident = sp.spksfs(int(target), et, 80)
    dc, ic = sp.dafus(descr, 2, 6)
    return {'id': ident.strip(), 'target': int(ic[0]), 'center': int(ic[1]),
            'frame': sp.frmnam(int(ic[2])), 'type': int(ic[3]),
            'startEt': float(dc[0]), 'endEt': float(dc[1])}


def horizons_edge(cfg, name, last):
    path = ROOT / f'public/data/historical/{"encounters" if "flyby" in name else "probes"}/{name}.json'
    metadata = json.loads(path.with_suffix('.metadata.json').read_text(encoding='utf8'))
    actual_hash = digest(path)
    assert actual_hash == metadata['sha256'], f'Horizons export hash mismatch: {path}'
    doc = json.loads(path.read_text(encoding='utf8'))
    rows = doc['series'][cfg['id']]
    row = rows[-1] if last else rows[0]
    return {'dataset': name, 'file': str(path.relative_to(ROOT)).replace('\\', '/'),
            'sha256': actual_hash, 'jdTdb': row[0], 'label': row[1], 'state': row[2:8],
            'acquisition': doc['acquisition']['bodies'][cfg['id']],
            'frame': doc['acquisition']['frameId'], 'center': doc['acquisition']['originCode'],
            'timeScale': doc['acquisition']['timeScale'], 'correction': doc['acquisition']['correction']}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    report = {'method': 'SpiceyPy/CSPICE spkezr, spksfs, sxform; preserved Horizons endpoint vectors',
              'toolkit': sp.tkvrsn('TOOLKIT'), 'spiceypy': sp.__version__,
              'frame': 'ECLIPJ2000', 'center': 'Sun (10)', 'timeScale': 'TDB/ET',
              'aberration': 'NONE', 'offsetSeconds': OFFSETS,
              'kernels': [], 'handoffs': []}
    for cfg in CONFIG:
        for path in [cfg['old'], cfg['new']]:
            meta = json.loads((path.parent / (path.name + '.request.json')).read_text(encoding='utf8'))
            actual = digest(path)
            assert actual == meta['sha256'], path
            report['kernels'].append({'file': str(path.relative_to(ROOT)).replace('\\', '/'),
                                      'sha256': actual, 'verified': True, 'sourceUrl': meta.get('url')})
        load(cfg['old'])
        et0 = sp.str2et(cfg['boundary'])
        before = horizons_edge(cfg, cfg['before'], True)
        after = horizons_edge(cfg, cfg['after'], False)
        for edge in [before, after]:
            assert edge['frame'] == 'ICRF_ECLIPTIC_J2000'
            assert edge['center'] == '500@10' and edge['timeScale'] == 'TDB' and edge['correction'] == 'NONE'
        assert abs((before['jdTdb'] - 2451545) * 86400 - et0) < 1e-4
        assert abs((after['jdTdb'] - before['jdTdb']) * 86400 - 60) < 1e-3
        samples = []
        for offset in OFFSETS:
            et = et0 + offset
            load(cfg['old'])
            old = state(cfg['id'], 10, et)
            old_segment = selected(cfg['id'], et)
            load(cfg['old'], cfg['new'])
            active = state(cfg['id'], 10, et)
            active_segment = selected(cfg['id'], et)
            row = {'offsetSeconds': offset, 'et': et, 'tdb': sp.etcal(et),
                   'old': old, 'oldSelectedSegment': old_segment,
                   'loadedOldThenRefit': active, 'selectedSegment': active_segment}
            if offset >= 0:
                load(cfg['new'])
                refit = state(cfg['id'], 10, et)
                row['refit'] = refit
                row['refitMinusOld'] = delta(refit, old)
                row['refitMinusOldNorm'] = norms(row['refitMinusOld'])
                load(cfg['new'], cfg['old'])
                row['selectedReversedLoadOrder'] = selected(cfg['id'], et)
                row['reversedLoadOrderState'] = state(cfg['id'], 10, et)
                if cfg['id'] == '-32':
                    load(cfg['new'])
                    rel = state(-32, 8, et)
                    parent = state(8, 10, et)
                    row['newCenterChainResidual'] = norms(delta([a+b for a,b in zip(rel,parent)],refit))
            else:
                row['refit'] = None
            samples.append(row)
        # Compare Horizons to CSPICE at identical endpoint epochs; no JS provider used.
        comparisons = []
        for edge, kernel in [(before, cfg['old']), (after, cfg['new'])]:
            load(kernel)
            et = (edge['jdTdb'] - 2451545) * 86400
            canonical = state(cfg['id'], 10, et)
            residual = delta(edge['state'], canonical)
            comparisons.append({'dataset': edge['dataset'], 'horizonsMinusSpice': residual,
                                'norm': norms(residual), 'spiceState': canonical,
                                'selectedSegment': selected(cfg['id'], et)})
        assert all(row['norm']['positionKm'] < 0.002 and row['norm']['velocityKmS'] < 1e-8
                   for row in comparisons), 'Preserved Horizons endpoints disagree with CSPICE'
        assert all(row['selectedSegment']['id'] == 'vgr1_st.nio' if cfg['id'] == '-31' else
                   row['selectedSegment']['id'] == 'vgr2_st.nio'
                   for row in samples if row['offsetSeconds'] < 0)
        assert all(row['selectedSegment']['id'] == 'pfile.nio' and
                   row['selectedReversedLoadOrder']['id'] in ('vgr1_st.nio', 'vgr2_st.nio')
                   for row in samples if row['offsetSeconds'] >= 0)
        load(cfg['old'])
        old_at_boundary = state(cfg['id'],10,et0)
        old_native = state(cfg['id'],cfg['center'],et0)
        old_parent = state(cfg['center'],10,et0) if cfg['center'] != '10' else [0.0]*6
        old_j2000 = state(cfg['id'],10,et0,'J2000')
        old_frame_residual = norms(delta(list(sp.mxvg(sp.sxform('J2000','ECLIPJ2000',et0),old_j2000)),old_at_boundary))
        load(cfg['new'])
        new_at_boundary = state(cfg['id'],10,et0)
        new_native = state(cfg['id'],cfg['center'],et0)
        new_parent = state(cfg['center'],10,et0) if cfg['center'] != '10' else [0.0]*6
        new_j2000 = state(cfg['id'],10,et0,'J2000')
        new_frame_residual = norms(delta(list(sp.mxvg(sp.sxform('J2000','ECLIPJ2000',et0),new_j2000)),new_at_boundary))
        same_epoch = delta(new_at_boundary,old_at_boundary)
        endpoint_delta = delta(after['state'],before['state'])
        endpoint_seconds = (after['jdTdb']-before['jdTdb'])*86400
        endpoint_residual = [endpoint_delta[i] - (before['state'][i+3]+after['state'][i+3])*endpoint_seconds/2 for i in range(3)]
        report['handoffs'].append({'probeId':cfg['id'],'label':cfg['label'],
            'boundaryTdb':cfg['boundary'],'boundaryEt':et0,'boundaryUtc':sp.et2utc(et0,'ISOC',6),
            'horizonsBefore':before,'horizonsAfter':after,'sampleSeparationSeconds':endpoint_seconds,
            'horizonsEndpointDifference':endpoint_delta,'horizonsEndpointDifferenceNorm':norms(endpoint_delta),
            'horizonsExcessDisplacementKm':math.hypot(*endpoint_residual),
            'endpointDisplacementOver60sKmS':math.hypot(*endpoint_delta[:3])/endpoint_seconds,
            'sameEpochRefitMinusOld':same_epoch,'sameEpochNorm':norms(same_epoch),
            'nativeCenterDifferenceVector':delta(new_native,old_native),
            'nativeCenterDifference':norms(delta(new_native,old_native)),
            'centerToSunDifferenceVector':delta(new_parent,old_parent),
            'centerToSunDifference':norms(delta(new_parent,old_parent)),
            'oldCenterChainResidual':norms(delta([a+b for a,b in zip(old_native,old_parent)],old_at_boundary)),
            'newCenterChainResidual':norms(delta([a+b for a,b in zip(new_native,new_parent)],new_at_boundary)),
            'oldFrameRotationResidual':old_frame_residual,'newFrameRotationResidual':new_frame_residual,
            'horizonsVsSpice':comparisons,'samples':samples})
    # A 2022 NAIF Neptune encounter reconstruction overlaps the V2 handoff.
    # Test it as an alternative, without changing any production source.
    cfg = CONFIG[1]
    alt = OLD / 'vgr2_nep097.bsp'
    meta = json.loads((alt.parent / (alt.name + '.request.json')).read_text(encoding='utf8'))
    assert digest(alt) == meta['sha256']
    report['kernels'].append({'file': str(alt.relative_to(ROOT)).replace('\\', '/'),
                              'sha256': digest(alt), 'verified': True, 'sourceUrl': meta.get('url')})
    boundary = report['handoffs'][1]['boundaryEt']
    alternatives = []
    for offset in [-600, -60, -10, -1, 0, 1, 10, 60, 600]:
        et = boundary + offset
        load(cfg['old'])
        old = state(-32, 10, et)
        load(alt)
        alternative = state(-32, 10, et)
        row = {'offsetSeconds': offset, 'alternativeSegment': selected(-32, et),
               'alternativeMinusOld': norms(delta(alternative, old)),
               'alternativeState': alternative}
        if offset >= 0:
            load(cfg['new'])
            refit = state(-32, 10, et)
            row['alternativeMinusRefit'] = norms(delta(alternative, refit))
        alternatives.append(row)
    report['officialNeptuneAlternative'] = {'kernel': str(alt.relative_to(ROOT)).replace('\\', '/'),
                                            'sha256': digest(alt), 'samples': alternatives}
    out = OUT/'spice-handoff-diagnostics.json'
    out.write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
    for item in report['handoffs']:
        print(item['label'], 'same-epoch:', item['sameEpochNorm'],
              'Horizons excess displacement (km):',item['horizonsExcessDisplacementKm'])
    print(out)


if __name__ == '__main__':
    main()
