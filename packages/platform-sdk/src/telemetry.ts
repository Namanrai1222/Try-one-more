/**
 * Vendor-agnostic telemetry bus (PRD.md §6 Phase 0, TECH_STACK.md §8).
 *
 * Events queue locally first — in memory and mirrored to storage so they survive a
 * reload — and are flushed in batches to whatever transport is plugged in. With no
 * transport the bus just holds a bounded local queue; wiring PostHog later is a
 * transport, not a rewrite.
 *
 * Never put personal data in props (SECURITY.md §7 Logging, §8).
 */

export type TelemetryProps = Record<string, string | number | boolean | null>;

export interface TelemetryEvent {
  /** Monotonic per-device sequence number; lets a backend de-duplicate retried batches. */
  seq: number;
  name: string;
  /** Epoch milliseconds. */
  ts: number;
  props?: TelemetryProps;
}

export interface TelemetryTransport {
  /** Resolve when the batch is durably accepted; reject to keep it queued for retry. */
  send(batch: readonly TelemetryEvent[]): Promise<void>;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface TelemetryOptions {
  transport?: TelemetryTransport | null;
  storage?: StorageLike | null;
  storageKey?: string;
  flushIntervalMs?: number;
  maxBatchSize?: number;
  maxQueueSize?: number;
  now?: () => number;
}

export interface TelemetryBus {
  emit(name: string, props?: TelemetryProps): void;
  /** Sends everything queued. Resolves to the number of events delivered. */
  flush(): Promise<number>;
  size(): number;
  destroy(): void;
}

export const TELEMETRY_STORAGE_KEY = 'jom:telemetry:v1';

function isEvent(value: unknown): value is TelemetryEvent {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.seq === 'number' && typeof v.name === 'string' && typeof v.ts === 'number';
}

export function createTelemetryBus(options: TelemetryOptions = {}): TelemetryBus {
  const transport = options.transport ?? null;
  const storage = options.storage ?? null;
  const key = options.storageKey ?? TELEMETRY_STORAGE_KEY;
  const maxBatch = options.maxBatchSize ?? 20;
  const maxQueue = options.maxQueueSize ?? 500;
  const now = options.now ?? Date.now;

  const queue: TelemetryEvent[] = load();
  let nextSeq = queue.reduce((max, e) => Math.max(max, e.seq), 0) + 1;
  let inFlight: Promise<number> | null = null;

  function load(): TelemetryEvent[] {
    try {
      const raw = storage?.getItem(key);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isEvent).slice(-maxQueue) : [];
    } catch {
      return []; // corrupt or inaccessible storage: start clean
    }
  }

  function persist(): void {
    try {
      storage?.setItem(key, JSON.stringify(queue));
    } catch {
      // quota exceeded / private mode: keep the in-memory queue only
    }
  }

  async function drain(): Promise<number> {
    let sent = 0;
    try {
      while (transport && queue.length > 0) {
        const batch = queue.slice(0, maxBatch);
        await transport.send(batch);
        const lastSeq = batch[batch.length - 1]!.seq;
        while (queue.length > 0 && queue[0]!.seq <= lastSeq) queue.shift();
        sent += batch.length;
        persist();
      }
    } catch {
      // transport failed: unsent events stay queued for the next flush
    }
    return sent;
  }

  const bus: TelemetryBus = {
    emit(name, props) {
      const event: TelemetryEvent = { seq: nextSeq++, name, ts: now() };
      if (props) event.props = props;
      queue.push(event);
      if (queue.length > maxQueue) queue.splice(0, queue.length - maxQueue);
      persist();
    },
    flush() {
      if (!transport || queue.length === 0) return Promise.resolve(0);
      inFlight ??= drain().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
    size: () => queue.length,
    destroy() {
      if (timer !== null) clearInterval(timer);
    },
  };

  const interval = options.flushIntervalMs ?? 10_000;
  const timer = transport && interval > 0 ? setInterval(() => void bus.flush(), interval) : null;

  return bus;
}

/** Dev-only transport that logs batches instead of sending them anywhere. */
export function createConsoleTransport(
  log: (...args: unknown[]) => void = console.debug,
): TelemetryTransport {
  return {
    async send(batch) {
      log('[telemetry]', batch);
    },
  };
}
