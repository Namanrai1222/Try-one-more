'use client';

import { LEVELS } from '@jom/game-rage/levels';
import { useRecord } from './use-save';

/**
 * The returning player's line above the headline: their own deaths, honestly counted on this
 * device (the global count arrives with the server). First-time visitors see the pitch instead.
 */
export function DeathCounter() {
  const { deaths, worst, next } = useRecord();
  if (deaths === 0) {
    return <p className="mono-label">Candidate notice / 001 · Four chapters, forty levels</p>;
  }
  return (
    <p className="home-returning">
      {deaths.toLocaleString('en-IN')} {deaths === 1 ? 'death' : 'deaths'} on this device
      {worst ? `, most of them on ${worst}` : ''}. Level {next + 1} of {LEVELS.length} is waiting.
    </p>
  );
}
