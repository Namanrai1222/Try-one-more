/**
 * Realtime server entry (Colyseus, TECH_STACK.md §2). Local: `pnpm --filter @jom/realtime dev`
 * → ws://localhost:2567. Deploy target: Railway/Fly — not configured yet.
 */
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { matchMaker } from '@colyseus/core';
import { createPartyServer, guardHttp } from './server.ts';

const port = Number(process.env.PORT ?? 2567);
const { server, http } = createPartyServer();
await server.listen(port);
guardHttp(http);
console.log(`realtime: listening on ${port}`);

// Health line every 10s (counts only, nothing about players): rooms, sockets, memory, and the
// event loop's p99 delay — the first number to rise when one process holds too many rooms.
const loop = monitorEventLoopDelay({ resolution: 10 });
loop.enable();
setInterval(() => {
  const { roomCount, ccu } = matchMaker.stats.local;
  console.log(
    JSON.stringify({
      metric: 'realtime',
      rooms: roomCount,
      clients: ccu,
      rssMb: Math.round(process.memoryUsage().rss / 2 ** 20),
      loopP99Ms: Math.round(loop.percentile(99) / 1e5) / 10,
      loopMaxMs: Math.round(loop.max / 1e5) / 10,
    }),
  );
  loop.reset();
}, 10_000).unref();
