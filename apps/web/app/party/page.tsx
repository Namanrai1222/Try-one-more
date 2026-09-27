import type { Metadata } from 'next';
import { PartyClient } from './party-client';

export const metadata: Metadata = {
  title: 'Play with friends',
  description: 'Race or sabotage your friends from one link. Up to four players.',
};

/** Party play (PRD.md §4.8): rooms by link, Race and Sabotage. */
export default function PartyPage() {
  return <PartyClient />;
}
