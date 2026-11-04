"""Feather documented rectangular stitch boundaries in the original Voyager Io mosaic.

The source JPEG remains unchanged. No synthetic terrain is added: each correction
only matches the two immediate sides of an existing mosaic join, over ten pixels.
"""
from pathlib import Path
import json

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'public/textures/moons/io-voyager-usgs.jpg'
OUTPUT = ROOT / 'public/textures/moons/io-voyager-usgs-seam-feathered.png'
AUDIT = ROOT / 'evidence/voyager-stage7b/io-seam-audit.json'
JOIN_COLUMNS = (348, 502, 768)
HALF_WIDTH = 10

source = np.asarray(Image.open(SOURCE).convert('RGB'), dtype=np.float32)
result = source.copy()
height, width, _ = source.shape
rows = slice(80, height - 80)
before = {}
after = {}
for column in JOIN_COLUMNS:
    if not HALF_WIDTH < column < width - HALF_WIDTH:
        raise ValueError(f'Join column outside mosaic: {column}')
    delta = np.clip(source[:, column] - source[:, column - 1], -35, 35)
    observed = np.min(np.concatenate((source[:, column - 4:column],
                                      source[:, column:column + 4]), axis=1), axis=(1, 2)) > 20
    before[str(column)] = float(np.abs(source[rows, column] - source[rows, column - 1]).mean())
    for step in range(HALF_WIDTH):
        blend = (step + 1) / HALF_WIDTH
        blend = blend * blend * (3 - 2 * blend)
        left_column = column - HALF_WIDTH + step
        right_column = column + HALF_WIDTH - 1 - step
        result[observed, left_column] += delta[observed] * (blend * 0.5)
        result[observed, right_column] -= delta[observed] * (blend * 0.5)
    after[str(column)] = float(np.abs(result[rows, column] - result[rows, column - 1]).mean())

Image.fromarray(np.clip(np.rint(result), 0, 255).astype('uint8'), 'RGB').save(OUTPUT)
AUDIT.parent.mkdir(parents=True, exist_ok=True)
AUDIT.write_text(json.dumps({
    'source': str(SOURCE.relative_to(ROOT)).replace('\\', '/'),
    'derivative': str(OUTPUT.relative_to(ROOT)).replace('\\', '/'),
    'sourceDimensions': [width, height],
    'joinsPx': JOIN_COLUMNS,
    'halfWidthPx': HALF_WIDTH,
    'meanAdjacentRgbDifferenceBefore': before,
    'meanAdjacentRgbDifferenceAfter': after,
    'note': 'Local color feather only; original source and geological structures retained. Native resolution mismatch remains.'
}, indent=2) + '\n', encoding='utf-8')
print(AUDIT.read_text(encoding='utf-8'))
