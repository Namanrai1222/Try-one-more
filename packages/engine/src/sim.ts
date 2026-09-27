import { overlaps } from './aabb.ts';
import type { Rect } from './aabb.ts';
import { clamp, toFixed } from './fixed.ts';
import { Input, InputReplayer } from './input.ts';
import type { InputLog } from './input.ts';
import { SpikeMode, inScope } from './level.ts';
import type { SimGoal, SimLevel } from './level.ts';
import { fnv1a, mulberry32 } from './prng.ts';

/**
 * Platformer physics, integer-only. All values are sim units per frame (velocity) or
 * per frame² (acceleration) at a fixed 60Hz. Changing any of these invalidates every
 * recorded replay — regenerate fixtures deliberately when you do.
 */
export const PHYSICS = {
  gravity: 600,
  maxFall: 14_000,
  runAccel: 900,
  airAccel: 600,
  runMax: 4_500,
  groundFriction: 1_200,
  airFriction: 150,
  /** Ice tiles: slow to start, and almost no braking. */
  iceAccel: 250,
  iceFriction: 40,
  jumpVelocity: -10_500,
  /** Releasing jump while rising divides upward velocity by this (variable jump height). */
  jumpCutDivisor: 2,
} as const;

export const PLAYER_W = toFixed(24);
export const PLAYER_H = toFixed(32);
/** After a `grow` trap. */
export const BIG_W = toFixed(48);
export const BIG_H = toFixed(64);
/**
 * Hazard hitboxes are this much smaller than their visuals on every side, so a death always
 * looks deserved (PRD.md §4.1 legibility rule; 3D_MODELING.md §5.3).
 */
export const HAZARD_INSET = toFixed(3);
/** A fake level-complete freezes the player at most this long (SECURITY.md §9: ≤ 3 seconds). */
export const FAKE_CLEAR_FRAMES = 180;

export const SimEvent = {
  Jumped: 1,
  Landed: 2,
  Died: 4,
  Cleared: 8,
  TrapFired: 16,
  /** A fakeClear door was reached: the shell may show its (real) level-complete slip. */
  MetaTrap: 32,
} as const;

export const DeathCause = {
  None: 0,
  Fall: 1,
  Spike: 2,
  Saw: 3,
  Crush: 4,
  Greed: 5,
  FakeDoor: 6,
} as const;

export interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
  /** Index of the solid stood on after the last step, or −1. */
  floor: number;
}

/** The level 18 clone: a second body replaying the previous attempt's inputs. */
export interface CloneState extends PlayerState {
  /** 0 = absent, 1 = passable (still overlapping the player at spawn), 2 = solid. */
  active: number;
  mask: number;
  prevMask: number;
  /** Read position in `SimState.cloneLog`. */
  at: number;
}

/** Per-trap runtime state for the current attempt. All integers. */
export interface TrapRun {
  active: number;
  fired: number;
  timer: number;
  /** Faller: current top edge. */
  y: number;
}

export interface SimState {
  frame: number;
  /** Frames since the current attempt started. */
  attemptFrame: number;
  /** mulberry32 state (uint32). Advance only via `nextRandom`. */
  rng: number;
  deaths: number;
  /** 1 on the first try; +1 after every death. Traps can be scoped to attempts. */
  attempt: number;
  /** Last frame's mask, after invert/shuffle remapping. */
  prevMask: number;
  cleared: boolean;
  clearFrame: number;
  /** 1 = down, −1 = up (after a gravityFlip). */
  gravity: number;
  /** 1 after a grow trap. */
  big: number;
  /** 1 after an invert trap: left and right swap. */
  invert: number;
  /** Frames left on a fake level-complete freeze. */
  freeze: number;
  /**
   * Multiplayer gate bits, set from outside before each step (the server's leader and armed
   * sabotage slots). Gated traps act only while their bit is on. 0 in solo play.
   */
  gates: number;
  player: PlayerState;
  clone: CloneState;
  /** Change-only [attemptFrame, mask, …] of the previous attempt (the clone's script). */
  cloneLog: number[];
  /** The same, being recorded for the current attempt. */
  curLog: number[];
  /** 1 where a solid has collapsed or vanished this attempt. */
  gone: number[];
  traps: TrapRun[];
  goalShift: number;
  lastDeath: { cause: number; x: number; y: number };
}

const hasTrap = (level: SimLevel, type: string) => level.traps.some((t) => t.type === type);

function resetAttempt(state: SimState, level: SimLevel): void {
  const p = state.player;
  p.x = level.spawn.x;
  p.y = level.spawn.y;
  p.vx = 0;
  p.vy = 0;
  p.onGround = false;
  p.floor = -1;
  state.attemptFrame = 0;
  state.gravity = 1;
  state.big = 0;
  state.invert = 0;
  state.freeze = 0;
  state.gone = level.solids.map(() => 0);
  state.traps = level.traps.map((t) => ({
    active: inScope(t, state.attempt) ? 1 : 0,
    fired: 0,
    timer: 0,
    y: t.type === 'faller' ? t.rect.y : 0,
  }));
  state.goalShift = 0;
  const cloneOn = level.traps.some((t, i) => t.type === 'clone' && state.traps[i]!.active);
  Object.assign(state.clone, {
    x: p.x,
    y: p.y,
    vx: 0,
    vy: 0,
    onGround: false,
    floor: -1,
    active: cloneOn && state.cloneLog.length > 0 ? 1 : 0,
    mask: 0,
    prevMask: 0,
    at: 0,
  });
  state.curLog = [];
}

/**
 * `attempt`: start as if on this attempt (traps and doors scoped with `when` follow it). Used to
 * prove every attempt's layout of a level is clearable; the game always starts at 1.
 */
export function createSimState(level: SimLevel, seed: number, attempt = 1): SimState {
  const state: SimState = {
    frame: 0,
    attemptFrame: 0,
    rng: seed >>> 0,
    deaths: 0,
    attempt,
    prevMask: Input.None,
    cleared: false,
    clearFrame: 0,
    gravity: 1,
    big: 0,
    invert: 0,
    freeze: 0,
    gates: 0,
    player: { x: 0, y: 0, vx: 0, vy: 0, onGround: false, floor: -1 },
    clone: {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      onGround: false,
      floor: -1,
      active: 0,
      mask: 0,
      prevMask: 0,
      at: 0,
    },
    cloneLog: [],
    curLog: [],
    gone: [],
    traps: [],
    goalShift: 0,
    lastDeath: { cause: DeathCause.None, x: 0, y: 0 },
  };
  resetAttempt(state, level);
  return state;
}

/** The only source of randomness inside the simulation. */
export function nextRandom(state: SimState, maxExclusive: number): number {
  const r = mulberry32(state.rng);
  state.rng = r.state;
  return r.value % maxExclusive;
}

/** The player's current hitbox size in sim units. */
export function playerSize(state: SimState): { w: number; h: number } {
  return state.big ? { w: BIG_W, h: BIG_H } : { w: PLAYER_W, h: PLAYER_H };
}

function hits(p: PlayerState, w: number, h: number, r: Readonly<Rect>, y = r.y): boolean {
  const i = HAZARD_INSET;
  return overlaps(p.x, p.y, w, h, { x: r.x + i, y: y + i, w: r.w - 2 * i, h: r.h - 2 * i });
}

/** The real door for the current attempt (first goal in scope), or null. */
export function activeGoal(state: SimState, level: SimLevel): Readonly<SimGoal> | null {
  return level.goals.find((g) => inScope(g, state.attempt)) ?? null;
}

/** Where the real door currently is (a goalShift trap may have moved it). */
export function goalRect(state: SimState, level: SimLevel): Rect | null {
  const g = activeGoal(state, level)?.rect;
  return g ? { x: g.x + state.goalShift, y: g.y, w: g.w, h: g.h } : null;
}

/** Whether trap `i` is a spike that is currently out (and therefore lethal). */
export function spikeUp(state: SimState, level: SimLevel, i: number): boolean {
  const t = level.traps[i];
  const r = state.traps[i];
  if (!t || !r || t.type !== 'spike' || !r.active) return false;
  if (t.mode === SpikeMode.Jump) return r.timer > 0;
  if (t.mode === SpikeMode.Time) return state.attemptFrame >= t.value;
  if (t.mode === SpikeMode.Near) return r.fired === 1;
  return true;
}

/** Shuffle orders for [Left, Right, Jump]; index 0 is normal. Consecutive periods always differ. */
const SHUFFLES = [
  [Input.Left, Input.Right, Input.Jump],
  [Input.Right, Input.Left, Input.Jump],
  [Input.Jump, Input.Right, Input.Left],
  [Input.Left, Input.Jump, Input.Right],
  [Input.Right, Input.Jump, Input.Left],
  [Input.Jump, Input.Left, Input.Right],
] as const;

/**
 * What the physical Left, Right and Jump inputs currently do (as Input bits), after any
 * invert or shuffle trap. The HUD shows this; the sim applies it to every mask.
 */
export function bindings(state: SimState, level: SimLevel): readonly [number, number, number] {
  let order: readonly [number, number, number] = SHUFFLES[0];
  const i = level.traps.findIndex((t, j) => t.type === 'shuffle' && state.traps[j]?.active);
  const t = level.traps[i];
  if (t?.type === 'shuffle') {
    const k = Math.floor(state.attemptFrame / t.every);
    order = SHUFFLES[k === 0 ? 0 : 1 + ((k - 1) % 5)]!;
  }
  if (!state.invert) return order;
  const swap = (b: number) => (b === Input.Left ? Input.Right : b === Input.Right ? Input.Left : b);
  return [swap(order[0]), swap(order[1]), swap(order[2])];
}

function remap(state: SimState, level: SimLevel, mask: number): number {
  const [l, r, j] = bindings(state, level);
  if (l === Input.Left && r === Input.Right) return mask; // j is then Jump too
  return (
    (mask & Input.Down) |
    (mask & Input.Left ? l : 0) |
    (mask & Input.Right ? r : 0) |
    (mask & Input.Jump ? j : 0)
  );
}

/** Frames until the next countdown fires, or null if none is running. */
export function timeLeft(state: SimState, level: SimLevel): number | null {
  let left: number | null = null;
  level.traps.forEach((t, i) => {
    const r = state.traps[i];
    if (t.type !== 'timer' || !r?.active || r.fired) return;
    const n = t.frames - state.attemptFrame;
    if (left === null || n < left) left = n;
  });
  return left;
}

/**
 * Move one body for one frame: intent, jump, gravity, then X and Y resolution against the
 * level (and `blocker`, the clone). Sets `onGround` and `floor`. Returns Jumped/Landed events.
 */
function moveBody(
  b: PlayerState,
  mask: number,
  prevMask: number,
  g: number,
  w: number,
  h: number,
  level: SimLevel,
  gone: readonly number[],
  blocker: Rect | null,
): number {
  let events = 0;
  const held = (bit: number) => (mask & bit) !== 0;
  const wasHeld = (bit: number) => (prevMask & bit) !== 0;
  const onIce = b.onGround && b.floor >= 0 && level.solids[b.floor]?.ice === true;

  // Horizontal intent
  const dir = (held(Input.Right) ? 1 : 0) - (held(Input.Left) ? 1 : 0);
  if (dir !== 0) {
    const accel = !b.onGround ? PHYSICS.airAccel : onIce ? PHYSICS.iceAccel : PHYSICS.runAccel;
    b.vx = clamp(b.vx + dir * accel, -PHYSICS.runMax, PHYSICS.runMax);
  } else {
    const friction = !b.onGround
      ? PHYSICS.airFriction
      : onIce
        ? PHYSICS.iceFriction
        : PHYSICS.groundFriction;
    if (b.vx > 0) b.vx = Math.max(0, b.vx - friction);
    else if (b.vx < 0) b.vx = Math.min(0, b.vx + friction);
  }

  // Jump on the press edge only; releasing while moving away from the ground cuts the arc.
  // Under flipped gravity everything vertical is mirrored.
  if (held(Input.Jump) && !wasHeld(Input.Jump) && b.onGround) {
    b.vy = g * PHYSICS.jumpVelocity;
    b.onGround = false;
    events |= SimEvent.Jumped;
  }
  if (!held(Input.Jump) && wasHeld(Input.Jump) && b.vy * g < 0) {
    b.vy = Math.trunc(b.vy / PHYSICS.jumpCutDivisor);
  }

  // Terminal velocity applies only in the direction of gravity, so a spring can launch faster
  // than anything can fall. (Jumps are well under the cap, so they are unaffected.)
  b.vy += g * PHYSICS.gravity;
  b.vy = g > 0 ? Math.min(b.vy, PHYSICS.maxFall) : Math.max(b.vy, -PHYSICS.maxFall);

  // Move and resolve X
  if (b.vx !== 0) {
    const movingRight = b.vx > 0;
    b.x += b.vx;
    const push = (s: Readonly<Rect>) => {
      if (!overlaps(b.x, b.y, w, h, s)) return;
      b.x = movingRight ? s.x - w : s.x + s.w;
      b.vx = 0;
    };
    level.solids.forEach((s, i) => {
      if (!gone[i]) push(s);
    });
    if (blocker) push(blocker);
  }
  if (b.x < 0) {
    b.x = 0;
    b.vx = 0;
  } else if (b.x + w > level.bounds.w) {
    b.x = level.bounds.w - w;
    b.vx = 0;
  }

  // Move and resolve Y; landing means hitting a solid in the direction of gravity
  const wasOnGround = b.onGround;
  b.onGround = false;
  b.floor = -1;
  if (b.vy !== 0) {
    const movingDown = b.vy > 0;
    const landing = movingDown === g > 0;
    b.y += b.vy;
    const push = (s: Readonly<Rect>, i: number) => {
      if (!overlaps(b.x, b.y, w, h, s)) return;
      b.y = movingDown ? s.y - h : s.y + s.h;
      b.vy = 0;
      if (landing) {
        b.onGround = true;
        b.floor = i;
      }
    };
    level.solids.forEach((s, i) => {
      if (!gone[i]) push(s, i);
    });
    if (blocker) push(blocker, -1);
  }
  if (b.onGround && !wasOnGround) events |= SimEvent.Landed;
  return events;
}

/**
 * Advance the simulation by exactly one fixed step. Mutates `state` and returns a
 * bitmask of SimEvent flags for presentation (sound, shake). Same state + same mask +
 * same level ⇒ same result, always.
 */
export function step(state: SimState, rawMask: number, level: SimLevel): number {
  if (state.cleared) {
    state.prevMask = rawMask;
    state.frame++;
    return 0;
  }

  const mask = remap(state, level, rawMask);
  const p = state.player;
  let events = 0;

  // Fake level-complete: the player is frozen until any new input (or 3 seconds), then the
  // floor goes.
  if (state.freeze > 0) {
    state.freeze = mask & ~state.prevMask ? 0 : state.freeze - 1;
    if (state.freeze === 0) {
      level.traps.forEach((t, i) => {
        if (t.type === 'fakeClear' && state.traps[i]!.fired) {
          for (const s of t.targets) state.gone[s] = 1;
        }
      });
      events |= SimEvent.TrapFired;
    }
    state.attemptFrame++;
    state.prevMask = mask;
    state.frame++;
    return events;
  }

  const g = state.gravity;
  const { w, h } = playerSize(state);

  // The clone moves first, replaying last attempt; once clear of the player it is solid.
  let blocker: Rect | null = null;
  const c = state.clone;
  if (c.active) {
    const log = state.cloneLog;
    while (c.at < log.length && log[c.at]! <= state.attemptFrame) {
      c.mask = log[c.at + 1]!;
      c.at += 2;
    }
    moveBody(c, c.mask, c.prevMask, g, PLAYER_W, PLAYER_H, level, state.gone, null);
    c.prevMask = c.mask;
    const rect = { x: c.x, y: c.y, w: PLAYER_W, h: PLAYER_H };
    if (c.y > level.bounds.h || c.y + PLAYER_H < 0) c.active = 0;
    else if (c.active === 1 && !overlaps(p.x, p.y, w, h, rect)) c.active = 2;
    if (c.active === 2) blocker = rect;
  }
  if (hasTrap(level, 'clone')) {
    const log = state.curLog;
    const last = log.length ? log[log.length - 1]! : Input.None;
    if (mask !== last) log.push(state.attemptFrame, mask);
  }

  events |= moveBody(p, mask, state.prevMask, g, w, h, level, state.gone, blocker);

  // Traps
  const centerX = p.x + (w >> 1);
  let cause: number = DeathCause.None;
  level.traps.forEach((t, i) => {
    const r = state.traps[i]!;
    if (!r.active || (t.gate && !(state.gates & t.gate))) return;
    switch (t.type) {
      case 'collapse':
        if (!r.fired && (r.timer > 0 || p.floor === t.target)) {
          r.timer++;
          if (r.timer >= t.delayFrames) {
            r.fired = 1;
            state.gone[t.target] = 1;
            events |= SimEvent.TrapFired;
          }
        }
        break;
      case 'spike':
        if (t.mode === SpikeMode.Jump && events & SimEvent.Jumped) {
          r.timer = t.value;
          events |= SimEvent.TrapFired;
        }
        if (t.mode === SpikeMode.Time && !r.fired && state.attemptFrame >= t.value) {
          r.fired = 1;
          events |= SimEvent.TrapFired;
        }
        // Pop-up: out the moment the player's centre is within `value` of the spike's edge.
        if (
          t.mode === SpikeMode.Near &&
          !r.fired &&
          Math.abs(centerX - (t.rect.x + (t.rect.w >> 1))) <= t.value + (t.rect.w >> 1)
        ) {
          r.fired = 1;
          events |= SimEvent.TrapFired;
        }
        if (spikeUp(state, level, i) && hits(p, w, h, t.rect)) cause = DeathCause.Spike;
        if (r.timer > 0) r.timer--;
        break;
      case 'faller':
        if (!r.fired && centerX >= t.triggerX) {
          r.fired = 1;
          events |= SimEvent.TrapFired;
        }
        if (r.fired && r.y < t.fallTo) r.y = Math.min(r.y + t.speed, t.fallTo);
        if (hits(p, w, h, t.rect, r.y)) {
          cause = t.look === 'saw' ? DeathCause.Saw : DeathCause.Crush;
        }
        break;
      case 'coin':
        if (hits(p, w, h, t.rect)) cause = DeathCause.Greed;
        break;
      case 'fakeGoal':
        // Same 3px forgiveness as every other hazard: brushing the frame doesn't swallow you.
        // (Plain overlap left a ~3-frame window to jump one at full speed.)
        if (hits(p, w, h, t.rect)) cause = DeathCause.FakeDoor;
        break;
      case 'goalShift': {
        const goal = goalRect(state, level);
        if (!r.fired && goal) {
          if (Math.abs(goal.x + (goal.w >> 1) - centerX) <= t.triggerDistance) {
            r.fired = 1;
            state.goalShift += t.dx;
            events |= SimEvent.TrapFired;
          }
        }
        break;
      }
      case 'gravityFlip':
      case 'invert':
      case 'grow':
        if (r.fired || centerX < t.triggerX) break;
        r.fired = 1;
        events |= SimEvent.TrapFired;
        if (t.type === 'gravityFlip') {
          state.gravity = -state.gravity;
          p.onGround = false;
        } else if (t.type === 'invert') {
          state.invert = 1;
        } else if (!state.big) {
          // Grow from the feet, around the same centre.
          state.big = 1;
          p.x -= (BIG_W - PLAYER_W) >> 1;
          if (state.gravity > 0) p.y -= BIG_H - PLAYER_H;
        }
        break;
      case 'spring':
        if (p.vy * state.gravity >= 0 && overlaps(p.x, p.y, w, h, t.rect)) {
          p.vy = -state.gravity * t.power;
          p.onGround = false;
          r.fired = 1;
          events |= SimEvent.Jumped | SimEvent.TrapFired;
        }
        break;
      case 'timer':
        if (!r.fired && state.attemptFrame >= t.frames) {
          r.fired = 1;
          for (const s of t.targets) state.gone[s] = 1;
          events |= SimEvent.TrapFired;
        }
        break;
      case 'teleport':
        if (!r.fired && overlaps(p.x, p.y, w, h, t.rect)) {
          r.fired = 1;
          p.x = level.spawn.x;
          p.y = level.spawn.y;
          p.vx = p.vy = 0;
          events |= SimEvent.TrapFired;
        }
        break;
      case 'fakeClear':
        if (!r.fired && overlaps(p.x, p.y, w, h, t.rect)) {
          r.fired = 1;
          state.freeze = FAKE_CLEAR_FRAMES;
          p.vx = p.vy = 0;
          events |= SimEvent.MetaTrap;
        }
        break;
      case 'shuffle':
      case 'clone':
        break; // applied above (input remap, clone body)
    }
  });
  if (cause === DeathCause.None && (p.y > level.bounds.h || p.y + h < 0)) {
    cause = DeathCause.Fall;
  }

  if (cause !== DeathCause.None) {
    state.lastDeath = { cause, x: p.x, y: p.y };
    state.deaths++;
    state.attempt++;
    if (hasTrap(level, 'clone')) state.cloneLog = state.curLog;
    resetAttempt(state, level);
    events |= SimEvent.Died;
  } else {
    state.attemptFrame++;
    const goal = goalRect(state, level);
    if (goal && overlaps(p.x, p.y, w, h, goal)) {
      state.cleared = true;
      state.clearFrame = state.frame + 1;
      p.vx = 0;
      events |= SimEvent.Cleared;
    }
  }

  state.prevMask = mask;
  state.frame++;
  return events;
}

/** FNV-1a over every integer in the state. Equal hashes ⇔ (practically) equal states. */
export function hashState(state: SimState): string {
  let h = 0x811c9dc5;
  const mix = (n: number) => {
    let v = n | 0;
    for (let i = 0; i < 4; i++) {
      h ^= v & 0xff;
      h = Math.imul(h, 0x01000193);
      v >>>= 8;
    }
  };
  const body = (b: PlayerState) => [b.x, b.y, b.vx, b.vy, b.onGround ? 1 : 0, b.floor];
  const c = state.clone;
  for (const n of [
    state.frame,
    state.attemptFrame,
    state.rng,
    state.deaths,
    state.attempt,
    state.prevMask,
    state.cleared ? 1 : 0,
    state.clearFrame,
    state.gravity,
    state.big,
    state.invert,
    state.freeze,
    ...body(state.player),
    ...body(c),
    c.active,
    c.mask,
    c.prevMask,
    c.at,
    state.goalShift,
    state.lastDeath.cause,
    state.lastDeath.x,
    state.lastDeath.y,
    ...state.gone,
    state.cloneLog.length,
    ...state.cloneLog,
    state.curLog.length,
    ...state.curLog,
  ]) {
    mix(n);
  }
  for (const t of state.traps) {
    mix(t.active);
    mix(t.fired);
    mix(t.timer);
    mix(t.y);
  }
  if (state.gates) mix(state.gates); // only multiplayer sets gates; solo hashes are unchanged
  return (h >>> 0).toString(16).padStart(8, '0');
}

export interface StateSnapshot {
  frame: number;
  rng: number;
  deaths: number;
  attempt: number;
  cleared: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
}

export function snapshot(state: SimState): StateSnapshot {
  const p = state.player;
  return {
    frame: state.frame,
    rng: state.rng,
    deaths: state.deaths,
    attempt: state.attempt,
    cleared: state.cleared,
    x: p.x,
    y: p.y,
    vx: p.vx,
    vy: p.vy,
    onGround: p.onGround,
  };
}

/** Headless replay: same seed + same input log ⇒ identical final state. */
export function replay(
  level: SimLevel,
  seed: number,
  log: InputLog,
  frames: number,
): { state: SimState; hash: string } {
  const state = createSimState(level, seed);
  const replayer = new InputReplayer(log);
  for (let f = 0; f < frames; f++) step(state, replayer.maskAt(f), level);
  return { state, hash: hashState(state) };
}

/**
 * Ghosts (L28, and the Phase 5 ghost race): replay a run and return every *failed* attempt's
 * path as interleaved [x, y, x, y, …] player positions, one pair per attempt frame.
 */
export function attemptTracks(
  level: SimLevel,
  seed: number,
  log: InputLog,
  frames: number,
): Int32Array[] {
  const state = createSimState(level, seed);
  const replayer = new InputReplayer(log);
  const tracks: Int32Array[] = [];
  let track: number[] = [];
  for (let f = 0; f < frames; f++) {
    if (step(state, replayer.maskAt(f), level) & SimEvent.Died) {
      track.push(state.lastDeath.x, state.lastDeath.y);
      tracks.push(Int32Array.from(track));
      track = [];
    } else {
      track.push(state.player.x, state.player.y);
    }
  }
  return tracks;
}

/** Hash of the physics constants, stored with fixtures so a tuning change is detected. */
export function hashPhysics(): string {
  return fnv1a(
    JSON.stringify({ PHYSICS, PLAYER_W, PLAYER_H, BIG_W, BIG_H, HAZARD_INSET, FAKE_CLEAR_FRAMES }),
  )
    .toString(16)
    .padStart(8, '0');
}
