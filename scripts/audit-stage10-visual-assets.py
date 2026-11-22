"""Audit Io source maps without altering any texture or historical data.

Requires Pillow and NumPy. Run: py -3.13 scripts/audit-stage10-visual-assets.py
"""
from pathlib import Path
import hashlib
import json

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'evidence/voyager-stage10/io-texture-audit.json'
SOURCES = {
    'voyagerAOriginal': 'source-assets/textures/moons/io-voyager-usgs.jpg',
    'voyagerAStage07B': 'public/textures/moons/io-voyager-usgs-seam-feathered.png',
    'galileoColorB': 'evidence/voyager-stage10/source/Jupiter - Io (B).jpg',
}
JOIN_COLUMNS = (348, 502, 768)


def inspect(file):
    path = ROOT / file
    array = np.asarray(Image.open(path).convert('RGB'), dtype=np.float32)
    height, width, _ = array.shape
    rows = slice(90, height - 90)
    valid_wrap = np.min(array[rows, 0], axis=1) > 20
    valid_wrap &= np.min(array[rows, -1], axis=1) > 20
    return {
        'path': file,
        'bytes': path.stat().st_size,
        'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
        'width': width,
        'height': height,
        'meanAdjacentRgbDifferenceAtJoins': {
            str(column): round(float(np.abs(array[rows, column]
                - array[rows, column - 1]).mean()), 6)
            for column in JOIN_COLUMNS
        },
        'meanRgbDifferenceAtLongitudeWrap': round(float(
            np.abs(array[rows, 0][valid_wrap]
                - array[rows, -1][valid_wrap]).mean()), 6),
        'validWrapRows': int(valid_wrap.sum()),
    }


result = {
    'method': 'Mean absolute RGB channel difference of adjacent columns, '
              'rows 90..629. Diagnostic of a visible stitch, not a '
              'geographic accuracy or color fidelity metric.',
    'sources': {name: inspect(file) for name, file in SOURCES.items()},
    'observedMask': 'public/textures/moons/io-observed-mask.png',
    'classification': 'Mosaic source and coverage differences; not a spherical UV break.',
    'alternativeDecision': 'NASA Io (B) includes Galileo-era color and the same '
                           'internal joins; retain Voyager Io (A) for 1979.'
}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
print(OUT.relative_to(ROOT))
print(json.dumps(result['sources'], indent=2))
