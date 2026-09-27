/**
 * Push Party on the client: prediction plus presentation. The server owns the arena; 20 times
 * a second it sends the whole state (a few hundred bytes), everyone's current inputs, and how
 * late each player's inputs are arriving. We re-simulate from that state to our own frame with
 * our logged inputs (and everyone else's last known ones), so our own body answers the keys at
 * once and everyone else is where the server last saw them heading.
 *
 * Clock: we stamp inputs with our frame. If the server says they land late, we run a frame
 * further ahead; far too early, we hold a frame. Never more than 10 frames past the last
 * snapshot, so we stay inside the server's slack for future stamps (12).
 */
import { FixedStepDriver, InputRecorder, InputReplayer, toPx } from '@jom/engine';
import type { PushController, PushHud, PushOptions } from './index.ts';
import { createPushInput } from './input.ts';
import { createPushView } from './render.ts';
import { ROUND_FRAMES, stepPush } from './sim.ts';
import type { PushState } from './sim.ts';

interface Snap {
  state: PushState | null;
  masks: number[];
  late: number[];
}
interface Standing {
  seat: number;
  place: number;
}

const HEARTBEAT_FRAMES = 6;
const MAX_LEAD = 10;
/** Our inputs should land about this many frames before the server needs them. */
const EARLY_ENOUGH = -6;

export function createPush(container: HTMLElement, o: PushOptions): PushController {
  const view = createPushView(container);
  const input = createPushInput(view.canvas);
  const recorder = new InputRecorder();
  const offs: Array<() => void> = [];
  let base: Snap | null = null;
  let predicted: PushState | null = null;
  let frame = 0; // our (predicted) frame
  let hold = 0;
  let lastSent = -1;
  let lastSentFrame = -HEARTBEAT_FRAMES;
  let over = false;
  let earned: PushHud['earned'] = null;

  const mine = () => predicted?.pushers.findIndex((p) => p.seat === o.seat) ?? -1;
  const masksWith = (own: number) => {
    const masks = [...(base?.masks ?? [])];
    const i = mine();
    if (i >= 0) masks[i] = own;
    return masks;
  };

  const repredict = () => {
    if (!base?.state) return;
    const s = structuredClone(base.state);
    const replayer = new InputReplayer(recorder.log);
    const i = s.pushers.findIndex((p) => p.seat === o.seat);
    while (s.frame < frame) {
      const masks = [...base.masks];
      if (i >= 0) masks[i] = replayer.maskAt(s.frame);
      stepPush(s, masks);
    }
    predicted = s;
  };

  const send = (mask: number) => {
    o.link.send('input', { f: frame, m: mask });
    lastSent = mask;
    lastSentFrame = frame;
  };

  offs.push(
    o.link.on('snap', (s: Snap) => {
      if (!s.state) return;
      base = s;
      const at = s.state.frame;
      const i = s.state.pushers.findIndex((p) => p.seat === o.seat);
      const late = i >= 0 ? (s.late[i] ?? 0) : 0;
      if (frame < at)
        frame = at + 2; // first snapshot, or we stalled (hidden tab)
      else if (late > 0)
        frame += 1; // our inputs land late: run a little further ahead
      else if (late < EARLY_ENOUGH) hold = 1; // far too early: wait a frame
      frame = Math.min(frame, at + MAX_LEAD);
      repredict();
    }),
    o.link.on('results', (r: { standings: Standing[] }) => {
      over = true;
      const me = r.standings.find((s) => s.seat === o.seat);
      if (!me) return;
      // Wallet (earn only): playing a round gives XP; lasting longest pays coins too.
      earned =
        me.place === 1 && r.standings.length > 1 ? { coins: 10, xp: 15 } : { coins: 0, xp: 5 };
      o.ctx.wallet.earn(earned.coins, earned.xp, earned.coins ? 'push_win' : 'push_round');
      if (predicted) o.onHud(hud(predicted));
    }),
  );

  const driver = new FixedStepDriver(() => {
    if (!predicted || over) return;
    if (hold > 0) {
      hold--;
      return;
    }
    const mask = input.read();
    recorder.record(frame, mask);
    if (mask !== lastSent || frame - lastSentFrame >= HEARTBEAT_FRAMES) send(mask);
    stepPush(predicted, masksWith(mask));
    frame++;
  });
  // A hidden tab stops the loop: let go of the keys on the server straight away.
  const onVisibility = () => {
    if (document.hidden && predicted && !over) send(0);
  };
  document.addEventListener('visibilitychange', onVisibility);

  // Corrections are eased so a re-prediction never teleports a body (a big one still snaps).
  const shown = new Map<number, { x: number; y: number }>();
  const hud = (s: PushState): PushHud => {
    const me = s.pushers.find((p) => p.seat === o.seat);
    return {
      standing: s.pushers.filter((p) => !p.out && p.fall === 0).length,
      total: s.pushers.length,
      secondsLeft: Math.max(0, Math.ceil((ROUND_FRAMES - s.frame) / 60)),
      out: !me || me.out || me.fall > 0,
      shoveReady: !!me && me.cooldown === 0,
      earned,
    };
  };

  let raf = 0;
  let last = performance.now();
  let hudAt = 0;
  const loop = (now: number) => {
    const dt = Math.min(now - last, 250);
    last = now;
    driver.advance(dt);
    const s = predicted;
    if (s) {
      const k = Math.min(1, dt / 40);
      for (const p of s.pushers) {
        const x = toPx(p.x);
        const y = toPx(p.y);
        const d = shown.get(p.seat);
        if (!d || Math.hypot(x - d.x, y - d.y) > 60) shown.set(p.seat, { x, y });
        else shown.set(p.seat, { x: d.x + (x - d.x) * k, y: d.y + (y - d.y) * k });
      }
      view.render(s, shown, o.seat);
      if (now > hudAt) {
        hudAt = now + 100; // 10Hz is plenty for the DOM
        o.onHud(hud(s));
      }
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  return {
    destroy() {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
      for (const off of offs) off();
      input.destroy();
      view.dispose();
    },
  };
}
