/**
 * Keyboard and touch → one Push Party input mask. Keys: arrows or WASD to move, Space (or
 * Shift, J) to shove. Touch: drag anywhere on the left half as a stick, tap the right half to
 * shove. The mouse is ignored, as in the platformer (desktop is keyboard-only).
 */
import { PushInput } from './sim.ts';

const KEYS: Record<string, number> = {
  ArrowLeft: PushInput.Left,
  KeyA: PushInput.Left,
  ArrowRight: PushInput.Right,
  KeyD: PushInput.Right,
  ArrowUp: PushInput.Up,
  KeyW: PushInput.Up,
  ArrowDown: PushInput.Down,
  KeyS: PushInput.Down,
  Space: PushInput.Shove,
  ShiftLeft: PushInput.Shove,
  ShiftRight: PushInput.Shove,
  KeyJ: PushInput.Shove,
};
/** A stick drag shorter than this (CSS px) is no direction. */
const DEAD_ZONE = 14;

/** Direction bits for a stick offset: 8-way, with a wide cone for each axis. */
export function stickBits(dx: number, dy: number): number {
  let bits = 0;
  if (Math.hypot(dx, dy) < DEAD_ZONE) return 0;
  if (Math.abs(dx) > Math.abs(dy) * 0.4) bits |= dx < 0 ? PushInput.Left : PushInput.Right;
  if (Math.abs(dy) > Math.abs(dx) * 0.4) bits |= dy < 0 ? PushInput.Up : PushInput.Down;
  return bits;
}

export function createPushInput(surface: HTMLElement) {
  const held = new Set<string>();
  const sticks = new Map<number, { x: number; y: number; bits: number }>();
  const shoves = new Set<number>();

  const onKeyDown = (e: KeyboardEvent) => {
    if (!(e.code in KEYS)) return;
    e.preventDefault(); // no page scrolling on arrows or space
    held.add(e.code);
  };
  const onKeyUp = (e: KeyboardEvent) => held.delete(e.code);
  const releaseAll = () => {
    held.clear();
    sticks.clear();
    shoves.clear();
  };
  const onVisibility = () => {
    if (document.hidden) releaseAll();
  };
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    e.preventDefault();
    surface.setPointerCapture(e.pointerId);
    const rect = surface.getBoundingClientRect();
    if (e.clientX - rect.left < rect.width / 2) {
      sticks.set(e.pointerId, { x: e.clientX, y: e.clientY, bits: 0 });
    } else {
      shoves.add(e.pointerId);
    }
  };
  const onPointerMove = (e: PointerEvent) => {
    const stick = sticks.get(e.pointerId);
    if (stick) stick.bits = stickBits(e.clientX - stick.x, e.clientY - stick.y);
  };
  const onPointerEnd = (e: PointerEvent) => {
    sticks.delete(e.pointerId);
    shoves.delete(e.pointerId);
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', onVisibility);
  surface.addEventListener('pointerdown', onPointerDown, { passive: false });
  surface.addEventListener('pointermove', onPointerMove);
  surface.addEventListener('pointerup', onPointerEnd);
  surface.addEventListener('pointercancel', onPointerEnd);

  return {
    read(): number {
      let mask = shoves.size > 0 ? PushInput.Shove : 0;
      for (const code of held) mask |= KEYS[code] ?? 0;
      for (const s of sticks.values()) mask |= s.bits;
      return mask;
    },
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', releaseAll);
      document.removeEventListener('visibilitychange', onVisibility);
      surface.removeEventListener('pointerdown', onPointerDown);
      surface.removeEventListener('pointermove', onPointerMove);
      surface.removeEventListener('pointerup', onPointerEnd);
      surface.removeEventListener('pointercancel', onPointerEnd);
      releaseAll();
    },
  };
}
