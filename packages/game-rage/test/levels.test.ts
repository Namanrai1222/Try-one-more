import {
  DeathCause,
  Input,
  InputReplayer,
  STEP_MS,
  SimEvent,
  createSimState,
  distinctAttempts,
  replay,
  step,
} from '@jom/engine';
import type { InputLog } from '@jom/engine';
import { describe, expect, it } from 'vitest';
import { LEVELS } from '../levels/index.ts';
import solutions from '../levels/solutions.json' with { type: 'json' };

const recorded = solutions as unknown as Record<string, { frames: number; inputLog: InputLog }>;
const byId = Object.fromEntries(LEVELS.map((l) => [l.file.id, l]));

describe('chapters 1–4', () => {
  it('load, validate, and are numbered in play order, ten per chapter', () => {
    expect(LEVELS.map((l) => l.file.index)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
    expect(LEVELS.map((l) => l.file.chapter)).toEqual(
      Array.from({ length: 40 }, (_, i) => Math.floor(i / 10) + 1),
    );
    expect(new Set(LEVELS.map((l) => l.file.id)).size).toBe(LEVELS.length);
  });

  // Stuck players get exactly three hints, vaguest first, in the house voice: English, sentence
  // case, no exclamation marks (CLAUDE.md UI copy rules).
  it.each(LEVELS.map((l) => [l.file.id] as const))('%s has three plain-English hints', (id) => {
    const hints = byId[id]!.file.hints ?? [];
    expect(hints).toHaveLength(3);
    for (const hint of hints) {
      expect(hint.length).toBeGreaterThan(0);
      expect(hint.length).toBeLessThanOrEqual(140);
      expect(hint).toMatch(/^[A-Z"]/);
      expect(hint).not.toContain('!');
      expect(hint).toMatch(/^[\x20-\x7E’“”–]+$/); // Latin text only
    }
  });

  // Traps that appear (or vanish) after you die are the meanest trick there is, and the easiest
  // to get wrong: every attempt's layout must be clearable, with its own recorded run.
  it.each(LEVELS.map((l) => [l.file.id] as const))(
    '%s is clearable on every attempt layout it has',
    (id) => {
      const level = byId[id]!;
      for (const s of [...level.sim.traps, ...level.sim.goals]) {
        // Ranges end by attempt 7, so attempts 1–8 show every layout (see LAYOUT_ATTEMPTS).
        expect(Math.min(s.from, 8)).toBeLessThanOrEqual(7);
        if (s.to < 1_000_000) expect(s.to).toBeLessThanOrEqual(7);
      }
      for (const attempt of distinctAttempts(level.sim).slice(1)) {
        const run = recorded[`${id}@${attempt}`];
        expect(run, `no recorded run for attempt ${attempt}`).toBeDefined();
        const s = createSimState(level.sim, 1, attempt);
        const inputs = new InputReplayer(run!.inputLog);
        for (let f = 0; f < run!.frames && s.deaths === 0; f++)
          step(s, inputs.maskAt(f), level.sim);
        expect(s.cleared, `attempt ${attempt} layout`).toBe(true);
        expect(s.deaths).toBe(0);
      }
    },
  );

  // Developer-recorded clean runs (also the future anti-cheat time floor, SECURITY.md §4.3).
  it.each(LEVELS.map((l) => [l.file.id] as const))('%s is clearable with zero deaths', (id) => {
    const level = byId[id]!;
    const run = recorded[id]!;
    const { state } = replay(level.sim, 1, run.inputLog, run.frames);
    expect(state.cleared).toBe(true);
    expect(state.deaths).toBe(0);
    const target = level.file.meta?.targetClearMs;
    if (target) expect(state.clearFrame * STEP_MS).toBeLessThanOrEqual(target);
  });

  it('Reverse Rules is safe to walk, and kills the reflex jump over a spike slot', () => {
    const level = byId['ch1-l05-reverse-rules']!.sim;
    const s = createSimState(level, 1);
    for (let i = 0; i < 400 && s.deaths === 0; i++) {
      const x = s.player.x / 1000;
      step(s, x > 225 && x < 250 ? Input.Right | Input.Jump : Input.Right, level);
    }
    expect(s.lastDeath.cause).toBe(DeathCause.Spike);
  });

  // A trap nobody can trigger is not a trap. Since the 2026-09-26 rebalance every level has
  // something that stops a player who only holds Right ("Trust" and "Nothing" included).
  const SAFE_TO_RUN: string[] = [];
  // These stop a Right-holder without killing: inverted controls walk you home, growing
  // wedges you under a slab, and Level 17 starts on the right.
  const STUCK_NOT_DEAD = [
    'ch2-l11-mirror-hands',
    'ch2-l12-growth-spurt',
    'ch2-l17-lights-out-backwards',
  ];
  it.each(LEVELS.filter((l) => !SAFE_TO_RUN.includes(l.file.id)).map((l) => [l.file.id] as const))(
    '%s punishes a player who just holds Right',
    (id) => {
      const level = byId[id]!.sim;
      const s = createSimState(level, 1);
      for (let i = 0; i < 1200 && s.deaths === 0 && !s.cleared; i++) step(s, Input.Right, level);
      expect(s.cleared).toBe(false);
      expect(s.deaths).toBe(STUCK_NOT_DEAD.includes(id) ? 0 : 1);
    },
  );

  // User decision 2026-09-26 (overrides PRD §4.6's trap-free level 29): it stays empty long
  // enough to make you paranoid, then the very end bites.
  it('"Nothing" is empty for most of the way; its traps wait in the last stretch', () => {
    const { file, sim } = byId['ch3-l29-nothing']!;
    const traps = file.traps ?? [];
    expect(traps.length).toBeGreaterThan(0);
    for (const t of traps) {
      if ('x' in t) expect(t.x).toBeGreaterThan(file.bounds.w * 0.6);
    }
    const s = createSimState(sim, 1);
    for (let i = 0; i < 1200 && s.deaths === 0; i++) step(s, Input.Right, sim);
    expect(s.deaths).toBe(1);
    expect(s.lastDeath.x / 1000).toBeGreaterThan(file.bounds.w * 0.6); // where it died, not the respawn
  });

  it('"Well Done" fakes a clear, then drops the floor', () => {
    const level = byId['ch2-l15-well-done']!.sim;
    const s = createSimState(level, 1);
    let events = 0;
    for (let i = 0; i < 1200 && s.deaths === 0; i++) events |= step(s, Input.Right, level);
    expect(events & SimEvent.MetaTrap).toBeTruthy();
    expect(s.lastDeath.cause).toBe(DeathCause.Fall);
  });

  it('"Error" punishes waiting: the floor under spawn goes', () => {
    const level = byId['ch3-l24-error']!.sim;
    const s = createSimState(level, 1);
    for (let i = 0; i < 400 && s.deaths === 0; i++) step(s, Input.None, level);
    expect(s.deaths).toBe(1);
  });

  it('level 1 ambushes a player who just runs right (collapse on attempt 1)', () => {
    const level = byId['ch1-l01-welcome']!.sim;
    const s = createSimState(level, 1);
    for (let i = 0; i < 400 && s.deaths === 0; i++) step(s, Input.Right, level);
    expect(s.deaths).toBe(1);
    expect(s.lastDeath.cause).toBe(DeathCause.Fall);
  });

  it('level 3 betrays muscle memory: the level 2 run is first killed by the saw', () => {
    const run = recorded['ch1-l02-trust']!;
    const level = byId['ch1-l03-false-trust']!.sim;
    const s = createSimState(level, 1);
    const inputs = new InputReplayer(run.inputLog);
    for (let f = 0; f < run.frames && s.deaths === 0; f++) step(s, inputs.maskAt(f), level);
    expect(s.deaths).toBe(1);
    expect(s.lastDeath.cause).toBe(DeathCause.Saw);
  });
});
