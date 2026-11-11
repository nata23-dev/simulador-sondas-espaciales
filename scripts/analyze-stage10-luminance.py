"""Sample fixed, unobstructed regions of authentic Chrome before/after PNGs."""
from pathlib import Path
import json
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / 'evidence/voyager-stage10'
CASES = {
    'mercury': {
        'before': 'before/inner-mercury-phase-1920x1080.png',
        'after': 'after/inner-mercury-phase-1920x1080.png',
        'roiXYXY': (925, 335, 1270, 720),
    },
    'neptuneHistoricalSunlit': {
        'before': 'before/voyager2-neptune-stabilized-1920x1080.png',
        'after': 'after/voyager2-neptune-1920x1080.png',
        'roiXYXY': (990, 340, 1090, 430),
    },
}


def sample(file, roi):
    image = np.asarray(Image.open(ROOT / file).convert('RGB'), dtype=np.float32)
    x0, y0, x1, y1 = roi
    rgb = image[y0:y1, x0:x1]
    luminance = (rgb * np.array([0.2126, 0.7152, 0.0722])).sum(axis=2)
    return {
        'meanSrgbLuma8bit': round(float(luminance.mean()), 3),
        'medianSrgbLuma8bit': round(float(np.median(luminance)), 3),
        'p95SrgbLuma8bit': round(float(np.percentile(luminance, 95)), 3),
        'meanRgb8bit': [round(float(v), 3) for v in rgb.mean(axis=(0, 1))],
    }


out = {name: {
    'files': [case['before'], case['after']],
    'roiXYXY': case['roiXYXY'],
    'before': sample(case['before'], case['roiXYXY']),
    'after': sample(case['after'], case['roiXYXY']),
} for name, case in CASES.items()}
out['note'] = ('sRGB screenshot luma in fixed rectangles; a display diagnostic, '
               'not radiance, albedo, or photometric calibration.')
(ROOT / 'luminance-comparison.json').write_text(
    json.dumps(out, indent=2) + '\n', encoding='utf-8')
print(json.dumps(out, indent=2))
