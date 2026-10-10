import { title as push } from '@jom/game-push-party';
import { title as rage } from '@jom/game-rage';
import Link from 'next/link';
import { DailyCard } from './daily-card';
import { HomeScene } from './home-scene';
import { InstallButton } from './pwa';
import { WalletBadge } from './wallet-badge';
import './home.css';

const TITLES = [rage, push];

export default function HomePage() {
  return (
    <main className="home-shell">
      <header className="home-masthead">
        <Link href="/" className="home-wordmark" aria-label="Just One More home">
          <span className="home-wordmark-symbol" aria-hidden="true">
            J/OM
          </span>
          <span>Just One More</span>
        </Link>
        <nav className="home-nav" aria-label="Main navigation">
          <Link href="/play/rage/levels">All levels</Link>
          <Link href="/party">Play with friends</Link>
        </nav>
        <div className="home-wallet">
          <WalletBadge />
        </div>
      </header>

      <section className="home-feature" aria-labelledby="home-title">
        <div className="home-feature-copy">
          <div className="home-issue-line">
            <span>Candidate notice / 001</span>
            <span>Four chapters · Forty levels</span>
          </div>
          <div className="home-feature-main">
            <p className="home-kicker">Your next attempt starts here</p>
            <h1 id="home-title">
              A game that
              <br />
              <span>lies to you.</span>
            </h1>
            <p className="home-description">
              Every level looks fair. That is the first trap. Learn the rules, distrust the floor,
              and try to reach the door before the game changes its mind.
            </p>
            <div className="home-actions">
              <Link href="/play/rage" className="home-primary-link">
                Play now <span aria-hidden="true">↗</span>
              </Link>
              <Link href="/play/rage/levels" className="home-text-link">
                View all levels <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
          <div className="home-feature-footer">
            <span>01 / Just One More</span>
            <span>Arrow keys + Space · or touch</span>
          </div>
        </div>

        <HomeScene />
      </section>

      <section className="home-shortcuts" aria-label="Ways to play">
        <div className="home-shortcut home-daily">
          <span className="home-shortcut-number">02 / Daily examination</span>
          <DailyCard />
        </div>
        <div className="home-shortcut home-party">
          <span className="home-shortcut-number">03 / Group work</span>
          <h2>Misery loves company.</h2>
          <p>Bring friends into the same room. The traps become everyone’s problem.</p>
          <Link href="/party">
            Play with friends <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>

      <section className="home-index" aria-labelledby="home-index-title">
        <div className="home-index-head">
          <div>
            <span className="home-index-label">The register / 04</span>
            <h2 id="home-index-title">Choose your trouble.</h2>
          </div>
          <InstallButton />
        </div>
        <ol>
          {TITLES.map((title, index) => (
            <li key={title.id}>
              <Link href={title.href ?? '/play/' + title.id}>
                <span className="home-index-number">{String(index + 1).padStart(2, '0')}</span>
                <span className="home-index-name">{title.displayName}</span>
                <span className="home-index-players">{title.players}</span>
                <span className="home-index-arrow" aria-hidden="true">
                  ↗
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>
      <footer className="home-footer">
        <span>Just One More</span>
        <span>See you after the next attempt.</span>
      </footer>
    </main>
  );
}
