"""Read-only diagnostics for the original Neptune and Io maps.

Usage: py -3 scripts/audit-stage11-textures.py
"""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FILES = (
    "public/textures/neptune.jpg",
    "public/textures/moons/io-voyager-usgs.jpg",
    "public/textures/moons/io-voyager-usgs-seam-feathered.png",
)


def inspect(relative):
    file = ROOT / relative
    data = file.read_bytes()
    rgb = np.asarray(Image.open(file).convert("RGB"), dtype=np.float32)
    horizontal_step = np.linalg.norm(np.diff(rgb, axis=1), axis=2)
    longitude_join = np.linalg.norm(rgb[:, 0] - rgb[:, -1], axis=1)
    latitude_step = np.linalg.norm(np.diff(rgb, axis=0), axis=2).mean(axis=1)
    top_latitudes = np.argsort(latitude_step)[-5:][::-1]
    return {
        "file": relative,
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "width": int(rgb.shape[1]),
        "height": int(rgb.shape[0]),
        "adjacent_longitude_mean_rgb_distance": float(horizontal_step.mean()),
        "wrap_join_mean_rgb_distance": float(longitude_join.mean()),
        "wrap_join_max_rgb_distance": float(longitude_join.max()),
        "highest_mean_latitude_steps": [
            {"row": int(row), "mean_rgb_distance": float(latitude_step[row])}
            for row in top_latitudes
        ],
    }


result = {"method": "Euclidean RGB distances in stored 8-bit sRGB; descriptive, not photometric", "files": [inspect(name) for name in FILES]}
out = ROOT / "evidence/voyager-stage11/texture-diagnostics.json"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(json.dumps(result, indent=2, ensure_ascii=False))
