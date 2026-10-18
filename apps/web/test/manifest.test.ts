import { colors } from '@jom/ui';
import { describe, expect, it } from 'vitest';
import { generateStaticParams } from '../app/icons/[name]/route';
import manifest from '../app/manifest';

describe('web app manifest', () => {
  it('is installable, uses palette colours, and every icon is a route that exists', () => {
    const m = manifest();
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('/');
    expect(m.background_color).toBe(colors.desk);
    const built = new Set(generateStaticParams().map((p) => `/icons/${p.name}`));
    for (const icon of m.icons ?? []) expect(built.has(icon.src)).toBe(true);
    expect(m.icons?.some((i) => i.purpose === 'maskable')).toBe(true);
    expect(m.icons?.some((i) => i.sizes === '512x512' && i.purpose === 'any')).toBe(true);
  });
});
