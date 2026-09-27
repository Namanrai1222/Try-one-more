'use client';

import { readProgress } from '@jom/game-rage';
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
