/**
 * Load test that doubles as an abuse test (TECH_STACK.md §8 Phase 5, SECURITY.md Phase 5).
 *
 * Starts the real server (`node src/index.ts`) on a spare port with TRUST_PROXY=1, then plays
 * N rooms from worker threads: a third each Race, Sabotage and Push Party, every room from its
 * own X-Forwarded-For address, as players behind the production proxy would arrive. Players
 * send inputs at a human rate, emote, arm traps, and rounds restart when they end. Under that
 * load three attacks run: a speed hack, a room-cap breach from one address, code brute force.
 *
 *   pnpm --filter @jom/realtime load-test [rooms = 200] [seconds = 60] [workers = 4]
 *
 * ponytail: the players share this machine with the server, so the numbers are a floor for a
 * shared box, not a Railway instance; rerun against the deployed server when one exists.
 */
import { spawn } from 'node:child_process';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { Client } from '@colyseus/sdk';

const PORT = 2569;
const BASE = `http://localhost:${PORT}`;
const STEP_MS = 1000 / 60;
const MODES = [
  ['race', 4],
  ['sabotage', 4],
  ['push', 8],
] as const;
/** Pass marks: snapshots arrive at ~20Hz, the loop stays responsive, nobody is dropped. */
const MIN_SNAPS_PER_S = 18;
const MAX_GAP_P95_MS = 100;
const MAX_LOOP_P99_MS = 50;
const MAX_PUSH_LAG_FRAMES = 12;
const BUCKET_MS = 5;
const BUCKETS = 201; // the last one holds every gap ≥ 1s

type Room = Awaited<ReturnType<Client['create']>>;
interface Tally {
  players: number;
  failedRooms: number;
  gaps: number[];
  gapSum: number;
  gapCount: number;
  dropped: number;
  closeCodes: Record<number, number>;
  pushLagMax: number;
  /** Push arena frames behind the wall clock, one bucket per frame (the last: ≥ 1s). */
  lags: number[];
}
const LAG_BUCKETS = 61;
/** The q-quantile bucket of a histogram (bucket index, so ×width for units). */
const quantile = (hist: number[], q: number) => {
  const total = hist.reduce((a, b) => a + b, 0);
  let seen = 0;
  return hist.findIndex((n) => (seen += n) >= total * q);
};

const ip = (n: number) => `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
const client = (n: number) => new Client(BASE, { headers: { 'x-forwarded-for': ip(n) } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pick = <T>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)]!;
/** Resolves with the promise's value, or `fallback` after `ms`. */
const within = <T>(ms: number, p: Promise<T>, fallback: T) =>
  Promise.race([p, sleep(ms).then(() => fallback)]);

// ================================================================== worker: plays rooms
async function playRooms(from: number, to: number) {
  const port = parentPort!;
  const tally: Tally = {
    players: 0,
    failedRooms: 0,
    gaps: new Array<number>(BUCKETS).fill(0),
    gapSum: 0,
    gapCount: 0,
    dropped: 0,
    closeCodes: {},
    pushLagMax: 0,
    lags: new Array<number>(LAG_BUCKETS).fill(0),
  };
  let measuring = false;
  let stopping = false;
  const timers: Array<ReturnType<typeof setInterval>> = [];
  const rooms: Room[] = [];

  async function playRoom(i: number) {
    const [mode, size] = MODES[i % MODES.length]!;
    const host = await client(i).create('party', { mode });
    const all: Room[] = [host];
    for (let k = 1; k < size; k++) all.push(await client(i).joinById(host.roomId));
    rooms.push(...all);
    tally.players += all.length;
    let startedAt = 0;
    // Latest server frame for input stamps: the clock for the platformer, the arena for Push.
    let frame = 0;
    for (const r of all) {
      let lastSnap = 0;
      r.onMessage('*', () => {});
      r.onLeave((code) => {
        if (stopping) return;
        tally.dropped++;
        tally.closeCodes[code] = (tally.closeCodes[code] ?? 0) + 1;
      });
      r.onMessage('go', () => (lastSnap = 0));
      r.onMessage(
        'snap',
        (s: { phase: string; clock: number; state?: { frame: number } | null }) => {
          // Gaps between snapshots while a round runs (lobbies and results send none).
          const now = performance.now();
          if (s.phase === 'playing') {
            if (lastSnap && measuring) {
              const gap = now - lastSnap;
              tally.gaps[Math.min(BUCKETS - 1, Math.floor(gap / BUCKET_MS))]!++;
              tally.gapSum += gap;
              tally.gapCount++;
            }
            lastSnap = now;
          } else lastSnap = 0;
          frame = s.state?.frame ?? s.clock;
          if (s.state && startedAt && measuring && now - startedAt > 2000) {
            const lag = (now - startedAt) / STEP_MS - s.state.frame;
            tally.pushLagMax = Math.max(tally.pushLagMax, lag);
            tally.lags[Math.min(LAG_BUCKETS - 1, Math.max(0, Math.floor(lag)))]!++;
          }
        },
      );
    }
    host.onMessage('go', () => {
      startedAt = performance.now();
      frame = 0;
    });
    // A round that ends starts again, so every room stays busy for the whole test.
    host.onMessage('results', () =>
      setTimeout(() => {
        host.send('next');
        host.send('start');
      }, 300),
    );
    all.forEach((r, k) => {
      let mask = 0;
      const masks = mode === 'push' ? [0, 1, 2, 4, 8, 16, 18, 20, 5, 10] : [0, 2, 6, 2, 1, 2];
      timers.push(
        setInterval(() => {
          if (Math.random() < 0.3) mask = pick(masks);
          r.send('input', { f: frame + 2, m: mask }); // a change, or the 10Hz heartbeat
          if (Math.random() < 0.01) r.send('emote', { id: Math.floor(Math.random() * 8) });
          if (mode === 'sabotage' && k > 0 && Math.random() < 0.03) {
            r.send('place', { slot: 1 + Math.floor(Math.random() * 6) });
          }
        }, 100),
      );
    });
    host.send('start');
  }

  for (let i = from; i < to; i += 10) {
    const batch = Array.from({ length: Math.min(10, to - i) }, (_, k) => i + k);
    const done = await Promise.allSettled(batch.map(playRoom));
    tally.failedRooms += done.filter((d) => d.status === 'rejected').length;
  }
  port.postMessage({ ready: true });
  port.on('message', async (m: string) => {
    if (m === 'measure') measuring = true;
    if (m === 'stop') {
      measuring = false;
      stopping = true;
      for (const t of timers) clearInterval(t);
      await within(5000, Promise.allSettled(rooms.map((r) => r.leave())), []);
      port.postMessage({ tally });
    }
  });
}

if (!isMainThread) {
  const { from, to } = workerData as { from: number; to: number };
  await playRooms(from, to);
} else {
  await main();
}

// ================================================================== main: server + attacks
async function main() {
  const ROOMS = Number(process.argv[2] ?? 200);
  const SECONDS = Number(process.argv[3] ?? 60);
  const WORKERS = Number(process.argv[4] ?? 4);
  const t0 = performance.now();
  const log = (text: string) =>
    console.log(`[${((performance.now() - t0) / 1000).toFixed(1)}s] ${text}`);

  // Profiling: SERVER_NODE_ARGS="--cpu-prof" with a SERVER_ENTRY that exits cleanly on its own.
  const nodeArgs = process.env.SERVER_NODE_ARGS?.split(' ').filter(Boolean) ?? [];
  const entry = process.env.SERVER_ENTRY ?? 'src/index.ts';
  const server = spawn(process.execPath, [...nodeArgs, entry], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: String(PORT), TRUST_PROXY: '1' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const metrics: Array<{ rooms: number; clients: number; rssMb: number; loopP99Ms: number }> = [];
  let listening = false;
  let measuring = false;
  server.stdout.on('data', (chunk: Buffer) => {
    for (const line of String(chunk).split('\n')) {
      if (line.includes('listening')) listening = true;
      if (line.startsWith('{"metric"')) {
        if (measuring) metrics.push(JSON.parse(line));
        log(line);
      }
    }
  });
  for (let i = 0; i < 100 && !listening; i++) await sleep(100);
  if (!listening) throw new Error('server did not start');

  // Players, spread over worker threads so one busy client thread can't skew the server's numbers.
  const per = Math.ceil(ROOMS / WORKERS);
  const workers = Array.from(
    { length: WORKERS },
    (_, w) =>
      new Worker(new URL(import.meta.url), {
        workerData: { from: w * per, to: Math.min(ROOMS, (w + 1) * per) },
      }),
  );
  const next = (w: Worker) =>
    new Promise<{ ready?: true; tally?: Tally }>((r) => w.once('message', r));
  await Promise.all(workers.map(next));
  log(`${ROOMS} rooms playing across ${WORKERS} workers`);

  // Attacks, under load.
  const attacks: Record<string, boolean> = {};
  const extra: Room[] = [];
  {
    // Speed hack: inputs stamped far in the future → kicked with 4403.
    const a = await client(900_001).create('party', { mode: 'race' });
    const b = await client(900_001).joinById(a.roomId);
    a.onMessage('*', () => {});
    b.onMessage('*', () => {});
    extra.push(b);
    const go = new Promise((r) => a.onMessage('go', r));
    a.send('start');
    await within(5000, go, null);
    const kicked = new Promise<number>((r) => a.onLeave(r));
    for (let f = 0; f < 40; f++) a.send('input', { f: 100_000 + f, m: 2 });
    attacks['speed hack is kicked (4403)'] = (await within(5000, kicked, 0)) === 4403;
    log('attack: speed hack done');
  }
  {
    // Room cap: a sixth live room from one address is refused.
    const errors: string[] = [];
    for (let k = 0; k < 6; k++) {
      const r = await within(
        5000,
        client(900_002)
          .create('party', { mode: 'push' })
          .catch((e: Error) => e.message),
        'timed out',
      );
      if (typeof r === 'string') errors.push(r);
      else extra.push(r);
    }
    attacks['6th room from one address is refused'] =
      errors.length === 1 && errors[0] === 'Too many rooms open from here.';
    log(`attack: room cap done ${JSON.stringify(errors)}`);
  }
  {
    // Code brute force: past 1000 matchmaking requests an hour, one address gets 429s.
    const statuses: number[] = [];
    for (let k = 0; k < 1001; k += 50) {
      const burst = Array.from({ length: Math.min(50, 1001 - k) }, () =>
        fetch(`${BASE}/matchmake/joinById/ZZZZZZ`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-forwarded-for': ip(900_003) },
          body: '{}',
        }).then((res) => res.status),
      );
      statuses.push(...(await Promise.all(burst)));
    }
    attacks['code brute force hits 429'] =
      statuses.filter((s) => s === 429).length === 1 && statuses.at(-1) !== undefined;
    log(`attack: brute force done (${statuses.filter((s) => s === 429).length} × 429)`);
  }

  // Steady state.
  measuring = true;
  for (const w of workers) w.postMessage('measure');
  const steadyFrom = performance.now();
  await sleep(SECONDS * 1000);
  const steadySeconds = (performance.now() - steadyFrom) / 1000;
  measuring = false;
  const results = workers.map(next);
  for (const w of workers) w.postMessage('stop');
  const tallies = (await Promise.all(results)).map((m) => m.tally!);
  await within(5000, Promise.allSettled(extra.map((r) => r.leave())), []);
  await Promise.all(workers.map((w) => w.terminate()));
  server.kill();

  const t: Tally = tallies.reduce((a, b) => ({
    players: a.players + b.players,
    failedRooms: a.failedRooms + b.failedRooms,
    gaps: a.gaps.map((n, i) => n + b.gaps[i]!),
    gapSum: a.gapSum + b.gapSum,
    gapCount: a.gapCount + b.gapCount,
    dropped: a.dropped + b.dropped,
    closeCodes: Object.fromEntries(
      [...new Set([...Object.keys(a.closeCodes), ...Object.keys(b.closeCodes)])].map((k) => [
        k,
        (a.closeCodes[+k] ?? 0) + (b.closeCodes[+k] ?? 0),
      ]),
    ),
    pushLagMax: Math.max(a.pushLagMax, b.pushLagMax),
    lags: a.lags.map((n, i) => n + b.lags[i]!),
  }));
  const p95 = (quantile(t.gaps, 0.95) + 1) * BUCKET_MS;
  const lagP50 = quantile(t.lags, 0.5);
  const lagP95 = quantile(t.lags, 0.95);
  const snapsPerSecond = t.gapCount ? 1000 / (t.gapSum / t.gapCount) : 0;
  const peak = (key: 'rssMb' | 'loopP99Ms' | 'clients' | 'rooms') =>
    Math.max(0, ...metrics.map((m) => m[key]));

  const checks: Record<string, boolean> = {
    [`all ${ROOMS} rooms created`]: t.failedRooms === 0,
    [`snapshots ≥ ${MIN_SNAPS_PER_S}/s per player in a round`]: snapsPerSecond >= MIN_SNAPS_PER_S,
    [`95% of snapshot gaps ≤ ${MAX_GAP_P95_MS}ms`]: p95 <= MAX_GAP_P95_MS,
    [`server event loop p99 ≤ ${MAX_LOOP_P99_MS}ms`]: peak('loopP99Ms') <= MAX_LOOP_P99_MS,
    [`push arena ≤ ${MAX_PUSH_LAG_FRAMES} frames behind the clock (p95)`]:
      lagP95 <= MAX_PUSH_LAG_FRAMES,
    'no dropped connections': t.dropped === 0,
    ...attacks,
  };
  console.log(
    JSON.stringify(
      {
        rooms: ROOMS,
        players: t.players,
        steadySeconds: +steadySeconds.toFixed(1),
        snapsPerPlayerPerS: +snapsPerSecond.toFixed(1),
        snapGapP95Ms: p95,
        pushLagFrames: { p50: lagP50, p95: lagP95, max: +t.pushLagMax.toFixed(1) },
        dropped: t.dropped,
        closeCodes: t.closeCodes,
        server: {
          peakRooms: peak('rooms'),
          peakClients: peak('clients'),
          peakRssMb: peak('rssMb'),
          peakLoopP99Ms: peak('loopP99Ms'),
          samples: metrics.length,
        },
      },
      null,
      2,
    ),
  );
  for (const [name, ok] of Object.entries(checks)) console.log(`${ok ? 'pass' : 'FAIL'}  ${name}`);
  process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
}
