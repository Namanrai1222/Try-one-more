import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
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
    <main className="mx-auto flex min-h-dvh max-w-[68ch] flex-col px-4 py-6">
      <header className="border-b border-ink pb-2">
        <Link href="/" className="font-display text-xl leading-none">
          Just One More
        </Link>
      </header>

      <section className="flex flex-1 flex-col justify-center gap-6 py-12">
        <p className="font-mono text-sm">
          Level {level} · {name}
        </p>
        <h1 className="font-display text-xl leading-tight">{challengeLine(challenge)}</h1>
        <p className="font-mono text-2xl leading-none">{deaths}</p>
        <p className="text-md">Your turn. It looks fair. It isn’t.</p>
        <div>
          <Link
            href={`/play/rage?level=${level}&vs=${deaths}`}
            className="inline-block min-h-11 rounded-button bg-ink px-6 py-3 font-display text-md text-paper"
          >
            Play level {level}
          </Link>
        </div>
      </section>
    </main>
  );
}
