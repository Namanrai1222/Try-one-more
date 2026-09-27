import { afterEach, describe, expect, it, vi } from 'vitest';
import { TELEMETRY_STORAGE_KEY, createTelemetryBus } from '../src/index.ts';
import type { StorageLike, TelemetryEvent, TelemetryTransport } from '../src/index.ts';

function memoryStorage(
  initial: Record<string, string> = {},
): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

function recordingTransport() {
  const batches: TelemetryEvent[][] = [];
  let failNext = 0;
  const transport: TelemetryTransport = {
    async send(batch) {
      if (failNext > 0) {
        failNext--;
        throw new Error('network down');
      }
      batches.push([...batch]);
    },
  };
  return { transport, batches, failTimes: (n: number) => (failNext = n) };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('telemetry bus', () => {
  it('queues locally when no transport is configured', async () => {
    const storage = memoryStorage();
    const bus = createTelemetryBus({ storage, now: () => 1000 });
    bus.emit('level_start', { level: 'sandbox-00' });
    bus.emit('level_death');
    expect(bus.size()).toBe(2);
    expect(await bus.flush()).toBe(0);
    const stored = JSON.parse(storage.data[TELEMETRY_STORAGE_KEY]!) as TelemetryEvent[];
    expect(stored.map((e) => e.name)).toEqual(['level_start', 'level_death']);
    expect(stored[0]).toEqual({
      seq: 1,
      name: 'level_start',
      ts: 1000,
      props: { level: 'sandbox-00' },
    });
  });

  it('restores the queue from storage and continues the sequence', () => {
    const prior: TelemetryEvent[] = [{ seq: 7, name: 'old', ts: 1 }];
    const storage = memoryStorage({ [TELEMETRY_STORAGE_KEY]: JSON.stringify(prior) });
    const bus = createTelemetryBus({ storage });
    bus.emit('new');
    const stored = JSON.parse(storage.data[TELEMETRY_STORAGE_KEY]!) as TelemetryEvent[];
    expect(stored.map((e) => e.seq)).toEqual([7, 8]);
  });

  it('flushes in batches and empties the queue', async () => {
    const { transport, batches } = recordingTransport();
    const bus = createTelemetryBus({ transport, maxBatchSize: 2, flushIntervalMs: 0 });
    for (let i = 0; i < 5; i++) bus.emit(`e${i}`);
    expect(await bus.flush()).toBe(5);
    expect(batches.map((b) => b.length)).toEqual([2, 2, 1]);
    expect(bus.size()).toBe(0);
  });

  it('keeps events queued when the transport fails, and retries later', async () => {
    const { transport, batches, failTimes } = recordingTransport();
    const bus = createTelemetryBus({ transport, flushIntervalMs: 0 });
    bus.emit('a');
    bus.emit('b');
    failTimes(1);
    expect(await bus.flush()).toBe(0);
    expect(bus.size()).toBe(2);
    expect(await bus.flush()).toBe(2);
    expect(batches.flat().map((e) => e.name)).toEqual(['a', 'b']);
  });

  it('does not lose events emitted while a flush is in flight', async () => {
    let release: () => void = () => {};
    let calls = 0;
    const sent: string[] = [];
    const transport: TelemetryTransport = {
      send: (batch) =>
        new Promise<void>((resolve) => {
          calls++;
          release = () => {
            sent.push(...batch.map((e) => e.name));
            resolve();
          };
        }),
    };
    const bus = createTelemetryBus({ transport, flushIntervalMs: 0, maxBatchSize: 10 });
    bus.emit('first');
    const flushing = bus.flush();
    bus.emit('during');
    release();
    await vi.waitFor(() => expect(calls).toBe(2));
    release();
    await flushing;
    expect(sent).toEqual(['first', 'during']);
    expect(bus.size()).toBe(0);
  });

  it('shares one in-flight flush between concurrent callers', async () => {
    const { transport, batches } = recordingTransport();
    const bus = createTelemetryBus({ transport, flushIntervalMs: 0 });
    bus.emit('x');
    const [a, b] = await Promise.all([bus.flush(), bus.flush()]);
    expect(a).toBe(1);
    expect(b).toBe(1);
    expect(batches).toHaveLength(1);
  });

  it('drops the oldest events beyond maxQueueSize', () => {
    const storage = memoryStorage();
    const bus = createTelemetryBus({ storage, maxQueueSize: 3 });
    for (let i = 0; i < 5; i++) bus.emit(`e${i}`);
    const stored = JSON.parse(storage.data[TELEMETRY_STORAGE_KEY]!) as TelemetryEvent[];
    expect(stored.map((e) => e.name)).toEqual(['e2', 'e3', 'e4']);
  });

  it('flushes on an interval when a transport is configured', async () => {
    vi.useFakeTimers();
    const { transport, batches } = recordingTransport();
    const bus = createTelemetryBus({ transport, flushIntervalMs: 1000 });
    bus.emit('tick');
    await vi.advanceTimersByTimeAsync(1000);
    expect(batches).toHaveLength(1);
    bus.destroy();
  });

  it('survives storage that throws or holds garbage', () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const bus = createTelemetryBus({ storage: throwing });
    expect(() => bus.emit('ok')).not.toThrow();
    expect(bus.size()).toBe(1);

    const garbage = memoryStorage({ [TELEMETRY_STORAGE_KEY]: '{not json' });
    expect(createTelemetryBus({ storage: garbage }).size()).toBe(0);
  });
});
