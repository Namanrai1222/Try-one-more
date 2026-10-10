import type { Metadata } from 'next';
import { PlayHost } from '../play/[title]/play-host';

export const metadata: Metadata = {
  title: 'Just One More',
  robots: { index: false, follow: false },
};

/** Single-title Basic Launch entry. No platform listing or multiplayer server dependency. */
export default function CrazyGamesPage() {
  return <PlayHost portal />;
}
