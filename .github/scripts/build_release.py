#!/usr/bin/env python3
"""Validate module.json and build release artifacts for GitHub Releases."""

from __future__ import annotations

import json
import os
from pathlib import Path
import sys
import zipfile

ROOT = Path.cwd()
OUT_DIR = ROOT / "dist"
SKIP_NAMES = {"LOCK", ".DS_Store", "Thumbs.db", "desktop.ini"}
ROOT_FILES = ("module.json", "LICENSE", "README.md", "CHANGELOG.md", "DESIGN.md")
CONTENT_DIRS = ("lang", "packs", "scripts", "styles", "templates")


def should_skip(path: Path) -> bool:
    return path.name in SKIP_NAMES or path.suffix == ".bak"


def main() -> int:
    manifest_path = ROOT / "module.json"
    if not manifest_path.is_file():
        print(f"ERROR: module.json not found in {ROOT}", file=sys.stderr)
        return 1

    manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
    module_id = manifest.get("id", "").strip()
    version = manifest.get("version", "").strip()
    if not module_id or not version:
        print("ERROR: module.json must define 'id' and 'version'", file=sys.stderr)
        return 1

    declared_paths = [
        *(manifest.get("esmodules") or []),
        *(manifest.get("styles") or []),
        *(lang.get("path") for lang in (manifest.get("languages") or []) if lang.get("path")),
    ]
    for rel in declared_paths:
        target = ROOT / rel
        if not target.is_file():
            print(f"ERROR: declared file missing: {rel}", file=sys.stderr)
            return 1

    for req_dir in CONTENT_DIRS:
        if not (ROOT / req_dir).is_dir():
            print(f"ERROR: required directory missing: {req_dir}", file=sys.stderr)
            return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    zip_path = OUT_DIR / f"{module_id}.zip"
    dist_manifest_path = OUT_DIR / "module.json"

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for file_name in ROOT_FILES:
            src = ROOT / file_name
            if src.is_file():
                zf.write(src, arcname=file_name)

        for dir_name in CONTENT_DIRS:
            base = ROOT / dir_name
            for item in sorted(base.rglob("*")):
                if item.is_file() and not should_skip(item):
                    zf.write(item, arcname=item.relative_to(ROOT).as_posix())

    dist_manifest_path.write_bytes(manifest_path.read_bytes())

    tag = os.environ.get("GITHUB_REF_NAME", f"v{version}")
    repo = os.environ.get("GITHUB_REPOSITORY", "carlos-decastro/t20-compendios-completos")
    notes = "\n".join([
        f"## Tormenta20 — Compêndios Completos {tag}",
        "",
        "### Instalação no Foundry VTT v14 (Manifest URL)",
        "```text",
        f"https://github.com/{repo}/releases/latest/download/module.json",
        "```",
        "",
        f"Consulte o [CHANGELOG.md](https://github.com/{repo}/blob/{tag}/CHANGELOG.md) para a lista completa de novidades.",
    ])
    (OUT_DIR / "release-notes.md").write_text(notes + "\n", encoding="utf-8")

    with zipfile.ZipFile(zip_path, "r") as zf:
        names = zf.namelist()
        if "module.json" not in names:
            print("ERROR: module.json missing from zip root", file=sys.stderr)
            return 1
        print(f"Built {zip_path} ({zip_path.stat().st_size} bytes, {len(names)} files)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
