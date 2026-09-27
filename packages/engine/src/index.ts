export { overlaps } from './aabb.ts';
export type { Rect } from './aabb.ts';
export { FP, clamp, toFixed, toPx } from './fixed.ts';
export { INPUT_MASK_ALL, Input, InputRecorder, InputReplayer, validateInputLog } from './input.ts';
export type { InputLog, LogValidation } from './input.ts';
export {
  LEADER_GATE,
  LevelError,
  MAX_HINTS,
  MAX_HINT_LENGTH,
  SANDBOX_LEVEL,
  SANDBOX_LEVEL_FILE,
  LAYOUT_ATTEMPTS,
  SpikeMode,
  attemptLayout,
  compileLevel,
  distinctAttempts,
  hashLevel,
  inScope,
  parseLevel,
} from './level.ts';
export type {
  AttemptRange,
  DoorLook,
  GoalFile,
  LevelFile,
  MetaTrapKind,
  Scope,
  SimGoal,
  SimLevel,
  SimSolid,
  SimTrap,
  SimView,
  SpikeErupt,
  TrapFile,
  TrapGate,
  ViewFile,
} from './level.ts';
export { FixedStepDriver, MAX_STEPS_PER_FRAME, SIM_HZ, STEP_MS } from './loop.ts';
export type { AdvanceResult, FixedStepOptions } from './loop.ts';
export { createRng, deriveSeed, fnv1a, mulberry32 } from './prng.ts';
export {
  BIG_H,
  BIG_W,
  DeathCause,
  FAKE_CLEAR_FRAMES,
  HAZARD_INSET,
  PHYSICS,
  PLAYER_H,
  PLAYER_W,
  SimEvent,
  activeGoal,
  attemptTracks,
  bindings,
  createSimState,
  goalRect,
  hashPhysics,
  hashState,
  nextRandom,
  playerSize,
  replay,
  snapshot,
  spikeUp,
  step,
  timeLeft,
} from './sim.ts';
export type { CloneState, PlayerState, SimState, StateSnapshot, TrapRun } from './sim.ts';
export { verifyRun } from './verify.ts';
export type { RunClaim, Verdict, VerifyOptions } from './verify.ts';
