'use client';

import { whatsappUrl } from '@jom/clip';
import type { PushHud } from '@jom/game-push-party';
import type { PartyHud } from '@jom/game-rage';
import { createConsoleTransport, createDeviceContext, createTelemetryBus } from '@jom/platform-sdk';
import type { RoomLink, StorageLike } from '@jom/platform-sdk';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

type Mode = 'race' | 'sabotage' | 'push';
interface Lobby {
  code: string;
  mode: Mode;
  size: number;
  phase: 'lobby' | 'playing' | 'results';
  round: number;
  host: number | null;
  runner: number | null;
  seats: Array<{ seat: number; connected: boolean; left: boolean }>;
}
interface You {
  seat: number;
  plays: boolean | null;
  budget: number;
  host: boolean;
}
interface Round {
  level: string | null;
  mode: Mode;
  runner: number | null;
  round: number;
}
interface Results {
  standings: Array<{
    seat: number;
    place: number;
    left: boolean;
    // Race / Sabotage
    cleared?: boolean;
    frames?: number | null;
    // Push Party
    out?: boolean;
  }>;
  winner: 'runner' | 'saboteurs' | null;
}
interface SdkRoom {
  roomId: string;
  send(type: string, message?: unknown): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server message shapes
  onMessage(type: string, cb: (message: any) => void): () => void;
  onLeave(cb: (code: number) => void): void;
  leave(consented?: boolean): Promise<number>;
}

/** Fixed emote set (SECURITY.md §5: no free text). ponytail: words for now, icons later. */
const EMOTES = ['Hi', 'Ha', 'Oops', 'Nice', 'RIP', 'Wait', 'Go', 'GG'];
/** Seat colours, as in the games (marigold, then Okabe–Ito). The label carries the number. */
const SEAT_BG = [
  'bg-marigold',
  'bg-sky',
  'bg-jade',
  'bg-orchid',
  'bg-lemon',
  'bg-cobalt',
  'bg-vermilion',
  'bg-chalk',
];
const MODES: Record<Mode, { name: string; start: string; line: string }> = {
  race: {
    name: 'Race',
    start: 'Start a race',
    line: 'Up to four players, one level. Being in front is a penalty.',
  },
  sabotage: {
    name: 'Sabotage',
    start: 'Start a sabotage',
    line: 'One player runs. Everyone else arms the traps.',
  },
  push: {
    name: 'Push Party',
    start: 'Start a Push Party',
    line: 'Up to eight players on a floor that falls away. Shove, don’t fall.',
  },
};
const CODE = /^[A-HJ-NP-Z2-9]{6}$/;

/** The realtime server: NEXT_PUBLIC_REALTIME_URL, or the local dev server on localhost. */
function realtimeUrl(): string | null {
  if (process.env.NEXT_PUBLIC_REALTIME_URL) return process.env.NEXT_PUBLIC_REALTIME_URL;
  return ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'ws://localhost:2567'
    : null;
}

function safeLocalStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null; // blocked storage: the wallet just isn't remembered
  }
}

function friendly(e: unknown): string {
  const text = e instanceof Error ? e.message : String(e);
  if (/not found/i.test(text)) return 'That room doesn’t exist any more. Ask for a new link.';
  if (/full|locked/i.test(text)) return 'That room is full.';
  if (/already running|Too many/i.test(text)) return text;
  return 'Couldn’t reach the party server. Try again in a moment.';
}

export function PartyClient() {
  const [status, setStatus] = useState<'choose' | 'connecting' | 'in' | 'error'>('choose');
  const [error, setError] = useState<string | null>(null);
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [you, setYou] = useState<You | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [hud, setHud] = useState<PartyHud | null>(null);
  const [pushHud, setPushHud] = useState<PushHud | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const [toasts, setToasts] = useState<Array<{ id: number; text: string }>>([]);
  const [codeInput, setCodeInput] = useState('');
  const [copied, setCopied] = useState(false);
  const room = useRef<SdkRoom | null>(null);
  const game = useRef<{ destroy(): void } | null>(null);
  const surface = useRef<HTMLDivElement>(null);
  const seat = useRef(0);
  const toastId = useRef(0);

  const toast = (text: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2500);
  };

  async function connect(target: { mode: Mode } | { code: string }) {
    const url = realtimeUrl();
    if (!url) {
      setError('Party play isn’t available here yet.');
      setStatus('error');
      return;
    }
    setStatus('connecting');
    try {
      const { Client } = await import('@colyseus/sdk');
      const client = new Client(url);
      const r = ('mode' in target
        ? await client.create('party', { mode: target.mode })
        : await client.joinById(target.code)) as unknown as SdkRoom;
      room.current = r;
      r.onMessage('lobby', (l: Lobby) => {
        setLobby(l);
        if (l.phase === 'lobby') setRound(null);
      });
      r.onMessage('you', (y: You) => {
        seat.current = y.seat;
        setYou(y);
      });
      r.onMessage('go', (g: Round) => {
        setResults(null);
        setHud(null);
        setPushHud(null);
        setRound(g);
      });
      r.onMessage('results', (res: Results) => setResults(res));
      r.onMessage('emote', (m: { seat: number; id: number }) =>
        toast(`Player ${m.seat + 1}: ${EMOTES[m.id] ?? ''}`),
      );
      r.onMessage('nope', (m: { reason: string }) => toast(m.reason));
      r.onMessage('*', () => {}); // game traffic (snap, truth, …) goes to the game's own handlers
      r.onLeave((code) => {
        room.current = null;
        if (code !== 1000 && code !== 4000) {
          setError(code === 4403 ? 'You were removed from the room.' : 'The connection dropped.');
          setStatus('error');
        }
      });
      // The address bar becomes the invite link.
      window.history.replaceState(null, '', `/party?code=${r.roomId}`);
      setStatus('in');
      r.send('hello');
    } catch (e) {
      setError(friendly(e));
      setStatus('error');
    }
  }

  // Opened from an invite link: join straight away.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code')?.toUpperCase();
    if (code && CODE.test(code)) void Promise.resolve().then(() => connect({ code }));
    return () => {
      game.current?.destroy();
      void room.current?.leave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);

  // A round is on: mount the game (it loads Three.js lazily), tear it down when it ends.
  useEffect(() => {
    const r = room.current;
    const container = surface.current;
    if (!round || !r || !container) return;
    let cancelled = false;
    const link: RoomLink = { send: (t, m) => r.send(t, m), on: (t, cb) => r.onMessage(t, cb) };
    const mounted =
      round.mode === 'push'
        ? import('@jom/game-push-party').then(({ mountPush }) => {
            const storage = safeLocalStorage();
            const telemetry = createTelemetryBus({
              storage,
              transport: process.env.NODE_ENV === 'development' ? createConsoleTransport() : null,
            });
            const ctx = createDeviceContext({
              titleId: 'push',
              storage,
              emit: (name, props) => telemetry.emit(name, props),
            });
            return mountPush(container, { link, ctx, seat: seat.current, onHud: setPushHud });
          })
        : import('@jom/game-rage').then(({ mountParty }) =>
            mountParty(container, {
              link,
              mode: round.mode as 'race' | 'sabotage',
              level: round.level ?? '',
              seat: seat.current,
              plays: round.mode === 'race' || seat.current === round.runner,
              runnerSeat: round.runner ?? 0,
              onHud: setHud,
            }),
          );
    mounted
      .then((c) => {
        if (cancelled) c.destroy();
        else game.current = c;
      })
      .catch(() => toast('The game didn’t load. Reload the page to try again.'));
    return () => {
      cancelled = true;
      game.current?.destroy();
      game.current = null;
    };
  }, [round]);

  const invite =
    lobby && typeof window !== 'undefined'
      ? `${window.location.origin}/party?code=${lobby.code}`
      : '';
  const connected = lobby?.seats.filter((s) => s.connected && !s.left).length ?? 0;
  const iRun = round ? round.mode !== 'sabotage' || you?.seat === round.runner : false;
  const earned = pushHud?.earned;

  // ---------------------------------------------------------------- in a round
  if (status === 'in' && round) {
    return (
      <main className="fixed inset-0 overflow-hidden bg-carbon text-chalk">
        <div ref={surface} className="absolute inset-0 touch-none select-none" />
        <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 p-4 font-mono text-sm">
          <div className="leading-snug">
            <p>
              {MODES[round.mode].name} · Round {round.round}
            </p>
            <p className="text-marigold" aria-live="polite">
              {round.mode === 'push'
                ? pushHud
                  ? pushHud.out
                    ? `You fell. ${pushHud.standing} still standing.`
                    : `${pushHud.standing} of ${pushHud.total} still standing`
                  : ''
                : round.mode === 'race'
                  ? hud?.place
                    ? `Position ${hud.place} of ${connected}${hud.leader ? ' · in front, so the traps are for you' : ''}`
                    : ''
                  : iRun
                    ? 'You run. They arm the traps.'
                    : `Player ${(round.runner ?? 0) + 1} runs. Traps left: ${you?.budget ?? 0}`}
            </p>
            {hud && iRun && round.mode !== 'push' && <p>Attempt {hud.attempt}</p>}
            {round.mode === 'push' && (
              <p className="pt-1 text-xs">
                Arrows or WASD to move, Space to shove. On a phone: drag on the left, tap on the
                right.
              </p>
            )}
          </div>
          {(round.mode === 'push' ? pushHud?.secondsLeft : hud?.secondsLeft) != null && (
            <p className="font-mono text-lg leading-none" aria-label="Seconds left">
              {round.mode === 'push' ? pushHud?.secondsLeft : hud?.secondsLeft}
            </p>
          )}
        </header>

        {/* Saboteurs: one button per slot, over the spot in the world it arms. */}
        {!iRun &&
          !results &&
          hud?.slots.map((s) => (
            <button
              key={s.slot}
              type="button"
              disabled={s.armed || !s.inRange || (you?.budget ?? 0) <= 0}
              onClick={() => room.current?.send('place', { slot: s.slot })}
              style={{ left: s.x, top: s.y }}
              className="absolute min-h-11 min-w-11 -translate-x-1/2 -translate-y-full border border-chalk bg-carbon px-2 font-mono text-sm text-chalk disabled:hidden"
            >
              Arm {s.slot}
            </button>
          ))}

        <Toasts toasts={toasts} />
        <EmoteBar
          low={round.mode === 'push'}
          onEmote={(id) => room.current?.send('emote', { id })}
        />

        {results && (
          <Slip title="Round over">
            {round.mode === 'sabotage' && (
              <p className="font-display text-lg">
                {results.winner === 'runner' ? 'The runner made it.' : 'The saboteurs win.'}
              </p>
            )}
            <ol className="border-y border-dashed border-paper-shadow py-2 font-mono text-sm">
              {results.standings.map((s) => (
                <li key={s.seat} className="flex items-center gap-3 py-1">
                  <span>{s.place}</span>
                  <Swatch seat={s.seat} />
                  <span className="flex-1">Player {s.seat + 1}</span>
                  <span>{outcome(round.mode, s)}</span>
                </li>
              ))}
            </ol>
            {earned && (
              <p className="font-mono text-sm">
                {`${earned.coins > 0 ? `+${earned.coins} coins · ` : ''}+${earned.xp} XP`}
              </p>
            )}
            {you?.host ? (
              <button
                type="button"
                autoFocus
                onClick={() => room.current?.send('next')}
                className="min-h-11 rounded-button bg-ink px-6 py-3 font-display text-md text-paper"
              >
                Play again
              </button>
            ) : (
              <p className="text-sm">The host starts the next round.</p>
            )}
            <Link
              href="/"
              className="min-h-11 py-3 text-center text-sm underline underline-offset-4"
            >
              Leave
            </Link>
          </Slip>
        )}
      </main>
    );
  }

  // ---------------------------------------------------------------- paper shell
  return (
    <main className="mx-auto flex min-h-dvh max-w-[68ch] flex-col px-4 py-6">
      <header className="border-b border-ink pb-2">
        <Link href="/" className="font-display text-xl leading-none">
          Just One More
        </Link>
      </header>

      {status === 'choose' && (
        <section className="flex flex-col gap-6 py-10">
          <h1 className="font-display text-xl">Play with friends</h1>
          <p className="text-md">Start a room, then send the link.</p>
          <div className="flex flex-col gap-3">
            {(['race', 'sabotage', 'push'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => void connect({ mode: m })}
                className="flex min-h-11 flex-col items-start border border-ink px-4 py-3 text-left"
              >
                <span className="font-display text-lg">{MODES[m].start}</span>
                <span className="text-sm">{MODES[m].line}</span>
              </button>
            ))}
          </div>
          <form
            className="flex flex-wrap items-end gap-3 border-t border-dashed border-paper-shadow pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              const code = codeInput.trim().toUpperCase();
              if (CODE.test(code)) void connect({ code });
              else toast('A room code is six letters and numbers.');
            }}
          >
            <label className="flex flex-col gap-1 text-sm">
              Room code
              <input
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                maxLength={6}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                className="min-h-11 w-40 border border-ink bg-paper px-3 font-mono text-md text-ink uppercase"
              />
            </label>
            <button
              type="submit"
              className="min-h-11 rounded-button bg-ink px-6 py-3 font-display text-md text-paper"
            >
              Join
            </button>
          </form>
          <Toasts toasts={toasts} paper />
        </section>
      )}

      {status === 'connecting' && (
        <p className="py-10 font-mono text-sm" role="status">
          Connecting
        </p>
      )}

      {status === 'error' && (
        <section className="flex flex-col gap-4 py-10">
          <p role="alert" className="text-md">
            {error}
          </p>
          <button
            type="button"
            onClick={() => {
              window.history.replaceState(null, '', '/party');
              setError(null);
              setLobby(null);
              setStatus('choose');
            }}
            className="min-h-11 w-fit border border-ink px-6 py-3 font-display text-md"
          >
            Back
          </button>
        </section>
      )}

      {status === 'in' && lobby && (
        <section className="flex flex-col gap-6 py-10">
          <div>
            <p className="text-sm">{MODES[lobby.mode].name} room</p>
            <h1 className="font-mono text-2xl leading-none">{lobby.code}</h1>
            <p className="pt-2 text-sm">{MODES[lobby.mode].line}</p>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(invite);
                setCopied(true);
              }}
              className="min-h-11 underline underline-offset-4"
            >
              {copied ? 'Link copied' : 'Copy the invite link'}
            </button>
            <a
              href={whatsappUrl(`Join my Just One More room: ${invite}`)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center underline underline-offset-4"
            >
              Send it on WhatsApp
            </a>
          </div>

          <ol className="border-t border-ink" aria-label="Players">
            {Array.from({ length: lobby.size }, (_, n) => {
              const s = lobby.seats.find((x) => x.seat === n);
              return (
                <li
                  key={n}
                  className="flex min-h-11 items-center gap-3 border-b border-paper-shadow"
                >
                  <Swatch seat={n} />
                  <span className="flex-1">{s ? `Player ${n + 1}` : 'Empty seat'}</span>
                  <span className="font-mono text-sm">
                    {[
                      s && you?.seat === n && 'you',
                      s && lobby.host === n && 'host',
                      s && !s.connected && 'away',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </li>
              );
            })}
          </ol>

          {!you?.host ? (
            <p className="text-sm">The host starts the round.</p>
          ) : connected < 2 ? (
            <p className="text-sm">Waiting for one more player.</p>
          ) : (
            <button
              type="button"
              onClick={() => room.current?.send('start')}
              className="min-h-11 w-fit rounded-button bg-ink px-6 py-3 font-display text-md text-paper"
            >
              Start
            </button>
          )}
          <EmoteBar paper onEmote={(id) => room.current?.send('emote', { id })} />
          <Toasts toasts={toasts} paper />
        </section>
      )}
    </main>
  );
}

function outcome(mode: Mode, s: Results['standings'][number]): string {
  if (s.left) return 'Left';
  if (mode === 'push') return s.out ? 'Fell' : 'Still standing';
  return s.cleared && s.frames != null ? `${(s.frames / 60).toFixed(2)}s` : 'Didn’t finish';
}

function Swatch({ seat }: { seat: number }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-6 w-6 border border-ink ${SEAT_BG[seat]}`}
    />
  );
}

/** `low`: sit on the bottom edge (Push Party has no on-screen touch buttons to clear). */
function EmoteBar({
  onEmote,
  paper,
  low,
}: {
  onEmote: (id: number) => void;
  paper?: boolean;
  low?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Emotes"
      className={
        paper
          ? 'flex flex-wrap gap-2'
          : `absolute inset-x-0 ${low ? 'bottom-2' : 'bottom-20'} flex flex-wrap justify-center gap-2 px-4`
      }
    >
      {EMOTES.map((e, id) => (
        <button
          key={e}
          type="button"
          onClick={() => onEmote(id)}
          className={`min-h-11 min-w-11 border px-2 font-mono text-sm ${
            paper ? 'border-ink text-ink' : 'border-chalk/40 bg-carbon/60 text-chalk'
          }`}
        >
          {e}
        </button>
      ))}
    </div>
  );
}

function Toasts({
  toasts,
  paper,
}: {
  toasts: Array<{ id: number; text: string }>;
  paper?: boolean;
}) {
  return (
    <div
      aria-live="polite"
      className={
        paper
          ? 'flex flex-col gap-1 text-sm'
          : 'pointer-events-none absolute inset-x-4 top-24 flex flex-col items-center gap-1 font-mono text-sm text-marigold'
      }
    >
      {toasts.map((t) => (
        <p key={t.id}>{t.text}</p>
      ))}
    </div>
  );
}

function Slip({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-carbon/70 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="slip-title"
        className="flex max-h-full w-full max-w-sm flex-col gap-3 overflow-y-auto border border-ink bg-paper p-6 text-ink"
      >
        <h2 id="slip-title" className="font-display text-xl leading-none">
          {title}
        </h2>
        {children}
      </section>
    </div>
  );
}
