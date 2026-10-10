'use client';

import { useEffect, useState } from 'react';

/** Registers the offline shell (`public/sw.js`). Production only: dev builds change every save. */
export function ServiceWorker() {
  useEffect(() => {
    if (window.location.pathname === '/crazygames' || window.self !== window.top) return;
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // No offline play, nothing else changes.
    });
  }, []);
  return null;
}

/** Chromium's install event (not in the DOM typings). */
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * "Install" appears only when the browser offers it (Chromium, not yet installed); the prompt
 * itself is the browser's own. Safari has no such event, so nothing shows there.
 */
export function InstallButton() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  useEffect(() => {
    const offered = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const installed = () => setPrompt(null);
    window.addEventListener('beforeinstallprompt', offered);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', offered);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);
  if (!prompt) return null;
  return (
    <button
      type="button"
      onClick={async () => {
        await prompt.prompt();
        setPrompt(null);
      }}
      className="inline-block min-h-11 border border-ink px-6 py-3 font-display text-md text-ink"
    >
      Install
    </button>
  );
}
