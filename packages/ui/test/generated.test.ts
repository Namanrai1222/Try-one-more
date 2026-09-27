import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderContrastReport, renderTokensCss } from '../src/render.ts';

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const hint = 'Out of date. Run: pnpm --filter @jom/ui generate';

describe('generated files are in sync with src/tokens.ts', () => {
  it('tokens.css', () => expect(read('../tokens.css'), hint).toBe(renderTokensCss()));
  it('CONTRAST.md', () => expect(read('../CONTRAST.md'), hint).toBe(renderContrastReport()));
});
