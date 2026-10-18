'use client';

import { readProgress, unlockedIndex } from '@jom/game-rage';
import { LEVELS } from '@jom/game-rage/levels';
import type { Progress } from '@jom/game-rage';
import { saveKey } from '@jom/platform-sdk';
import { useSyncExternalStore } from 'react';

const readSave = () => {
  try {
    return window.localStorage.getItem(saveKey('rage'));
  } catch {
    return null; // blocked storage: everything reads as a fresh save
  }
};
const noSubscribe = () => () => {};

/** The rage title's on-device save, validated. `null` during the server render. */
export function useSave(): Progress | null {
  const raw = useSyncExternalStore(noSubscribe, readSave, () => undefined);
  if (raw === undefined) return null;
  try {
    return readProgress(raw ? JSON.parse(raw) : null);
  } catch {
    return readProgress(null);
  }
}

export interface PlayerRecord {
  /** Deaths on this device across every level. */
  deaths: number;
  /** 0-based index of the level the player continues from. */
  next: number;
  /** Levels cleared at least once. */
  cleared: number;
  /** Name of the level with the most deaths, once there is one. */
  worst: string | null;
}

/** The player's record, read from the save; a fresh record during the server render. */
export function useRecord(): PlayerRecord {
  const progress = useSave() ?? readProgress(null);
  const ids = LEVELS.map(({ file }) => file.id);
  const unlocked = unlockedIndex(progress, ids);
  const next = Math.min(unlocked, LEVELS.length - 1);
  let worst: string | null = null;
  let most = 0;
  for (const { file } of LEVELS) {
    const n = progress.deaths[file.id] ?? 0;
    if (n > most) [most, worst] = [n, file.name];
  }
  return {
    deaths: Object.values(progress.deaths).reduce((sum, n) => sum + n, 0),
    next,
    cleared: LEVELS.filter(({ file }, i) => i < unlocked || progress.best[file.id]).length,
    worst,
  };
}
