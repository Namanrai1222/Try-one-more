import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { colors } from '@jom/ui';
import { ImageResponse } from 'next/og';

/**
 * App icons (DESIGNING.md §8 Phase 6), drawn at build time: "+1" in the display face with a
 * red-pen underline, on paper. `maskable` keeps the mark inside the 80% safe circle that
 * Android crops to.
 */
const ICONS = {
  '32': { size: 32, mark: 0.7 },
  '180': { size: 180, mark: 0.62 },
  '192': { size: 192, mark: 0.62 },
  '512': { size: 512, mark: 0.62 },
  maskable: { size: 512, mark: 0.42 },
} as const;

export const dynamic = 'force-static';
export const dynamicParams = false;
export const generateStaticParams = () => Object.keys(ICONS).map((name) => ({ name }));

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const icon = ICONS[(await params).name as keyof typeof ICONS];
  if (!icon) return new Response('Not found', { status: 404 });
  const { size, mark } = icon;
  const glyph = Math.round(size * mark);
  const khand = await readFile(
    join(process.cwd(), 'assets', 'fonts', 'khand-latin-700-normal.woff'),
  );
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: colors.paper,
        color: colors.ink,
        fontFamily: 'Khand',
      }}
    >
      <div style={{ display: 'flex', fontSize: glyph, lineHeight: 0.8 }}>+1</div>
      <div
        style={{
          display: 'flex',
          width: Math.round(glyph * 0.9),
          height: Math.max(2, Math.round(glyph * 0.09)),
          marginTop: Math.round(glyph * 0.06),
          background: colors['red-pen'],
        }}
      />
    </div>,
    {
      width: size,
      height: size,
      fonts: [{ name: 'Khand', data: khand, weight: 700, style: 'normal' }],
    },
  );
}
