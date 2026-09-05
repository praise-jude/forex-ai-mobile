import { AppState, type AppStateStatus } from "react-native";
import { useEffect, useState } from "react";

interface PollerEntry {
  data: unknown;
  error: string | null;
  intervalId: ReturnType<typeof setInterval> | null;
  subscribers: Set<(data: unknown, error: string | null) => void>;
  fetcher: () => Promise<unknown>;
  intervalMs: number;
}

// Module-scoped, not per-component -- multiple components calling usePolledResource
// with the SAME key share one interval and one in-flight fetch, mirroring forex-ai
// (web)'s lib/hooks/usePolledResource.ts. Fixes the confirmed duplicate-polling case
// where index.tsx and EngineModeControl.tsx each independently hit /api/engine-mode on
// identical 7s timers.
const registry = new Map<string, PollerEntry>();

function notify(entry: PollerEntry): void {
  for (const subscriber of entry.subscribers) subscriber(entry.data, entry.error);
}

async function runFetch(key: string): Promise<void> {
  const entry = registry.get(key);
  if (!entry) return;
  try {
    entry.data = await entry.fetcher();
    entry.error = null;
  } catch (err) {
    // Best-effort, matching usePolling.ts's own posture -- keep showing the last known
    // value rather than flashing an error on a single missed poll.
    entry.error = err instanceof Error ? err.message : "Request failed";
  }
  notify(entry);
}

function startInterval(key: string, entry: PollerEntry): void {
  if (entry.intervalId) return;
  void runFetch(key);
  entry.intervalId = setInterval(() => void runFetch(key), entry.intervalMs);
}

function stopInterval(entry: PollerEntry): void {
  if (entry.intervalId) {
    clearInterval(entry.intervalId);
    entry.intervalId = null;
  }
}

export interface PolledResource<T> {
  data: T | null;
  error: string | null;
  /** Patches the shared cache immediately (broadcasting to every subscriber of this key)
   * without waiting for the next interval tick -- e.g. an optimistic update right after
   * a successful POST. */
  setData: (next: T) => void;
}

/**
 * Polls `key` on a shared interval, deduplicated across every component that calls this
 * hook with the same key -- only one network request fires per tick no matter how many
 * subscribers there are. Same background/foreground pause behavior as usePolling.ts
 * (AppState-driven), applied once per subscriber -- redundant but harmless, since
 * start/stop are idempotent and this hook is only used for low-frequency, low-subscriber
 * keys (currently just "engine-mode").
 */
export function usePolledResource<T>(key: string, fetcher: () => Promise<T>, intervalMs: number, enabled = true): PolledResource<T> {
  const [state, setState] = useState<{ data: T | null; error: string | null }>(() => {
    const existing = registry.get(key);
    return { data: (existing?.data as T | undefined) ?? null, error: existing?.error ?? null };
  });

  useEffect(() => {
    if (!enabled) return;

    let entry = registry.get(key);
    const isFirstSubscriber = !entry;
    if (!entry) {
      entry = { data: null, error: null, subscribers: new Set(), fetcher: fetcher as () => Promise<unknown>, intervalId: null, intervalMs };
      registry.set(key, entry);
    }

    const subscriber = (data: unknown, error: string | null) => setState({ data: data as T | null, error });
    entry.subscribers.add(subscriber);
    if (isFirstSubscriber && AppState.currentState === "active") startInterval(key, entry);

    const appStateSubscription = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      const current = registry.get(key);
      if (!current) return;
      if (nextState === "active") startInterval(key, current);
      else stopInterval(current);
    });

    return () => {
      appStateSubscription.remove();
      const current = registry.get(key);
      if (!current) return;
      current.subscribers.delete(subscriber);
      if (current.subscribers.size === 0) {
        stopInterval(current);
        registry.delete(key);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetcher intentionally not tracked here: re-subscribing on every fetcher identity change would defeat the dedup this hook exists for. The effect below keeps the shared entry's fetcher current instead.
  }, [key, intervalMs, enabled]);

  // Keeps the shared entry's fetcher pointed at the latest closure -- fixed a real bug
  // where changing serverUrl/authHeader (Settings screen) left every subscriber of an
  // already-mounted key (engine-mode, kill-switch, autopilot-lock, etc.) silently polling
  // with the OLD server/credentials indefinitely, since the entry was only ever created
  // once with whichever subscriber's fetcher happened to be first. Cheap field write, no
  // interval restart or resubscribe, so it doesn't reintroduce the duplicate-polling bug
  // the effect above exists to prevent.
  useEffect(() => {
    if (!enabled) return;
    const entry = registry.get(key);
    if (entry) entry.fetcher = fetcher as () => Promise<unknown>;
  }, [key, enabled, fetcher]);

  function setData(next: T): void {
    const entry = registry.get(key);
    if (!entry) return;
    entry.data = next;
    entry.error = null;
    notify(entry);
  }

  return { data: state.data, error: state.error, setData };
}
