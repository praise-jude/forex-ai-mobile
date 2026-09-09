import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useIsFocused } from "expo-router";
import { useApi } from "@/lib/api/client";
import { usePolledResource } from "@/lib/api/usePolledResource";
import type { ExecutionConfigResponse } from "@/lib/api/types";
import { DashboardColors } from "@/constants/dashboardColors";

const POLL_INTERVAL_MS = 15000;

type Engine = "range_engine" | "trend_continuation";

/**
 * Real on/off switches for Range Engine and Trend Continuation (see forex-ai's
 * engineToggles.ts) -- replaces the env-var-only posture both engines launched with.
 * Targets the "live" account specifically: this deployment has no demo account
 * configured, so "live" is the only account either engine can ever actually run
 * against. Persists across restarts. RN port of forex-ai's EngineTogglesControl.tsx --
 * a Pressable pair stands in for the web version's checkboxes, same as
 * ExecutionPolicyControl's own tier buttons.
 *
 * Turning either of these on does NOT bypass autopilot lock, engine mode, or any other
 * real risk check -- it only lets that engine's own signals be CONSIDERED for
 * auto-execution at all.
 */
export function EngineTogglesControl() {
  const api = useApi();
  const isFocused = useIsFocused();
  const { data, setData } = usePolledResource(
    "execution-config",
    () => api.get<ExecutionConfigResponse>("/api/execution-config"),
    POLL_INTERVAL_MS,
    isFocused
  );
  const [rangeEngineEnabled, setRangeEngineEnabled] = useState(false);
  const [trendContinuationEnabled, setTrendContinuationEnabled] = useState(false);
  const [busyEngine, setBusyEngine] = useState<Engine | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- seeding local toggle state from a
     polled external resource, not state derivable from render. */
  useEffect(() => {
    if (!data) return;
    setRangeEngineEnabled(data.live.rangeEngineEnabled);
    setTrendContinuationEnabled(data.live.trendContinuationEnabled);
  }, [data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function toggle(engine: Engine, enabled: boolean) {
    setBusyEngine(engine);
    setError(null);
    try {
      const json = await api.post<ExecutionConfigResponse>("/api/execution-config", { account: "live", engine, enabled });
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error — try again");
      // Roll the optimistic local flip back since the request failed.
      if (engine === "range_engine") setRangeEngineEnabled(!enabled);
      else setTrendContinuationEnabled(!enabled);
    } finally {
      setBusyEngine(null);
    }
  }

  if (!data) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Engines</Text>

      <View style={styles.row}>
        <Pressable
          disabled={busyEngine === "range_engine"}
          onPress={() => {
            const next = !rangeEngineEnabled;
            setRangeEngineEnabled(next);
            void toggle("range_engine", next);
          }}
          style={[styles.chip, rangeEngineEnabled && styles.chipActive]}
        >
          <Text style={[styles.chipText, rangeEngineEnabled && styles.chipTextActive]}>Range Engine {rangeEngineEnabled ? "ON" : "OFF"}</Text>
        </Pressable>

        <Pressable
          disabled={busyEngine === "trend_continuation"}
          onPress={() => {
            const next = !trendContinuationEnabled;
            setTrendContinuationEnabled(next);
            void toggle("trend_continuation", next);
          }}
          style={[styles.chip, trendContinuationEnabled && styles.chipActive]}
        >
          <Text style={[styles.chipText, trendContinuationEnabled && styles.chipTextActive]}>Trend Engine {trendContinuationEnabled ? "ON" : "OFF"}</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  label: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, color: DashboardColors.textMuted },
  row: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  chip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: DashboardColors.border,
    backgroundColor: DashboardColors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipActive: { borderColor: DashboardColors.emerald, backgroundColor: DashboardColors.emeraldBg },
  chipText: { fontSize: 11, fontWeight: "600", color: DashboardColors.textSecondary },
  chipTextActive: { color: DashboardColors.emerald },
  errorText: { fontSize: 11, color: DashboardColors.rose },
});
