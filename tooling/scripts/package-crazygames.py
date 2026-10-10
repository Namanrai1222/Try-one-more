"""Validate the standalone files to upload through CrazyGames' file picker."""

from pathlib import Path
import re


root = Path(__file__).resolve().parents[2]
source = root / "apps/web/dist/crazygames"
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

print(f"Upload the contents of {source}: {len(files)} files, {bytes_total:,} bytes")
