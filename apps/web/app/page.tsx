import { title as push } from '@jom/game-push-party';
import { title as rage } from '@jom/game-rage';
import Link from 'next/link';
import { DailyCard } from './daily-card';
import { InstallButton } from './pwa';
import { WalletBadge } from './wallet-badge';

/** Titles on the platform, in build order (PRD.md §4.9). The shell knows only this listing. */
const TITLES = [rage, push];

/**
 * Home, built for N titles (DESIGNING.md §3.1). The live global death counter needs the
 * server (Phase 2 backend) — until then no number is shown rather than a made-up one.
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[68ch] flex-col px-4 py-6">
      <header className="flex items-baseline justify-between gap-4 border-b border-ink pb-2">
        <p className="font-display text-xl leading-none">Just One More</p>
        <WalletBadge />
      </header>

      <section className="flex flex-1 flex-col justify-center gap-6 py-12">
        <h1 className="font-display text-xl leading-tight">A game that lies to you.</h1>
        <p className="text-md">
          Four chapters, forty levels. Each one looks fair. None of them are. Arrow keys and space
          on a keyboard, or two thumbs on your phone.
        </p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link
            href="/play/rage"
            className="inline-block min-h-11 rounded-button bg-ink px-6 py-3 font-display text-md text-paper"
          >
            Play
          </Link>
          <Link
            href="/play/rage/levels"
            className="inline-block min-h-11 border border-ink px-6 py-3 font-display text-md text-ink"
          >
            All levels
          </Link>
          <Link
            href="/party"
            className="inline-block min-h-11 border border-ink px-6 py-3 font-display text-md text-ink"
          >
            Play with friends
          </Link>
          <InstallButton />
          <DailyCard />
        </div>
      </section>

      <section className="border-t border-dashed border-paper-shadow py-4">
        <h2 className="pb-2 text-sm font-semibold">Games</h2>
        <ol>
          {TITLES.map((t, i) => (
            <li key={t.id}>
              <Link
                href={t.href ?? `/play/${t.id}`}
                className="flex min-h-11 items-baseline gap-4 py-2"
              >
                <span className="font-mono text-sm">{String(i + 1).padStart(2, '0')}</span>
                <span className="flex-1 font-display text-md">{t.displayName}</span>
                <span className="text-sm">{t.players}</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
