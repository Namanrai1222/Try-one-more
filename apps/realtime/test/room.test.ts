import { Client } from '@colyseus/sdk';
import { boot } from '@colyseus/testing';
import type { ColyseusTestServer } from '@colyseus/testing';
import { Input } from '@jom/engine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CODE_ALPHABET, Limiter } from '../src/limits.ts';
import { createPartyServer, guardHttp } from '../src/server.ts';

type SdkRoom = Awaited<ReturnType<ColyseusTestServer['sdk']['create']>>;

/** Resolves with the next message of `type` (handlers attach before `hello` asks for state). */
function next<T = unknown>(room: SdkRoom, type: string, ms = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no "${type}" within ${ms}ms`)), ms);
    const off = room.onMessage(type, (msg: T) => {
      clearTimeout(timer);
      off();
      resolve(msg);
    });
  });
}

/** Swallow everything by default so unhandled-type warnings don't spam the output. */
function quiet(room: SdkRoom) {
  room.onMessage('*', () => {});
}

const { server, http } = createPartyServer();
let colyseus: ColyseusTestServer;

beforeAll(async () => {
  colyseus = await boot(server);
  guardHttp(http, new Limiter(40, 60_000));
});
afterAll(() => colyseus.shutdown());

describe('party room', () => {
  it('creates a room with a 6-character code from the unambiguous alphabet', async () => {
    const host = await colyseus.sdk.create('party', { mode: 'race' });
    quiet(host);
    expect(host.roomId).toMatch(new RegExp(`^[${CODE_ALPHABET}]{6}$`));
    const you = next(host, 'you');
    const lobby = next(host, 'lobby');
    host.send('hello');
    expect(await you).toMatchObject({ seat: 0, host: true });
    expect(await lobby).toMatchObject({ code: host.roomId, mode: 'race', phase: 'lobby' });
    await host.leave();
  });

  it('rejects an unknown mode without leaking validator details', async () => {
    await expect(colyseus.sdk.create('party', { mode: 'chaos' })).rejects.toThrow(/Unknown mode/);
  });

  it('two players join by code, the host starts, inputs flow and truth comes back', async () => {
    const host = await colyseus.sdk.create('party', { mode: 'race' });
    const guest = await colyseus.sdk.joinById(host.roomId);
    quiet(host);
    quiet(guest);

    const refused = next(guest, 'nope');
    guest.send('start'); // only the host may start
    expect(await refused).toEqual({ reason: 'Only the host can start.' });

    const go = next(guest, 'go');
    host.send('start');
    expect(await go).toMatchObject({ level: 'mp-race-01-front-runner', round: 1 });

    // Frames within the server clock's slack only: a burst of "future" frames gets kicked.
    for (let f = 0; f < 5; f++) host.send('input', { f, m: Input.Right });
    // Truth rides in the snapshot (one write per player per beat); wait for one past frame 0.
    type Snap = {
      players: Array<{ seat: number }>;
      truths: Array<{ seat: number; frame: number; hash: string }>;
    };
    let snap = await next<Snap>(host, 'snap');
    while (!(snap.truths.find((t) => t.seat === 0)?.frame ?? 0))
      snap = await next<Snap>(host, 'snap');
    expect(snap.players.map((p) => p.seat).sort()).toEqual([0, 1]);
    const truth = snap.truths.find((t) => t.seat === 0)!;
    expect(truth.frame).toBeGreaterThan(0);
    expect(truth.hash).toMatch(/^[0-9a-f]{8}$/);

    // A third player can't join once the round is running.
    await expect(colyseus.sdk.joinById(host.roomId)).rejects.toThrow(/already running/);
    await host.leave();
    await guest.leave();
  });

  it('kicks a client that floods frames from the future (speed hack)', async () => {
    const host = await colyseus.sdk.create('party', { mode: 'race' });
    const guest = await colyseus.sdk.joinById(host.roomId);
    quiet(host);
    quiet(guest);
    const go = next(host, 'go');
    host.send('start');
    await go;
    const kicked = new Promise<number>((resolve) => host.onLeave.once(resolve));
    for (let f = 0; f < 40; f++) host.send('input', { f: 1000 + f, m: Input.Right });
    expect(await kicked).toBe(4403);
    await guest.leave();
  });

  it('hosts Push Party: eight seats, one shared state in every snapshot, no trap slots', async () => {
    const host = await colyseus.sdk.create('party', { mode: 'push' });
    const guest = await colyseus.sdk.joinById(host.roomId);
    quiet(host);
    quiet(guest);
    const lobby = next<{ size: number; mode: string }>(guest, 'lobby');
    guest.send('hello');
    expect(await lobby).toMatchObject({ size: 8, mode: 'push' });
    const go = next(guest, 'go');
    host.send('start');
    expect(await go).toMatchObject({ mode: 'push', level: null, runner: null, round: 1 });
    guest.send('input', { f: 0, m: 2 });
    const snap = await next<{ state: { pushers: Array<{ seat: number }> }; masks: number[] }>(
      guest,
      'snap',
    );
    expect(snap.state.pushers.map((p) => p.seat)).toEqual([0, 1]);
    const refused = next(guest, 'nope');
    guest.send('place', { slot: 1 });
    expect(await refused).toEqual({ reason: 'Not now.' });
    await host.leave();
    await guest.leave();
  });

  it('refuses malformed messages', async () => {
    const host = await colyseus.sdk.create('party', { mode: 'sabotage' });
    quiet(host);
    const refused = next(host, 'nope');
    host.send('emote', { id: 'hello' });
    expect(await refused).toEqual({ reason: 'malformed message' });
    await host.leave();
  });
});

describe('per-IP room cap', () => {
  it('counts the socket address, not a spoofed X-Real-IP / X-Forwarded-For', async () => {
    // The rooms above are still live (empty rooms last 10 minutes) and all came from here.
    const errors: string[] = [];
    for (let i = 0; i < 6 && errors.length === 0; i++) {
      const spoofed = `203.0.113.${i + 1}`;
      const client = new Client('http://localhost:2568', {
        headers: { 'x-real-ip': spoofed, 'x-forwarded-for': spoofed, 'x-client-ip': spoofed },
      });
      await client.create('party', { mode: 'race' }).then(
        (room) => quiet(room),
        (e: Error) => errors.push(e.message),
      );
    }
    expect(errors).toEqual(['Too many rooms open from here.']);
  });
});

describe('matchmaking guard', () => {
  it('stops brute-forcing room codes after the per-IP limit', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 45; i++) {
      const res = await fetch('http://localhost:2568/matchmake/joinById/ZZZZZZ', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      statuses.push(res.status);
    }
    expect(statuses.at(-1)).toBe(429);
  });
});
