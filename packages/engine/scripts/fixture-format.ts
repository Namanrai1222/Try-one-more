import { SANDBOX_LEVEL, compileLevel } from '../src/index.ts';
import type { InputLog, LevelFile, SimLevel, StateSnapshot } from '../src/index.ts';

export const FIXTURE_PATH = new URL('../test/fixtures/determinism-runs.json', import.meta.url);
export const FIXTURE_RUNS = 50;

/** Every trap type, scoped to different attempts, so fixtures exercise all of them. */
export const TRAP_LEVEL_FILE: LevelFile = {
  schema: 1,
  id: 'fixture-traps',
  chapter: 0,
  index: 0,
  name: 'Fixture traps',
  bounds: { w: 960, h: 540 },
  spawn: { x: 64, y: 400 },
  goal: { x: 820, y: 416, w: 32, h: 64 },
  solids: [
    { id: 'floor-a', x: 0, y: 480, w: 256, h: 60 },
    { id: 'drop', x: 256, y: 480, w: 64, h: 60 },
    { id: 'floor-b', x: 320, y: 480, w: 640, h: 60 },
  ],
  traps: [
    { type: 'collapse', target: 'drop', delayFrames: 4, when: { to: 1 } },
    { type: 'spike', x: 448, y: 464, w: 48, h: 16, when: { from: 2, to: 2 } },
    {
      type: 'saw',
      x: 600,
      y: 0,
      w: 48,
      h: 48,
      triggerX: 560,
      fallTo: 432,
      speed: 9,
      when: { from: 2 },
    },
    { type: 'goalShift', dx: 96, triggerDistance: 120, when: { from: 3 } },
  ],
};

/** The Phase 2 mechanics: erupting spikes, crusher, coin, fake and alternating doors, gravity. */
export const TRAP_LEVEL_2_FILE: LevelFile = {
  schema: 1,
  id: 'fixture-traps-2',
  chapter: 0,
  index: 0,
  name: 'Fixture traps 2',
  bounds: { w: 960, h: 540 },
  spawn: { x: 64, y: 400 },
  goals: [
    { x: 760, y: 384, w: 40, h: 64, look: 'primary', when: { parity: 'even' } },
    { x: 880, y: 384, w: 40, h: 64, look: 'alt' },
  ],
  solids: [
    { x: 0, y: 0, w: 960, h: 32 },
    { x: 0, y: 448, w: 960, h: 92 },
  ],
  traps: [
    { type: 'spike', x: 40, y: 416, w: 64, h: 32, erupt: { on: 'time', frame: 150 } },
    { type: 'spike', x: 200, y: 360, w: 48, h: 88, erupt: { on: 'jump', frames: 20 } },
    { type: 'coin', x: 400, y: 380, w: 32, h: 32 },
    { type: 'crusher', x: 500, y: -200, w: 200, h: 200, triggerX: 480, fallTo: 230, speed: 1 },
    { type: 'fakeGoal', x: 760, y: 384, w: 40, h: 64, when: { parity: 'odd' } },
    { type: 'gravityFlip', triggerX: 700, when: { from: 3 } },
  ],
};

/**
 * The Phase 4 mechanics, packed close to spawn so random inputs reach them: ice, a hidden
 * spring, shuffled bindings, the clone, invert, a countdown, grow, a teleport, a fake clear.
 */
export const TRAP_LEVEL_3_FILE: LevelFile = {
  schema: 1,
  id: 'fixture-traps-3',
  chapter: 0,
  index: 0,
  name: 'Fixture traps 3',
  bounds: { w: 960, h: 540 },
  spawn: { x: 64, y: 400 },
  goal: { x: 900, y: 384, w: 40, h: 64 },
  solids: [
    { id: 'ice', x: 0, y: 448, w: 300, h: 92, ice: true },
    { id: 'mid', x: 300, y: 448, w: 300, h: 92 },
    { id: 'end', x: 600, y: 448, w: 360, h: 92 },
    { id: 'ledge', x: 150, y: 330, w: 100, h: 16 },
  ],
  traps: [
    { type: 'shuffle', every: 90 },
    { type: 'clone' },
    { type: 'spring', x: 120, y: 436, w: 24, h: 12, power: 14, hidden: true },
    { type: 'spike', x: 220, y: 432, w: 32, h: 16 }, // deaths, so the clone gets a script
    { type: 'invert', triggerX: 250 },
    { type: 'timer', frames: 400, targets: ['ledge'] },
    { type: 'grow', triggerX: 420 },
    { type: 'teleport', x: 520, y: 400, w: 24, h: 48, when: { from: 2 } },
    { type: 'fakeClear', x: 700, y: 384, w: 40, h: 64, targets: ['end'] },
  ],
};

export const FIXTURE_LEVELS: Record<string, SimLevel> = {
  [SANDBOX_LEVEL.id]: SANDBOX_LEVEL,
  [TRAP_LEVEL_FILE.id]: compileLevel(TRAP_LEVEL_FILE),
  [TRAP_LEVEL_2_FILE.id]: compileLevel(TRAP_LEVEL_2_FILE),
  [TRAP_LEVEL_3_FILE.id]: compileLevel(TRAP_LEVEL_3_FILE),
};

export interface FixtureRun {
  id: number;
  levelId: string;
  seed: number;
  frames: number;
  inputLog: InputLog;
  expected: StateSnapshot & { hash: string };
}

export interface FixtureFile {
  version: 2;
  /** levelId → hashLevel, so a geometry change is detected. */
  levelHashes: Record<string, string>;
  physicsHash: string;
  runs: FixtureRun[];
}
