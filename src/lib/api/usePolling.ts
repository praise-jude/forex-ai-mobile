import { AppState, type AppStateStatus } from "react-native";
import { useEffect, useRef, useState } from "react";

/**
 * Polls `fetchFn` immediately and then every `intervalMs`, mirroring the polling pattern
 * every panel on the web dashboard already uses (ConnectionStatus, RiskGuardianBanner,
 * PositionsPanel, EngineModeControl, KillSwitchControl). `fetchFn` is read through a ref
 * so a new function identity each render doesn't restart the interval.
 *
 * Pauses while the app is backgrounded (a phone-specific battery/data concern a desktop
 * browser tab doesn't have) and resumes with an immediate poll when it comes back to the
 * foreground, rather than polling at full rate the whole time the app isn't visible.
 */
export function usePolling<T>(fetchFn: () => Promise<T>, intervalMs: number, enabled = true) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fetchRef = useRef(fetchFn);
  // Incremented on every poll attempt so a slow response that resolves after a newer
  // request has already started (or resolved) gets ignored -- otherwise a stale response
  // landing late could briefly overwrite fresher data.
  const generationRef = useRef(0);

  // Keeps the ref pointed at the latest closure without restarting the interval below --
  // assigning it in an effect (rather than during render) so it runs post-commit.
  useEffect(() => {
    fetchRef.current = fetchFn;
  });

  useEffect(() => {
    if (!enabled) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    function poll() {
      const generation = ++generationRef.current;
      fetchRef.current()
        .then((json) => {
          if (generation !== generationRef.current) return;
          setData(json);
          setError(null);
        })
        .catch((err) => {
          // Best-effort, same as the web panels: keep showing the last known snapshot
          // rather than flashing an error on a transient network hiccup.
          if (generation !== generationRef.current) return;
          setError(err instanceof Error ? err.message : String(err));
        });
    }

    function startPolling() {
      if (intervalId) return;
      poll();
      intervalId = setInterval(poll, intervalMs);
    }

    function stopPolling() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }

    if (AppState.currentState === "active") startPolling();

    const subscription = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (nextState === "active") startPolling();
      else stopPolling();
    });

    return () => {
      stopPolling();
      subscription.remove();
    };
  }, [enabled, intervalMs]);

  return { data, error, setData };
}
