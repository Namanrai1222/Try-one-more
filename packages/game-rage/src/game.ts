import {
  FixedStepDriver,
  Input,
  InputRecorder,
  InputReplayer,
  PLAYER_W,
  STEP_MS,
  SimEvent,
  attemptLayout,
  attemptTracks,
  bindings,
  compileLevel,
  createSimState,
  deriveSeed,
  distinctAttempts,
  goalRect,
  parseLevel,
  step,
  timeLeft,
  toPx,
} from '@jom/engine';
import type { InputLog, SimState } from '@jom/engine';
import { LEVELS } from '../levels/index.ts';
import type { GameLevel } from '../levels/index.ts';
import solutions from '../levels/solutions.json' with { type: 'json' };
import { createSfx } from './audio.ts';
import { makeClip } from './clip.ts';
import { dailyLevel } from './daily.ts';
import type { GameController, GameOptions, HudState } from './index.ts';
import { createInputSource } from './input/source.ts';
import { metaTrapAllowed } from './meta-trap.ts';
import { readProgress, recordDailyClear, unlockedIndex } from './progress.ts';
import { rageScore } from './rage.ts';
import { createView } from './render.ts';
import { pickTaunt } from './taunts.ts';

const bits = (m: number) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);
const ACTION: Record<number, string> = {
  [Input.Left]: 'Left',
  [Input.Right]: 'Right',
  [Input.Jump]: 'Jump',
};
/** Best runs longer than this aren't kept (save size); 10 minutes, SECURITY.md §4.2's frame cap. */
const MAX_BEST_FRAMES = 36_000;
const MAX_BEST_ENTRIES = 4_000;
/**
 * "Watch how": each level's recorded zero-death run (levels/solutions.json), chosen by the
 * solver to survive human timing, replayed in the real renderer with the keys shown.
 */
const RUNS = solutions as unknown as Record<string, { frames: number; inputLog: InputLog }>;
/** Recordings were made with sim seed 1; a demo starts from the same seed so it replays exactly. */
const RECORDED_SEED = 1;
/** After the demo reaches the door, the level restarts for real after this pause. */
const DEMO_OUTRO_MS = 900;

export function createGame(container: HTMLElement, options: GameOptions): GameController {
  const { ctx } = options;
  const progress = readProgress(ctx.loadProgress());
  progress.unlocked = unlockedIndex(
    progress,
    LEVELS.map((l) => l.file.id),
  );
  progress.sessions++;
  const save = () => ctx.saveProgress(progress);
  save();
  const metaTrapsOk = metaTrapAllowed({
    sessions: progress.sessions,
    lastRealErrorAt: ctx.lastRealErrorAt,
    now: Date.now(),
  });

  const view = createView(container);
  const input = createInputSource(view.canvas);
  const sfx = createSfx(progress.muted, ctx.isAudioMuted);

  // Daily mode plays today's generated level instead of the chapters.
  const day = options.daily;
  const pool: readonly GameLevel[] = day
    ? [
        (() => {
          const file = parseLevel(dailyLevel(day));
          return { file, sim: compileLevel(file) };
        })(),
      ]
    : LEVELS;
  const clampIndex = (i: number) => Math.min(Math.max(0, Math.trunc(i) || 0), pool.length - 1);

  // A challenge link opens its level even if it is still locked here; nothing else is skipped.
  const challengeIndex = options.challenge ? clampIndex(options.levelIndex ?? 0) : -1;
  const allowed = (i: number) =>
    day || clampIndex(i) === challengeIndex
      ? clampIndex(i)
      : Math.min(clampIndex(i), progress.unlocked);
  // Start where the player left off unless they asked for an (unlocked) level.
  let index = allowed(options.levelIndex ?? progress.unlocked);
  let level = pool[index]!;
  const seedOf = (l: GameLevel) => deriveSeed(l.sim.id, 1);
  let state: SimState = createSimState(level.sim, seedOf(level));
  let prevX = 0;
  let prevY = 0;
  let paused = false;
  let taunt: string | null = null;
  let deathId = 0;
  let fake: HudState['fake'] = null;
  let nudge = 0;
  // Clip, ghost and rage meter inputs for the current run (reset by load)
  const recorder = new InputRecorder();
  let run = 0;
  let presses = 0;
  let lastMask = 0;
  /**
   * Keys still held from before the last death. They are ignored until released, so holding
   * Right through an instant respawn doesn't run the player straight back into the same trap.
   */
  let stale = 0;
  /** The player has jumped and moved 200px this session: the controls hint can go. */
  let taught = false;
  let jumpedOnce = false;
  let spawnX = 0;
  /** Levels whose start pan has played this session: it shows once, not on every restart. */
  const introduced = new Set<string>();
  let deathEnd = 0;
  let clearEnd = 0;
  let shown = ''; // last emitted countdown + bindings, so the HUD updates only on change
  // "Watch how": inputs come from the recorded run, and nothing the demo does counts.
  let demo: InputReplayer | null = null;
  let demoKeys = 0;
  let demoOutro: ReturnType<typeof setTimeout> | undefined;
  /** The attempt the player was on when they asked to watch: the level resumes there. */
  let resumeAttempt = 1;
  /**
   * The recording for the level as it is on `attempt` (traps can appear after a death), and
   * the attempt it was recorded on. Each distinct layout has its own run.
   */
  const runFor = (l: GameLevel, attempt: number) => {
    if (day) return undefined;
    const layout = attemptLayout(l.sim, attempt);
    const recordedOn = distinctAttempts(l.sim).find((a) => attemptLayout(l.sim, a) === layout);
    if (recordedOn === undefined) return undefined;
    const run = RUNS[recordedOn === 1 ? l.file.id : `${l.file.id}@${recordedOn}`];
    return run ? { run, attempt: recordedOn } : undefined;
  };

  const timer = () => {
    const t = timeLeft(state, level.sim);
    return t === null ? null : Math.max(0, Math.ceil(t / 6) / 10);
  };
  const keys = (): HudState['bindings'] => {
    const [l, r, j] = bindings(state, level.sim);
    if (l === Input.Left && r === Input.Right && j === Input.Jump) return null;
    return [ACTION[l]!, ACTION[r]!, ACTION[j]!];
  };
  const hud = (): HudState => ({
    run,
    levelIndex: index,
    levelCount: pool.length,
    levelName: level.file.name,
    chapter: level.file.chapter,
    attempt: state.attempt,
    // A finished demo is not a clear: it stays "playing" until the level restarts for real.
    status: state.cleared && !demo ? 'cleared' : paused ? 'paused' : 'playing',
    taunt,
    deathId,
    // The fake level-complete slip shows real-looking numbers (DESIGNING.md §3.7).
    clearMs: state.cleared
      ? Math.round(state.clearFrame * STEP_MS)
      : fake === 'complete'
        ? Math.round(state.frame * STEP_MS)
        : null,
    totalDeaths: progress.deaths[level.file.id] ?? 0,
    muted: sfx.muted,
    fake,
    timer: timer(),
    bindings: keys(),
    rage: state.cleared
      ? rageScore(presses, state.clearFrame)
      : fake === 'complete'
        ? rageScore(presses, state.frame)
        : null,
    daily: day ? { day, ...progress.daily } : null,
    hints: day ? [] : (level.file.hints ?? []),
    canWatch: runFor(level, demo ? resumeAttempt : state.attempt) !== undefined,
    demo: demo ? { keys: demoKeys } : null,
    taught,
  });
  const emit = () => {
    shown = `${timer()}|${keys()?.join()}|${demoKeys}`;
    options.onHud(hud());
  };

  /** Levels 8 and 24 fake a screen at the start of attempts 1–2, where SECURITY.md §9 allows. */
  const armMetaTrap = () => {
    const m = level.file.metaTrap;
    fake =
      !demo && metaTrapsOk && m && state.attempt <= 2
        ? m.kind === 'fakeError'
          ? 'error'
          : 'loading'
        : null;
  };

  function tick(): void {
    const held = demo ? 0 : input.read() | nudge;
    stale &= held; // a released key is live again on its next press
    const mask = demo ? demo.maskAt(state.frame) : held & ~stale;
    nudge = 0;
    if (demo) demoKeys = mask;
    if (
      (fake === 'loading' || fake === 'error') &&
      (mask !== 0 || state.attemptFrame >= (level.file.metaTrap?.frames ?? 0))
    ) {
      fake = null; // any input — or the time limit — ends the lie
      emit();
    }
    if (!state.cleared && !demo) {
      recorder.record(state.frame, mask);
      presses += bits(mask & ~lastMask);
    }
    lastMask = mask;
    prevX = state.player.x;
    prevY = state.player.y;
    const events = step(state, mask, level.sim);

    if (events & SimEvent.Jumped) {
      sfx.jump();
      view.jumped();
      if (!demo) jumpedOnce = true;
    }
    if (!taught && jumpedOnce && !demo && Math.abs(toPx(state.player.x - spawnX)) >= 200) {
      taught = true;
      emit();
    }
    if (events & SimEvent.Landed) view.landed();
    if (events & SimEvent.TrapFired) sfx.trap();
    // Level 15: the real level-complete slip, over a level that is not complete.
    if (events & SimEvent.MetaTrap && metaTrapsOk && !demo) {
      fake = 'complete';
      emit();
    } else if (fake === 'complete' && state.freeze === 0) {
      fake = null;
      emit();
    }

    if (events & SimEvent.Died) {
      // Respawn is a hard cut (DESIGNING.md §2.3): never interpolate from the pit to spawn.
      prevX = state.player.x;
      prevY = state.player.y;
      sfx.death();
      view.died(state);
      if (!demo) {
        stale = held;
        deathEnd = state.frame;
        if (level.sim.view?.ghosts) {
          view.setGhosts(attemptTracks(level.sim, seedOf(level), recorder.log, state.frame));
        }
        progress.deaths[level.file.id] = (progress.deaths[level.file.id] ?? 0) + 1;
        save();
        const goal = goalRect(state, level.sim);
        const distance = goal
          ? Math.abs(toPx(goal.x + goal.w / 2 - (state.lastDeath.x + PLAYER_W / 2)))
          : Infinity;
        taunt = pickTaunt(
          { deaths: state.deaths, cause: state.lastDeath.cause, distanceToGoalPx: distance },
          taunt,
          level.file.taunts?.overrides,
        );
        deathId++;
        armMetaTrap();
        ctx.emit('level_death', {
          level: level.file.id,
          attempt: state.attempt - 1,
          cause: state.lastDeath.cause,
        });
      }
      emit();
    }

    if (events & SimEvent.Cleared && demo) {
      // The demo reached the door: a beat to see it, then the level is the player's again.
      sfx.clear();
      demoKeys = 0;
      emit();
      demoOutro = setTimeout(() => load(index, false, resumeAttempt), DEMO_OUTRO_MS);
    } else if (events & SimEvent.Cleared) {
      sfx.clear();
      clearEnd = state.frame;
      // Wallet: a first clear pays, the Daily Trap pays once a day, a replay gives a little XP.
      // (A first clear too long to store as a best run pays again next time; bounded, rare.)
      if (day && progress.daily.last !== day) ctx.wallet.earn(5, 5, 'daily_clear');
      else if (!day && !progress.best[level.file.id]) ctx.wallet.earn(10, 10, 'first_clear');
      else ctx.wallet.earn(0, 2, 'clear');
      if (day) {
        progress.daily = recordDailyClear(progress.daily, day);
      } else if (index <= progress.unlocked) {
        // Clearing a challenge level that is still locked here doesn't skip the ones before it.
        progress.unlocked = Math.max(progress.unlocked, clampIndex(index + 1));
      }
      const best = progress.best[level.file.id];
      const log = recorder.log;
      if (
        (!best || state.clearFrame < best.frames) &&
        state.clearFrame <= MAX_BEST_FRAMES &&
        log.length <= MAX_BEST_ENTRIES
      ) {
        progress.best[level.file.id] = {
          frames: state.clearFrame,
          deaths: state.deaths,
          log: log.slice(),
        };
      }
      save();
      ctx.emit('level_clear', {
        level: level.file.id,
        attempts: state.attempt,
        frames: state.clearFrame,
      });
      emit();
    }

    if (`${timer()}|${keys()?.join()}|${demoKeys}` !== shown) emit();
  }

  const driver = new FixedStepDriver(tick);

  /**
   * `watch`: play the recorded run for the current attempt's layout instead of reading the
   * player's keys. `attempt`: start on this attempt (used to hand the level back after a demo
   * without quietly resetting a level that changes between attempts).
   */
  function load(i: number, watch = false, attempt = 1): void {
    clearTimeout(demoOutro);
    if (watch) resumeAttempt = state.attempt;
    index = allowed(i);
    level = pool[index]!;
    const recorded = watch ? runFor(level, resumeAttempt) : undefined;
    demo = recorded ? new InputReplayer(recorded.run.inputLog) : null;
    demoKeys = 0;
    state = recorded
      ? createSimState(level.sim, RECORDED_SEED, recorded.attempt)
      : createSimState(level.sim, seedOf(level), attempt);
    prevX = state.player.x;
    prevY = state.player.y;
    spawnX = state.player.x;
    recorder.reset();
    run++;
    presses = lastMask = deathEnd = clearEnd = stale = 0;
    paused = false;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    taunt = null;
    armMetaTrap();
    driver.reset();
    const intro = !demo && attempt === 1 && !introduced.has(level.file.id);
    introduced.add(level.file.id);
    view.setLevel(level.sim, intro);
    if (demo) ctx.emit('level_watch', { level: level.file.id });
    else ctx.emit('level_start', { level: level.file.id });
    emit();
  }

  function setPaused(value: boolean): void {
    if (state.cleared || paused === value) return;
    paused = value;
    if (!value && document.activeElement instanceof HTMLElement) document.activeElement.blur();
    driver.reset();
    emit();
  }

  let raf = 0;
  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(now - last, 250);
    last = now;
    const alpha = paused || state.cleared ? 1 : driver.advance(dt).alpha;
    const px = toPx(prevX + (state.player.x - prevX) * alpha);
    const py = toPx(prevY + (state.player.y - prevY) * alpha);
    view.render(state, px, py, dt / 1000);
    raf = requestAnimationFrame(frame);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.repeat) return;
    // A focused menu button owns Enter/Space; do not also skip to the next level.
    if (e.code === 'Enter' && e.target instanceof Element && e.target.closest('button, a')) return;
    // During a demo the keys belong to the recording; Escape hands the level back off-portal.
    if (demo) {
      if (!options.portal && e.code === 'Escape') load(index, false, resumeAttempt);
      return;
    }
    if ((e.code === 'Escape' && !options.portal) || e.code === 'KeyP') setPaused(!paused);
    else if (e.code === 'KeyR' && !paused) load(index);
    else if (e.code === 'Enter' && state.cleared) load(index + 1 < pool.length ? index + 1 : 0);
  };
  const onVisibility = () => {
    if (document.hidden) setPaused(true);
  };
  const onBlur = () => setPaused(true);
  window.addEventListener('keydown', onKey);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisibility);

  load(index);
  raf = requestAnimationFrame(frame);

  return {
    pause: () => setPaused(true),
    resume: () => setPaused(false),
    restart: () => load(index),
    goToLevel: (i) => load(i),
    watchHow: () => load(index, true),
    stopWatching: () => load(index, false, resumeAttempt),
    nudge() {
      nudge = Input.Down; // one frame of real input: dismisses a fake screen like a key would
    },
    clip(url) {
      // The last death sells better than the clear (PRD.md §3: people share failure).
      const endFrame = deathEnd || clearEnd;
      if (!endFrame) return Promise.resolve(null);
      return makeClip({
        level: level.sim,
        log: recorder.log.slice(),
        endFrame,
        card: {
          level: day ? `Daily Trap · ${day}` : `Level ${index + 1} · ${level.file.name}`,
          deaths: progress.deaths[level.file.id] ?? 0,
          url,
        },
      });
    },
    setMuted(muted) {
      sfx.muted = muted;
      progress.muted = muted;
      save();
      emit();
    },
    destroy() {
      clearTimeout(demoOutro);
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      input.destroy();
      view.dispose();
      sfx.dispose();
    },
  };
}
