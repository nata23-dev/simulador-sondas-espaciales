"""Verifica sin red los once kernels alternativos conservados de la Etapa 09B."""
from __future__ import annotations

import csv
import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "evidence/voyager-stage9b/kernel-manifest.csv"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    with MANIFEST.open(encoding="utf-8", newline="") as source:
        records = list(csv.DictReader(source))
    if len(records) != 11:
        raise SystemExit(f"Manifest 09B: se esperaban 11 kernels, hay {len(records)}")
    names: set[str] = set()
    total = 0
    for record in records:
        name = record["file"]
        if name in names or not name.startswith("evidence/voyager-stage9b/Kernels/"):
            raise SystemExit(f"Ruta duplicada o externa al inventario: {name}")
        names.add(name)
        path = ROOT / name
        if not path.is_file():
            raise SystemExit(f"Falta kernel: {name}")
        expected_size = int(record["bytes"])
        actual_size = path.stat().st_size
        if actual_size != expected_size:
            raise SystemExit(f"Tamaño distinto: {name} ({actual_size} != {expected_size})")
        if sha256(path).lower() != record["sha256"].lower():
            raise SystemExit(f"SHA-256 distinto: {name}")
        if not record["url"].startswith("https://naif.jpl.nasa.gov/"):
            raise SystemExit(f"URL de procedencia inesperada: {name}")
        total += actual_size
        print(f"OK {name} ({actual_size} bytes)")
    print(f"Verificados {len(records)} kernels alternativos; {total} bytes; manifiesto SHA-256 correcto")


if __name__ == "__main__":
    main()
