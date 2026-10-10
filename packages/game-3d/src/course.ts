/**
 * The "Higher and Higher" climb (3D_MODELING.md §3.2 and §8 Phase 6d): a square spiral round a
 * central tower, built from the kit — slabs, pillars, crumbling slabs, a spike strip, ferries,
 * an elevator and a sweeping saw — in three sections, each with its own trap vocabulary. Every
 * piece sits on the 0.5 m grid (UNITS.gridSnap).
 *
 * The ring's corners are (±7, ±7) m; each side runs 0–14 m from one corner to the next and is
 * laid out explicitly. Hops stay inside what a jump can do: rise ≤ 1 m (apex 1.6 m), gap ≤ 2 m
 * (a full-speed jump carries ~3.3 m at a 1 m rise). `test/course.test.ts` climbs it with a bot.
 */
import { CRUMBLE, MM, MOVER } from './sim.ts';
import type { Box, Course, Path } from './sim.ts';

/** One hop of the route: what to land on (a ground id, see sim.ts) and what it is. */
export interface RouteStep {
  id: number;
  kind: 'slab' | 'crumble' | 'mover' | 'goal';
}

const m = (v: number) => Math.round(v * MM);
const box = (x: number, y: number, z: number, w: number, h: number, d: number): Box => ({
  x: m(x),
  y: m(y),
  z: m(z),
  w: m(w),
  h: m(h),
  d: m(d),
});
const path = (dx: number, dy: number, dz: number, period: number, phase = 0): Path => ({
  dx: m(dx),
  dy: m(dy),
  dz: m(dz),
  period,
  phase,
});

/** Headings round the tower, counter-clockwise from above: +x, +z, -x, -z. */
const DX = [1, 0, -1, 0];
const DZ = [0, 1, 0, -1];

export function climbCourse(): { course: Course; route: RouteStep[] } {
  const solids: Box[] = [];
  const crumbles: Course['crumbles'] = [];
  const movers: Course['movers'] = [];
  const spikes: Box[] = [];
  const saws: Course['saws'] = [];
  const checkpoints: Course['checkpoints'] = [];
  const route: RouteStep[] = [];

  // The current side of the ring: its start corner and heading. `y` is the height reached.
  let cx = -7;
  let cz = -7;
  let dir = 0;
  let y = 0;
  const px = (pos: number) => cx + DX[dir]! * pos;
  const pz = (pos: number) => cz + DZ[dir]! * pos;
  const turn = () => {
    cx = px(14);
    cz = pz(14);
    dir = (dir + 1) % 4;
  };
  /** A slab with its top centre at `pos` along the side; `len` runs along the heading. */
  const slabAt = (pos: number, len = 2.5, wide = 2.5, h = 0.5): Box => {
    const [w, d] = dir % 2 ? [wide, len] : [len, wide];
    return box(px(pos) - w / 2, y - h, pz(pos) - d / 2, w, h, d);
  };
  const add = (b: Box, kind: RouteStep['kind'] = 'slab') => {
    if (kind === 'crumble') {
      crumbles.push({ ...b, delay: 45 }); // 0.75 s: a 2.5 m slab takes ~0.45 s to cross
      route.push({ id: CRUMBLE + crumbles.length - 1, kind });
    } else {
      solids.push(b);
      route.push({ id: solids.length - 1, kind });
    }
  };
  const checkpoint = (name: string, pos: number) => {
    checkpoints.push({
      name,
      box: box(px(pos) - 1, y, pz(pos) - 1, 2, 2, 2),
      spawn: { x: m(px(pos)), y: m(y), z: m(pz(pos)) },
      floorY: m(y - 4),
    });
  };

  // Ground: a plaza. The start is its corner, where the ring begins.
  solids.push(box(-15, -1, -15, 30, 1, 30));
  route.push({ id: 0, kind: 'slab' });
  checkpoint('The Stairs', 0);
  checkpoints[0]!.floorY = m(-5);

  // 1. The Stairs (four sides): steady steps; two crumble; one long slab has a spike strip.
  for (let side = 0; side < 4; side++) {
    for (const pos of [3.5, 7, 10.5, 14]) {
      if (side === 2 && pos === 7) continue; // covered by the long slab
      y += pos === 7 || pos === 14 ? 1 : 0.5;
      if (side === 2 && pos === 3.5) {
        add(slabAt(5.25, 6));
        const strip = slabAt(7.5, 0.5, 2.5, 0.4);
        strip.y += m(0.4);
        spikes.push(strip);
        continue;
      }
      add(slabAt(pos), (side === 1 || side === 3) && pos === 7 ? 'crumble' : 'slab');
    }
    turn();
  }

  // 2. The Works. Side 1: a ferry over a gap no jump crosses.
  y += 0.5;
  add(slabAt(3.5, 3, 3));
  checkpoint('The Works', 3.5);
  movers.push({ ...slabAt(6.25), ...path(DX[dir]! * 5, 0, DZ[dir]! * 5, 300) });
  route.push({ id: MOVER + movers.length - 1, kind: 'mover' });
  add(slabAt(14, 3, 3));
  turn();
  // Side 2: a step, an elevator 4 m up, a step off at the top.
  y += 1;
  add(slabAt(3.5));
  movers.push({ ...slabAt(7), ...path(0, 4, 0, 360) });
  route.push({ id: MOVER + movers.length - 1, kind: 'mover' });
  y += 4.5;
  add(slabAt(10.5));
  y += 0.5;
  add(slabAt(14, 3, 3));
  turn();
  // Side 3: a walkway with a saw sweeping along it.
  y += 0.5;
  add(slabAt(7, 9));
  const saw = slabAt(4, 0.8, 0.8, 0.8);
  saw.y += m(0.8);
  saws.push({ ...saw, ...path(DX[dir]! * 6, 0, DZ[dir]! * 6, 200) });
  y += 0.5;
  add(slabAt(14, 3, 3));
  turn();
  // Side 4: a second ferry, then steps (one crumbles) to the last section.
  movers.push({ ...slabAt(2.75), ...path(DX[dir]! * 5, 0, DZ[dir]! * 5, 300, 150) });
  route.push({ id: MOVER + movers.length - 1, kind: 'mover' });
  y += 0.5;
  add(slabAt(10.5));
  y += 1;
  add(slabAt(14, 3, 3));
  turn();

  // 3. The Spire: 1.5 m posts; every third crumbles.
  checkpoint('The Spire', 0);
  let n = 0;
  for (let side = 0; side < 3; side++) {
    for (const pos of side < 2 ? [3.5, 7, 10.5, 14] : [3.5, 7]) {
      y += 1;
      // Posts 3 m deep, not from the ground: the ring below passes under them.
      add(
        box(px(pos) - 0.75, y - 3, pz(pos) - 0.75, 1.5, 3, 1.5),
        ++n % 3 === 0 ? 'crumble' : 'slab',
      );
    }
    if (side < 2) turn();
  }
  // Inward from the middle of the last side: a bridge, then the tower top and the flag.
  const inX = -DZ[dir]!; // left of the heading points at the tower
  const inZ = DX[dir]!;
  y += 0.5;
  solids.push(box(px(7) + inX * 2.5 - 1.25, y - 0.5, pz(7) + inZ * 2.5 - 1.25, 2.5, 0.5, 2.5));
  route.push({ id: solids.length - 1, kind: 'slab' });
  const top = y + 1;
  solids.push(box(-3, 0, -3, 6, top, 6));
  route.push({ id: solids.length - 1, kind: 'goal' });

  return {
    course: {
      id: 'climb-1',
      name: 'Higher and Higher',
      solids,
      crumbles,
      movers,
      spikes,
      saws,
      checkpoints,
      goal: box(-0.5, top, -0.5, 1, 2, 1),
    },
    route,
  };
}
