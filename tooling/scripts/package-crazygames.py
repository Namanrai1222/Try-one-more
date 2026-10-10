"""Zip the standalone CrazyGames build with index.html at the archive root."""

from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
import re


root = Path(__file__).resolve().parents[2]
source = root / "apps/web/dist/crazygames"
target = root / "apps/web/dist/just-one-more-crazygames.zip"
index = source / "index.html"
if not index.is_file():
    raise SystemExit("Build first: pnpm --filter @jom/web build:crazygames")

files = sorted(path for path in source.rglob("*") if path.is_file())
if len(files) > 1500:
    raise SystemExit(f"Too many files for CrazyGames: {len(files)}")
bytes_total = sum(path.stat().st_size for path in files)
if bytes_total > 20_000_000:
    raise SystemExit(f"Build exceeds mobile-homepage budget: {bytes_total} bytes")

html = index.read_text()
for url in re.findall(r'(?:src|href)="([^"]+)"', html):
    if url.startswith(("http:", "https:", "data:")):
        continue
    if url.startswith("/") or not (source / url).is_file():
        raise SystemExit(f"Missing or absolute asset URL: {url}")

with ZipFile(target, "w", ZIP_DEFLATED, compresslevel=9) as archive:
    for path in files:
        archive.write(path, path.relative_to(source))

with ZipFile(target) as archive:
    bad = archive.testzip()
    if bad:
        raise SystemExit(f"Corrupt archive member: {bad}")
    assert "index.html" in archive.namelist()

print(f"{target}: {len(files)} files, {bytes_total:,} uncompressed bytes")
