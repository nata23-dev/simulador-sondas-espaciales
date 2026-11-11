"""Quita sólo blancos finales que Git detecta en evidencias de texto derivadas."""
from pathlib import Path

COMMENTS = [
    "evidence/voyager-stage9b/de421.bsp.comments.txt",
    "evidence/voyager-stage9b/vgr1.sat286.bsp.comments.txt",
    "evidence/voyager-stage9b/vgr1_sat261.bsp.comments.txt",
    "evidence/voyager-stage9b/vgr1_saturn.bsp.comments.txt",
]
LOGS = ["evidence/backup-08-11b/build.log", "evidence/voyager-stage11b/build.txt"]

for name in COMMENTS:
    path = Path(name)
    data = path.read_bytes()
    newline = b"\r\n" if b"\r\n" in data else b"\n"
    trimmed = data.rstrip(b"\r\n") + newline
    if trimmed != data:
        path.write_bytes(trimmed)
        print("Blank final lines removed:", name)

for name in LOGS:
    path = Path(name)
    data = path.read_bytes()
    cleaned = data.replace(b"[plugin builtin:vite-reporter] \r\n", b"[plugin builtin:vite-reporter]\r\n")
    cleaned = cleaned.replace(b"[plugin builtin:vite-reporter] \n", b"[plugin builtin:vite-reporter]\n")
    if cleaned != data:
        path.write_bytes(cleaned)
        print("Trailing space removed:", name)
