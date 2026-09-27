import { Input } from '@jom/engine';

/**
 * Desktop controls (PRD.md §4.3): arrow keys / WASD + Space. Nothing else. Ever.
 * Mapped by `KeyboardEvent.code` so the physical key works on any keyboard layout.
 */
const KEY_BITS: Readonly<Record<string, number>> = {
  ArrowLeft: Input.Left,
  KeyA: Input.Left,
  ArrowRight: Input.Right,
  KeyD: Input.Right,
  ArrowUp: Input.Jump,
  KeyW: Input.Jump,
  Space: Input.Jump,
  ArrowDown: Input.Down,
  KeyS: Input.Down,
};

export function keyCodeToInput(code: string): number {
  return KEY_BITS[code] ?? Input.None;
}
