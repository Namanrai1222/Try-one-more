/**
 * Room codes and abuse limits (SECURITY.md §5). ponytail: in-memory, so per process — move
 * the counters to Redis (Upstash) when the realtime server runs more than one instance.
 */
import { randomInt } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

/** No 0/O, 1/I/L: a code read aloud or off a phone screen survives. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;

/** A cryptographically random room code that `taken` doesn't already claim. */
export function roomCode(taken: (code: string) => boolean): string {
  for (;;) {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    if (!taken(code)) return code;
  }
}

/** At most `limit` hits per key in any `windowMs` (sliding window). */
export class Limiter {
  readonly #limit: number;
  readonly #windowMs: number;
  readonly #hits = new Map<string, number[]>();

  constructor(limit: number, windowMs: number) {
    this.#limit = limit;
    this.#windowMs = windowMs;
  }

  /** Records a hit; false if the key is over its limit (the hit is not counted then). */
  hit(key: string, now = Date.now()): boolean {
    const recent = (this.#hits.get(key) ?? []).filter((t) => t > now - this.#windowMs);
    if (recent.length >= this.#limit) {
      this.#hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.#hits.set(key, recent);
    return true;
  }
}

/**
 * The caller's address. Behind one proxy (Railway, Fly) set `TRUST_PROXY=1` to read the
 * *last* `X-Forwarded-For` hop — the address our proxy saw. Earlier hops (and the header
 * itself without a proxy) are whatever the client sent, so they are never trusted.
 */
export function clientIp(req: Pick<IncomingMessage, 'headers' | 'socket'>): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (process.env.TRUST_PROXY === '1' && typeof forwarded === 'string') {
    return forwarded.split(',').at(-1)!.trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}

/**
 * Colyseus derives `ctx.ip` from X-Real-IP, X-Forwarded-For or X-Client-IP as sent, so a
 * client could claim any address and walk past the per-IP room caps. Overwrite X-Real-IP (its
 * first choice) with the address we trust, before Colyseus reads the request.
 */
export function pinClientIp(req: Pick<IncomingMessage, 'headers' | 'socket'>): void {
  req.headers['x-real-ip'] = clientIp(req);
}
