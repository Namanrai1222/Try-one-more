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
  if (coins === 0 && xp === 0) return null; // a row of zeros tells a new player nothing
  return (
    <p aria-label={`${coins} coins, ${xp} XP`}>
      {coins} coins / {xp} XP
    </p>
  );
}
