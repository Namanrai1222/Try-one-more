/**
 * DESIGNING.md §9.1: "Any hardcoded colour is a bug." Colours come from the tokens in
 * packages/ui/src/tokens.ts (and its generated tokens.css) — nowhere else.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCAN = ['apps', 'packages'];
const EXTENSIONS = /\.(ts|tsx|mts|mjs|js|jsx|css)$/;
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.turbo',
  'dist',
  'coverage',
  'public',
  'test',
  'fixtures',
]);
const ALLOWED = new Set([
  join('packages', 'ui', 'src', 'tokens.ts'),
  join('packages', 'ui', 'tokens.css'),
]);
// A hex colour after a quote, colon, paren, comma or whitespace. `this.#field` is not matched.
const HEX = /(?<=['"`:(,\s])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g;
// In JS/TS, `#dead = 1`, `#face;`, `#bad(): void` are private class members, not colours.
const PRIVATE_MEMBER_TAIL = /^\s*(?:=(?!=)|;|\(|:|\?|!)/;

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return SKIP_DIRS.has(name) ? [] : walk(full);
    return EXTENSIONS.test(name) ? [full] : [];
  });

const hits = [];
for (const top of SCAN) {
  for (const file of walk(join(ROOT, top))) {
    const rel = relative(ROOT, file);
    if (ALLOWED.has(rel)) continue;
    const isCss = file.endsWith('.css');
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .forEach((line, i) => {
        for (const m of line.matchAll(HEX)) {
          const tail = line.slice(m.index + m[0].length);
          if (!isCss && PRIVATE_MEMBER_TAIL.test(tail)) continue;
          hits.push(`${rel.split(sep).join('/')}:${i + 1}  ${m[0]}`);
        }
      });
  }
}

if (hits.length > 0) {
  console.error('Hardcoded colours found — use a token from @jom/ui instead:');
  for (const h of hits) console.error(`  ${h}`);
  process.exit(1);
}
console.log('No hardcoded colours outside packages/ui tokens.');
