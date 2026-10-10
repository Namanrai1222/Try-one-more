'use client';

import { liveStreak, utcDay } from '@jom/game-rage';
import Link from 'next/link';
import { useSave } from './use-save';

/** Daily trap and streak, beside Play (DESIGNING.md §3.1). The date is the player's UTC day. */
export function DailyCard({ onPlay }: { onPlay?: () => void } = {}) {
  const save = useSave();
  const today = save ? utcDay() : null;
  const streak = save && today ? liveStreak(save.daily, today) : 0;
  const doneToday = !!save && save.daily.last === today;

  return (
    <div className="flex flex-col justify-center gap-1">
      <p className="text-sm font-semibold">Daily trap</p>
      <p className="font-mono text-sm">
        {streak > 0 ? `${streak}-day streak` : 'No streak yet'}
        {doneToday && ' · done today'}
      </p>
      <Link
        href="/play/rage?daily=1"
        onClick={
          onPlay &&
          ((event) => {
            event.preventDefault();
            onPlay();
          })
        }
        className="min-h-11 py-2 text-sm underline underline-offset-4"
      >
        Play today’s trap
      </Link>
    </div>
  );
}
