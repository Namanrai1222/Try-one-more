/**
 * "Higher and Higher" (3D_MODELING.md §3.2, Phase 6): a deterministic 3D climb, on the same
 * rules as the 2D engine (TECH_STACK.md §5) — integers only (1 m = 1000), no randomness or
 * clock, input as a per-frame bitmask, one fixed 60Hz step — so a run replays exactly.
 *
 * The kit is axis-aligned boxes (slabs, pillars, blocks), so collision is exact and cheap: a
 * kinematic controller on boxes needs no physics engine. (The spec names Rapier for this;
 * boxes made it unnecessary, and integer AABB keeps replays bit-exact without verification.)
 * Moving pieces are pure functions of the frame, like the 2D game's floors.
 */

/** Millimetres per metre: every position and size below is in mm. */
export const MM = 1000;

export const Key = { Forward: 1, Back: 2, Left: 4, Right: 8, Jump: 16 } as const;
/** Camera heading, in 64ths of a turn, rides in bits 8–13: movement is camera-relative. */
export const YAW_STEPS = 64;
export const inputMask = (keys: number, yaw: number) => (keys & 31) | ((yaw & 63) << 8);

export const CLIMB = {
  gravity: 7, // mm/frame² ≈ 25 m/s²
  maxFall: 320,
  jump: 150, // apex ≈ 1.6 m
  run: 95, // mm/frame ≈ 5.7 m/s
  groundAccel: 14,
  airAccel: 6,
  /** Frames after leaving an edge in which a jump still works, and before landing that one is kept. */
  coyote: 6,
  buffer: 6,
} as const;

/** The player's box: 0.6 m square, 1.8 m tall (UNITS.playerHeight). Position = feet centre. */
export const PLAYER = { w: 600, h: 1800 } as const;
const HALF = PLAYER.w >> 1;
/** Hazards forgive 8 cm on every side, like the 2D game's 3px. */
const INSET = 80;

/** sin(k/64 turn) × 1024 for k = 0–16; the rest by symmetry. Literals, not Math.sin. */
const SIN_Q = [
  0, 100, 200, 297, 392, 483, 569, 650, 724, 792, 851, 903, 946, 980, 1004, 1019, 1024,
];
export function sin64(k: number): number {
  k &= 63;
  if (k <= 16) return SIN_Q[k]!;
  if (k <= 32) return SIN_Q[32 - k]!;
  if (k <= 48) return -SIN_Q[k - 32]!;
  return -SIN_Q[64 - k]!;
}
export const cos64 = (k: number) => sin64(k + 16);

/** Min corner and size, mm; y is up. */
export interface Box {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
}
/** Out by up to (dx, dy, dz) and back, once every `period` frames (even), from `phase`. */
export interface Path {
  dx: number;
  dy: number;
  dz: number;
  period: number;
  phase: number;
}
export interface Vec {
  x: number;
  y: number;
  z: number;
}
export interface Checkpoint {
  name: string;
  /** Touching it makes it the respawn point. */
  box: Box;
  spawn: Vec;
  /** Falling below this sends you back here: how far a fall costs is the mode's difficulty. */
  floorY: number;
}
export interface Course {
  id: string;
  name: string;
  solids: Box[];
  /** Drop `delay` frames after first stood on; back when you respawn. */
  crumbles: Array<Box & { delay: number }>;
  /** Carry whoever stands on them. */
  movers: Array<Box & Path>;
  spikes: Box[];
  saws: Array<Box & Path>;
  /** In climbing order; the first is the start. */
  checkpoints: Checkpoint[];
  goal: Box;
}

export function offset(p: Path, frame: number): Vec {
  const half = p.period >> 1;
  const t = (frame + p.phase) % p.period;
  const u = t < half ? t : p.period - t;
  return {
    x: Math.trunc((p.dx * u) / half),
    y: Math.trunc((p.dy * u) / half),
    z: Math.trunc((p.dz * u) / half),
  };
}

export const ClimbEvent = { Jumped: 1, Landed: 2, Died: 4, Checkpoint: 8, Cleared: 16 } as const;

export interface ClimbState {
  frame: number;
  /** Feet centre, velocity; `ground` is what you stand on, -1 in the air. */
  p: { x: number; y: number; z: number; vx: number; vy: number; vz: number; ground: number };
  coyote: number;
  buffer: number;
  checkpoint: number;
  deaths: number;
  cleared: boolean;
  clearFrame: number;
  /** Per crumble: 0 untouched, n > 0 frames since stood on, -1 gone. */
  crumble: Int32Array;
  /** Highest the feet have been, mm. */
  best: number;
  prevKeys: number;
}

/** Ground ids: solids 0…, crumbles CRUMBLE + i, movers MOVER + i. */
export const CRUMBLE = 100_000;
export const MOVER = 200_000;

export function createClimb(course: Course): ClimbState {
  const s: ClimbState = {
    frame: 0,
    p: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ground: -1 },
    coyote: 0,
    buffer: 0,
    checkpoint: 0,
    deaths: 0,
    cleared: false,
    clearFrame: 0,
    crumble: new Int32Array(course.crumbles.length),
    best: 0,
    prevKeys: 0,
  };
  respawn(s, course);
  s.best = s.p.y;
  return s;
}

function respawn(s: ClimbState, c: Course) {
  const at = c.checkpoints[s.checkpoint]!.spawn;
  Object.assign(s.p, { x: at.x, y: at.y, z: at.z, vx: 0, vy: 0, vz: 0, ground: -1 });
  s.coyote = 0;
  s.buffer = 0;
  s.crumble.fill(0);
}

const overlaps = (x: number, y: number, z: number, b: Box, inset = 0) =>
  x + HALF > b.x + inset &&
  x - HALF < b.x + b.w - inset &&
  y + PLAYER.h > b.y + inset &&
  y < b.y + b.h - inset &&
  z + HALF > b.z + inset &&
  z - HALF < b.z + b.d - inset;

/** A moving piece's box at `frame`, written into `out`. */
export function placed(m: Box & Path, frame: number, out: Box): Box {
  const o = offset(m, frame);
  out.x = m.x + o.x;
  out.y = m.y + o.y;
  out.z = m.z + o.z;
  out.w = m.w;
  out.h = m.h;
  out.d = m.d;
  return out;
}

const scratch: Box = { x: 0, y: 0, z: 0, w: 0, h: 0, d: 0 };

/** Every solid box at `frame` with its ground id, until `fn` returns true. */
function eachSolid(s: ClimbState, c: Course, frame: number, fn: (b: Box, id: number) => boolean) {
  for (let i = 0; i < c.solids.length; i++) if (fn(c.solids[i]!, i)) return;
  for (let i = 0; i < c.crumbles.length; i++) {
    if (s.crumble[i]! >= 0 && fn(c.crumbles[i]!, CRUMBLE + i)) return;
  }
  for (let i = 0; i < c.movers.length; i++) {
    if (fn(placed(c.movers[i]!, frame, scratch), MOVER + i)) return;
  }
}

const approach = (v: number, target: number, a: number) =>
  v < target ? Math.min(v + a, target) : Math.max(v - a, target);

/** One fixed step. Returns ClimbEvent bits. */
export function step(s: ClimbState, mask: number, c: Course): number {
  if (s.cleared) {
    s.frame++;
    return 0;
  }
  let events = 0;
  const keys = mask & 31;
  const yaw = (mask >> 8) & 63;
  const pressed = keys & ~s.prevKeys;
  const p = s.p;
  const next = s.frame + 1;

  // Run: the keys pick a direction relative to the camera's heading.
  const f = (keys & Key.Forward ? 1 : 0) - (keys & Key.Back ? 1 : 0);
  const r = (keys & Key.Right ? 1 : 0) - (keys & Key.Left ? 1 : 0);
  let tx = 0;
  let tz = 0;
  if (f || r) {
    const sn = sin64(yaw);
    const cs = cos64(yaw);
    // forward = (sin, cos), right = (-cos, sin) on (x, z)
    let wx = f * sn - r * cs;
    let wz = f * cs + r * sn;
    if (f && r) {
      wx = (wx * 724) >> 10;
      wz = (wz * 724) >> 10;
    }
    tx = (wx * CLIMB.run) >> 10;
    tz = (wz * CLIMB.run) >> 10;
  }
  const accel = p.ground >= 0 ? CLIMB.groundAccel : CLIMB.airAccel;
  p.vx = approach(p.vx, tx, accel);
  p.vz = approach(p.vz, tz, accel);

  // Jump, with a little forgiveness either side of the edge; letting go early cuts it short.
  if (pressed & Key.Jump) s.buffer = CLIMB.buffer;
  if (s.buffer > 0 && s.coyote > 0) {
    p.vy = CLIMB.jump;
    s.buffer = 0;
    s.coyote = 0;
    p.ground = -1;
    events |= ClimbEvent.Jumped;
  } else if (s.buffer > 0) s.buffer--;
  if (!(keys & Key.Jump) && s.prevKeys & Key.Jump && p.vy > 0) p.vy >>= 1;
  p.vy = Math.max(p.vy - CLIMB.gravity, -CLIMB.maxFall);

  // Standing on a moving piece carries you with it (before your own movement is resolved).
  let cx = 0;
  let cz = 0;
  if (p.ground >= MOVER) {
    const m = c.movers[p.ground - MOVER]!;
    const a = offset(m, s.frame);
    const b = offset(m, next);
    cx = b.x - a.x;
    cz = b.z - a.z;
    p.x += cx;
    p.y += b.y - a.y;
    p.z += cz;
  }

  // Move one axis at a time against every solid where it will be next frame.
  const wasGround = p.ground >= 0;
  const dx = p.vx || cx;
  p.x += p.vx;
  eachSolid(s, c, next, (b) => {
    if (!overlaps(p.x, p.y, p.z, b)) return false;
    p.x = dx > 0 ? b.x - HALF : b.x + b.w + HALF;
    p.vx = 0;
    return false;
  });
  const dz = p.vz || cz;
  p.z += p.vz;
  eachSolid(s, c, next, (b) => {
    if (!overlaps(p.x, p.y, p.z, b)) return false;
    p.z = dz > 0 ? b.z - HALF : b.z + b.d + HALF;
    p.vz = 0;
    return false;
  });
  const dy = p.vy;
  p.y += dy;
  p.ground = -1;
  eachSolid(s, c, next, (b, id) => {
    if (!overlaps(p.x, p.y, p.z, b)) return false;
    if (dy <= 0) {
      p.y = b.y + b.h;
      p.ground = id;
    } else p.y = b.y - PLAYER.h;
    p.vy = 0;
    return false;
  });
  if (p.ground >= 0) {
    s.coyote = CLIMB.coyote;
    if (!wasGround) events |= ClimbEvent.Landed;
  } else if (s.coyote > 0) s.coyote--;

  // Crumbles count down once stood on, then drop.
  for (let i = 0; i < c.crumbles.length; i++) {
    const t = s.crumble[i]!;
    if (t === 0 && p.ground === CRUMBLE + i) s.crumble[i] = 1;
    else if (t > 0) s.crumble[i] = t >= c.crumbles[i]!.delay ? -1 : t + 1;
  }

  // Hazards, checkpoints, the summit.
  let dead = c.spikes.some((b) => overlaps(p.x, p.y, p.z, b, INSET));
  for (let i = 0; i < c.saws.length && !dead; i++) {
    dead = overlaps(p.x, p.y, p.z, placed(c.saws[i]!, next, scratch), INSET);
  }
  if (p.y < c.checkpoints[s.checkpoint]!.floorY) dead = true;
  s.frame = next;
  s.prevKeys = keys;
  if (dead) {
    s.deaths++;
    respawn(s, c);
    return events | ClimbEvent.Died;
  }
  for (let i = s.checkpoint + 1; i < c.checkpoints.length; i++) {
    if (overlaps(p.x, p.y, p.z, c.checkpoints[i]!.box)) {
      s.checkpoint = i;
      events |= ClimbEvent.Checkpoint;
    }
  }
  if (p.y > s.best) s.best = p.y;
  if (overlaps(p.x, p.y, p.z, c.goal)) {
    s.cleared = true;
    s.clearFrame = s.frame;
    events |= ClimbEvent.Cleared;
  }
  return events;
}

/** FNV-1a over the whole state: equal hashes, equal runs. */
export function hashClimb(s: ClimbState): string {
  let h = 0x811c9dc5;
  const mix = (n: number) => {
    let v = n | 0;
    for (let i = 0; i < 4; i++) {
      h ^= v & 0xff;
      h = Math.imul(h, 0x01000193);
      v >>>= 8;
    }
  };
  const { p } = s;
  [s.frame, p.x, p.y, p.z, p.vx, p.vy, p.vz, p.ground, s.coyote, s.buffer, s.checkpoint].forEach(
    mix,
  );
  [s.deaths, s.cleared ? 1 : 0, s.clearFrame, s.best, s.prevKeys].forEach(mix);
  s.crumble.forEach(mix);
  return (h >>> 0).toString(16).padStart(8, '0');
}
