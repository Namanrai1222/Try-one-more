/**
 * Synthesised sound effects (DESIGNING.md §7): short and dry, no audio files, zero payload.
 * The AudioContext is created on first use, which is always after a key press or touch,
 * so browsers allow it without a permission prompt.
 */
export interface Sfx {
  muted: boolean;
  jump(): void;
  death(): void;
  trap(): void;
  clear(): void;
  dispose(): void;
}

export function createSfx(muted: boolean, hostMuted: () => boolean = () => false): Sfx {
  let ctx: AudioContext | null = null;
  const unlock = () => {
    if (!ctx || sfx.muted || hostMuted() || ctx.state === 'running' || ctx.state === 'closed')
      return;
    void ctx.resume().catch(() => {});
  };
  document.addEventListener('pointerup', unlock);
  document.addEventListener('keydown', unlock);

  const tone = (
    type: OscillatorType,
    from: number,
    to: number,
    dur: number,
    gain: number,
    delay = 0,
  ) => {
    if (sfx.muted || hostMuted() || document.hidden || !document.hasFocus()) return;
    try {
      ctx ??= new AudioContext();
    } catch {
      return; // no Web Audio: play silently
    }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur);
  };

  const sfx: Sfx = {
    muted,
    jump: () => tone('square', 420, 640, 0.07, 0.04),
    // abrupt and short, so the instant respawn never feels slow
    death: () => tone('sawtooth', 220, 55, 0.14, 0.1),
    // the only sound with drama
    trap: () => tone('triangle', 1200, 240, 0.18, 0.14),
    // two notes, deliberately underwhelming
    clear: () => {
      tone('sine', 523, 523, 0.12, 0.08);
      tone('sine', 659, 659, 0.16, 0.08, 0.12);
    },
    dispose() {
      document.removeEventListener('pointerup', unlock);
      document.removeEventListener('keydown', unlock);
      void ctx?.close().catch(() => {});
    },
  };
  return sfx;
}
