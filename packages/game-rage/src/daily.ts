/**
 * Daily Trap (PRD.md §4.7): one new level per UTC day, identical for everyone. Generated from
 * the date alone — no server needed to agree on it — and solvable by construction: every
 * hazard can be jumped from a full-speed runway, and runways are longer than a jump's landing
 * distance. Tests run the real solver over sample days (test/daily.test.ts).
 */
import { fnv1a, mulberry32 } from '@jom/engine';
import type { LevelFile, TrapFile } from '@jom/engine';

const FLOOR = 448;
const H = 540 - FLOOR;

type Solid = LevelFile['solids'][number];

export function dailyLevel(day: string): LevelFile {
  let seed = fnv1a(`daily:${day}`);
  const rand = (n: number) => {
    const r = mulberry32(seed);
    seed = r.state;
    return r.value % n;
  };
  const between = (lo: number, hi: number) => lo + rand(hi - lo + 1);

  const solids: Solid[] = [];
  const traps: TrapFile[] = [];
  let segStart = 0;
  let x = 240; // the cursor: everything left of it is built
  const endSegment = (at: number, id = `s${solids.length}`) => {
    solids.push({ id, x: segStart, y: FLOOR, w: at - segStart, h: H });
  };
  const runway = () => (x += between(170, 240));

  const features = ['gap', 'spikes', 'collapse', 'saw', 'coin', 'door', 'gap', 'spikes'];
  const count = between(5, 6);
  for (let i = 0; i < count; i++) {
    runway();
    switch (features[rand(features.length)]) {
      case 'gap': {
        endSegment(x);
        x += between(70, 110);
        segStart = x;
        break;
      }
      case 'spikes': {
        const w = between(32, 56);
        traps.push({ type: 'spike', x, y: FLOOR - 24, w, h: 24 });
        x += w;
        break;
      }
      case 'collapse': {
        // A tile over a pit that drops shortly after it is stood on: jump it.
        endSegment(x);
        const w = between(80, 100);
        const id = `tile${solids.length}`;
        solids.push({ id, x, y: FLOOR, w, h: H });
        traps.push({ type: 'collapse', target: id, delayFrames: between(6, 10) });
        x += w;
        segStart = x;
        break;
      }
      case 'saw': {
        // Drops onto whoever runs under it; wait, then jump the landed blade.
        traps.push({
          type: 'saw',
          x: x + 70,
          y: -64,
          w: 40,
          h: 40,
          triggerX: x,
          fallTo: FLOOR - 40,
          speed: 20,
        });
        x += 110;
        break;
      }
      case 'coin': {
        traps.push({ type: 'coin', x, y: FLOOR - 44, w: 32, h: 32 });
        x += 32;
        break;
      }
      case 'door': {
        traps.push({ type: 'fakeGoal', x, y: FLOOR - 64, w: 40, h: 64 });
        x += 40;
        break;
      }
    }
  }
  runway();
  const doorX = x;
  const width = doorX + 120;
  endSegment(width);

  return {
    schema: 1,
    id: `daily-${day}`,
    chapter: 0,
    index: 0,
    name: 'Daily Trap',
    bounds: { w: width, h: 540 },
    spawn: { x: 48, y: 400 },
    goal: { x: doorX, y: FLOOR - 64, w: 40, h: 64, look: 'alt' },
    solids,
    traps,
    taunts: { overrides: ['Same trap for everyone today. You found it first.'] },
    meta: { targetDeaths: 5 },
  };
}
