"""Build a complete project ZIP with explicit POSIX entry names.

Usage: python scripts/package-portable-zip.py OUTPUT.zip
"""

from __future__ import annotations

import hashlib
import json
import stat
import sys
from datetime import datetime
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


ROOT = Path(__file__).resolve().parents[1]
DIRECTORIES = (
    ".github",
    "AUDITORIA_INTEGRAL_SIMULADOR_VOYAGER",
    "capturas",
    "docs",
    "evidencias",
    "evidence",
    "public",
    "scripts",
    "src",
    "tests",
)
ROOT_FILES = (
    ".gitignore",
    "index.html",
    "package.json",
    "package-lock.json",
    "README.md",
    "vite.config.js",
)
START = """# Simulador Voyager — Etapa 03.1

El proyecto completo está en `Proyecto/`. Consulte
`Proyecto/evidence/stage3-1/INFORME_NAVEGACION.md` para los cambios, capturas y
resultados. Las discrepancias científicas SPK de la Etapa 02.3 siguen pendientes.

Para ejecutar: `cd Proyecto`, `npm ci`, `node --test tests/*.test.mjs`,
`npm run build`, `npm run dev`.

Las rutas de este ZIP usan `/`. `MANIFEST_SHA256.json` contiene las sumas de
todos los archivos de la entrega, salvo el propio manifiesto.
"""
START_STAGE4 = """# Simulador de Sondas Espaciales — Etapa 04

El proyecto completo está en `Proyecto/`. El informe y las cinco capturas nuevas
están en `Proyecto/evidence/stage4/`. Las cinco lunas nuevas pertenecen solo a
Exploración general; la discrepancia Voyager/SPK sigue pendiente.

Para ejecutar: `cd Proyecto`, `npm ci`, `node --test tests/*.test.mjs`,
`npm run build`, `npm run dev`.

Las rutas del ZIP usan `/`. `MANIFEST_SHA256.json` verifica todos los archivos
de la entrega, salvo el propio manifiesto.
"""


def info(name: str, timestamp: float | None = None) -> ZipInfo:
    if "\\" in name or name.startswith("/") or ".." in name.split("/"):
        raise ValueError(f"Ruta ZIP no portable: {name}")
    if timestamp is None:
        date = datetime(2026, 11, 1, 12, 0, 0)
    else:
        date = datetime.fromtimestamp(timestamp)
    date = max(date, datetime(1980, 1, 1))
    entry = ZipInfo(name, date.timetuple()[:6])
    entry.create_system = 3
    entry.external_attr = (stat.S_IFREG | 0o644) << 16
    entry.compress_type = ZIP_DEFLATED
    return entry


def files_to_include() -> list[Path]:
    files = [ROOT / name for name in ROOT_FILES]
    files.extend(ROOT.glob("navigation-*.png"))
    for dirname in DIRECTORIES:
        directory = ROOT / dirname
        if directory.is_dir():
            files.extend(path for path in directory.rglob("*") if path.is_file())
    for path in files:
        if not path.is_file() or path.is_symlink():
            raise ValueError(f"Archivo ausente o enlace simbólico: {path}")
    return sorted(files, key=lambda path: path.relative_to(ROOT).as_posix())


def main() -> None:
    if len(sys.argv) not in (2, 3) or (len(sys.argv) == 3 and sys.argv[2] != '--stage4'):
        raise SystemExit(__doc__)
    output = Path(sys.argv[1]).resolve()
    if output.exists():
        raise FileExistsError(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    manifest = []
    with ZipFile(output, "w", compression=ZIP_DEFLATED, compresslevel=6, allowZip64=True) as archive:
        start_bytes = (START_STAGE4 if len(sys.argv) == 3 else START).encode("utf-8")
        archive.writestr(info("INICIO.md"), start_bytes)
        manifest.append({"path": "INICIO.md", "bytes": len(start_bytes), "sha256": hashlib.sha256(start_bytes).hexdigest()})
        for source in files_to_include():
            name = "Proyecto/" + source.relative_to(ROOT).as_posix()
            digest = hashlib.sha256()
            size = 0
            with source.open("rb") as stream:
                with archive.open(info(name, source.stat().st_mtime), "w", force_zip64=True) as target:
                    while chunk := stream.read(1024 * 1024):
                        digest.update(chunk)
                        size += len(chunk)
                        target.write(chunk)
            manifest.append({"path": name, "bytes": size, "sha256": digest.hexdigest()})
        archive.writestr(
            info("MANIFEST_SHA256.json"),
            (json.dumps({"schema": "sha256-file-manifest-v1", "fileCount": len(manifest), "files": manifest}, ensure_ascii=False, indent=2) + "\n").encode("utf-8"),
        )
    print(f"{output}\n{len(manifest)} archivos con SHA-256\n{output.stat().st_size} bytes")


if __name__ == "__main__":
    main()
