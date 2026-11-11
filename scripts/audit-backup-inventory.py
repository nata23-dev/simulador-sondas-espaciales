"""Inventario reproducible de los cambios pendientes antes del respaldo Git."""
from __future__ import annotations

import json
import re
import subprocess
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "evidence" / "backup-08-11b" / "inventory.json"


def paths(*args: str) -> list[str]:
    raw = subprocess.check_output(["git", *args, "-z"], cwd=ROOT)
    return [part.decode("utf-8", errors="surrogateescape") for part in raw.split(b"\0") if part]


def size_of(name: str) -> int:
    return (ROOT / name).stat().st_size


def category(name: str) -> str:
    parts = Path(name).parts
    if name.startswith("evidence/voyager-stage9b/Kernels/") and name.lower().endswith(".bsp"):
        return "kernels_alternativos"
    if parts[0] == "evidence":
        return "evidencia"
    if parts[0] == "docs" or name == "MIGRACION_OTRA_LAPTOP.md":
        return "documentacion"
    if parts[0] == "scripts":
        return "scripts"
    if parts[0] == "tests":
        return "pruebas"
    if parts[0] in {"public", "assets"}:
        return "recursos"
    if parts[0] == "src":
        return "codigo"
    return "otros"


def main() -> None:
    new = sorted(set(paths("ls-files", "--others", "--exclude-standard"))
                 | set(paths("diff", "--cached", "--name-only", "--diff-filter=A")))
    modified = sorted((set(paths("diff", "--name-only", "--diff-filter=M"))
                       | set(paths("diff", "--cached", "--name-only", "--diff-filter=M"))) - set(new))
    deleted = sorted(set(paths("diff", "--name-only", "--diff-filter=D"))
                     | set(paths("diff", "--cached", "--name-only", "--diff-filter=D")))
    tracked = paths("ls-files")
    new_records = [{"path": name, "bytes": size_of(name), "category": category(name)} for name in new]
    modified_records = [{"path": name, "bytes": size_of(name), "category": category(name)} for name in modified]
    size_thresholds = {"over50MiB": [], "over100MiB": []}
    for record in new_records + modified_records:
        if record["bytes"] > 50 * 1024 * 1024:
            size_thresholds["over50MiB"].append(record)
        if record["bytes"] > 100 * 1024 * 1024:
            size_thresholds["over100MiB"].append(record)
    suspicious_name = re.compile(r"(^|/)(\.env($|\.)|id_(rsa|ed25519)|.*\.(pem|key|p12|pfx)$)", re.I)
    secret_patterns = {
        "private_key": re.compile(r"-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----"),
        "github_token": re.compile(r"(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})"),
        "openai_key": re.compile(r"sk-[A-Za-z0-9_-]{35,}"),
        "aws_access_key": re.compile(r"AKIA[0-9A-Z]{16}"),
    }
    findings = []
    for record in new_records + modified_records:
        name = record["path"]
        if suspicious_name.search(name):
            findings.append({"path": name, "reason": "suspicious_filename"})
        if record["bytes"] > 4 * 1024 * 1024 or Path(name).suffix.lower() not in {
            ".js", ".mjs", ".py", ".md", ".json", ".csv", ".tsv", ".txt", ".html", ".css", ".yml", ".yaml"
        }:
            continue
        try:
            lines = (ROOT / name).read_text(encoding="utf-8").splitlines()
        except (UnicodeError, OSError):
            continue
        for number, line in enumerate(lines, start=1):
            for label, pattern in secret_patterns.items():
                if pattern.search(line):
                    findings.append({"path": name, "line": number, "reason": label})
    all_project_paths = set(tracked) | set(new)
    project_bytes = sum(size_of(name) for name in all_project_paths if (ROOT / name).is_file())
    report = {
        "baseCommit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
        "newCount": len(new_records), "modifiedCount": len(modified_records), "deleted": deleted,
        "newBytes": sum(r["bytes"] for r in new_records),
        "modifiedBytes": sum(r["bytes"] for r in modified_records),
        "projectBytes": project_bytes,
        "categoriesNew": dict(Counter(r["category"] for r in new_records)),
        "top20New": sorted(new_records, key=lambda r: r["bytes"], reverse=True)[:20],
        "sizeThresholds": size_thresholds,
        "sensitiveFindings": findings,
        "newFiles": new_records,
        "modifiedFiles": modified_records,
        "ignoredRoots": subprocess.check_output(["git", "status", "--ignored", "--short"], cwd=ROOT, text=True)
            .splitlines(),
    }
    report["ignoredRoots"] = [line[3:] for line in report["ignoredRoots"] if line.startswith("!! ")]
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    self_record = next((r for r in new_records if r["path"] == OUTPUT.relative_to(ROOT).as_posix()), None)
    if self_record:
        base_project_bytes = project_bytes - self_record["bytes"]
        for _ in range(8):
            report["newBytes"] = sum(r["bytes"] for r in new_records)
            report["projectBytes"] = base_project_bytes + self_record["bytes"]
            encoded = (json.dumps(report, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
            if len(encoded) == self_record["bytes"]:
                break
            self_record["bytes"] = len(encoded)
    OUTPUT.write_bytes((json.dumps(report, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    print(json.dumps({key: report[key] for key in (
        "newCount", "modifiedCount", "deleted", "newBytes", "modifiedBytes",
        "projectBytes", "categoriesNew", "sizeThresholds", "sensitiveFindings", "ignoredRoots"
    )}, ensure_ascii=False, indent=2))
    print("Top 20:")
    for record in report["top20New"]:
        print(f"{record['bytes'] / 1024**2:8.3f} MiB  {record['path']}")


if __name__ == "__main__":
    main()
