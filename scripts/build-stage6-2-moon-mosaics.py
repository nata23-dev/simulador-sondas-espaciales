"""Create WebGL-sized copies of official cylindrical moon mosaics.

Requires Pillow. The scientific source is never retouched or enlarged.
Source files are downloaded only when absent from assets/stage6-2-sources.
"""

from pathlib import Path
from urllib.request import urlopen
from shutil import copyfileobj
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "assets" / "stage6-2-sources"
OUTPUT = ROOT / "public" / "textures" / "moons"
Image.MAX_IMAGE_PIXELS = None  # These are known, official global mosaics.

MAPS = (
    ("PIA18435-original.jpg", "enceladus-cassini-2014-2k.jpg",
     "https://assets.science.nasa.gov/content/dam/science/psd/photojournal/pia/pia18/pia18435/PIA18435.jpg"),
    ("Europa-USGS-500m.tif", "europa-usgs-voyager-galileo-2k.jpg",
     "https://planetarymaps.usgs.gov/mosaic/Europa_Voyager_GalileoSSI_global_mosaic_500m.tif"),
    ("Ganymede-USGS-color-1435m.tif", "ganymede-usgs-voyager-galileo-color-2k.jpg",
     "https://planetarymaps.usgs.gov/mosaic/Ganymede_Voyager_GalileoSSI_Global_ClrMosaic_1435m.tif"),
    ("Callisto-USGS-1km.tif", "callisto-usgs-voyager-galileo-2k.jpg",
     "https://planetarymaps.usgs.gov/mosaic/Callisto_Voyager_GalileoSSI_global_mosaic_1km.tif"),
)

GAP_FILLS = {
    "Europa-USGS-500m.tif": ("europa-gap-fill.png", "europa-illustrative-2k.jpg", "europa-usgs-observed-mask-2k.png"),
    "Ganymede-USGS-color-1435m.tif": ("ganymede-gap-fill.png", "ganymede-illustrative-2k.jpg", "ganymede-usgs-observed-mask-2k.png"),
    "Callisto-USGS-1km.tif": ("callisto-gap-fill.png", "callisto-illustrative-2k.jpg", "callisto-usgs-observed-mask-2k.png"),
}


def main():
    SOURCES.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for source_name, output_name, url in MAPS:
        source = SOURCES / source_name
        if not source.exists():
            with urlopen(url, timeout=90) as response, source.open("wb") as stream:
                copyfileobj(response, stream)
        with Image.open(source) as original:
            if original.width < 2048 or original.height < 1024:
                raise ValueError(f"Refusing to enlarge {source_name}: {original.size}")
            # Simple cylindrical 2:1, north at the top; preserve the full map.
            result = original.convert("RGB").resize((2048, 1024), Image.Resampling.LANCZOS)
            result.save(OUTPUT / output_name, format="JPEG", quality=90, subsampling=0, optimize=True)
            print(f"{output_name}: {original.size} -> {result.size}")
            if source_name in GAP_FILLS:
                generated_name, illustration_name, mask_name = GAP_FILLS[source_name]
                generated = ROOT / "assets" / "stage6-2-generations" / generated_name
                with Image.open(generated) as illustration:
                    illustration.convert("RGB").resize((2048, 1024), Image.Resampling.LANCZOS).save(
                        OUTPUT / illustration_name, format="JPEG", quality=90, subsampling=0, optimize=True)
                # TIFF nodata is exactly zero. Erode before feathering so the
                # JPEG's black nodata edge cannot bleed into the visible map.
                coverage = original.convert("RGB").resize((2048, 1024), Image.Resampling.NEAREST)
                mask = coverage.convert("L").point(lambda value: 255 if value > 0 else 0)
                mask = mask.filter(ImageFilter.MinFilter(15)).filter(ImageFilter.GaussianBlur(4))
                mask.save(OUTPUT / mask_name)
                print(f"{illustration_name}, {mask_name}: illustrative nodata fill")


if __name__ == "__main__":
    main()
