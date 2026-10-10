import { DailyCard } from '../app/daily-card';
import { HomeScene } from '../app/home-scene';
import { WalletBadge } from '../app/wallet-badge';
import '../app/home.css';

export function CrazyHome({ onPlay, onDaily }: { onPlay: () => void; onDaily: () => void }) {
  return (
    <main className="home-shell">
      <header className="home-masthead">
        <div className="home-wordmark">
          <span className="home-wordmark-symbol" aria-hidden="true">
            J/OM
          </span>
          <span>Just One More</span>
        </div>
        <nav className="home-nav" aria-label="Main navigation">
          <button type="button" onClick={onPlay}>
            Play the game
          </button>
          <a href="#home-modes">Daily trap</a>
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
              <button type="button" onClick={onPlay} className="home-primary-link">
                Play now <span aria-hidden="true">↗</span>
              </button>
              <a href="#home-modes" className="home-text-link">
                See game modes <span aria-hidden="true">→</span>
              </a>
            </div>
          </div>
          <div className="home-feature-footer">
            <span>01 / Just One More</span>
            <span>Arrow keys + Space · or touch</span>
          </div>
        </div>
        <HomeScene onPlay={onPlay} />
      </section>

      <section id="home-modes" className="home-shortcuts" aria-label="Ways to play">
        <div className="home-shortcut home-daily">
          <span className="home-shortcut-number">02 / Daily examination</span>
          <DailyCard onPlay={onDaily} />
        </div>
        <div className="home-shortcut home-party">
          <span className="home-shortcut-number">03 / Your next attempt</span>
          <h2>Forty levels. One more try.</h2>
          <p>Every mistake teaches you something. Continue from your latest unlocked level.</p>
          <button type="button" onClick={onPlay}>
            Continue playing <span aria-hidden="true">↗</span>
          </button>
        </div>
      </section>

      <footer className="home-footer">
        <span>Just One More</span>
        <span>See you after the next attempt.</span>
      </footer>
    </main>
  );
}
