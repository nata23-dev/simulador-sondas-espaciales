"""Acquire selected official NAIF alternatives and inventory their SPK segments.

Requires SpiceyPy 8.3.0 / CSPICE N0067. Keeps every downloaded binary unchanged.
Run: python scripts/audit-voyager-stage9b-alternatives.py
"""
from datetime import datetime, timezone
from pathlib import Path
import csv
import hashlib
import json
import urllib.request
import spiceypy as sp

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'evidence/voyager-stage9b'
KERNELS = OUT / 'Kernels'
BASE = 'https://naif.jpl.nasa.gov/pub/naif/VOYAGER/kernels/spk/'
FILES = [
    ('voyager_1.ST+1991_a54418u.merged.bsp', ''),
    ('voyager_2.ST+1992_m05208u.merged.bsp', ''),
    ('vgr1_st.bsp', 'a_older_versions/'),
    ('vgr2_st.bsp', 'a_older_versions/'),
    ('vg1_sat.bsp', 'a_older_versions/'),
    ('vgr1_saturn.bsp', 'a_older_versions/'),
    ('vgr1_sat261.bsp', 'a_older_versions/'),
    ('vgr1.sat286.bsp', 'a_older_versions/'),
    ('vg2_nep.bsp', 'a_older_versions/'),
    ('vgr2_nep081.bsp', ''),
    ('de421.bsp', 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/a_old_versions/'),
]


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def acquire(name, prefix):
    KERNELS.mkdir(parents=True, exist_ok=True)
    path = KERNELS / name
    metadata_path = KERNELS / (name + '.request.json')
    url = prefix + name if prefix.startswith('https://') else BASE + prefix + name
    if path.exists():
        metadata = json.loads(metadata_path.read_text(encoding='utf8'))
        assert metadata['url'] == url and metadata['sha256'] == sha(path)
        assert metadata['bytes'] == path.stat().st_size
        return path, metadata
    request = urllib.request.Request(url, headers={'User-Agent': 'Voyager-stage9b-science-audit/1.0'})
    partial = KERNELS / (name + '.partial')
    with urllib.request.urlopen(request, timeout=120) as response, partial.open('wb') as output:
        assert response.status == 200, (url, response.status)
        while block := response.read(1024 * 1024):
            output.write(block)
        metadata = {'url': url, 'httpStatus': response.status,
                    'lastModifiedHttp': response.headers.get('Last-Modified'),
                    'contentTypeHttp': response.headers.get('Content-Type'),
                    'bytes': partial.stat().st_size, 'sha256': sha(partial),
                    'acquiredAtUtc': datetime.now(timezone.utc).isoformat()}
    partial.replace(path)
    metadata_path.write_text(json.dumps(metadata, indent=2) + '\n', encoding='utf8')
    return path, metadata


def inventory(path, metadata):
    handle = sp.dafopr(str(path))
    comments = []
    while True:
        count, lines, done = sp.dafec(handle, 100, 1000)
        comments.extend(lines[:count])
        if done:
            break
    sp.dafbfs(handle)
    segments = []
    while sp.daffna():
        dc, ic = sp.dafus(sp.dafgs(), 2, 6)
        segments.append({'target': int(ic[0]), 'center': int(ic[1]),
                         'frameId': int(ic[2]), 'frameName': sp.frmnam(int(ic[2])),
                         'type': int(ic[3]), 'startEt': float(dc[0]), 'endEt': float(dc[1]),
                         'startTdb': sp.etcal(dc[0]), 'endTdb': sp.etcal(dc[1]),
                         'segmentId': sp.dafgn().strip()})
    sp.dafcls(handle)
    (OUT / (path.name + '.comments.txt')).write_text('\n'.join(comments) + '\n', encoding='utf8')
    return {'file': str(path.relative_to(ROOT)).replace('\\', '/'),
            **metadata, 'segments': segments, 'commentLineCount': len(comments)}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    sp.furnsh(str(ROOT / 'evidence/stage2-3/Kernels/naif0012.tls'))
    results = []
    for name, prefix in FILES:
        path, metadata = acquire(name, prefix)
        entry = inventory(path, metadata)
        results.append(entry)
        spacecraft = [s for s in entry['segments'] if s['target'] in (-31, -32)]
        print(name, metadata['bytes'], metadata['sha256'],
              'spacecraft segments:', len(spacecraft))
    output = {'toolkit': sp.tkvrsn('TOOLKIT'), 'spiceypy': sp.__version__,
              'officialArchive': BASE, 'kernels': results}
    (OUT / 'alternative-kernel-inventory.json').write_text(json.dumps(output, indent=2) + '\n', encoding='utf8')
    with (OUT / 'kernel-manifest.csv').open('w', newline='', encoding='utf8') as stream:
        writer = csv.DictWriter(stream, fieldnames=['file','url','bytes','sha256','lastModifiedHttp','acquiredAtUtc'])
        writer.writeheader()
        for entry in results:
            writer.writerow({key: entry[key] for key in writer.fieldnames})


if __name__ == '__main__':
    main()
