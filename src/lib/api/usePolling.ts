import { useEffect, useRef, useState } from "react";

/**
 * Polls `fetchFn` immediately and then every `intervalMs`, mirroring the polling pattern
 * every panel on the web dashboard already uses (ConnectionStatus, RiskGuardianBanner,
 * PositionsPanel, EngineModeControl, KillSwitchControl). `fetchFn` is read through a ref
 * so a new function identity each render doesn't restart the interval.
 */
export function usePolling<T>(fetchFn: () => Promise<T>, intervalMs: number, enabled = true) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fetchRef = useRef(fetchFn);

  // Keeps the ref pointed at the latest closure without restarting the interval below --
  // assigning it in an effect (rather than during render) so it runs post-commit.
  useEffect(() => {
    fetchRef.current = fetchFn;
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    function poll() {
      fetchRef.current()
        .then((json) => {
          if (!cancelled) {
            setData(json);
            setError(null);
          }
        })
        .catch((err) => {
          // Best-effort, same as the web panels: keep showing the last known snapshot
          // rather than flashing an error on a transient network hiccup.
          if (!cancelled) setError(err instanceof Error ? err.message : String(err));
        });
    }

    poll();
    const id = setInterval(poll, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled, intervalMs]);

  return { data, error, setData };
}
