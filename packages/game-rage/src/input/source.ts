import { keyCodeToInput } from './keyboard.ts';
import { touchBits, touchKindAt } from './touch.ts';
import type { TouchKind } from './touch.ts';

/**
 * Keyboard + touch → one input bitmask (TECH_STACK.md §8 Phase 0). The sim reads
 * `read()` once per fixed step; it never learns which device produced the bits.
 */
export interface InputSource {
  read(): number;
  destroy(): void;
}

export function createInputSource(surface: HTMLElement): InputSource {
  const heldKeys = new Set<string>();
  const touches = new Map<number, { kind: TouchKind; bits: number }>();

  const localX = (e: PointerEvent) => {
    const rect = surface.getBoundingClientRect();
    return { x: e.clientX - rect.left, width: rect.width };
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (keyCodeToInput(e.code) === 0) return;
    e.preventDefault(); // stop arrows/space scrolling the page
    heldKeys.add(e.code);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    heldKeys.delete(e.code);
  };
  const releaseAll = () => {
    heldKeys.clear();
    touches.clear();
  };
  const onVisibility = () => {
    if (document.hidden) releaseAll();
  };

  // Mouse is deliberately ignored: desktop is keyboard-only (PRD.md §4.3).
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    e.preventDefault();
    surface.setPointerCapture(e.pointerId);
    const { x, width } = localX(e);
    const kind = touchKindAt(x, width);
    touches.set(e.pointerId, { kind, bits: touchBits(kind, x, width) });
  };
  const onPointerMove = (e: PointerEvent) => {
    const touch = touches.get(e.pointerId);
    if (!touch) return;
    const { x, width } = localX(e);
    touch.bits = touchBits(touch.kind, x, width);
  };
  const onPointerEnd = (e: PointerEvent) => {
    touches.delete(e.pointerId);
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
    read() {
      let mask = 0;
      for (const code of heldKeys) mask |= keyCodeToInput(code);
      for (const touch of touches.values()) mask |= touch.bits;
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
