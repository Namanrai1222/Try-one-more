'use client';

import { shareClip, whatsappUrl } from '@jom/clip';
import { Input, utcDay } from '@jom/game-rage';
import type { GameController, HudState } from '@jom/game-rage';
import {
  createConsoleTransport,
  createDeviceContext,
  createTelemetryBus,
  recordRealError,
} from '@jom/platform-sdk';
import type { StorageLike, TelemetryProps } from '@jom/platform-sdk';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { challengePath } from '../../c/path';
import { createCrazyBridge, loadCrazySdk } from '../../crazygames/sdk';

function safeLocalStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null; // blocked storage / private mode: telemetry stays in memory
  }
}

const COARSE = '(pointer: coarse)';
const subscribeCoarse = (cb: () => void) => {
  const mq = window.matchMedia(COARSE);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
const useTouch = () =>
  useSyncExternalStore(
    subscribeCoarse,
    () => window.matchMedia(COARSE).matches,
    () => false,
  );

const TAUNT_MS = 1800;
/** Lifetime deaths on a level before a hint is offered, and before "Watch how" is. */
const HINT_AFTER_DEATHS = 3;
const WATCH_AFTER_DEATHS = 6;

/** Share flow for one slip; `key` ties it to the run/attempt/status it was started on. */
interface Share {
  key: string;
  phase: 'making' | 'done' | 'saved' | 'failed';
  url: string;
  text: string;
  copied?: boolean;
}

const died = (n: number) => (n === 1 ? 'once' : `${n} times`);

/**
 * Hosts the game on a full-screen surface and draws the HUD and menus as accessible DOM
 * around it. The game bundle — and Three.js with it — is fetched only here, via dynamic import.
 */
export function PlayHost({ portal = false }: { portal?: boolean }) {
  const surface = useRef<HTMLDivElement>(null);
  const game = useRef<GameController | null>(null);
  const lastDeath = useRef(0);
  const tauntTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [hud, setHud] = useState<HudState | null>(null);
  const [taunt, setTaunt] = useState<string | null>(null);
  const [vs, setVs] = useState<{ levelIndex: number; deaths: number } | null>(null);
  const [share, setShare] = useState<Share | null>(null);
  // Hints read so far, per level (index). ponytail: in memory, so a reload starts at hint 1.
  const [hintsRead, setHintsRead] = useState<Record<number, number>>({});
  const [yourTurn, setYourTurn] = useState(false);
  const wasWatching = useRef(false);
  const emit = useRef<(name: string, props?: TelemetryProps) => void>(() => {});
  const touch = useTouch();

  useEffect(() => {
    const container = surface.current;
    if (!container) return;

    let cancelled = false;
    let bridge = createCrazyBridge(null);
    // No analytics vendor yet: events queue locally; dev logs them.
    const telemetry = createTelemetryBus({
      storage: safeLocalStorage(),
      transport: process.env.NODE_ENV === 'development' ? createConsoleTransport() : null,
    });
    emit.current = (name, props) => telemetry.emit(name, props);
    const query = new URLSearchParams(window.location.search);
    const requested = Number(query.get('level'));
    // No ?level → continue from the furthest unlocked level.
    const levelIndex = Number.isInteger(requested) && requested > 0 ? requested - 1 : undefined;
    // ?vs=N: opened from a challenge link — a friend died N times on this level.
    const vsDeaths = /^(0|[1-9]\d{0,3})$/.test(query.get('vs') ?? '')
      ? Number(query.get('vs'))
      : null;
    const challenge =
      levelIndex !== undefined && vsDeaths !== null ? { levelIndex, deaths: vsDeaths } : null;
    // ?daily=1: today's Daily Trap (the same level for everyone on this UTC day).
    const daily = query.get('daily') === '1' ? utcDay() : undefined;
    const storage = safeLocalStorage();
    const ctx = createDeviceContext({
      titleId: 'rage',
      storage,
      emit: (name, props) => telemetry.emit(name, props),
    });
    ctx.isAudioMuted = () => bridge.isAudioMuted();

    const onHud = (next: HudState) => {
      if (cancelled) return;
      bridge.setPlaying(next.status === 'playing' && !next.demo);
      setHud(next);
      // The demo handed the level back: say so, briefly.
      if (wasWatching.current && !next.demo) {
        setYourTurn(true);
        setTimeout(() => setYourTurn(false), TAUNT_MS);
      }
      wasWatching.current = next.demo !== null;
      if (next.deathId !== lastDeath.current) {
        lastDeath.current = next.deathId;
        setTaunt(next.taunt);
        clearTimeout(tauntTimer.current);
        tauntTimer.current = setTimeout(() => setTaunt(null), TAUNT_MS);
      }
    };

    Promise.all([import('@jom/game-rage'), portal ? loadCrazySdk() : Promise.resolve(null)])
      .then(([{ mountGame }, sdk]) => {
        if (cancelled) return null;
        bridge = createCrazyBridge(sdk);
        return mountGame(container, {
          portal,
          levelIndex,
          challenge: challenge !== null,
          daily,
          onHud,
          ctx,
        });
      })
      .then((mounted) => {
        if (!mounted) return;
        if (cancelled) {
          mounted.destroy();
          return;
        }
        game.current = mounted;
        bridge.loaded();
        setVs(challenge);
        setStatus('ready');
      })
      .catch(() => {
        bridge.loaded();
        recordRealError(storage); // meta-traps stay quiet after a genuine failure
        if (!cancelled) setStatus('error');
      });

    const flush = () => void telemetry.flush();
    window.addEventListener('pagehide', flush);

    return () => {
      cancelled = true;
      window.removeEventListener('pagehide', flush);
      clearTimeout(tauntTimer.current);
      game.current?.destroy();
      game.current = null;
      bridge.destroy();
      telemetry.destroy();
    };
  }, [portal]);

  // Help for a stuck player, paced so it never spoils a level early: a hint after 3 deaths (up
  // to 3 hints, one at a time), and "Watch how" after 6 deaths or once every hint is read.
  const read = hud ? (hintsRead[hud.levelIndex] ?? 0) : 0;
  const stuck = hud ? hud.totalDeaths >= HINT_AFTER_DEATHS : false;
  const nextHint = hud && stuck && read < hud.hints.length ? read + 1 : null;
  const canWatch =
    !!hud?.canWatch &&
    (hud.totalDeaths >= WATCH_AFTER_DEATHS || (read > 0 && read >= hud.hints.length));
  const showHint = () => {
    if (!hud || nextHint === null) return;
    setHintsRead((r) => ({ ...r, [hud.levelIndex]: nextHint }));
    emit.current('hint_read', { level: hud.levelIndex + 1, hint: nextHint });
  };
  const watch = () => game.current?.watchHow();

  const isLast = hud ? hud.levelIndex + 1 >= hud.levelCount : false;
  const firstRun = hud?.levelIndex === 0 && hud.attempt === 1 && hud.status === 'playing';
  const shareKey = hud ? `${hud.run}:${hud.attempt}:${hud.status}` : '';
  const shareNow = share?.key === shareKey ? share : null;

  /** Clip → native share sheet, or saved file + link fallbacks (TECH_STACK.md §8 Phase 3). */
  async function startShare() {
    const g = game.current;
    if (!hud || !g || shareNow?.phase === 'making') return;
    const level = hud.levelIndex + 1;
    const where = hud.daily ? "today's Daily Trap" : `level ${level}`;
    // The Daily Trap lives on the home page; a level gets a challenge link.
    const url = hud.daily
      ? `${window.location.origin}/`
      : `${window.location.origin}${challengePath(level, hud.totalDeaths)}`;
    const text =
      hud.totalDeaths === 0
        ? `I cleared ${where} of Just One More first try. Your turn: ${url}`
        : `I died ${died(hud.totalDeaths)} on ${where} of Just One More. Your turn: ${url}`;
    const base = { key: shareKey, url, text };
    setShare({ ...base, phase: 'making' });
    const started = performance.now();
    try {
      const file = await g.clip(url);
      if (!file) return setShare(null);
      emit.current('clip_made', {
        level,
        format: file.type,
        ms: Math.round(performance.now() - started),
      });
      const channel = await shareClip(file, text);
      if (channel) emit.current('share', { level, channel, taunt: hud.taunt });
      setShare({ ...base, phase: channel === 'download' ? 'saved' : 'done' });
    } catch {
      setShare({ ...base, phase: 'failed' });
    }
  }

  const onChannel = (channel: 'whatsapp' | 'copy') => {
    if (!hud || !shareNow) return;
    if (channel === 'copy') {
      void navigator.clipboard?.writeText(shareNow.url);
      setShare({ ...shareNow, copied: true });
    }
    emit.current('share', { level: hud.levelIndex + 1, channel, taunt: hud.taunt });
  };

  return (
    <main className="game-surface fixed inset-0 overflow-hidden bg-carbon text-chalk">
      <div ref={surface} className="absolute inset-0 touch-none select-none" />

      {status === 'error' && <ErrorScreen real />}

      {hud && (
        <>
          <header className="game-hud pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 p-4">
            <div className="font-mono text-sm leading-snug">
              <p>
                {hud.daily
                  ? `Daily Trap · ${hud.daily.day}`
                  : `Level ${hud.levelIndex + 1} · ${hud.levelName}`}
              </p>
              <p className="text-marigold" aria-live="polite">
                Attempt {hud.attempt}
              </p>
              {hud.bindings && !touch && (
                // Levels 11 and 26: say plainly what the keys do now.
                <p aria-live="polite">
                  ← is {hud.bindings[0]} · → is {hud.bindings[1]} · Space is {hud.bindings[2]}
                </p>
              )}
              {!hud.demo && read > 0 && (
                <ol
                  aria-live="polite"
                  aria-label="Hints"
                  className="mt-2 flex max-w-sm list-decimal flex-col gap-1 border border-chalk/30 bg-carbon/80 py-2 pr-3 pl-7 font-body"
                >
                  {hud.hints.slice(0, read).map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ol>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              {hud.demo ? (
                <button
                  type="button"
                  onClick={() => game.current?.stopWatching()}
                  className="pointer-events-auto min-h-11 border border-chalk px-3 font-mono text-sm text-chalk"
                >
                  Stop watching
                </button>
              ) : (
                <div className="pointer-events-auto flex gap-2">
                  <HudButton
                    label={hud.muted ? 'Turn sound on' : 'Turn sound off'}
                    onClick={() => game.current?.setMuted(!hud.muted)}
                  >
                    {hud.muted ? <SoundOffIcon /> : <SoundOnIcon />}
                  </HudButton>
                  <HudButton label="Pause" onClick={() => game.current?.pause()}>
                    <PauseIcon />
                  </HudButton>
                </div>
              )}
              {!hud.demo && hud.status === 'playing' && (nextHint !== null || canWatch) && (
                <div className="pointer-events-auto flex gap-2 font-mono text-sm">
                  {nextHint !== null && (
                    <button
                      type="button"
                      onClick={showHint}
                      className="min-h-11 border border-chalk/60 bg-carbon/60 px-3 text-chalk"
                    >
                      {nextHint === 1 ? 'Hint' : `Hint ${nextHint} of ${hud.hints.length}`}
                    </button>
                  )}
                  {canWatch && (
                    <button
                      type="button"
                      onClick={watch}
                      className="min-h-11 border border-chalk/60 bg-carbon/60 px-3 text-chalk"
                    >
                      Watch how
                    </button>
                  )}
                </div>
              )}
              {hud.timer !== null && (
                <p className="font-mono text-lg leading-none text-chalk" aria-label="Time left">
                  {hud.timer.toFixed(1)}
                </p>
              )}
            </div>
          </header>

          {hud.demo && (
            // "Watch how": the recorded run plays; the keys it presses light up.
            <div className="pointer-events-none absolute inset-x-4 bottom-6 flex flex-col items-center gap-2 font-mono text-sm">
              <p className="text-chalk">Watching how it’s done · Esc to stop</p>
              <div className="flex gap-2" aria-hidden="true">
                {(
                  [
                    [Input.Left, '←'],
                    [Input.Right, '→'],
                    [Input.Jump, 'Jump'],
                  ] as const
                ).map(([bit, label]) => (
                  <span
                    key={label}
                    className={`flex min-h-11 min-w-11 items-center justify-center border px-3 ${
                      hud.demo!.keys & bit
                        ? 'border-marigold bg-marigold text-ink'
                        : 'border-chalk/40 text-chalk/60'
                    }`}
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {yourTurn && !hud.demo && hud.status === 'playing' && (
            <p
              role="status"
              className="pointer-events-none absolute inset-x-4 top-[22%] text-center font-display text-xl leading-tight text-chalk"
            >
              Your turn.
            </p>
          )}

          {taunt && !yourTurn && hud.status === 'playing' && (
            <p
              role="status"
              className="pointer-events-none absolute inset-x-4 top-[22%] text-center font-display text-xl leading-tight text-chalk"
            >
              {taunt}
            </p>
          )}

          {firstRun && !touch && (
            <p
              className={`game-keyboard-hint pointer-events-none absolute inset-x-4 ${portal ? 'bottom-20' : 'bottom-6'} mx-auto w-fit max-w-[calc(100%-2rem)] bg-ink/85 px-3 py-2 text-center font-mono text-sm text-chalk`}
            >
              ← → to move · Space to jump · {portal ? 'P' : 'Esc'} to pause · R to restart
            </p>
          )}

          {(touch || portal) && !hud.demo && hud.status === 'playing' && (
            <div
              aria-hidden="true"
              className="game-controls pointer-events-none absolute inset-x-0 bottom-0 flex font-mono text-sm text-chalk/80"
            >
              <span className="flex h-16 w-1/4 items-center justify-center border-t border-r border-chalk/20">
                ◀ {hud.bindings?.[0] ?? 'Left'}
              </span>
              <span className="flex h-16 w-1/4 items-center justify-center border-t border-chalk/20">
                {hud.bindings?.[1] ?? 'Right'} ▶
              </span>
              <span className="flex h-16 w-1/2 items-center justify-center border-t border-l border-chalk/20">
                {hud.bindings?.[2] ?? 'Jump'} ▲
              </span>
            </div>
          )}

          {hud.status === 'paused' && (
            <Panel title="Paused">
              <PrimaryButton autoFocus onClick={() => game.current?.resume()}>
                Resume
              </PrimaryButton>
              <SecondaryButton onClick={() => game.current?.restart()}>
                Restart level
              </SecondaryButton>
              {nextHint !== null && (
                <SecondaryButton onClick={showHint}>
                  {nextHint === 1 ? 'Show a hint' : `Show hint ${nextHint} of ${hud.hints.length}`}
                </SecondaryButton>
              )}
              {canWatch && <SecondaryButton onClick={watch}>Watch how it’s done</SecondaryButton>}
              {read > 0 && (
                <ol className="list-decimal pl-5 text-sm">
                  {hud.hints.slice(0, read).map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ol>
              )}
              {!portal && hud.attempt > 1 && (
                <ShareControls
                  label="Share last death"
                  share={shareNow}
                  onShare={startShare}
                  onChannel={onChannel}
                />
              )}
              {portal ? (
                <SecondaryButton onClick={() => game.current?.goToLevel(0)}>
                  Play from level 1
                </SecondaryButton>
              ) : (
                <>
                  <LevelsLink />
                  <HomeLink />
                </>
              )}
            </Panel>
          )}

          {hud.status === 'cleared' && (
            <ClearedSlip
              portal={portal}
              hud={hud}
              vs={vs}
              isLast={isLast}
              onNext={() => game.current?.goToLevel(isLast ? 0 : hud.levelIndex + 1)}
              onReplay={() => game.current?.restart()}
              share={
                !portal && (
                  <ShareControls
                    primary
                    label="Share clip"
                    share={shareNow}
                    onShare={startShare}
                    onChannel={onChannel}
                  />
                )
              }
            />
          )}

          {/* Level 15: the real slip, over a level that is not complete. Every control on it
              is just input: it dismisses the lie (SECURITY.md §9) and the floor goes. */}
          {hud.fake === 'complete' && (
            <ClearedSlip
              portal={portal}
              hud={hud}
              vs={vs}
              isLast={isLast}
              onAny={() => game.current?.nudge()}
              share={
                !portal && (
                  <ShareControls
                    primary
                    label="Share clip"
                    share={null}
                    onShare={() => game.current?.nudge()}
                    onChannel={() => {}}
                  />
                )
              }
            />
          )}
        </>
      )}

      {/* One component each for the real loading and error screens and the fakes on levels 8
          and 24, so they are pixel-identical (DESIGNING.md §3.7). A click on one is input. */}
      {(status === 'loading' || hud?.fake === 'loading') && (
        <LoadingScreen onPointerDown={() => game.current?.nudge()} />
      )}
      {hud?.fake === 'error' && <ErrorScreen onPointerDown={() => game.current?.nudge()} />}

      {!portal && (
        <Link
          href="/"
          className="sr-only focus:not-sr-only focus:absolute focus:bottom-4 focus:left-4 focus:bg-chalk focus:px-3 focus:py-2 focus:text-carbon"
        >
          Back to home
        </Link>
      )}
    </main>
  );
}

function LoadingScreen({ onPointerDown }: { onPointerDown: () => void }) {
  return (
    <div
      onPointerDown={onPointerDown}
      className="absolute inset-0 z-10 flex items-center justify-center bg-carbon"
    >
      <p className="font-mono text-sm text-chalk">Loading</p>
    </div>
  );
}

/** The real failure screen. Level 24 shows this same component; only `real` is announced. */
function ErrorScreen({ real, onPointerDown }: { real?: boolean; onPointerDown?: () => void }) {
  return (
    <div
      onPointerDown={onPointerDown}
      className="absolute inset-0 z-10 flex items-center justify-center bg-carbon px-4"
    >
      <p role={real ? 'alert' : undefined} className="text-center text-md text-chalk">
        The game didn’t load. Reload the page to try again.
      </p>
    </div>
  );
}

/**
 * The result slip (DESIGNING.md §3.5). Frozen: level 15's fake is this exact component with
 * `onAny`, which turns every control into plain input instead of its real action.
 */
function ClearedSlip({
  portal = false,
  hud,
  vs,
  isLast,
  share,
  onNext,
  onReplay,
  onAny,
}: {
  portal?: boolean;
  hud: HudState;
  vs: { levelIndex: number; deaths: number } | null;
  isLast: boolean;
  share: ReactNode;
  onNext?: () => void;
  onReplay?: () => void;
  onAny?: () => void;
}) {
  const next = onAny ?? onNext ?? (() => {});
  const replay = onAny ?? onReplay ?? (() => {});
  const deaths = hud.attempt - 1;
  return (
    <Panel title="Level cleared" onAny={onAny}>
      <p className="font-display text-lg">{hud.levelName}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 border-y border-dashed border-paper-shadow py-3 font-mono text-sm">
        <dt>Attempts</dt>
        <dd className="text-right">{hud.attempt}</dd>
        <dt>Time</dt>
        <dd className="text-right">{((hud.clearMs ?? 0) / 1000).toFixed(2)}s</dd>
        <dt>Deaths here, ever</dt>
        <dd className="text-right">{hud.totalDeaths}</dd>
        {hud.rage && (
          <>
            <dt>Rage score</dt>
            <dd className="text-right">{hud.rage.score}</dd>
          </>
        )}
        {hud.daily && (
          <>
            <dt>Daily streak</dt>
            <dd className="text-right">
              {hud.daily.streak} {hud.daily.streak === 1 ? 'day' : 'days'}
            </dd>
          </>
        )}
      </dl>
      {hud.rage && <p className="text-sm">{hud.rage.line}</p>}
      {vs?.levelIndex === hud.levelIndex && (
        <p className="font-display text-lg leading-tight">
          Your friend died {died(vs.deaths)} here. You died {died(deaths)}.{' '}
          {deaths < vs.deaths
            ? 'Tell them.'
            : deaths === vs.deaths
              ? 'A tie. Nobody learned anything.'
              : 'Maybe don’t tell them.'}
        </p>
      )}
      {hud.daily ? (
        <p className="text-sm">A new trap tomorrow. Same time, same mistakes.</p>
      ) : (
        isLast && <p className="text-sm">All forty levels cleared. You made it.</p>
      )}
      {!hud.daily && (
        <PrimaryButton autoFocus onClick={next}>
          {isLast ? 'Play from level 1' : 'Next level'}
        </PrimaryButton>
      )}
      {share}
      <SecondaryButton onClick={replay}>Replay level</SecondaryButton>
      {!portal && <HomeLink onClick={onAny} />}
    </Panel>
  );
}

function LevelsLink() {
  return (
    <Link
      href="/play/rage/levels"
      className="min-h-11 border border-ink px-6 py-3 text-center font-display text-md text-ink"
    >
      All levels
    </Link>
  );
}

/** Menus are printed slips on paper (DESIGNING.md §3.5): ink on paper, square corners, 1px rules. */
function Panel({
  title,
  children,
  onAny,
}: {
  title: string;
  children: ReactNode;
  /** Meta-trap fakes only: any press anywhere on the slip is input. */
  onAny?: () => void;
}) {
  return (
    <div
      onPointerDown={onAny}
      className="absolute inset-0 flex items-center justify-center bg-carbon/70 p-4"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="panel-title"
        className="flex max-h-full w-full max-w-sm flex-col gap-3 overflow-y-auto border border-ink bg-paper p-6 text-ink"
      >
        <h2 id="panel-title" className="font-display text-xl leading-none">
          {title}
        </h2>
        {children}
      </section>
    </div>
  );
}

type ButtonProps = { onClick: () => void; children: ReactNode; autoFocus?: boolean };

function PrimaryButton({ onClick, children, autoFocus }: ButtonProps) {
  return (
    <button
      type="button"
      autoFocus={autoFocus}
      onClick={onClick}
      className="min-h-11 rounded-button bg-ink px-6 py-3 font-display text-md text-paper"
    >
      {children}
    </button>
  );
}

function SecondaryButton({ onClick, children }: ButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-11 border border-ink px-6 py-3 font-display text-md text-ink"
    >
      {children}
    </button>
  );
}

/**
 * The share affordance (DESIGNING.md §3.5): marigold on the result slip. Where the native
 * sheet can't take the clip, it is saved and the link can go out by WhatsApp or clipboard.
 */
function ShareControls({
  label,
  primary,
  share,
  onShare,
  onChannel,
}: {
  label: string;
  primary?: boolean;
  share: Share | null;
  onShare: () => void;
  onChannel: (channel: 'whatsapp' | 'copy') => void;
}) {
  const making = share?.phase === 'making';
  const fallback = share?.phase === 'saved' || share?.phase === 'failed';
  return (
    <>
      <button
        type="button"
        onClick={onShare}
        disabled={making}
        className={`min-h-11 px-6 py-3 font-display text-md text-ink ${
          primary ? 'rounded-button bg-marigold' : 'border border-ink'
        }`}
      >
        {making ? 'Making the clip' : label}
      </button>
      <p aria-live="polite" className="text-sm empty:hidden">
        {making && 'This takes about six seconds. It replays your run.'}
        {share?.phase === 'saved' && 'Clip saved. Post it anywhere, or send the link.'}
        {share?.phase === 'failed' && 'The clip didn’t work on this device. The link still does.'}
      </p>
      {fallback && share && (
        <div className="flex gap-6 text-sm">
          <a
            href={whatsappUrl(share.text)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onChannel('whatsapp')}
            className="min-h-11 py-3 underline underline-offset-4"
          >
            Send on WhatsApp
          </a>
          <button
            type="button"
            onClick={() => onChannel('copy')}
            className="min-h-11 py-3 underline underline-offset-4"
          >
            {share.copied ? 'Link copied' : 'Copy link'}
          </button>
        </div>
      )}
    </>
  );
}

function HomeLink({ onClick }: { onClick?: () => void }) {
  return (
    <Link
      href="/"
      onClick={
        onClick &&
        ((e) => {
          e.preventDefault(); // a fake slip's link goes nowhere; the press is just input
          onClick();
        })
      }
      className="min-h-11 py-3 text-center text-sm underline underline-offset-4"
    >
      Back to home
    </Link>
  );
}

function HudButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-11 w-11 items-center justify-center border border-chalk/40 bg-carbon/60 text-chalk"
    >
      {children}
    </button>
  );
}

const icon = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  'aria-hidden': true,
} as const;

function PauseIcon() {
  return (
    <svg {...icon}>
      <path d="M8 5v14M16 5v14" />
    </svg>
  );
}

function SoundOnIcon() {
  return (
    <svg {...icon}>
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7" />
    </svg>
  );
}

function SoundOffIcon() {
  return (
    <svg {...icon}>
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      <path d="M17 9l5 6M22 9l-5 6" />
    </svg>
  );
}
