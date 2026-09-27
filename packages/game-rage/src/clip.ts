/**
 * Death clips (PRD.md §4.7 "Auto clip"). Nothing is buffered while playing: the game keeps the
 * run's input log, and a clip re-simulates it — deterministic, so the replay IS the run — and
 * re-renders the last 5 seconds into a 9:16 share card (DESIGNING.md §3.6). Branding and the
 * death count are burned into every frame.
 */
import { MAX_CLIP_BYTES, pickVideoType, recordCanvas } from '@jom/clip';
import { InputReplayer, SimEvent, createSimState, deriveSeed, step, toPx } from '@jom/engine';
import type { InputLog, SimLevel, SimState } from '@jom/engine';
import { colors, fontFamilies } from '@jom/ui';
import { createView } from './render.ts';
import type { View } from './render.ts';

const W = 720;
const H = 1280;
const TOP = 200;
const GAME_H = 840;
const FPS = 30;
const LEAD_FRAMES = 300; // 5 seconds of sim before the moment
const HOLD_FRAMES = 24; // video frames on the aftermath

export interface ClipRequest {
  level: SimLevel;
  log: InputLog;
  /** Sim frame count right after the death (or clear) step. */
  endFrame: number;
  card: { level: string; deaths: number; url: string };
}

export const headline = (deaths: number) =>
  deaths === 0
    ? 'Cleared it first try.'
    : `I died here ${deaths === 1 ? 'once' : `${deaths} times`}.`;

/** Replay `log` from the level start up to (not including) `frame`. */
function replayTo(level: SimLevel, log: InputLog, frame: number) {
  const state = createSimState(level, deriveSeed(level.id, 1));
  const input = new InputReplayer(log);
  while (state.frame < frame) step(state, input.maskAt(state.frame), level);
  return { state, input };
}

export async function makeClip(req: ClipRequest): Promise<File> {
  const { level, log, endFrame, card } = req;
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const g = out.getContext('2d')!;
  const view = createView(document.createElement('div'), { w: W, h: GAME_H });
  view.setLevel(level);
  await Promise.all([
    document.fonts.load(`700 72px ${fontFamilies.display}`),
    document.fonts.load(`500 150px ${fontFamilies.mono}`),
  ]).catch(() => {}); // fallback fonts still print a legible card

  const compose = () => {
    g.fillStyle = colors.paper;
    g.fillRect(0, 0, W, H);
    g.drawImage(view.canvas, 0, TOP);
    g.fillStyle = colors.ink;
    g.fillRect(0, TOP - 4, W, 4);
    g.fillRect(0, TOP + GAME_H, W, 4);
    g.font = `500 26px ${fontFamilies.mono}`;
    g.fillText(`Just One More · ${card.level}`, 40, 64, W - 80);
    g.fillStyle = colors['red-pen']; // large bold text only (4.27:1 on paper)
    g.font = `700 72px ${fontFamilies.display}`;
    g.fillText(headline(card.deaths), 40, 156, W - 80);
    g.fillStyle = colors.ink;
    const count = String(card.deaths);
    g.font = `500 150px ${fontFamilies.mono}`;
    const countW = Math.min(g.measureText(count).width, W - 200);
    g.fillText(count, 36, TOP + GAME_H + 150, W - 200);
    g.font = `700 44px ${fontFamilies.display}`;
    g.fillText(card.deaths === 1 ? 'death' : 'deaths', 36 + countW + 16, TOP + GAME_H + 150);
    g.font = `500 24px ${fontFamilies.mono}`;
    g.fillText(card.url, 40, H - 28, W - 80);
  };

  try {
    const type = (navigator.hardwareConcurrency || 4) <= 2 ? null : pickVideoType();
    if (type) {
      const blob = await recordCanvas(out, frames(level, log, endFrame, view, compose), {
        type,
        fps: FPS,
      });
      if (blob.size > 0 && blob.size <= MAX_CLIP_BYTES) {
        const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
        return new File([blob], `just-one-more.${ext}`, { type: blob.type });
      }
    }
    // Still card (weak device, no recorder, or an oversized clip): the moment before it went wrong.
    const { state } = replayTo(level, log, endFrame - 1);
    for (let i = 0; i < 2; i++) view.render(state, toPx(state.player.x), toPx(state.player.y), 1);
    compose();
    const png = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'));
    if (!png) throw new Error('Could not make the share card');
    return new File([png], 'just-one-more.png', { type: 'image/png' });
  } finally {
    view.dispose();
  }
}

/** Frame source for the recorder: 5s of replay at 30fps, then a short hold on the aftermath. */
function frames(level: SimLevel, log: InputLog, endFrame: number, view: View, compose: () => void) {
  const { state, input } = replayTo(level, log, Math.max(0, endFrame - LEAD_FRAMES));
  let final: { state: SimState; showPlayer: boolean } | null = null;
  let hold = 0;
  return (): boolean => {
    for (let i = 0; i < 60 / FPS && !final; i++) {
      const before = state.frame === endFrame - 1 ? structuredClone(state) : null;
      const events = step(state, input.maskAt(state.frame), level);
      if (events & SimEvent.Jumped) view.jumped();
      if (events & SimEvent.Landed) view.landed();
      if (!before) continue;
      if (events & SimEvent.Died) {
        view.died(state);
        final = { state: before, showPlayer: false }; // traps where they struck; debris flies
      } else {
        final = { state, showPlayer: true };
      }
    }
    const s = final?.state ?? state;
    view.render(s, toPx(s.player.x), toPx(s.player.y), 1 / FPS, final?.showPlayer ?? true);
    compose();
    return !final || hold++ < HOLD_FRAMES;
  };
}
