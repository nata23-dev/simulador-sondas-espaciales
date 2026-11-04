"""Audita las cadenas SPK Voyager con kernels oficiales NAIF y respuestas Horizons.

Requiere spiceypy; no modifica el catálogo ni los datos del simulador.
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import spiceypy as spice


ROOT = Path(__file__).resolve().parent.parent
EVIDENCE = ROOT / 'evidence'
KERNELS = EVIDENCE / 'stage2-3' / 'Kernels'
RAW = EVIDENCE / 'stage2-3' / 'ConsultasOriginales'
RAW_PRIOR = EVIDENCE / 'stage2-2' / 'ConsultasOriginales'
RESULTS = EVIDENCE / 'stage2-3' / 'Resultados'
TLS = KERNELS / 'naif0012.tls'
EVENTS = [
    ('v1-jupiter-1979', '1979-03-05 12:05:26', '-31', '5', '599',
     'Voyager_1.a54206u_V0.2_merged.bsp', 'vgr1_jup230.bsp', 4.89 * 71398),
    ('v2-jupiter-1979', '1979-07-09 22:29:51', '-32', '5', '599',
     'Voyager_2.m05016u.merged.bsp', 'vgr2_jup230.bsp', 10.11 * 71398),
    ('v1-saturn-1980', '1980-11-12 23:46:30', '-31', '6', '699',
     'Voyager_1.a54206u_V0.2_merged.bsp', 'vgr1_sat337.bsp', 3.09 * 60330),
    ('v2-saturn-1981', '1981-08-26 03:24:57', '-32', '6', '699',
     'Voyager_2.m05016u.merged.bsp', 'vgr2_sat337.bsp', 2.67 * 60330),
    ('v2-uranus-1986', '1986-01-24 17:59:47', '-32', '7', '799',
     'Voyager_2.m05016u.merged.bsp', 'vgr2.ura182.bsp', 4.19 * 25559),
    ('v2-neptune-1989', '1989-08-25 03:56:36', '-32', '8', '899',
     'Voyager_2.m05016u.merged.bsp', 'vgr2_nep097.bsp', 1.18 * 24760),
]


def verified_bytes(file: Path) -> bytes:
    data = file.read_bytes()
    metadata_file = (file.with_suffix('.request.json') if file.suffix == '.json'
                     else file.with_name(file.name + '.request.json'))
    meta = json.loads(metadata_file.read_text(encoding='utf8'))
    if meta['sha256'] != hashlib.sha256(data).hexdigest():
        raise ValueError(f'SHA-256 inválido: {file}')
    if meta.get('httpStatus') != 200:
        raise ValueError(f'HTTP inválido: {file}')
    return data


def rows(file: Path) -> list[list[float]]:
    result = json.loads(verified_bytes(file))['result']
    block = result.split('$$SOE', 1)[1].split('$$EOE', 1)[0]
    return [[float(value) for value in line.split(',')[2:8]]
            for line in block.strip().splitlines()]


def subtract(a, b):
    return [x - y for x, y in zip(a, b)]


def norm(v):
    return math.hypot(*v)


def state(target: str, center: str, et: float) -> list[float]:
    return list(spice.spkezr(target, et, 'ECLIPJ2000', 'NONE', center)[0])


def load(*kernels: str):
    spice.kclear()
    spice.furnsh(str(TLS))
    for name in kernels:
        spice.furnsh(str(KERNELS / name))


def transition_residual(before: list[float], after: list[float], seconds: float) -> float:
    return norm([after[i] - before[i] - seconds * (before[i + 3] + after[i + 3]) / 2
                 for i in range(3)])


def audit() -> dict:
    for file in KERNELS.iterdir():
        if file.is_file() and not file.name.endswith('.request.json'):
            verified_bytes(file)

    encounters = []
    for event, utc, probe, bary, planet, merged, special, nssdc in EVENTS:
        center = rows(RAW / f'{event}-planet-barycenter.json')
        modern_parent = rows(RAW / f'{event}-barycenter-sun.json')
        direct = rows(RAW_PRIOR / f'{event}-relative-probe.json')
        heliocentric_probe = rows(RAW_PRIOR / f'{event}-heliocentric-probe.json')
        probe_bary = rows(RAW / f'{event}-probe-barycenter.json')
        if len(center) != 121 or len(direct) != 121 or len(probe_bary) != 121:
            raise ValueError(f'Ventana incompleta: {event}')
        load(merged)
        et = spice.str2et(utc + ' UTC')
        spk_bary = state(probe, bary, et)
        spk_sun = state(probe, '10', et)
        old_parent = state(bary, '10', et)
        spk_center = subtract(spk_bary, center[60])
        horizon_chain = subtract(probe_bary[60], center[60])
        old_distance = norm(spk_center[:3])
        common_barycenter_residual_km = 0.0
        if bary in ('5', '6', '7', '8'):
            other_merged = ('Voyager_2.m05016u.merged.bsp'
                            if merged.startswith('Voyager_1')
                            else 'Voyager_1.a54206u_V0.2_merged.bsp')
            load(other_merged)
            common_barycenter_residual_km = norm(subtract(old_parent[:3],
                                                           state(bary, '10', et)[:3]))
        load(merged, special)
        special_distance_km = None
        if planet in [str(value) for value in spice.spkobj(str(KERNELS / special))]:
            special_distance_km = norm(state(probe, planet, et)[:3])
        coverage = spice.spkcov(str(KERNELS / special), int(probe))
        overlay_boundaries = []
        for side, boundary in [('start', coverage[0]), ('end', coverage[-1])]:
            a = state(probe, '10', boundary - 1)
            b = state(probe, '10', boundary + 1)
            overlay_boundaries.append({
                'side': side,
                'utc': spice.et2utc(boundary, 'ISOC', 3),
                'joinResidualKm': transition_residual(a, b, 2),
            })
        encounters.append({
            'eventId': event, 'utc': utc + 'Z', 'probeId': probe,
            'planetId': planet, 'barycenterId': bary,
            'mergedKernel': merged, 'specializedKernel': special,
            'nssdcDistanceKm': nssdc,
            'spiceMergedChainDistanceKm': old_distance,
            'spiceVsHorizonsDirectPositionResidualKm': norm(subtract(spk_center[:3], direct[60][:3])),
            'spiceVsHorizonsDirectVelocityResidualKmS': norm(subtract(spk_center[3:], direct[60][3:])),
            'mergedSpkVsHorizonsHeliocentricProbeKm': norm(subtract(spk_sun[:3], heliocentric_probe[60][:3])),
            'oldVsDe441BarycenterPositionKm': norm(subtract(old_parent[:3], modern_parent[60][:3])),
            'horizonsBarycenterChainClosureKm': norm(subtract(horizon_chain[:3], direct[60][:3])),
            'commonBarycenterBetweenVoyagerKernelsResidualKm': common_barycenter_residual_km,
            'specializedKernelDistanceKm': special_distance_km,
            'specializedOverlayBoundaries': overlay_boundaries,
        })

    handoffs = []
    for name, merged, probe, bary, tdb in [
        ('v1-handoff-1981-1s', 'Voyager_1.a54206u_V0.2_merged.bsp', '-31', '6',
         '1981-01-01 00:00:00 TDB'),
        ('v2-handoff-1989-1s', 'Voyager_2.m05016u.merged.bsp', '-32', '8',
         '1989-08-29 08:00:00 TDB'),
    ]:
        current = rows(RAW / f'{name}.json')
        if len(current) != 241:
            raise ValueError(f'Ventana de unión incompleta: {name}')
        load(merged)
        et = spice.str2et(tdb)
        old_before = state(probe, bary, et)
        old_after = state(probe, bary, et + 1)
        handoffs.append({
            'name': name, 'tdb': tdb,
            'currentOneSecondJumpResidualKm': transition_residual(current[120], current[121], 1),
            'oldMergedOneSecondResidualKm': transition_residual(old_before, old_after, 1),
            'currentPositionDeltaKm': norm(subtract(current[121][:3], current[120][:3])),
            'currentSpeedDeltaKmS': norm(subtract(current[121][3:], current[120][3:])),
        })

    current_holdouts = json.loads((RESULTS / 'current-probe-holdouts.json').read_text(encoding='utf8'))
    holdouts = []
    for row in current_holdouts:
        merged = ('Voyager_1.a54206u_V0.2_merged.bsp' if row['probe'] == '-31'
                  else 'Voyager_2.m05016u.merged.bsp')
        load(merged)
        et = spice.str2et(row['date'] + ' TDB')
        old = state(row['probe'], '10', et)
        current = [row['position'][axis] for axis in 'xyz'] + [row['velocity'][axis] for axis in 'xyz']
        holdouts.append({
            'probeId': row['probe'], 'tdb': row['date'], 'datasetId': row['dataset'],
            'oldVsCurrentPositionKm': norm(subtract(old[:3], current[:3])),
            'oldVsCurrentVelocityKmS': norm(subtract(old[3:], current[3:])),
        })
    return {
        'method': 'CSPICE_N0067 via spiceypy; ECLIPJ2000; NONE; km and km/s; NAIF TLS; all files checked by SHA-256',
        'encounters': encounters, 'handoffs': handoffs, 'holdouts': holdouts,
    }


if __name__ == '__main__':
    RESULTS.mkdir(parents=True, exist_ok=True)
    result = audit()
    (RESULTS / 'spice-chain-audit.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf8')
    for row in result['encounters']:
        print(row['eventId'],
              f"SPICE-Horizons {row['spiceVsHorizonsDirectPositionResidualKm'] * 1000:.3f} m",
              f"specialized={row['specializedKernelDistanceKm']}")
    for row in result['handoffs']:
        print(row['name'], f"current jump={row['currentOneSecondJumpResidualKm']:.3f} km",
              f"old kernel residual={row['oldMergedOneSecondResidualKm']:.6f} km")
