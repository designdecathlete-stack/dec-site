from pathlib import Path
import hashlib
import json
import re
import zipfile

root = Path(__file__).resolve().parent
version = (root / "VERSION").read_text(encoding="utf-8").strip()
if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", version):
    raise SystemExit("VERSION must be MAJOR.MINOR.PATCH")
if f"## {version} " not in (root / "CHANGELOG.md").read_text(encoding="utf-8"):
    raise SystemExit("Add this version to CHANGELOG.md first")
for name in ["mobile-first-lp-template", "lp-template-copy-design", "lp-design-final-polish", "lp-quality-checker"]:
    if not (root / "skills" / name / "SKILL.md").is_file():
        raise SystemExit(f"Missing skill: {name}")
release = root / "releases"
release.mkdir(exist_ok=True)
archive = release / f"lp-skill-package-v{version}.zip"
if archive.exists():
    raise SystemExit("Release exists; increment VERSION instead of overwriting")
files = sorted(p for p in root.rglob("*") if p.is_file() and "releases" not in p.relative_to(root).parts and "__pycache__" not in p.parts and p.suffix != ".pyc")
prefix = f"lp-skill-package-v{version}"
manifest = {"version": version, "files": [{"path": p.relative_to(root).as_posix(), "bytes": p.stat().st_size, "sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]}
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as z:
    for p in files:
        z.write(p, prefix + "/" + p.relative_to(root).as_posix())
    z.writestr(prefix + "/MANIFEST.json", json.dumps(manifest, ensure_ascii=False, indent=2))
with zipfile.ZipFile(archive) as z:
    if z.testzip() is not None:
        raise SystemExit("ZIP integrity check failed")
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
archive.with_suffix(".zip.sha256").write_text(digest + "  " + archive.name + "\n", encoding="utf-8")
print(f"Verified {archive.name}: {len(files)} source files; SHA-256 {digest}")
