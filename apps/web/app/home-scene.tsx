'use client';

import { readProgress, unlockedIndex } from '@jom/game-rage';
import { LEVELS } from '@jom/game-rage/levels';
import Link from 'next/link';
import { useRef } from 'react';
import { useSave } from './use-save';

const IDS = LEVELS.map(({ file }) => file.id);

export function HomeScene() {
  const scene = useRef<HTMLAnchorElement>(null);
  const progress = useSave() ?? readProgress(null);
  const level = Math.min(unlockedIndex(progress, IDS), LEVELS.length - 1);
  const file = LEVELS[level]!.file;

  function tilt(event: React.PointerEvent<HTMLAnchorElement>) {
    if (event.pointerType !== 'mouse' || !scene.current) return;
    const bounds = scene.current.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    scene.current.style.setProperty('--scene-ry', `${x * 13}deg`);
    scene.current.style.setProperty('--scene-rx', `${-y * 10}deg`);
  }

  function resetTilt() {
    scene.current?.style.removeProperty('--scene-ry');
    scene.current?.style.removeProperty('--scene-rx');
  }

  return (
    <Link
      ref={scene}
      href={`/play/rage?level=${level + 1}`}
      className="home-scene"
      aria-label={`Continue Just One More at level ${level + 1}: ${file.name}`}
      onPointerMove={tilt}
      onPointerLeave={resetTilt}
      onBlur={resetTilt}
    >
      <div className="home-scene-head">
        <span>
          Level {String(level + 1).padStart(2, '0')} / {file.name}
        </span>
        <span>
          {level + 1} of {LEVELS.length} unlocked
        </span>
      </div>
      <div className="home-scene-world" aria-hidden="true">
        <div className="home-scene-orbit home-scene-orbit-a" />
        <div className="home-scene-orbit home-scene-orbit-b" />
        <span className="home-scene-coordinate">Scene / 001</span>
        <div className="home-scene-grid">
          <div className="home-scene-note">
            Looks easy,
            <br />
            doesn’t it?
          </div>
          <div className="home-scene-door">
            <span>Exit</span>
          </div>
          <div className="home-scene-player">
            <span />
          </div>
          <div className="home-scene-spikes">
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="home-scene-impact">Again.</div>
          <div className="home-scene-ground" />
        </div>
        <span className="home-scene-card-label">Tilt to inspect / tap to play</span>
      </div>
      <div className="home-scene-foot">
        <span>Trust nothing</span>
        <span className="home-scene-enter">
          Enter level <span aria-hidden="true">↗</span>
        </span>
      </div>
    </Link>
  );
}
