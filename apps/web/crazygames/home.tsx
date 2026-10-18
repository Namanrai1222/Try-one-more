import { DailyCard } from '../app/daily-card';
import { DeathCounter } from '../app/death-counter';
import { HomeScene } from '../app/home-scene';
import { Masthead } from '../app/masthead';
import { PlayButton } from '../app/play-button';

/**
 * The CrazyGames front page: the same desk as the web home, single-player only — no party,
 * no outbound links (CrazyGames Basic Launch rules). Every action stays inside the game.
 */
export function CrazyHome({ onPlay, onDaily }: { onPlay: () => void; onDaily: () => void }) {
  return (
    <main className="desk-shell">
      <Masthead
        nav={
          <>
            <button type="button" onClick={onPlay}>
              Play the game
            </button>
            <a href="#home-modes">Daily trap</a>
          </>
        }
      />

      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-copy">
          <DeathCounter />
          <h1 id="home-title">
            A game that <span>lies to you.</span>
          </h1>
          <p className="home-lede">
            Every level looks fair. That is the first trap. Learn the rules, distrust the floor, and
            try to reach the door before the game changes its mind.
          </p>
          <div className="home-actions">
            <PlayButton onPlay={onPlay} />
            <a href="#home-modes" className="desk-link">
              Today’s trap
            </a>
          </div>
          <p className="mono-label">Arrow keys or WASD, Space to jump. On a phone, touch.</p>
        </div>
        <HomeScene onPlay={onPlay} />
      </section>

      <section id="home-modes" className="home-slips" aria-label="Ways to play">
        <article className="slip">
          <DailyCard onPlay={onDaily} />
        </article>
        <article className="slip">
          <div className="slip-head w-full">
            <span>Form R / Your record</span>
            <span>Forty levels</span>
          </div>
          <h2>One more try.</h2>
          <p>Every mistake teaches you something. Continue from your latest unlocked level.</p>
          <button type="button" onClick={onPlay} className="btn btn-line">
            Continue playing
          </button>
        </article>
      </section>

      <footer className="desk-footer mono-label">
        <span>Just One More</span>
        <span>See you after the next attempt.</span>
      </footer>
    </main>
  );
}
