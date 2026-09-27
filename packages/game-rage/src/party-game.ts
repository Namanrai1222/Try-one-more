/**
 * Party play on the client (Race and Sabotage, PRD.md §4.8). The server owns every outcome;
 * this is prediction plus presentation. A player who runs the level simulates it locally with
 * the same engine (instant controls), sends inputs, and reconciles against the server:
 * - gate changes (leader traps, armed slots) arrive stamped with the frame the server applied
 *   them at; one that lands in our past is replayed by re-simulating from the input log;
 * - every snapshot carries the server's state hash for its frame; if ours differs, we ask for
 *   the server's state and replay our inputs on top of it.
 * Saboteurs don't run anything: they watch the runner's state as the server sends it.
 */
import {
  FixedStepDriver,
  InputRecorder,
  InputReplayer,
  STEP_MS,
  SimEvent,
  createSimState,
  hashState,
  step,
  toPx,
} from '@jom/engine';
import type { SimState } from '@jom/engine';
import type { ColorToken } from '@jom/ui';
import { RACE_LEVELS, SABOTAGE_LEVELS } from '../levels/index.ts';
import type { PartyController, PartyHud, PartyOptions } from './index.ts';
import { createInputSource } from './input/source.ts';
import { createView } from './render.ts';

/** Seat colours: marigold, then the Okabe–Ito tokens (DESIGNING.md §8 Phase 5). */
export const SEAT_TINTS: readonly ColorToken[] = ['marigold', 'sky', 'jade', 'orchid'];
const HEARTBEAT_FRAMES = 6;
const HASH_HISTORY = 240;
const LIMIT_FRAMES = { race: 120 * 60, sabotage: 90 * 60 };
const PLACE_MIN_AHEAD = 160;
const PLACE_MAX_AHEAD = 900;

interface Truth {
  seat: number;
  frame: number;
  hash: string;
  gates: GateLog;
}

interface Snap {
  clock: number;
  armed: number;
  leader: number | null;
  truths: Truth[];
  watch: SimState | null;
  players: Array<{
    seat: number;
    x: number;
    y: number;
    big: number;
    gravity: number;
    cleared: boolean;
    left: boolean;
  }>;
}

type GateLog = Array<[number, number]>;

export function createParty(container: HTMLElement, o: PartyOptions): PartyController {
  const level = [...RACE_LEVELS, ...SABOTAGE_LEVELS].find((l) => l.file.id === o.level)!;
  const view = createView(container);
  view.setLevel(level.sim);
  view.setTint(SEAT_TINTS[o.plays ? o.seat : o.runnerSeat] ?? 'marigold');
  view.setMarkers(!o.plays);
  const { link } = o;
  const offs: Array<() => void> = [];

  // ---------------------------------------------------------------- my run (prediction)
  let state: SimState = createSimState(level.sim, 1);
  const recorder = new InputRecorder();
  let gateLog: GateLog = [];
  const hashes = new Map<number, string>();
  let prevX = state.player.x;
  let prevY = state.player.y;
  let lastSent = -1;
  let lastSentFrame = -HEARTBEAT_FRAMES;
  let resyncAt = 0;

  const gatesAt = (frame: number) => {
    let g = 0;
    for (const [f, gates] of gateLog) if (f <= frame) g = gates;
    return g;
  };
  const advance = (s: SimState, mask: number) => {
    s.gates = gatesAt(s.frame);
    const events = step(s, mask, level.sim);
    hashes.set(s.frame, hashState(s));
    hashes.delete(s.frame - HASH_HISTORY);
    return events;
  };
  /** Re-run our own inputs from `from` (the start, or a server state) up to where we are now. */
  const replayFrom = (from: SimState) => {
    const target = state.frame;
    const replayer = new InputReplayer(recorder.log);
    while (from.frame < target) advance(from, replayer.maskAt(from.frame));
    state = from;
  };

  const input = o.plays ? createInputSource(view.canvas) : null;
  const driver = new FixedStepDriver(() => {
    if (!input || state.cleared || state.frame >= LIMIT_FRAMES[o.mode]) return;
    const mask = input.read();
    recorder.record(state.frame, mask);
    if (mask !== lastSent || state.frame - lastSentFrame >= HEARTBEAT_FRAMES) {
      link.send('input', { f: state.frame, m: mask });
      lastSent = mask;
      lastSentFrame = state.frame;
    }
    prevX = state.player.x;
    prevY = state.player.y;
    const events = advance(state, mask);
    if (events & SimEvent.Jumped) view.jumped();
    if (events & SimEvent.Landed) view.landed();
    if (events & SimEvent.Died) {
      prevX = state.player.x;
      prevY = state.player.y;
      view.died(state);
    }
  });

  const onTruth = (t: Truth) => {
    // A gate change we haven't applied yet, stamped in our past: replay with it.
    const late = t.gates.some(
      ([f, g], i) => (gateLog[i]?.[0] !== f || gateLog[i]?.[1] !== g) && f < state.frame,
    );
    gateLog = t.gates;
    if (late) replayFrom(createSimState(level.sim, 1));
    const mine = hashes.get(t.frame);
    if (mine && mine !== t.hash && performance.now() > resyncAt) {
      resyncAt = performance.now() + 1000;
      link.send('resync');
    }
  };
  offs.push(
    link.on('state', (m: { state: SimState; truth: { gates: GateLog } }) => {
      gateLog = m.truth.gates;
      replayFrom(m.state);
    }),
  );

  // ---------------------------------------------------------------- everyone else
  let snap: Snap | null = null;
  let watched: SimState | null = null;
  let watchedPrev: { x: number; y: number; at: number } | null = null;
  offs.push(
    link.on('snap', (s: Snap) => {
      snap = s;
      // The snapshot carries our truth (if we run) or the runner's state (if we sabotage).
      const truth = s.truths.find((t) => t.seat === o.seat);
      if (o.plays && truth) onTruth(truth);
      if (!o.plays && s.watch) onWatch(s.watch);
      view.setOthers(
        s.players
          .filter(
            (p) => p.seat !== o.seat && !p.left && (o.mode === 'race' || p.seat !== o.runnerSeat),
          )
          .map((p) => ({
            x: p.x,
            y: p.y,
            big: p.big,
            gravity: p.gravity,
            tint: SEAT_TINTS[p.seat] ?? 'chalk',
          })),
      );
    }),
  );
  function onWatch(runner: SimState) {
    if (watched) watchedPrev = { x: watched.player.x, y: watched.player.y, at: performance.now() };
    watched = runner;
  }

  // ---------------------------------------------------------------- HUD
  const hud = (): PartyHud => {
    const me = o.plays ? state : watched;
    const players = snap?.players ?? [];
    const order = [...players]
      .filter((p) => !p.left)
      .sort((a, b) => Number(b.cleared) - Number(a.cleared) || b.x - a.x);
    const runnerX = watched ? toPx(watched.player.x) : 0;
    return {
      attempt: me?.attempt ?? 0,
      deaths: me?.deaths ?? 0,
      cleared: me?.cleared ?? false,
      secondsLeft: snap ? Math.max(0, Math.ceil((LIMIT_FRAMES[o.mode] - snap.clock) / 60)) : null,
      place: o.mode === 'race' ? order.findIndex((p) => p.seat === o.seat) + 1 || null : null,
      leader: snap?.leader === o.seat,
      slots: o.plays
        ? []
        : level.sim.traps.flatMap((t) => {
            if (!t.gate || t.gate === 1 || !('rect' in t)) return [];
            const x = toPx(t.rect.x);
            const y = t.type === 'faller' ? toPx(t.fallTo) : toPx(t.rect.y);
            const ahead = x - runnerX;
            return [
              {
                slot: Math.log2(t.gate),
                ...view.project(x + toPx(t.rect.w) / 2, y),
                armed: ((snap?.armed ?? 0) & t.gate) !== 0,
                inRange: ahead >= PLACE_MIN_AHEAD && ahead <= PLACE_MAX_AHEAD,
              },
            ];
          }),
    };
  };

  let raf = 0;
  let last = performance.now();
  let hudAt = 0;
  const frame = (now: number) => {
    const dt = Math.min(now - last, 250);
    last = now;
    if (o.plays) {
      const alpha = driver.advance(dt).alpha;
      view.render(
        state,
        toPx(prevX + (state.player.x - prevX) * alpha),
        toPx(prevY + (state.player.y - prevY) * alpha),
        dt / 1000,
      );
    } else if (watched) {
      // Snapshots come at 20Hz: ease from the previous one over one interval.
      const t = watchedPrev ? Math.min(1, (now - watchedPrev.at) / (3 * STEP_MS)) : 1;
      const from = watchedPrev ?? { x: watched.player.x, y: watched.player.y };
      view.render(
        watched,
        toPx(from.x + (watched.player.x - from.x) * t),
        toPx(from.y + (watched.player.y - from.y) * t),
        dt / 1000,
      );
    }
    if (now > hudAt) {
      hudAt = now + 100; // 10Hz is plenty for the DOM
      o.onHud(hud());
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    destroy() {
      cancelAnimationFrame(raf);
      for (const off of offs) off();
      input?.destroy();
      view.dispose();
    },
  };
}
