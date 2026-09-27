import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LevelBoard } from './level-board';

export const dynamicParams = false;

export function generateStaticParams() {
  return [{ title: 'rage' }];
}

export const metadata: Metadata = { title: 'Levels', robots: { index: false, follow: false } };

export default async function LevelsPage({ params }: { params: Promise<{ title: string }> }) {
  const { title } = await params;
  if (title !== 'rage') notFound();
  return (
    <main className="mx-auto min-h-dvh max-w-[68ch] px-4 py-6">
      <header className="border-b border-ink pb-2">
        <p className="font-display text-xl leading-none">Just One More</p>
      </header>
      <h1 className="pt-6 font-display text-xl">All levels</h1>
      <p className="pb-4 text-sm">Every level looks fair. Your deaths are counted here.</p>
      <LevelBoard />
    </main>
  );
}
