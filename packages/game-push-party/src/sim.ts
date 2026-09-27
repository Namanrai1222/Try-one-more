/**
 * Push Party (title #2, PRD.md §4.9): up to eight players shove each other off a floor that
 * falls away ring by ring. Top-down: x and y are floor coordinates.
 *
 * Deterministic and integer-only like the platformer's engine (TECH_STACK.md §5), because the
 * same code runs on the server (the truth) and in every browser (prediction): 1px = 1000
 * units, no floats, no randomness, input only as one bitmask per player per frame. The floor
 * is a pure function of the frame number, so it never has to travel over the network.
 */
import { FP } from '@jom/engine';

export const PushInput = { Left: 1, Right: 2, Up: 4, Down: 8, Shove: 16 } as const;
export const PUSH_MASK_ALL = 0b11111;
export const MAX_PUSHERS = 8;

/** The floor: GRID × GRID tiles of TILE units. */
export const GRID = 10;
export const TILE = 64 * FP;
export const ARENA = GRID * TILE;
export const RADIUS = 18 * FP;
/** Walking: acceleration while a direction is held, and drag (v -= v / DRAG) always. */
const ACCEL = 300;
const DRAG = 12;
/** 1/√2 in thousandths, so diagonals are not faster. */
const DIAGONAL = 707;
/** A shove is a lunge; if it connects within SHOVE_FRAMES it knocks the other body away. */
const SHOVE_SPEED = 9 * FP;
export const SHOVE_FRAMES = 12;
export const SHOVE_COOLDOWN = 50;
const KNOCK = 7 * FP;
/** Bodies bounce off each other with restitution 0.8: each takes (1 + e) / 2 of the closing speed. */
const BOUNCE_NUM = 9;
const BOUNCE_DEN = 10;
/** Frames between losing the floor and being out (the fall the renderer shows). */
export const FALL_FRAMES = 40;
/** A ring shakes this long before it drops. */
export const CRUMBLE_FRAMES = 90;
export const FIRST_RING_AT = 8 * 60;
export const RING_EVERY = 10 * 60;
/** Rings 0 (the edge) to 3 fall; ring 4, the centre 2×2, never does. */
export const FALLING_RINGS = 4;
export const ROUND_FRAMES = 75 * 60;

export const PushEvent = { Shoved: 1, Hit: 2, Fell: 4, Out: 8, Crumble: 16 } as const;

export interface Pusher {
  seat: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Facing, in thousandths: the direction a shove goes. */
  fx: number;
  fy: number;
  /** Frames left of an active shove, and before the next one is allowed. */
  shove: number;
  cooldown: number;
  /** 0 while on the floor; counts up while falling; out at FALL_FRAMES. */
  fall: number;
  out: boolean;
  /** The frame this pusher went out, or -1. */
  outFrame: number;
  /** Last frame's mask (a shove needs a fresh press). */
  prev: number;
}

export interface PushState {
  frame: number;
  /** Sorted by seat; masks passed to `stepPush` follow this order. */
  pushers: Pusher[];
}

/** Spawn offsets from the centre in px, by seat: a circle, everyone facing the middle. */
const SPAWN: ReadonlyArray<readonly [number, number]> = [
  [200, 0],
  [141, 141],
  [0, 200],
  [-141, 141],
  [-200, 0],
  [-141, -141],
  [0, -200],
  [141, -141],
];

export function createPushState(seats: readonly number[]): PushState {
  const centre = ARENA / 2;
  return {
    frame: 0,
    pushers: [...new Set(seats)]
      .filter((s) => Number.isInteger(s) && s >= 0 && s < MAX_PUSHERS)
      .sort((a, b) => a - b)
      .map((seat) => {
        const [dx, dy] = SPAWN[seat]!;
        return {
          seat,
          x: centre + dx * FP,
          y: centre + dy * FP,
          vx: 0,
          vy: 0,
          fx: -dx * 5, // 200px offset → 1000 thousandths
          fy: -dy * 5,
          shove: 0,
          cooldown: 0,
          fall: 0,
          out: false,
          outFrame: -1,
          prev: 0,
        };
      }),
  };
}

/** 0 for the edge ring, 4 for the centre 2×2. */
export const ring = (i: number, j: number) => Math.min(i, j, GRID - 1 - i, GRID - 1 - j);

/** Tile (i, j) at `frame`: 0 solid, > 0 crumbling (frames left, still holds you), -1 gone. */
export function tileAt(frame: number, i: number, j: number): number {
  if (i < 0 || j < 0 || i >= GRID || j >= GRID) return -1;
  const r = ring(i, j);
  if (r >= FALLING_RINGS) return 0;
  const starts = FIRST_RING_AT + r * RING_EVERY;
  if (frame < starts) return 0;
  const left = starts + CRUMBLE_FRAMES - frame;
  return left > 0 ? left : -1;
}

/** Exact integer square root (Math.sqrt is correctly rounded, so this is the same everywhere). */
export function isqrt(n: number): number {
  let r = Math.floor(Math.sqrt(n));
  while (r * r > n) r--;
  while ((r + 1) * (r + 1) <= n) r++;
  return r;
}

const onFloor = (p: Pusher) => !p.out && p.fall === 0;

function collide(a: Pusher, b: Pusher): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const reach = 2 * RADIUS;
  const d2 = dx * dx + dy * dy;
  if (d2 >= reach * reach) return 0;
  const d = isqrt(d2);
  // Normal from a to b, in thousandths. Two bodies on the same spot split along x.
  const nx = d === 0 ? FP : Math.trunc((dx * FP) / d);
  const ny = d === 0 ? 0 : Math.trunc((dy * FP) / d);
  const half = Math.trunc((reach - d) / 2) + 1;
  a.x -= Math.trunc((nx * half) / FP);
  a.y -= Math.trunc((ny * half) / FP);
  b.x += Math.trunc((nx * half) / FP);
  b.y += Math.trunc((ny * half) / FP);
  const closing = Math.trunc(((b.vx - a.vx) * nx + (b.vy - a.vy) * ny) / FP);
  if (closing < 0) {
    const j = Math.trunc((-closing * BOUNCE_NUM) / BOUNCE_DEN);
    a.vx -= Math.trunc((j * nx) / FP);
    a.vy -= Math.trunc((j * ny) / FP);
    b.vx += Math.trunc((j * nx) / FP);
    b.vy += Math.trunc((j * ny) / FP);
  }
  // A live shove that lands sends the other body flying and is spent. Two shoves just bounce.
  let events = 0;
  if (a.shove > 0 && b.shove === 0) {
    b.vx += Math.trunc((KNOCK * nx) / FP);
    b.vy += Math.trunc((KNOCK * ny) / FP);
    a.shove = 0;
    events |= PushEvent.Hit;
  } else if (b.shove > 0 && a.shove === 0) {
    a.vx -= Math.trunc((KNOCK * nx) / FP);
    a.vy -= Math.trunc((KNOCK * ny) / FP);
    b.shove = 0;
    events |= PushEvent.Hit;
  }
  return events;
}

/** One frame. `masks[i]` is pusher i's input (missing = nothing held). Returns PushEvent bits. */
export function stepPush(state: PushState, masks: readonly number[]): number {
  const frame = state.frame;
  const ps = state.pushers;
  let events = 0;
  for (let r = 0; r < FALLING_RINGS; r++) {
    if (frame === FIRST_RING_AT + r * RING_EVERY) events |= PushEvent.Crumble;
  }

  ps.forEach((p, i) => {
    if (p.out) return;
    const m = (masks[i] ?? 0) & PUSH_MASK_ALL;
    if (p.fall === 0) {
      const ax = (m & PushInput.Right ? 1 : 0) - (m & PushInput.Left ? 1 : 0);
      const ay = (m & PushInput.Down ? 1 : 0) - (m & PushInput.Up ? 1 : 0);
      if (ax !== 0 || ay !== 0) {
        const k = ax !== 0 && ay !== 0 ? DIAGONAL : FP;
        p.fx = ax * k;
        p.fy = ay * k;
        p.vx += Math.trunc((p.fx * ACCEL) / FP);
        p.vy += Math.trunc((p.fy * ACCEL) / FP);
      }
      if (m & PushInput.Shove && !(p.prev & PushInput.Shove) && p.cooldown === 0) {
        p.vx += Math.trunc((p.fx * SHOVE_SPEED) / FP);
        p.vy += Math.trunc((p.fy * SHOVE_SPEED) / FP);
        p.shove = SHOVE_FRAMES;
        p.cooldown = SHOVE_COOLDOWN;
        events |= PushEvent.Shoved;
      }
    }
    p.prev = m;
    p.vx -= Math.trunc(p.vx / DRAG);
    p.vy -= Math.trunc(p.vy / DRAG);
    p.x += p.vx;
    p.y += p.vy;
    if (p.shove > 0) p.shove--;
    if (p.cooldown > 0) p.cooldown--;
  });

  for (let a = 0; a < ps.length; a++) {
    for (let b = a + 1; b < ps.length; b++) {
      if (onFloor(ps[a]!) && onFloor(ps[b]!)) events |= collide(ps[a]!, ps[b]!);
    }
  }

  for (const p of ps) {
    if (p.out) continue;
    if (p.fall > 0) {
      if (++p.fall >= FALL_FRAMES) {
        p.out = true;
        p.outFrame = frame;
        events |= PushEvent.Out;
      }
    } else if (tileAt(frame, Math.floor(p.x / TILE), Math.floor(p.y / TILE)) < 0) {
      p.fall = 1;
      events |= PushEvent.Fell;
    }
  }

  state.frame++;
  return events;
}

/** Over when at most one player is left standing (of two or more), or the time is up. */
export function isOver(state: PushState): boolean {
  const left = state.pushers.filter((p) => !p.out).length;
  return (state.pushers.length >= 2 && left <= 1) || state.frame >= ROUND_FRAMES;
}

/** Places by seat: whoever lasted longest is first; survivors, and simultaneous falls, tie. */
export function placings(state: PushState): Array<{ seat: number; place: number; out: boolean }> {
  const lasted = (p: Pusher) => (p.out ? p.outFrame : Number.MAX_SAFE_INTEGER);
  return state.pushers.map((p) => ({
    seat: p.seat,
    place: 1 + state.pushers.filter((q) => lasted(q) > lasted(p)).length,
    out: p.out,
  }));
}
