import { Input } from '@jom/engine';

/**
 * Mobile controls (PRD.md §4.3): two thumb zones, no on-screen D-pad.
 * A touch that starts in the left half is a "move" touch; one that starts in the right
 * half is a "jump" touch. The kind is fixed at touch start, so a thumb sliding across
 * the midline never turns into a jump by accident.
 *
 * Within the move half, the outer quarter means left and the inner quarter means right.
 * This split is a Phase 0 default and needs to be validated in the Phase 1 playtest.
 */
export type TouchKind = 'move' | 'jump';

export function touchKindAt(x: number, width: number): TouchKind {
  return x < width / 2 ? 'move' : 'jump';
}

export function touchBits(kind: TouchKind, x: number, width: number): number {
  if (kind === 'jump') return Input.Jump;
  return x < width / 4 ? Input.Left : Input.Right;
}
