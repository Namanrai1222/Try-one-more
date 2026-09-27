/** Regenerates tokens.css and CONTRAST.md from src/. Run: pnpm --filter @jom/ui generate */
import { writeFileSync } from 'node:fs';
import { renderContrastReport, renderTokensCss } from '../src/render.ts';

writeFileSync(new URL('../tokens.css', import.meta.url), renderTokensCss());
writeFileSync(new URL('../CONTRAST.md', import.meta.url), renderContrastReport());
console.log('wrote packages/ui/tokens.css and packages/ui/CONTRAST.md');
