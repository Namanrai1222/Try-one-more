import { STEP_MS } from '@jom/engine';
import { PushInput, ROUND_FRAMES } from '@jom/game-push-party/sim';
import { describe, expect, it } from 'vitest';
import { PushMatch } from '../src/push-match.ts';

const T0 = 1_000_000;
/** 1ms into frame `f`, so float rounding never lands on the previous frame. */
const at = (frame: number) => T0 + frame * STEP_MS + 1;

function started(n: number) {
  const m = new PushMatch();
  for (let i = 0; i < n; i++) m.join(`p${i}`);
  expect(m.start('p0', T0)).toEqual({ ok: true });
  return m;
}

/** Everyone sends `mask(id, f)` on time each frame (a heartbeat when unchanged). */
function play(m: PushMatch, frames: number, mask: (id: string, f: number) => number) {
  const from = m.state!.frame;
  for (let f = from; f < from + frames && m.phase === 'playing'; f++) {
    for (const id of m.players.keys()) m.input(id, f, mask(id, f), at(f));
    m.tick(at(f + 1));
  }
}

const pusher = (m: PushMatch, seat: number) => m.state!.pushers.find((p) => p.seat === seat)!;

describe('push match', () => {
  it('seats up to eight; everyone connected at the start plays', () => {
    const m = new PushMatch();
    for (let i = 0; i < 8; i++) expect(m.join(`p${i}`)).toEqual({ ok: true, seat: i });
    expect(m.join('p8')).toEqual({ ok: false, reason: 'The room is full.' });
    m.players.get('p7')!.connected = false; // dropped before the start: sits this one out
    expect(m.start('p0', T0)).toEqual({ ok: true });
    expect(m.state!.pushers.map((p) => p.seat)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(m.plays(m.players.get('p0')!)).toBe(true);
    expect(m.plays(m.players.get('p7')!)).toBe(false);
    expect(m.input('p7', 0, PushInput.Left, at(0))).toEqual({ ok: false, reason: 'not playing' });
  });

  it('moves bodies from inputs, and lets go of a player who stops sending', () => {
    const m = started(2);
    const x0 = pusher(m, 1).x;
    play(m, 20, (id) => (id === 'p1' ? PushInput.Right : 0));
    expect(pusher(m, 1).x).toBeGreaterThan(x0);
    // p1 goes silent while holding Right: after half a second the server releases it.
    for (let f = 20; f < 80; f++) m.tick(at(f + 1));
    expect(m.masks[1]).toBe(0);
  });

  it('applies a late input now and tells the client how late it was', () => {
    const m = started(2);
    m.tick(at(20)); // the server is at frame 20
    expect(m.input('p1', 5, PushInput.Up, at(20))).toEqual({ ok: true });
    m.tick(at(21));
    expect(m.masks[1]).toBe(PushInput.Up);
    expect(m.snapshot(at(21)).late[1]).toBe(15);
  });

  it('strikes malformed and future inputs', () => {
    const m = started(2);
    expect(m.input('p1', 0, 32, at(0))).toEqual({ ok: false, reason: 'malformed input' });
    expect(m.input('p1', 500, 1, at(0))).toEqual({ ok: false, reason: 'input from the future' });
    for (let i = 0; i < 20; i++) m.input('p1', 0, -1, at(0));
    expect(m.input('p1', 0, -1, at(0))).toEqual({ ok: false, reason: 'kick' });
  });

  it('a player who leaves is out and ranked last; the last one standing wins', () => {
    const m = started(3);
    play(m, 5, () => 0);
    m.leave('p2');
    play(m, 1, () => 0);
    expect(pusher(m, 2).out).toBe(true);
    // p1 walks off the edge; p0 stays put and wins.
    play(m, 300, (id) => (id === 'p1' ? PushInput.Down : 0));
    expect(m.phase).toBe('results');
    expect(m.standings).toEqual([
      { seat: 0, place: 1, out: false, left: false },
      { seat: 1, place: 2, out: true, left: false },
      { seat: 2, place: 3, out: true, left: true },
    ]);
  });

  it('ends at the time limit even if nobody falls', () => {
    const m = started(2);
    m.state!.pushers.forEach((p) => Object.assign(p, { x: 320_000 + p.seat * 40_000, y: 320_000 }));
    m.tick(at(ROUND_FRAMES + 60));
    expect(m.phase).toBe('results');
    expect(m.state!.frame).toBe(ROUND_FRAMES);
    expect(m.standings.map((s) => s.place)).toEqual([1, 1]);
  });
});
