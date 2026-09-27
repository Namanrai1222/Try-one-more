'use client';

import { WALLET_KEY, createDeviceWallet } from '@jom/platform-sdk';
import { useSyncExternalStore } from 'react';

const readRaw = () => {
  try {
    return window.localStorage.getItem(WALLET_KEY);
  } catch {
    return null;
  }
};
const noSubscribe = () => () => {};

/** Coins and XP from every title (the masthead's rank slot, DESIGNING.md §3.1). */
export function WalletBadge() {
  const raw = useSyncExternalStore(noSubscribe, readRaw, () => undefined);
  if (raw === undefined) return null; // server render: nothing rather than a made-up zero
  const { coins, xp } = createDeviceWallet(
    { getItem: () => raw, setItem: () => {} },
    () => {},
    'shell',
  ).read();
  return (
    <p className="font-mono text-sm" aria-label={`${coins} coins, ${xp} XP`}>
      {coins} coins · {xp} XP
    </p>
  );
}
