/**
 * Font pipeline (DESIGNING.md §6, §8 Phase 0): self-hosted WOFF2, Latin subset, each file
 * under 40KB. Sources are the Fontsource packages, which ship per-unicode-range subsets;
 * All copy is English, so only the latin subsets are copied.
 *
 *   pnpm --filter @jom/web fonts
 */
import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MAX_BYTES = 40 * 1024;
const FONTS = [
  ['khand', 'khand-latin-700-normal.woff2'],
  ['ibm-plex-sans', 'ibm-plex-sans-latin-400-normal.woff2'],
  ['ibm-plex-sans', 'ibm-plex-sans-latin-600-normal.woff2'],
  ['ibm-plex-mono', 'ibm-plex-mono-latin-500-normal.woff2'],
];

const out = new URL('../public/fonts/', import.meta.url);
mkdirSync(out, { recursive: true });

let failed = false;
const licensed = new Set();
for (const [pkg, file] of FONTS) {
  const pkgDir = new URL(`../node_modules/@fontsource/${pkg}/`, import.meta.url);
  const dest = new URL(file, out);
  copyFileSync(new URL(`files/${file}`, pkgDir), dest);
  if (!licensed.has(pkg)) {
    // SIL Open Font License: the licence travels with the font files.
    copyFileSync(new URL('LICENSE', pkgDir), new URL(`LICENSE-${pkg}.txt`, out));
    licensed.add(pkg);
  }
  const size = statSync(dest).size;
  const ok = size <= MAX_BYTES;
  failed ||= !ok;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${file}  ${(size / 1024).toFixed(1)}KB`);
}

console.log(`→ ${fileURLToPath(out)}`);

// OG images (app/c/[code]/opengraph-image.tsx) render on the server with Satori, which reads
// WOFF but not WOFF2. Never served to browsers, so outside public/ and the 40KB budget.
const og = new URL('../assets/fonts/', import.meta.url);
mkdirSync(og, { recursive: true });
for (const [pkg, file] of [
  ['khand', 'khand-latin-700-normal.woff'],
  ['ibm-plex-mono', 'ibm-plex-mono-latin-500-normal.woff'],
]) {
  copyFileSync(
    new URL(`../node_modules/@fontsource/${pkg}/files/${file}`, import.meta.url),
    new URL(file, og),
  );
  console.log(`ok   ${file}  (OG images)`);
}
if (failed) {
  console.error(`A font exceeds the ${MAX_BYTES / 1024}KB budget (DESIGNING.md §6).`);
  process.exitCode = 1;
}
