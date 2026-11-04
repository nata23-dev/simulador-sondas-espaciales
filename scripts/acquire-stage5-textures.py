"""Acquire the five unmodified NASA image textures used by the moon renderer."""
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1] / 'public' / 'textures' / 'moons'
ROOT.mkdir(parents=True, exist_ok=True)
SOURCES = {
    'moon-lroc-color-2k.jpg': 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_2k.jpg',
    'europa-voyager-usgs.jpg': 'https://assets.science.nasa.gov/content/dam/science/cds/3d/resources/image/jupiter---europa/Jupiter%20-%20Europa.jpg',
    'titan-cassini-938nm.jpg': 'https://assets.science.nasa.gov/dynamicimage/assets/science/psd/solar/2023/09/p/i/a/2/PIA22770.jpg?w=2048&h=1024&fit=clip',
    'titania-voyager-usgs.jpg': 'https://assets.science.nasa.gov/content/dam/science/cds/3d/resources/image/uranus---titania/Uranus%20-%20Titania.jpg',
    'triton-voyager-usgs.jpg': 'https://assets.science.nasa.gov/content/dam/science/cds/3d/resources/image/neptune---triton/Neptune%20-%20Triton.jpg',
}
for filename, url in SOURCES.items():
    destination = ROOT / filename
    if destination.exists():
        continue
    with urlopen(Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=60) as response:
        if not response.headers.get('Content-Type', '').startswith('image/jpeg'):
            raise RuntimeError(f'{filename}: unexpected content type')
        destination.write_bytes(response.read())
