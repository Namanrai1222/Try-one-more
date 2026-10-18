'use client';

import Link from 'next/link';
import { useRecord } from './use-save';

/** The page's one filled button: "Play now" the first time, then "Continue level N". */
export function PlayButton({ onPlay }: { onPlay?: () => void } = {}) {
  const { deaths, next } = useRecord();
  const label = deaths > 0 || next > 0 ? `Continue level ${next + 1}` : 'Play now';
  if (onPlay) {
    return (
      <button type="button" onClick={onPlay} className="btn btn-go btn-lg">
        {label}
      </button>
    );
  }
  return (
    <Link href="/play/rage" className="btn btn-go btn-lg">
      {label}
    </Link>
  );
}
