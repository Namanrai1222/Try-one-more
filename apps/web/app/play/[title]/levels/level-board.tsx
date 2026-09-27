'use client';

import { readProgress, unlockedIndex } from '@jom/game-rage';
import { CHAPTERS, LEVELS } from '@jom/game-rage/levels';
import Link from 'next/link';
import { useSave } from '../../../use-save';

/**
 * The notice board (DESIGNING.md §3.2): a ruled list per chapter, not a grid of cards. Locked
 * levels are printed but struck through. A global median column arrives with the server.
 */
export function LevelBoard() {
  const progress = useSave() ?? readProgress(null);
  const chapters = [...new Set(LEVELS.map((l) => l.file.chapter))];
  const unlocked = unlockedIndex(
    progress,
    LEVELS.map((l) => l.file.id),
  );

  return chapters.map((chapter) => (
    <section key={chapter} className="pb-6">
      <h2 className="border-b border-ink pb-1 font-display text-lg">
        Chapter {chapter} · {CHAPTERS[chapter]}
      </h2>
      <ol>
        {LEVELS.map(({ file }, i) => {
          if (file.chapter !== chapter) return null;
          const locked = i > unlocked;
          const deaths = progress.deaths[file.id] ?? 0;
          const row = (
            <>
              <span className="w-8 font-mono text-sm">{String(i + 1).padStart(2, '0')}</span>
              <span className={`flex-1 ${locked ? 'line-through' : ''}`}>{file.name}</span>
              <span className="font-mono text-sm">
                {locked ? 'Locked' : `${deaths} ${deaths === 1 ? 'death' : 'deaths'}`}
              </span>
            </>
          );
          return (
            <li key={file.id} className="border-b border-paper-shadow">
              {locked ? (
                <div className="flex min-h-11 items-center gap-4 py-2">{row}</div>
              ) : (
                <Link
                  href={`/play/rage?level=${i + 1}`}
                  className="flex min-h-11 items-center gap-4 py-2"
                >
                  {row}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  ));
}
