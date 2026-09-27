import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PlayHost } from './play-host';

/** Game host route (TECH_STACK.md §3). One title so far: the rage platformer. */
const TITLES = ['rage'];

export const dynamicParams = false;

export function generateStaticParams() {
  return TITLES.map((title) => ({ title }));
}

export const metadata: Metadata = {
  title: 'Play',
  robots: { index: false, follow: false },
};

export default async function PlayPage({ params }: { params: Promise<{ title: string }> }) {
  const { title } = await params;
  if (!TITLES.includes(title)) notFound();
  return <PlayHost />;
}
