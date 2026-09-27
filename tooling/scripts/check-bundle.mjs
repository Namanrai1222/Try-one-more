/**
 * Bundle budgets and isolation checks, run after `pnpm build` (CI blocking).
 *
 *  1. Initial JS per prerendered page ≤ 250KB gzipped   (TECH_STACK.md §6)
 *  2. No Three.js (the game renderer) in any page's initial JS — it loads lazily on /play only
 *  3. All client JS combined ≤ 3MB gzipped (upper bound on the 3MB payload budget)
 *  4. No server-only env var NAME from .env.example appears in client JS (SECURITY.md §2)
 *
 * "Initial JS" = the <script src> tags in the prerendered HTML, which is exactly what a
 * first visit downloads before any dynamic import.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const NEXT = join(ROOT, 'apps', 'web', '.next');
const KB = 1024;
const INITIAL_JS_BUDGET = 250 * KB;
const TOTAL_JS_BUDGET = 3 * KB * KB;
const THREE_MARKER = '__THREE__'; // three.js registers itself under this global key

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );

if (!existsSync(NEXT)) {
  console.error('apps/web/.next not found — run `pnpm build` first.');
  process.exit(1);
}

const gz = new Map();
const text = new Map();
const chunk = (file) => {
  if (!gz.has(file)) {
    const src = readFileSync(file, 'utf8');
    text.set(file, src);
    gz.set(file, gzipSync(src).length);
  }
  return { size: gz.get(file), src: text.get(file) };
};

const failures = [];
const fmt = (bytes) => `${(bytes / KB).toFixed(1)}KB`;

// 1–3: per-page initial JS
const pages = walk(join(NEXT, 'server', 'app')).filter((f) => f.endsWith('.html'));
if (pages.length === 0) failures.push('no prerendered pages found');
console.log('Initial JS per page (gzipped):');
for (const page of pages) {
  const html = readFileSync(page, 'utf8');
  const srcs = [...html.matchAll(/<script[^>]+src="\/_next\/(static\/[^"]+\.js)"/g)].map(
    (m) => m[1],
  );
  const files = [...new Set(srcs)].map((s) => join(NEXT, s));
  let total = 0;
  for (const file of files) {
    if (!existsSync(file)) {
      failures.push(`${relative(NEXT, page)} references missing ${relative(NEXT, file)}`);
      continue;
    }
    const { size, src } = chunk(file);
    total += size;
    if (src.includes(THREE_MARKER)) {
      failures.push(`${relative(NEXT, page)}: Three.js is in the initial JS (must be lazy)`);
    }
  }
  const ok = total <= INITIAL_JS_BUDGET;
  if (!ok) {
    failures.push(`${relative(NEXT, page)}: initial JS ${fmt(total)} > ${fmt(INITIAL_JS_BUDGET)}`);
  }
  const name = relative(join(NEXT, 'server', 'app'), page);
  console.log(
    `  ${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(24)} ${fmt(total).padStart(9)}  (${files.length} scripts)`,
  );
}

// 4: all client JS
const allJs = walk(join(NEXT, 'static')).filter((f) => f.endsWith('.js'));
const totalJs = allJs.reduce((sum, f) => sum + chunk(f).size, 0);
const lazyGame = allJs.filter((f) => chunk(f).src.includes(THREE_MARKER));
console.log(`All client JS: ${fmt(totalJs)} gzipped across ${allJs.length} files`);
console.log(
  `Three.js lazy chunk(s): ${lazyGame.map((f) => `${relative(NEXT, f)} ${fmt(chunk(f).size)}`).join(', ') || 'none'}`,
);
if (totalJs > TOTAL_JS_BUDGET) {
  failures.push(`all client JS ${fmt(totalJs)} > ${fmt(TOTAL_JS_BUDGET)}`);
}

// 5: private env var names leaking into client JS
const envExample = join(ROOT, '.env.example');
const privateKeys = existsSync(envExample)
  ? readFileSync(envExample, 'utf8')
      .split(/\r?\n/)
      .map((line) => /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line)?.[1])
      .filter((k) => k && !k.startsWith('NEXT_PUBLIC_'))
  : [];
for (const key of privateKeys) {
  // Whole identifiers only: `PORT` must not match inside `TRANSPORT`.
  const name = new RegExp(`(?<![A-Za-z0-9_$])${key}(?![A-Za-z0-9_$])`);
  for (const f of allJs) {
    if (name.test(chunk(f).src)) {
      failures.push(`server-only env name ${key} appears in ${relative(NEXT, f)}`);
    }
  }
}
console.log(`Server-only env names checked: ${privateKeys.length}`);

if (failures.length > 0) {
  console.error('\nBundle check FAILED:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\nBundle check passed.');
