import { title as push } from '@jom/game-push-party';
import { title as rage } from '@jom/game-rage';
import Link from 'next/link';
import { DailyCard } from './daily-card';
import { DeathCounter } from './death-counter';
import { HomeScene } from './home-scene';
import { Masthead } from './masthead';
import { PlayButton } from './play-button';
import { InstallButton } from './pwa';

const TITLES = [rage, push];

/** The front page (DESIGN.md): one idea in the first viewport — a game that lies — then slips. */
export default function HomePage() {
  return (
    <main className="desk-shell">
      <Masthead current="home" />

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
            <PlayButton />
            <Link href="/play/rage/levels" className="desk-link">
              All levels
            </Link>
          </div>
          <p className="mono-label">Arrow keys or WASD, Space to jump. On a phone, touch.</p>
        </div>
        <HomeScene />
      </section>

      <section className="home-slips" aria-label="Ways to play">
        <article className="slip">
          <DailyCard />
        </article>
        <article className="slip">
          <div className="slip-head w-full">
            <span>Form G / Group work</span>
            <span>2–8 players</span>
          </div>
          <h2>Misery loves company.</h2>
          <p>Start a room and send the link. The traps become everyone’s problem.</p>
          <Link href="/party" className="btn btn-line">
            Start a room
          </Link>
        </article>
      </section>

      <section className="home-register" aria-labelledby="register-title">
        <div className="page-head-row">
          <h2 id="register-title">Choose your trouble.</h2>
          <InstallButton />
        </div>
        <ol>
          {TITLES.map((title, index) => (
            <li key={title.id} className="register-row">
              <Link href={title.href ?? '/play/' + title.id}>
                <span className="mono-label">{String(index + 1).padStart(2, '0')}</span>
                <span className="register-name">{title.displayName}</span>
                <span className="mono-label">{title.players}</span>
                <span className="mono-label">Open</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <footer className="desk-footer mono-label">
        <span>Just One More</span>
        <span>See you after the next attempt.</span>
      </footer>
    </main>
  );
}
