'use client';

import { liveStreak, utcDay } from '@jom/game-rage';
import Link from 'next/link';
import { useSave } from './use-save';

/** The Daily Trap form (DESIGNING.md §3.1): today's UTC level and a week of streak stamps. */
export function DailyCard({ onPlay }: { onPlay?: () => void } = {}) {
  const save = useSave();
  const today = save ? utcDay() : null;
  const streak = save && today ? liveStreak(save.daily, today) : 0;
  const doneToday = !!save && save.daily.last === today;
  const week = Math.min(streak, 7);

  return (
    <>
      <div className="slip-head w-full">
        <span>Form D / Daily examination</span>
        <span>{today ?? 'Today'} (UTC)</span>
      </div>
      <h2>Daily trap</h2>
      <p>One new level a day, the same for everyone. It is generated, so nobody has a guide.</p>
      <div className="streak-row">
        <div className="streak-days" aria-hidden="true">
          {Array.from({ length: 7 }, (_, i) => (
            <span key={i} data-done={i < week ? '' : undefined} />
          ))}
        </div>
        <p className="font-mono text-sm">
          {streak > 0 ? `${streak}-day streak` : 'No streak yet'}
          {doneToday && ' · done today'}
        </p>
      </div>
      <Link
        href="/play/rage?daily=1"
        onClick={
          onPlay &&
          ((event) => {
            event.preventDefault();
            onPlay();
          })
        }
        className="btn btn-ink"
      >
        {doneToday ? 'Play it again' : 'Play today’s trap'}
      </Link>
    </>
  );
}
