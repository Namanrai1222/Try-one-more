import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Masthead } from '../../../masthead';
import { LevelBoard, RecordSummary } from './level-board';

export const dynamicParams = false;

export function generateStaticParams() {
  return [{ title: 'rage' }];
}

export const metadata: Metadata = { title: 'Levels', robots: { index: false, follow: false } };

export default async function LevelsPage({ params }: { params: Promise<{ title: string }> }) {
  const { title } = await params;
  if (title !== 'rage') notFound();
  return (
    <main className="desk-shell">
      <Masthead current="levels" />
      <header className="page-head">
        <p className="mono-label">Candidate record / Just One More</p>
        <h1>All levels</h1>
        <RecordSummary />
      </header>
      <LevelBoard />
    </main>
  );
}
