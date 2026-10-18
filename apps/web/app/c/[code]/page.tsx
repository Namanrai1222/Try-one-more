import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Masthead } from '../../masthead';
import { challengeLine, parseChallenge } from './challenge';

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const challenge = parseChallenge((await params).code);
  if (!challenge) return {};
  const description = `${challengeLine(challenge)} Your turn.`;
  return {
    title: 'Your turn',
    description,
    openGraph: { title: 'Your turn', description },
    twitter: { card: 'summary_large_image', title: 'Your turn', description },
  };
}

/** Landing for a challenge link (PRD.md §4.7). Opens the level directly, locked or not. */
export default async function ChallengePage({ params }: Props) {
  const challenge = parseChallenge((await params).code);
  if (!challenge) notFound();
  const { level, deaths, name } = challenge;

  return (
    <main className="desk-shell">
      <Masthead />
      <section className="slip challenge-slip" aria-labelledby="challenge-title">
        <div className="slip-head">
          <span>Challenge / Level {level}</span>
          <span>{name}</span>
        </div>
        <h1 id="challenge-title" className="mt-4 font-display text-xl leading-tight">
          {challengeLine(challenge)}
        </h1>
        {/* The death number is the hero (DESIGNING.md §2.2): red pen, 61px mono. */}
        <p className="death-figure mt-4" aria-hidden="true">
          {deaths}
        </p>
        <p className="mt-2 text-md">Your turn. It looks fair. It isn’t.</p>
        <Link href={`/play/rage?level=${level}&vs=${deaths}`} className="btn btn-ink mt-6">
          Play level {level}
        </Link>
      </section>
    </main>
  );
}
