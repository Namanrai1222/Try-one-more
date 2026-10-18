'use client';

import { readProgress, unlockedIndex } from '@jom/game-rage';
import { CHAPTERS, LEVELS } from '@jom/game-rage/levels';
import Link from 'next/link';
import { useRecord, useSave } from '../../../use-save';

/** The record line under the title, and the way back in. */
export function RecordSummary() {
  const { deaths, cleared, next } = useRecord();
  return (
    <div className="page-head-row">
      <p className="record-summary">
        {cleared} of {LEVELS.length} passed · <strong>{deaths.toLocaleString('en-IN')}</strong>{' '}
        {deaths === 1 ? 'death' : 'deaths'} on this device
      </p>
      <Link href={`/play/rage?level=${next + 1}`} className="btn btn-go">
        {cleared === 0 && deaths === 0 ? 'Start level 1' : `Continue level ${next + 1}`}
      </Link>
    </div>
  );
}

/**
 * The result sheets (DESIGNING.md §3.2): one slip per chapter, a ruled row per level with your
 * deaths and a stamp. Locked levels are printed but struck through. A global median column
 * arrives with the server.
 */
export function LevelBoard() {
  const progress = useSave() ?? readProgress(null);
  const unlocked = unlockedIndex(
    progress,
    LEVELS.map((l) => l.file.id),
  );
  const chapters = [...new Set(LEVELS.map((l) => l.file.chapter))];

  return (
    <div className="chapters">
      {chapters.map((chapter) => {
        const rows = LEVELS.map((l, i) => ({ ...l, i })).filter((l) => l.file.chapter === chapter);
        const passed = rows.filter(({ file, i }) => i < unlocked || progress.best[file.id]).length;
        return (
          <section key={chapter} className="slip chapter-slip" aria-labelledby={`ch-${chapter}`}>
            <div className="slip-head">
              <span>Result sheet / Chapter {chapter}</span>
              <span>
                {passed} of {rows.length} passed
              </span>
            </div>
            <h2 id={`ch-${chapter}`}>
              {CHAPTERS[chapter]}
              <small>Deaths</small>
            </h2>
            <ol>
              {rows.map(({ file, i }) => {
                const locked = i > unlocked;
                const done = !locked && (i < unlocked || !!progress.best[file.id]);
                const deaths = progress.deaths[file.id] ?? 0;
                const row = (
                  <>
                    <span className="font-mono text-sm">{String(i + 1).padStart(2, '0')}</span>
                    <span className="level-name">{file.name}</span>
                    <span className="level-deaths font-mono text-sm">{locked ? '' : deaths}</span>
                    <span className="stamp">{locked ? 'Locked' : done ? 'Passed' : 'Up next'}</span>
                  </>
                );
                return (
                  <li
                    key={file.id}
                    className="level-row"
                    data-locked={locked ? '' : undefined}
                    data-next={!locked && !done ? '' : undefined}
                  >
                    {locked ? (
                      <div>{row}</div>
                    ) : (
                      <Link href={`/play/rage?level=${i + 1}`}>{row}</Link>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
