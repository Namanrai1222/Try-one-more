import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { colors } from '@jom/ui';
import { notFound } from 'next/navigation';
import { ImageResponse } from 'next/og';
import { parseChallenge } from './challenge';

export const alt = 'A challenge on Just One More';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const font = (file: string) => readFile(join(process.cwd(), 'assets', 'fonts', file));

/**
 * Challenge link preview (DESIGNING.md §8 Phase 3): the friend's count, huge, so it reads at
 * thumbnail size in a WhatsApp chat. Only numbers and our own level names are drawn — no
 * player-supplied text reaches this image.
 */
export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const challenge = parseChallenge((await params).code);
  if (!challenge) notFound();
  const { level, deaths, name } = challenge;
  const [display, mono] = await Promise.all([
    font('khand-latin-700-normal.woff'),
    font('ibm-plex-mono-latin-500-normal.woff'),
  ]);

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 64,
        background: colors.paper,
        color: colors.ink,
        fontFamily: 'Plex Mono',
        borderBottom: `16px solid ${colors['red-pen']}`,
      }}
    >
      <div style={{ display: 'flex', fontSize: 34 }}>
        {`Just One More / Level ${level} / ${name}`}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 40 }}>
        <div style={{ display: 'flex', fontSize: 280, lineHeight: 0.9 }}>{String(deaths)}</div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'Khand',
            fontSize: 72,
            lineHeight: 1,
            paddingBottom: 16,
          }}
        >
          <div style={{ display: 'flex', color: colors['red-pen'] }}>
            {deaths === 1 ? 'death.' : 'deaths.'}
          </div>
          <div style={{ display: 'flex' }}>Your turn.</div>
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: 'Khand', data: display, weight: 700, style: 'normal' },
        { name: 'Plex Mono', data: mono, weight: 500, style: 'normal' },
      ],
    },
  );
}
