"""Strict ZIP path/CRC/extraction/SHA-256 check. Usage: python verify-portable-zip.py FILE.zip"""
from __future__ import annotations
import hashlib
import json
import sys
import tempfile
from pathlib import Path
from zipfile import ZipFile

source=Path(sys.argv[1])
with ZipFile(source) as archive:
    entries=archive.infolist()
    names=[entry.filename for entry in entries]
    assert len(names)==len(set(names)), 'duplicate ZIP path'
    assert all('\\' not in name and not name.startswith('/') and '..' not in name.split('/') for name in names), 'non-POSIX path'
    assert all(entry.create_system==3 for entry in entries), 'non-UNIX ZIP metadata'
    assert archive.testzip() is None, 'ZIP CRC failed'
    manifest=json.loads(archive.read('MANIFEST_SHA256.json'))
    assert manifest['fileCount']==len(manifest['files'])==len(names)-1
    with tempfile.TemporaryDirectory(prefix='voyager-portable-zip-') as directory:
        archive.extractall(directory)
        for file in manifest['files']:
            actual=Path(directory,file['path'])
            assert actual.stat().st_size==file['bytes'], file['path']
            assert hashlib.sha256(actual.read_bytes()).hexdigest()==file['sha256'], file['path']
print(f'{source.name}: {len(names)} POSIX entries, {manifest["fileCount"]} SHA-256 files, CRC and extraction OK')
