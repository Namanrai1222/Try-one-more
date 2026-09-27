/**
 * One party room: a thin Colyseus adapter around a party game — `Match` (the platformer's Race
 * and Sabotage) or `PushMatch` (Push Party). Everything a client sends is validated here with
 * Zod (the API boundary, SECURITY.md §7) and then judged by the game. No Schema state sync: the
 * game state *is* the deterministic sim, so the room sends plain messages — a snapshot at 20Hz
 * (which, for the platformer, carries each runner's server-side truth for reconciliation).
 */
import { Room, ServerError } from '@colyseus/core';
import type { AuthContext, Client, Delayed } from '@colyseus/core';
import { STEP_MS } from '@jom/engine';
import { z } from 'zod';
import { Limiter, roomCode } from './limits.ts';
import { Match } from './match.ts';
import type { Result } from './party.ts';
import { PushMatch } from './push-match.ts';

const CreateOptions = z.object({ mode: z.enum(['race', 'sabotage', 'push']) });
const InputMsg = z.object({ f: z.number().int().min(0).max(1e7), m: z.number().int() });
const PlaceMsg = z.object({ slot: z.number().int() });
const EmoteMsg = z.object({ id: z.number().int() });

/** SECURITY.md §5: codes are unique while live; per IP ≤ 5 live rooms, ≤ 20 new rooms an hour. */
const liveCodes = new Set<string>();
const liveRoomsByIp = new Map<string, number>();
export const limits = { roomsPerIp: 5 };
export const creations = new Limiter(20, 60 * 60 * 1000);
/** Rooms expire 10 minutes after the last player leaves. */
const EMPTY_TTL_MS = 10 * 60 * 1000;
/** Reconnect grace after an unexpected drop (SECURITY.md §5). */
const RECONNECT_S = 15;
/** 20Hz, by the clock: tick spacing varies with the OS timer (about 15.6ms steps on Windows). */
const SNAPSHOT_MS = 50;

export class PartyRoom extends Room {
  /** Inputs are change-only plus a 10Hz heartbeat; anything near this is a flood. */
  override maxMessagesPerSecond = 90;
  override autoDispose = false;
  match!: Match | PushMatch;
  #creatorIp: string | null = null;
  #empty: Delayed | null = null;
  #nextSnapAt = 0;

  override onCreate(options: unknown) {
    const opts = CreateOptions.safeParse(options);
    if (!opts.success) throw new ServerError(400, 'Unknown mode.'); // no validator internals out
    const { mode } = opts.data;
    this.roomId = roomCode((c) => liveCodes.has(c));
    liveCodes.add(this.roomId);
    this.match = mode === 'push' ? new PushMatch() : new Match(mode);
    this.maxClients = this.match.maxPlayers;
    this.setTimestep(() => this.tick(), STEP_MS);
    // Start empty: a room nobody ever joins (expired seat reservation) must still expire.
    this.#empty = this.clock.setTimeout(() => void this.disconnect(), EMPTY_TTL_MS);

    this.onMessage('input', (client, raw) => {
      const msg = InputMsg.safeParse(raw);
      const r = msg.success
        ? this.match.input(client.sessionId, msg.data.f, msg.data.m, Date.now())
        : bad;
      // Inputs are fire-and-forget: a rejected one (e.g. still in flight when the round ended)
      // is dropped silently, and only the strike limit is acted on.
      if (!r.ok && r.reason === 'kick') client.leave(4403);
    });
    this.onMessage('start', (client) => {
      const m = this.match;
      if (!this.judge(client, m.start(client.sessionId, Date.now()))) return;
      this.broadcast('go', {
        level: m instanceof Match ? m.level.file.id : null,
        round: m.round,
        mode: m.mode,
        runner: m instanceof Match ? m.runnerSeat : null,
      });
      this.sendLobby();
    });
    this.onMessage('place', (client, raw) => {
      const msg = PlaceMsg.safeParse(raw);
      const m = this.match;
      const r = !msg.success
        ? bad
        : m instanceof Match
          ? m.place(client.sessionId, msg.data.slot, Date.now())
          : notNow;
      if (!this.judge(client, r) || !msg.success) return;
      this.broadcast('placed', { slot: msg.data.slot, seat: this.seat(client) });
      this.sendYou(client);
    });
    this.onMessage('emote', (client, raw) => {
      const msg = EmoteMsg.safeParse(raw);
      const r = msg.success ? this.match.emote(client.sessionId, msg.data.id, Date.now()) : bad;
      if (this.judge(client, r) && msg.success) {
        this.broadcast('emote', { seat: this.seat(client), id: msg.data.id });
      }
    });
    this.onMessage('next', (client) => {
      if (this.judge(client, this.match.next(client.sessionId))) this.sendLobby();
    });
    // Sent once the client's handlers are attached (messages sent during onJoin can race them).
    this.onMessage('hello', (client) => {
      this.sendYou(client);
      this.sendLobby();
    });
    // Platformer only: Push Party snapshots carry the whole state already.
    this.onMessage('resync', (client) => {
      const m = this.match;
      const sim = m instanceof Match ? m.players.get(client.sessionId)?.sim : null;
      if (m instanceof Match && sim) {
        client.send('state', { state: sim, truth: m.truth(client.sessionId) });
      }
    });
  }

  override onAuth(_client: Client, _options: unknown, ctx: AuthContext) {
    // ctx.ip is the socket address (or the proxy's hop): pinned in server.ts, not client-set.
    const ip = ctx.ip ?? 'unknown';
    if (this.clients.length === 0 && this.#creatorIp === null) {
      // The first joiner created the room: SECURITY.md §5 caps apply to them.
      if ((liveRoomsByIp.get(ip) ?? 0) >= limits.roomsPerIp) {
        throw new ServerError(429, 'Too many rooms open from here.');
      }
      if (!creations.hit(ip)) throw new ServerError(429, 'Too many new rooms. Try again later.');
      this.#creatorIp = ip;
      liveRoomsByIp.set(ip, (liveRoomsByIp.get(ip) ?? 0) + 1);
    }
    if (this.match.phase !== 'lobby') throw new ServerError(409, 'A round is already running.');
    return true;
  }

  override onJoin(client: Client) {
    this.#empty?.clear();
    this.#empty = null;
    const r = this.match.join(client.sessionId);
    if (!r.ok) {
      client.leave(4409);
      return;
    }
    this.sendYou(client);
    this.sendLobby();
  }

  override async onDrop(client: Client) {
    const p = this.match.players.get(client.sessionId);
    if (p) p.connected = false;
    this.sendLobby();
    await this.allowReconnection(client, RECONNECT_S);
  }

  override onReconnect(client: Client) {
    this.match.join(client.sessionId);
    this.sendYou(client);
    this.sendLobby();
  }

  override onLeave(client: Client) {
    this.match.leave(client.sessionId);
    this.sendLobby();
    if (this.clients.length === 0) {
      this.#empty = this.clock.setTimeout(() => void this.disconnect(), EMPTY_TTL_MS);
    }
  }

  override onDispose() {
    liveCodes.delete(this.roomId);
    if (this.#creatorIp !== null) {
      const n = (liveRoomsByIp.get(this.#creatorIp) ?? 1) - 1;
      if (n > 0) liveRoomsByIp.set(this.#creatorIp, n);
      else liveRoomsByIp.delete(this.#creatorIp);
    }
  }

  private tick() {
    const m = this.match;
    const was = m.phase;
    const now = Date.now();
    m.tick(now);
    if (m.phase === 'playing' && now >= this.#nextSnapAt) {
      // Keep the average at 20Hz; after a stall, restart the beat rather than send a burst.
      this.#nextSnapAt += SNAPSHOT_MS;
      if (this.#nextSnapAt <= now) this.#nextSnapAt = now + SNAPSHOT_MS;
      // One message per player per beat: truths and the watched run ride inside the snapshot.
      this.broadcast('snap', m.snapshot(now));
    }
    if (was === 'playing' && m.phase === 'results') {
      this.broadcast('snap', m.snapshot(Date.now()));
      this.broadcast('results', { standings: m.standings, winner: m.winner });
      this.sendLobby();
    }
  }

  /** Sends a refusal back; kicks a client that keeps sending garbage. True if accepted. */
  private judge(client: Client, r: Result): boolean {
    if (r.ok) return true;
    if (r.reason === 'kick') client.leave(4403);
    else client.send('nope', { reason: r.reason });
    return false;
  }

  private seat(client: Client): number {
    return this.match.players.get(client.sessionId)?.seat ?? -1;
  }

  private sendYou(client: Client) {
    const m = this.match;
    const p = m.players.get(client.sessionId);
    if (!p) return;
    client.send('you', {
      seat: p.seat,
      // Each game's own player type; `plays` takes it back unchanged.
      plays: m.phase === 'lobby' ? null : (m.plays as (q: typeof p) => boolean)(p),
      budget: 'budget' in p ? p.budget : 0,
      host: m.host === p.id,
    });
  }

  private sendLobby() {
    const m = this.match;
    this.broadcast('lobby', {
      code: this.roomId,
      mode: m.mode,
      size: m.maxPlayers,
      phase: m.phase,
      round: m.round,
      level: m instanceof Match ? m.level.file.id : null,
      host: m.host ? (m.players.get(m.host)?.seat ?? null) : null,
      runner: m instanceof Match ? m.runnerSeat : null,
      seats: [...m.players.values()].map((p) => ({
        seat: p.seat,
        connected: p.connected,
        left: p.left,
      })),
    });
    for (const client of this.clients) this.sendYou(client);
  }
}

const bad: Result = { ok: false, reason: 'malformed message' };
const notNow: Result = { ok: false, reason: 'Not now.' };
