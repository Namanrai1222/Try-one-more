import { describe, expect, it } from 'vitest';
import {
  BIG_H,
  BIG_W,
  FAKE_CLEAR_FRAMES,
  Input,
  InputRecorder,
  LevelError,
  SimEvent,
  attemptTracks,
  bindings,
  compileLevel,
  createSimState,
  parseLevel,
  playerSize,
  step,
  timeLeft,
  toFixed,
  verifyRun,
} from '../src/index.ts';
import type { LevelFile, SimLevel, SimState, TrapFile } from '../src/index.ts';

/** Flat floor, spawn on the left, door far right; `solids`/`traps` added per test. */
function level(traps: TrapFile[], extra: Partial<LevelFile> = {}): SimLevel {
  return compileLevel(
    parseLevel({
      schema: 1,
      id: 't3',
      chapter: 0,
      index: 0,
      name: 'T3',
      bounds: { w: 960, h: 540 },
      spawn: { x: 64, y: 416 },
      goal: { x: 900, y: 384, w: 40, h: 64 },
      solids: [{ id: 'floor', x: 0, y: 448, w: 960, h: 92 }],
      traps,
      ...extra,
    }),
  );
}

function run(s: SimState, l: SimLevel, mask: number, frames: number): number {
  let events = 0;
  for (let i = 0; i < frames; i++) events |= step(s, mask, l);
  return events;
}

describe('ice', () => {
  it('slides far after letting go, where concrete stops at once', () => {
    const slide = (ice: boolean) => {
      const l = level([], { solids: [{ id: 'floor', x: 0, y: 448, w: 960, h: 92, ice }] });
      const s = createSimState(l, 1);
      run(s, l, Input.None, 10); // land
      run(s, l, Input.Right, 40);
      const x = s.player.x;
      run(s, l, Input.None, 30);
      return s.player.x - x;
    };
    expect(slide(false)).toBeLessThan(toFixed(12));
    expect(slide(true)).toBeGreaterThan(toFixed(60));
  });
});

describe('invert, grow, spring, teleport', () => {
  it('invert swaps left and right once past the trigger', () => {
    const l = level([{ type: 'invert', triggerX: 200 }]);
    const s = createSimState(l, 1);
    run(s, l, Input.Right, 60);
    expect(s.invert).toBe(1);
    const x = s.player.x;
    run(s, l, Input.Right, 20); // now moves left
    expect(s.player.x).toBeLessThan(x);
    expect(bindings(s, l)).toEqual([Input.Right, Input.Left, Input.Jump]);
  });

  it('grow doubles the hitbox, feet staying on the floor', () => {
    const l = level([{ type: 'grow', triggerX: 150 }]);
    const s = createSimState(l, 1);
    run(s, l, Input.Right, 40);
    expect(playerSize(s)).toEqual({ w: BIG_W, h: BIG_H });
    run(s, l, Input.None, 20);
    expect(s.player.y + BIG_H).toBe(toFixed(448));
    expect(s.player.onGround).toBe(true);
  });

  it('a spring launches much higher than a jump', () => {
    const l = level([{ type: 'spring', x: 160, y: 436, w: 24, h: 12, power: 16, hidden: true }]);
    const s = createSimState(l, 1);
    let top = s.player.y;
    for (let i = 0; i < 120; i++) {
      step(s, i < 30 ? Input.Right : Input.None, l);
      top = Math.min(top, s.player.y);
    }
    expect(s.traps[0]!.fired).toBe(1);
    expect(toFixed(448) - top).toBeGreaterThan(toFixed(150)); // a normal jump peaks ~92px
  });

  it('a teleport "checkpoint" sends the player back to spawn, alive', () => {
    const l = level([{ type: 'teleport', x: 300, y: 400, w: 24, h: 48 }]);
    const s = createSimState(l, 1);
    const events = run(s, l, Input.Right, 90);
    expect(events & SimEvent.Died).toBe(0);
    expect(s.traps[0]!.fired).toBe(1);
    expect(s.player.x).toBeLessThan(toFixed(300));
  });
});

describe('timer', () => {
  it('counts down, then the targets vanish', () => {
    const l = level([{ type: 'timer', frames: 60, targets: ['floor'] }]);
    const s = createSimState(l, 1);
    run(s, l, Input.None, 20);
    expect(timeLeft(s, l)).toBe(40);
    run(s, l, Input.None, 41);
    expect(s.gone[0]).toBe(1);
    expect(timeLeft(s, l)).toBeNull();
    expect(run(s, l, Input.None, 120) & SimEvent.Died).toBeTruthy();
  });
});

describe('shuffle', () => {
  it('is normal for the first period, then changes every period', () => {
    const l = level([{ type: 'shuffle', every: 60 }]);
    const s = createSimState(l, 1);
    const seen: string[] = [];
    for (let k = 0; k < 7; k++) {
      seen.push(bindings(s, l).join());
      run(s, l, Input.None, 60);
    }
    expect(seen[0]).toBe([Input.Left, Input.Right, Input.Jump].join());
    for (let k = 1; k < seen.length; k++) expect(seen[k]).not.toBe(seen[k - 1]);
  });
});

describe('clone', () => {
  it('replays the previous attempt as a solid body', () => {
    const l = level([{ type: 'clone' }, { type: 'spike', x: 400, y: 432, w: 32, h: 16 }]);
    const s = createSimState(l, 1);
    // Attempt 1: walk right into the spikes.
    while (!(step(s, Input.Right, l) & SimEvent.Died));
    expect(s.clone.active).toBe(1);
    // Attempt 2: wait; the clone walks off and turns solid once clear of the player.
    run(s, l, Input.None, 30);
    expect(s.clone.active).toBe(2);
    expect(s.clone.x).toBeGreaterThan(s.player.x);
    // Chase it: the player is blocked by the clone's body instead of passing through.
    run(s, l, Input.Right, 8);
    expect(s.player.x + toFixed(24)).toBeLessThanOrEqual(s.clone.x);
  });
});

describe('fakeClear', () => {
  const l = level([{ type: 'fakeClear', x: 300, y: 384, w: 40, h: 64, targets: ['floor'] }]);

  it('freezes the player, then drops the floor on the next new input', () => {
    const s = createSimState(l, 1);
    let events = 0;
    while (!(events & SimEvent.MetaTrap)) events = step(s, Input.Right, l);
    const x = s.player.x;
    run(s, l, Input.Right, 30); // a held key is not new input
    expect(s.player.x).toBe(x);
    expect(s.freeze).toBeGreaterThan(0);
    step(s, Input.Right | Input.Jump, l);
    expect(s.freeze).toBe(0);
    expect(s.gone[0]).toBe(1);
    expect(run(s, l, Input.None, 120) & SimEvent.Died).toBeTruthy();
  });

  it('never freezes longer than 3 seconds', () => {
    const s = createSimState(l, 1);
    while (!(step(s, Input.Right, l) & SimEvent.MetaTrap));
    run(s, l, Input.Right, FAKE_CLEAR_FRAMES);
    expect(s.freeze).toBe(0);
    expect(s.gone[0]).toBe(1);
  });
});

describe('level format', () => {
  const base = {
    schema: 1,
    id: 'x',
    chapter: 2,
    index: 1,
    name: 'X',
    bounds: { w: 100, h: 100 },
    spawn: { x: 1, y: 1 },
    solids: [{ id: 'a', x: 0, y: 90, w: 100, h: 10 }],
  };

  it('validates the new traps', () => {
    const bad = (traps: unknown[]) => () => parseLevel({ ...base, traps });
    expect(bad([{ type: 'timer', frames: 10, targets: ['nope'] }])).toThrow(LevelError);
    expect(bad([{ type: 'shuffle', every: 5 }])).toThrow(/≥ 30/);
    expect(bad([{ type: 'spring', x: 0, y: 0, w: 1, h: 1, power: 99 }])).toThrow(/≤ 30/);
    expect(bad([{ type: 'fakeClear', x: 0, y: 0, w: 1, h: 1, targets: [] }])).toThrow(LevelError);
    expect(bad([])).not.toThrow();
  });

  it('passes view hints and printed text through to the renderer only', () => {
    const l = compileLevel(
      parseLevel({
        ...base,
        solids: [{ id: 'a', x: 0, y: 90, w: 100, h: 10, text: 'Climb this.' }],
        view: { dark: 90, ghosts: true },
      }),
    );
    expect(l.view).toEqual({ chapter: 2, dark: 90, ghosts: true, texts: ['Climb this.'] });
  });

  it('keeps chapter 1 levels byte-identical when compiled (no view, no ice)', () => {
    const l = level([]);
    expect(l.view).toBeUndefined();
    expect(Object.keys(l.solids[0]!)).toEqual(['x', 'y', 'w', 'h']);
  });

  it('only accepts fake loading and fake error meta-traps', () => {
    const meta = (kind: string) => () => parseLevel({ ...base, metaTrap: { kind, frames: 60 } });
    expect(meta('fakeError')).not.toThrow();
    expect(meta('fakeLogin')).toThrow(LevelError);
  });
});

describe('ghost tracks and verification', () => {
  const l = level([{ type: 'spike', x: 300, y: 432, w: 32, h: 16 }]);
  const rec = new InputRecorder();
  // Two deaths walking right, then a clear jumping the spikes.
  const s = createSimState(l, 5);
  for (let f = 0; !s.cleared && f < 3000; f++) {
    const jump = s.attempt >= 3 && s.player.x > toFixed(210); // held: a full-height jump
    const mask = jump ? Input.Right | Input.Jump : Input.Right;
    rec.record(s.frame, mask);
    step(s, mask, l);
  }
  const claim = { seed: 5, inputLog: rec.log, frames: s.clearFrame, cleared: true, deaths: 2 };

  it('attemptTracks returns one path per failed attempt, ending where it died', () => {
    expect(s.cleared).toBe(true);
    const tracks = attemptTracks(l, 5, rec.log, s.clearFrame);
    expect(tracks).toHaveLength(2);
    const t = tracks[0]!;
    expect(t[t.length - 2]).toBeGreaterThan(toFixed(250));
  });

  it('accepts the honest run and rejects doctored ones', () => {
    expect(verifyRun(l, claim)).toEqual({ ok: true });
    expect(verifyRun(l, { ...claim, deaths: 0 })).toMatchObject({ ok: false });
    expect(verifyRun(l, { ...claim, frames: claim.frames - 1 })).toMatchObject({ ok: false });
    expect(verifyRun(l, { ...claim, inputLog: 'nope' })).toMatchObject({ ok: false });
    expect(verifyRun(l, claim, { floorFrames: claim.frames * 2 })).toEqual({
      ok: false,
      reason: 'faster than the level allows',
    });
    expect(verifyRun(l, claim, { maxFrames: 10 })).toMatchObject({ ok: false });
  });

  it('rejects superhuman input density', () => {
    const mash = Array.from({ length: 100 }, (_, i) => [i * 2, i % 2 ? Input.Right : 0] as const);
    expect(
      verifyRun(l, { seed: 5, inputLog: mash, frames: 300, cleared: false, deaths: 0 }),
    ).toEqual({ ok: false, reason: 'superhuman input density' });
  });
});
