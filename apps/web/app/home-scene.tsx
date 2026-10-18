'use client';

import { LEVELS } from '@jom/game-rage/levels';
import Link from 'next/link';
import { useRef } from 'react';
import { useRecord } from './use-save';

// The Blender diorama (tooling/blender/home_diorama.py): a level as an exam paper on the desk.
const FIGURE = new URL('./art/home-diorama.webp', import.meta.url).href;
const FIGURE_SMALL = new URL('./art/home-diorama-800.webp', import.meta.url).href;

/** Fig. 01: the continue level, as a diorama. Tilts towards a mouse; a tap or click plays. */
export function HomeScene({ onPlay }: { onPlay?: () => void } = {}) {
  const figure = useRef<HTMLAnchorElement>(null);
  const { next } = useRecord();
  const file = LEVELS[next]!.file;
  const number = String(next + 1).padStart(2, '0');

  function tilt(event: React.PointerEvent<HTMLAnchorElement>) {
    if (event.pointerType !== 'mouse' || !figure.current) return;
    const bounds = figure.current.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    figure.current.style.setProperty('--fig-ry', `${x * 6}deg`);
    figure.current.style.setProperty('--fig-rx', `${-y * 5}deg`);
  }

  function resetTilt() {
    figure.current?.style.removeProperty('--fig-ry');
    figure.current?.style.removeProperty('--fig-rx');
  }

  return (
    <Link
      ref={figure}
      href={`/play/rage?level=${next + 1}`}
      className="home-figure"
      aria-label={`Play level ${next + 1}: ${file.name}`}
      onClick={
        onPlay &&
        ((event) => {
          event.preventDefault();
          onPlay();
        })
      }
      onPointerMove={tilt}
      onPointerLeave={resetTilt}
      onBlur={resetTilt}
    >
      {/* A plain img: this component also ships in the CrazyGames Vite build, without next/image. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={FIGURE}
        srcSet={`${FIGURE_SMALL} 800w, ${FIGURE} 1600w`}
        sizes="(max-width: 900px) 100vw, 50vw"
        width={1600}
        height={1600}
        alt=""
        fetchPriority="high"
      />
      <span className="home-figure-cap" aria-hidden="true">
        <span>
          Fig. {number} / {file.name}
        </span>
        <span>
          {next + 1} of {LEVELS.length} unlocked
        </span>
      </span>
      <span className="home-figure-note" aria-hidden="true">
        Looks easy,
        <br />
        doesn’t it?
      </span>
      <span className="home-figure-foot" aria-hidden="true">
        <span>Trust nothing</span>
        <span className="home-figure-go">
          <span className="figure-hover">Click to play</span>
          <span className="figure-touch">Tap to play</span>
        </span>
      </span>
    </Link>
  );
}
