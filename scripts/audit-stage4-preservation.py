"""Compare historical Voyager source and data with the approved Stage 03.1 ZIP."""
from __future__ import annotations
import hashlib
from pathlib import Path
from zipfile import ZipFile

root = Path(__file__).resolve().parents[1]
baseline = Path.home() / 'Downloads' / 'SIMULADOR_VOYAGER_ETAPA_03_1_CORRECCION_FINAL_UX.zip'
with ZipFile(baseline) as archive:
    names = [n for n in archive.namelist() if (
        n.startswith('Proyecto/public/data/historical')
        or n.startswith('Proyecto/src/science/Voyager')
        or n.startswith('Proyecto/src/science/Historical')
        or n == 'Proyecto/src/integration/HistoricalVisualPipeline.js'
    )]
    if len(names) < 10:
        raise SystemExit('Historical preservation set unexpectedly small')
    for name in names:
        current = root / name.removeprefix('Proyecto/')
        if not current.is_file() or hashlib.sha256(current.read_bytes()).digest() != hashlib.sha256(archive.read(name)).digest():
            raise SystemExit(f'Difference: {name}')
print(f'{len(names)} historical Voyager source/data files unchanged versus approved Stage 03.1 ZIP')
