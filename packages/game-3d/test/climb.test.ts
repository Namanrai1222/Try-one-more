import { describe, expect, it } from 'vitest';
import { climbCourse } from '../src/course.ts';
import type { RouteStep } from '../src/course.ts';
import {
  CLIMB,
  CRUMBLE,
  Key,
  MOVER,
  PLAYER,
  createClimb,
  hashClimb,
  inputMask,
  placed,
  step,
} from '../src/sim.ts';
import type { Box, ClimbState, Course } from '../src/sim.ts';

const { course, route } = climbCourse();
const HALF = PLAYER.w / 2;

function boxOf(c: Course, id: number, frame: number): Box {
  if (id >= MOVER)
    return placed(c.movers[id - MOVER]!, frame, { x: 0, y: 0, z: 0, w: 0, h: 0, d: 0 });
  if (id >= CRUMBLE) return c.crumbles[id - CRUMBLE]!;
  return c.solids[id]!;
}

/** Horizontal gap between the player's box and `b` (0 when above or below it). */
function gap(s: ClimbState, b: Box): number {
  const gx = Math.max(b.x - (s.p.x + HALF), s.p.x - HALF - (b.x + b.w), 0);
  const gz = Math.max(b.z - (s.p.z + HALF), s.p.z - HALF - (b.z + b.d), 0);
  return Math.hypot(gx, gz);
}

/** How far the player can go along (dx, dz) before leaving `b`'s top. */
function exit(s: ClimbState, b: Box, dx: number, dz: number): number {
  const tx = dx > 0 ? (b.x + b.w - s.p.x) / dx : dx < 0 ? (b.x - s.p.x) / dx : Infinity;
  const tz = dz > 0 ? (b.z + b.d - s.p.z) / dz : dz < 0 ? (b.z - s.p.z) / dz : Infinity;
  return Math.min(tx, tz);
}

/**
 * A plain climber: steer at the next platform and jump at the edge; wait for a moving piece to
 * come within reach (and ride it until the next one is); hop spikes and saws ahead. It proves
 * the course can be climbed, with every input recorded.
 */
function climbBot(c: Course, r: readonly RouteStep[], maxFrames = 20_000) {
  const s = createClimb(c);
  const masks: number[] = [];
  let k = 1;
  let jumpUntil = -1;
  for (let f = 0; f < maxFrames && !s.cleared; f++) {
    const at = r.findIndex((st, i) => i >= k && st.id === s.p.ground);
    if (at >= 0) k = at + 1;
    const target = r[Math.min(k, r.length - 1)]!;
    const tb = boxOf(c, target.id, s.frame);
    const tx = tb.x + tb.w / 2 - s.p.x;
    const tz = tb.z + tb.d / 2 - s.p.z;
    const len = Math.hypot(tx, tz) || 1;
    const yaw = Math.round((Math.atan2(tx, tz) / (2 * Math.PI)) * 64) & 63;
    let keys: number = Key.Forward;
    const reach = gap(s, tb) <= 1500 && tb.y + tb.h - s.p.y <= 1000;
    const onGround = s.p.ground >= 0;
    const riding = s.p.ground >= MOVER;
    const ferry =
      target.kind === 'mover' &&
      (c.movers[target.id - MOVER]!.dx !== 0 || c.movers[target.id - MOVER]!.dz !== 0);
    const elevator = target.kind === 'mover' && !ferry;
    if (onGround && !reach && (ferry || riding || (elevator && gap(s, tb) < 1300))) keys = 0;
    if (keys && f > jumpUntil) {
      const ground = onGround ? boxOf(c, s.p.ground, s.frame) : null;
      const edge = ground !== null && ground !== tb && exit(s, ground, tx / len, tz / len) < 280;
      const hazards = [...c.spikes, ...c.saws.map((w) => placed(w, s.frame, { ...w }))];
      const hazard = hazards.some(
        (h) => gap(s, h) < 1300 && h.y <= s.p.y + 200 && h.y + h.h > s.p.y,
      );
      // A step up right ahead (no gap to jump, just a riser to get onto).
      const riser = tb.y + tb.h > s.p.y + 100 && gap(s, tb) < 700;
      // Press just before touching down when a spike sits at the landing edge. The six-frame
      // input buffer then launches on contact; pressing after landing is too late at full speed.
      const bufferedHazard = !onGround && s.p.vy < 0 && hazard;
      if ((onGround && (edge || hazard || riser)) || bufferedHazard) jumpUntil = f + 24; // held to the apex: letting go early cuts it
    }
    if (f <= jumpUntil) keys |= Key.Jump;
    const mask = inputMask(keys, yaw);
    masks.push(mask);
    step(s, mask, c);
  }
  return { s, masks };
}

describe('Higher and Higher', () => {
  it('sits on the 0.5 m grid, in three named sections', () => {
    for (const b of [...course.solids, ...course.crumbles, ...course.movers]) {
      for (const v of [b.x, b.z, b.w, b.d]) expect(Math.abs(v % 250)).toBe(0);
    }
    expect(course.checkpoints.map((c) => c.name)).toEqual(['The Stairs', 'The Works', 'The Spire']);
  });

  it('jumps about 1.6 m and runs about 5.7 m/s', () => {
    const s = createClimb(course);
    const y0 = s.p.y;
    let apex = y0;
    for (let f = 0; f < 60; f++) {
      step(s, inputMask(f < 30 ? Key.Jump : 0, 0), course);
      apex = Math.max(apex, s.p.y);
    }
    expect(apex - y0).toBeGreaterThan(1500);
    expect(apex - y0).toBeLessThan(1700);
    for (let f = 0; f < 30; f++) step(s, inputMask(Key.Forward, 48), course); // yaw 48 faces -x, open plaza
    expect(s.p.vx).toBe(-CLIMB.run);
  });

  it('can be climbed to the summit without a fall', () => {
    const { s } = climbBot(course, route);
    expect(s.deaths).toBe(0);
    expect(s.cleared).toBe(true);
    expect(s.checkpoint).toBe(course.checkpoints.length - 1);
    expect(s.best / 1000).toBeGreaterThan(30); // metres in this prototype course
  });

  it('replays the same inputs to the same state (determinism)', () => {
    const { s, masks } = climbBot(course, route);
    const again = createClimb(course);
    for (const m of masks) step(again, m, course);
    expect(hashClimb(again)).toBe(hashClimb(s));
  });

  it('sends a fall back to the section checkpoint, with crumbles restored', () => {
    const s = createClimb(course);
    s.checkpoint = 1;
    s.crumble.fill(-1);
    s.p.y = course.checkpoints[1]!.floorY - 1000;
    step(s, 0, course);
    expect(s.deaths).toBe(1);
    expect(s.p.x).toBe(course.checkpoints[1]!.spawn.x);
    expect([...s.crumble].every((t) => t === 0)).toBe(true);
  });
});
