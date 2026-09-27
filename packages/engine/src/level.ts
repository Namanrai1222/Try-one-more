import type { Rect } from './aabb.ts';
import { toFixed } from './fixed.ts';
import { fnv1a } from './prng.ts';

/**
 * Level file format, schema 1 (TECH_STACK.md §4). Levels are data, never code: authored in
 * pixels (960×540 reference space per screen, y down), validated by `parseLevel`, then
 * compiled to integer sim units by `compileLevel`. The server can load the same files headless.
 */

/** Which attempts something exists in. Attempt 1 is the first try. All fields optional. */
export interface AttemptRange {
  from?: number;
  to?: number;
  /** Only odd or only even attempts — lets a trap flip on every retry. */
  parity?: 'odd' | 'even';
}

/** `jump`: pops up for `frames` after every jump. `time`: pops up at `frame` of the attempt. */
/**
 * `jump`: out for `frames` after every jump. `time`: out from attempt frame `frame` on.
 * `near`: pops out (and stays) once the player comes within `distance` px of it — hidden until
 * you are almost on it, the genre's signature ambush. Fair on the next attempt: you know.
 */
export type SpikeErupt =
  { on: 'jump'; frames: number } | { on: 'time'; frame: number } | { on: 'near'; distance: number };

export type DoorLook = 'primary' | 'alt';

/**
 * Multiplayer gates (Phase 5): a gated trap exists only while the server says so.
 * `'leader'` — only for whoever leads a race (PRD.md §4.8); a number 1–30 — a sabotage slot
 * that a saboteur arms. The sim reads them from `SimState.gates`; solo play never sets any.
 */
export type TrapGate = 'leader' | number;

/** Bit for `'leader'` in `SimState.gates`; slot `k` is `1 << k`. */
export const LEADER_GATE = 1;

export type TrapFile = { gate?: TrapGate } &
  /** A solid that drops `delayFrames` after the player first stands on it. */
  (
    | { type: 'collapse'; target: string; delayFrames?: number; when?: AttemptRange }
    /** Spikes: always out, or hidden until `erupt` says so. */
    | ({ type: 'spike'; erupt?: SpikeErupt; when?: AttemptRange } & Rect)
    /**
     * Falls from its rect toward `fallTo` (y) at `speed` px/frame once the player's centre
     * passes `triggerX`. A saw is hidden until it drops; a crusher (a descending ceiling) is
     * visible the whole time.
     */
    | ({
        type: 'saw' | 'crusher';
        triggerX: number;
        fallTo: number;
        speed: number;
        when?: AttemptRange;
      } & Rect)
    /** Greed: a glowing coin that kills whoever picks it up. */
    | ({ type: 'coin'; when?: AttemptRange } & Rect)
    /** A door that kills whoever walks in. */
    | ({ type: 'fakeGoal'; look?: DoorLook; when?: AttemptRange } & Rect)
    /** The real door jumps `dx` once the player gets within `triggerDistance` of it. */
    | { type: 'goalShift'; dx: number; triggerDistance: number; when?: AttemptRange }
    /** Gravity inverts for the rest of the attempt once the player's centre passes `triggerX`. */
    | { type: 'gravityFlip'; triggerX: number; when?: AttemptRange }
    /** Left and right swap for the rest of the attempt once the player passes `triggerX`. */
    | { type: 'invert'; triggerX: number; when?: AttemptRange }
    /** The player doubles in size (growing upward from the feet) once past `triggerX`. */
    | { type: 'grow'; triggerX: number; when?: AttemptRange }
    /** Launches whoever touches it at `power` px/frame. `hidden` = invisible until first used. */
    | ({ type: 'spring'; power: number; hidden?: boolean; when?: AttemptRange } & Rect)
    /** Countdown: the `targets` solids vanish at `frames` into the attempt (the HUD shows it). */
    | { type: 'timer'; frames: number; targets: string[]; when?: AttemptRange }
    /** Looks like a checkpoint; touching it sends the player back to the spawn point. */
    | ({ type: 'teleport'; when?: AttemptRange } & Rect)
    /** Left, right and jump swap roles every `every` frames (the first period is normal). */
    | { type: 'shuffle'; every: number; when?: AttemptRange }
    /** From the second attempt, a solid clone replays the previous attempt's inputs. */
    | { type: 'clone'; when?: AttemptRange }
    /**
     * A door that "clears" the level: the player freezes (the shell may show its real
     * level-complete slip — a meta-trap), then the `targets` drop on the next input, or after
     * 3 seconds at most (SECURITY.md §9).
     */
    | ({ type: 'fakeClear'; targets: string[]; when?: AttemptRange } & Rect)
  );

export type GoalFile = Rect & { look?: DoorLook; when?: AttemptRange };

export type MetaTrapKind = 'fakeLoading' | 'fakeError';

/** Presentation hints: the sim never reads these. */
export interface ViewFile {
  /** Darkness: only this many px around the player are lit. */
  dark?: number;
  /** The whole level slowly rotates, degrees per second. */
  spin?: number;
  /** Camera lie: frame the level as if it were only this many px wide until the player passes it. */
  frameW?: number;
  /** Replay every failed attempt of this run as a ghost. */
  ghosts?: boolean;
}

export interface LevelFile {
  schema: 1;
  id: string;
  chapter: number;
  index: number;
  name: string;
  bounds: { w: number; h: number };
  spawn: { x: number; y: number };
  /** One door, or `goals` for doors that exist only in some attempts. The first active one counts. */
  goal?: GoalFile;
  goals?: GoalFile[];
  /** `ice`: no grip, no braking. `text`: printed on the slab's face (the type is the platform). */
  solids: Array<Rect & { id?: string; ice?: boolean; text?: string }>;
  traps?: TrapFile[];
  /** Presentation-only lie shown at the start of an attempt (SECURITY.md §9). */
  metaTrap?: { kind: MetaTrapKind; frames: number };
  view?: ViewFile;
  taunts?: { overrides?: string[] };
  /** Up to 3 hints for a stuck player, vaguest first. Presentation only: never compiled. */
  hints?: string[];
  meta?: { targetDeaths?: number; targetClearMs?: number };
}

export const MAX_HINTS = 3;
export const MAX_HINT_LENGTH = 140;

const ANY_ATTEMPT = 1_000_000;

/** Compiled attempt range. parity: 0 any, 1 odd, 2 even. */
export interface Scope {
  from: number;
  to: number;
  parity: number;
}

export function inScope(s: Scope, attempt: number): boolean {
  if (attempt < s.from || attempt > s.to) return false;
  return s.parity === 0 || (s.parity === 1) === (attempt % 2 === 1);
}

export const SpikeMode = { Always: 0, Jump: 1, Time: 2, Near: 3 } as const;

/**
 * A level can change between attempts (traps and doors scoped with `when`). Every attempt up to
 * this one is checked for a distinct layout; ranges must end by attempt 7 (enforced by the level
 * tests), so from here on only parity can differ and attempts 7–8 stand for all later ones.
 */
export const LAYOUT_ATTEMPTS = 8;

/** Which traps and doors are live on `attempt`, as a key: equal keys mean the same level. */
export function attemptLayout(level: SimLevel, attempt: number): string {
  const bits = (xs: readonly Scope[]) => xs.map((x) => (inScope(x, attempt) ? 1 : 0)).join('');
  return `${bits(level.traps)}|${bits(level.goals)}`;
}

/** The first attempt of each distinct layout (always starts with 1). */
export function distinctAttempts(level: SimLevel): number[] {
  const seen = new Set<string>();
  const out: number[] = [];
  for (let a = 1; a <= LAYOUT_ATTEMPTS; a++) {
    const key = attemptLayout(level, a);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(a);
    }
  }
  return out;
}

/** `gate`: a `SimState.gates` bit mask, present only on gated traps (so older levels hash the same). */
export type SimTrap = Scope & { gate?: number } & (
    | { type: 'collapse'; target: number; delayFrames: number }
    | { type: 'spike'; rect: Rect; mode: number; value: number }
    | {
        type: 'faller';
        look: 'saw' | 'crusher';
        rect: Rect;
        triggerX: number;
        fallTo: number;
        speed: number;
      }
    | { type: 'coin'; rect: Rect }
    | { type: 'fakeGoal'; rect: Rect; look: DoorLook }
    | { type: 'goalShift'; dx: number; triggerDistance: number }
    | { type: 'gravityFlip' | 'invert' | 'grow'; triggerX: number }
    | { type: 'spring'; rect: Rect; power: number; hidden: boolean }
    | { type: 'timer'; frames: number; targets: number[] }
    | { type: 'teleport'; rect: Rect }
    | { type: 'shuffle'; every: number }
    | { type: 'clone' }
    | { type: 'fakeClear'; rect: Rect; targets: number[] }
  );

export type SimGoal = Scope & { rect: Rect; look: DoorLook };

/** A compiled solid. `ice` is present only when true, so older levels hash the same. */
export type SimSolid = Rect & { ice?: true };

/** Render hints (px / degrees, not sim units). Present only for chapter 2+ or hinted levels. */
export interface SimView {
  chapter: number;
  dark?: number;
  spin?: number;
  frameW?: number;
  ghosts?: boolean;
  /** Per solid: printed text, or null. */
  texts?: ReadonlyArray<string | null>;
}

/** Compiled level, integer sim units. The only form the sim ever reads. */
export interface SimLevel {
  readonly id: string;
  readonly bounds: { readonly w: number; readonly h: number };
  readonly spawn: { readonly x: number; readonly y: number };
  readonly goals: ReadonlyArray<Readonly<SimGoal>>;
  readonly solids: ReadonlyArray<Readonly<SimSolid>>;
  readonly traps: ReadonlyArray<Readonly<SimTrap>>;
  readonly view?: Readonly<SimView>;
}

export class LevelError extends Error {
  override name = 'LevelError';
}

// ---------------------------------------------------------------- validation

type Obj = Record<string, unknown>;

function fail(path: string, message: string): never {
  throw new LevelError(`${path}: ${message}`);
}

function obj(v: unknown, path: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(path, 'expected an object');
  return v as Obj;
}

function num(v: unknown, path: string, min = -Infinity): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, 'expected a number');
  if (v < min) fail(path, `must be ≥ ${min}`);
  return v;
}

function int(v: unknown, path: string, min = -Infinity): number {
  const n = num(v, path, min);
  if (!Number.isInteger(n)) fail(path, 'expected an integer');
  return n;
}

function str(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.length === 0) fail(path, 'expected a non-empty string');
  return v;
}

function oneOf<const T extends string>(v: unknown, path: string, options: readonly T[]): T {
  if (!options.includes(v as T)) fail(path, `expected one of ${options.join(', ')}`);
  return v as T;
}

function rect(v: unknown, path: string): Rect {
  const o = obj(v, path);
  return {
    x: num(o.x, `${path}.x`),
    y: num(o.y, `${path}.y`),
    w: num(o.w, `${path}.w`, 1),
    h: num(o.h, `${path}.h`, 1),
  };
}

function range(v: unknown, path: string): { when?: AttemptRange } {
  if (v === undefined) return {};
  const o = obj(v, path);
  const r: AttemptRange = {};
  if (o.from !== undefined) r.from = int(o.from, `${path}.from`, 1);
  if (o.to !== undefined) r.to = int(o.to, `${path}.to`, 1);
  if (o.parity !== undefined) r.parity = oneOf(o.parity, `${path}.parity`, ['odd', 'even']);
  if (r.from !== undefined && r.to !== undefined && r.to < r.from) fail(path, 'to < from');
  return { when: r };
}

function bool(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') fail(path, 'expected true or false');
  return v;
}

function targets(v: unknown, path: string, solidIds: Set<string>): string[] {
  if (!Array.isArray(v) || v.length === 0) fail(path, 'expected a non-empty array of solid ids');
  return v.map((id, i) => {
    const s = str(id, `${path}[${i}]`);
    if (!solidIds.has(s)) fail(`${path}[${i}]`, `no solid with id "${s}"`);
    return s;
  });
}

function look(v: unknown, path: string): { look?: DoorLook } {
  return v === undefined ? {} : { look: oneOf(v, path, ['primary', 'alt']) };
}

function trap(v: unknown, path: string, solidIds: Set<string>): TrapFile {
  const t = trapKind(v, path, solidIds);
  const g = obj(v, path).gate;
  if (g === undefined) return t;
  if (g === 'leader') return { ...t, gate: g };
  const slot = int(g, `${path}.gate`, 1);
  if (slot > 30) fail(`${path}.gate`, "must be 'leader' or a slot from 1 to 30");
  return { ...t, gate: slot };
}

function trapKind(v: unknown, path: string, solidIds: Set<string>): TrapFile {
  const o = obj(v, path);
  const when = range(o.when, `${path}.when`);
  switch (o.type) {
    case 'collapse': {
      const target = str(o.target, `${path}.target`);
      if (!solidIds.has(target)) fail(`${path}.target`, `no solid with id "${target}"`);
      const t: TrapFile = { type: 'collapse', target, ...when };
      if (o.delayFrames !== undefined) t.delayFrames = int(o.delayFrames, `${path}.delayFrames`, 0);
      return t;
    }
    case 'spike': {
      const t: TrapFile = { type: 'spike', ...rect(o, path), ...when };
      if (o.erupt !== undefined) {
        const e = obj(o.erupt, `${path}.erupt`);
        const on = oneOf(e.on, `${path}.erupt.on`, ['jump', 'time', 'near']);
        t.erupt =
          on === 'jump'
            ? { on, frames: int(e.frames, `${path}.erupt.frames`, 1) }
            : on === 'time'
              ? { on, frame: int(e.frame, `${path}.erupt.frame`, 0) }
              : { on, distance: int(e.distance, `${path}.erupt.distance`, 1) };
      }
      return t;
    }
    case 'saw':
    case 'crusher':
      return {
        type: o.type,
        ...rect(o, path),
        triggerX: num(o.triggerX, `${path}.triggerX`),
        fallTo: num(o.fallTo, `${path}.fallTo`),
        speed: num(o.speed, `${path}.speed`, 0.1),
        ...when,
      };
    case 'coin':
      return { type: 'coin', ...rect(o, path), ...when };
    case 'fakeGoal':
      return { type: 'fakeGoal', ...rect(o, path), ...look(o.look, `${path}.look`), ...when };
    case 'goalShift':
      return {
        type: 'goalShift',
        dx: num(o.dx, `${path}.dx`),
        triggerDistance: num(o.triggerDistance, `${path}.triggerDistance`, 1),
        ...when,
      };
    case 'gravityFlip':
    case 'invert':
    case 'grow':
      return { type: o.type, triggerX: num(o.triggerX, `${path}.triggerX`), ...when };
    case 'spring': {
      const t: TrapFile = {
        type: 'spring',
        ...rect(o, path),
        power: num(o.power, `${path}.power`, 1),
        ...when,
      };
      if (t.power > 30) fail(`${path}.power`, 'must be ≤ 30');
      if (o.hidden !== undefined) t.hidden = bool(o.hidden, `${path}.hidden`);
      return t;
    }
    case 'timer':
      return {
        type: 'timer',
        frames: int(o.frames, `${path}.frames`, 1),
        targets: targets(o.targets, `${path}.targets`, solidIds),
        ...when,
      };
    case 'teleport':
      return { type: 'teleport', ...rect(o, path), ...when };
    case 'shuffle':
      return { type: 'shuffle', every: int(o.every, `${path}.every`, 30), ...when };
    case 'clone':
      return { type: 'clone', ...when };
    case 'fakeClear':
      return {
        type: 'fakeClear',
        ...rect(o, path),
        targets: targets(o.targets, `${path}.targets`, solidIds),
        ...when,
      };
    default:
      return fail(`${path}.type`, `unknown trap type ${JSON.stringify(o.type)}`);
  }
}

function goal(v: unknown, path: string): GoalFile {
  const o = obj(v, path);
  return { ...rect(o, path), ...look(o.look, `${path}.look`), ...range(o.when, `${path}.when`) };
}

/** Validate untrusted JSON (a level file, a CDN response) into a typed LevelFile. Throws LevelError. */
export function parseLevel(json: unknown): LevelFile {
  const o = obj(json, 'level');
  if (o.schema !== 1) fail('level.schema', 'unsupported schema version (expected 1)');
  const boundsObj = obj(o.bounds, 'level.bounds');
  const bounds = {
    w: num(boundsObj.w, 'level.bounds.w', 1),
    h: num(boundsObj.h, 'level.bounds.h', 1),
  };
  const spawnObj = obj(o.spawn, 'level.spawn');
  const spawn = { x: num(spawnObj.x, 'level.spawn.x', 0), y: num(spawnObj.y, 'level.spawn.y', 0) };
  if (spawn.x >= bounds.w || spawn.y >= bounds.h) fail('level.spawn', 'outside the level bounds');

  if (!Array.isArray(o.solids)) fail('level.solids', 'expected an array');
  const solidIds = new Set<string>();
  const solids = o.solids.map((s, i) => {
    const path = `level.solids[${i}]`;
    const r: Rect & { id?: string; ice?: boolean; text?: string } = rect(s, path);
    const so = obj(s, path);
    if (so.id !== undefined) {
      r.id = str(so.id, `${path}.id`);
      if (solidIds.has(r.id)) fail(`${path}.id`, `duplicate id "${r.id}"`);
      solidIds.add(r.id);
    }
    if (so.ice !== undefined) r.ice = bool(so.ice, `${path}.ice`);
    if (so.text !== undefined) r.text = str(so.text, `${path}.text`);
    return r;
  });

  const file: LevelFile = {
    schema: 1,
    id: str(o.id, 'level.id'),
    chapter: int(o.chapter, 'level.chapter', 0),
    index: int(o.index, 'level.index', 0),
    name: str(o.name, 'level.name'),
    bounds,
    spawn,
    solids,
  };
  if (o.goal !== undefined && o.goals !== undefined) fail('level', 'use goal or goals, not both');
  if (o.goal !== undefined) file.goal = goal(o.goal, 'level.goal');
  if (o.goals !== undefined) {
    if (!Array.isArray(o.goals)) fail('level.goals', 'expected an array');
    file.goals = o.goals.map((g, i) => goal(g, `level.goals[${i}]`));
  }
  if (o.traps !== undefined) {
    if (!Array.isArray(o.traps)) fail('level.traps', 'expected an array');
    file.traps = o.traps.map((t, i) => trap(t, `level.traps[${i}]`, solidIds));
  }
  if (o.metaTrap !== undefined) {
    const m = obj(o.metaTrap, 'level.metaTrap');
    file.metaTrap = {
      // Only the game's own screens. Never login, permission, payment, browser or OS UI.
      kind: oneOf(m.kind, 'level.metaTrap.kind', ['fakeLoading', 'fakeError']),
      frames: int(m.frames, 'level.metaTrap.frames', 1),
    };
    // SECURITY.md §9: a fake state never lasts longer than 3 seconds.
    if (file.metaTrap.frames > 180) fail('level.metaTrap.frames', 'must be ≤ 180 (3 seconds)');
  }
  if (o.view !== undefined) {
    const v = obj(o.view, 'level.view');
    const view: ViewFile = {};
    if (v.dark !== undefined) view.dark = num(v.dark, 'level.view.dark', 16);
    if (v.spin !== undefined) view.spin = num(v.spin, 'level.view.spin');
    if (v.frameW !== undefined) view.frameW = num(v.frameW, 'level.view.frameW', 1);
    if (v.ghosts !== undefined) view.ghosts = bool(v.ghosts, 'level.view.ghosts');
    file.view = view;
  }
  if (o.taunts !== undefined) {
    const t = obj(o.taunts, 'level.taunts');
    if (t.overrides !== undefined) {
      if (!Array.isArray(t.overrides)) fail('level.taunts.overrides', 'expected an array');
      file.taunts = {
        overrides: t.overrides.map((s, i) => str(s, `level.taunts.overrides[${i}]`)),
      };
    }
  }
  if (o.hints !== undefined) {
    if (!Array.isArray(o.hints) || o.hints.length > MAX_HINTS) {
      fail('level.hints', `expected an array of at most ${MAX_HINTS}`);
    }
    file.hints = o.hints.map((s, i) => {
      const hint = str(s, `level.hints[${i}]`);
      if (hint.length === 0 || hint.length > MAX_HINT_LENGTH) {
        fail(`level.hints[${i}]`, `expected 1–${MAX_HINT_LENGTH} characters`);
      }
      return hint;
    });
  }
  if (o.meta !== undefined) {
    const m = obj(o.meta, 'level.meta');
    file.meta = {};
    if (m.targetDeaths !== undefined)
      file.meta.targetDeaths = int(m.targetDeaths, 'level.meta.targetDeaths', 0);
    if (m.targetClearMs !== undefined)
      file.meta.targetClearMs = int(m.targetClearMs, 'level.meta.targetClearMs', 0);
  }
  return file;
}

// ---------------------------------------------------------------- compilation

const fixRect = (r: Rect): Rect => ({
  x: toFixed(r.x),
  y: toFixed(r.y),
  w: toFixed(r.w),
  h: toFixed(r.h),
});

const scope = (when?: AttemptRange): Scope => ({
  from: when?.from ?? 1,
  to: when?.to ?? ANY_ATTEMPT,
  parity: when?.parity === 'odd' ? 1 : when?.parity === 'even' ? 2 : 0,
});

export function compileLevel(file: LevelFile): SimLevel {
  const ids = file.solids.map((s) => s.id);
  const traps = (file.traps ?? [])
    .map((t): SimTrap => {
      const s = scope(t.when);
      switch (t.type) {
        case 'collapse':
          return {
            ...s,
            type: 'collapse',
            target: ids.indexOf(t.target),
            delayFrames: t.delayFrames ?? 6,
          };
        case 'spike':
          return {
            ...s,
            type: 'spike',
            rect: fixRect(t),
            mode: !t.erupt
              ? SpikeMode.Always
              : t.erupt.on === 'jump'
                ? SpikeMode.Jump
                : t.erupt.on === 'time'
                  ? SpikeMode.Time
                  : SpikeMode.Near,
            // jump: frames out; time: attempt frame; near: trigger distance in sim units.
            value: !t.erupt
              ? 0
              : t.erupt.on === 'jump'
                ? t.erupt.frames
                : t.erupt.on === 'time'
                  ? t.erupt.frame
                  : toFixed(t.erupt.distance),
          };
        case 'saw':
        case 'crusher':
          return {
            ...s,
            type: 'faller',
            look: t.type,
            rect: fixRect(t),
            triggerX: toFixed(t.triggerX),
            fallTo: toFixed(t.fallTo),
            speed: toFixed(t.speed),
          };
        case 'coin':
          return { ...s, type: 'coin', rect: fixRect(t) };
        case 'fakeGoal':
          return { ...s, type: 'fakeGoal', rect: fixRect(t), look: t.look ?? 'primary' };
        case 'goalShift':
          return {
            ...s,
            type: 'goalShift',
            dx: toFixed(t.dx),
            triggerDistance: toFixed(t.triggerDistance),
          };
        case 'gravityFlip':
        case 'invert':
        case 'grow':
          return { ...s, type: t.type, triggerX: toFixed(t.triggerX) };
        case 'spring':
          return {
            ...s,
            type: 'spring',
            rect: fixRect(t),
            power: toFixed(t.power),
            hidden: t.hidden ?? false,
          };
        case 'timer':
          return { ...s, type: 'timer', frames: t.frames, targets: t.targets.map(index) };
        case 'teleport':
          return { ...s, type: 'teleport', rect: fixRect(t) };
        case 'shuffle':
          return { ...s, type: 'shuffle', every: t.every };
        case 'clone':
          return { ...s, type: 'clone' };
        case 'fakeClear':
          return { ...s, type: 'fakeClear', rect: fixRect(t), targets: t.targets.map(index) };
      }
    })
    .map((c, i): SimTrap => {
      const g = file.traps![i]!.gate;
      return g === undefined ? c : { ...c, gate: g === 'leader' ? LEADER_GATE : 1 << g };
    });
  const goals = (file.goals ?? (file.goal ? [file.goal] : [])).map((g): SimGoal => ({
    ...scope(g.when),
    rect: fixRect(g),
    look: g.look ?? 'primary',
  }));
  const level: SimLevel = {
    id: file.id,
    bounds: { w: toFixed(file.bounds.w), h: toFixed(file.bounds.h) },
    spawn: { x: toFixed(file.spawn.x), y: toFixed(file.spawn.y) },
    goals,
    solids: file.solids.map((s): SimSolid => (s.ice ? { ...fixRect(s), ice: true } : fixRect(s))),
    traps,
  };
  const texts = file.solids.some((s) => s.text) ? file.solids.map((s) => s.text ?? null) : null;
  if (file.chapter > 1 || file.view || texts) {
    return { ...level, view: { chapter: file.chapter, ...file.view, ...(texts && { texts }) } };
  }
  return level;

  function index(id: string): number {
    return ids.indexOf(id);
  }
}

/** Content hash of a compiled level — lets replays detect that the level changed under them. */
export function hashLevel(level: SimLevel): string {
  return fnv1a(JSON.stringify(level)).toString(16).padStart(8, '0');
}

/** Phase 0 physics sandbox: floor with a pit, three stepped platforms, one wall. No goal. */
export const SANDBOX_LEVEL_FILE: LevelFile = {
  schema: 1,
  id: 'sandbox-00',
  chapter: 0,
  index: 0,
  name: 'Sandbox',
  bounds: { w: 960, h: 540 },
  spawn: { x: 64, y: 400 },
  solids: [
    { x: 0, y: 480, w: 384, h: 60 },
    { x: 480, y: 480, w: 480, h: 60 },
    { x: 224, y: 384, w: 128, h: 16 },
    { x: 416, y: 304, w: 128, h: 16 },
    { x: 608, y: 224, w: 128, h: 16 },
    { x: 800, y: 352, w: 32, h: 128 },
  ],
};

export const SANDBOX_LEVEL: SimLevel = compileLevel(SANDBOX_LEVEL_FILE);
