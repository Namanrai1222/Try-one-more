import Link from 'next/link';
import type { ReactNode } from 'react';
import { WalletBadge } from './wallet-badge';

type Page = 'home' | 'levels' | 'party';

/** The one masthead on every shell page: wordmark home, the two places to go, the wallet. */
export function Masthead({ current, nav }: { current?: Page; nav?: ReactNode }) {
  const here = (page: Page) => (current === page ? ('page' as const) : undefined);
  return (
    <header className="masthead">
      <Link href="/" className="wordmark" aria-current={here('home')}>
        <span className="wordmark-chip" aria-hidden="true">
          J/OM
        </span>
        Just One More
      </Link>
      <nav className="masthead-nav" aria-label="Main navigation">
        {nav ?? (
          <>
            <Link href="/play/rage/levels" aria-current={here('levels')}>
              All levels
            </Link>
            <Link href="/party" aria-current={here('party')}>
              Play with friends
            </Link>
          </>
        )}
      </nav>
      <div className="masthead-wallet">
        <WalletBadge />
      </div>
    </header>
  );
}
