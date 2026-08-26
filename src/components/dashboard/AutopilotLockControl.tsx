import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useIsFocused } from "expo-router";
import { useApi } from "@/lib/api/client";
import { usePolledResource } from "@/lib/api/usePolledResource";
import type { AutopilotLockState } from "@/lib/api/types";
import { DashboardColors } from "@/constants/dashboardColors";

const POLL_INTERVAL_MS = 7000;

/**
 * Mirrors forex-ai (web)'s AutopilotLockControl.tsx -- the operator's own dedicated
 * on/off switch for the autopilot, distinct from KillSwitchControl (which also blocks
 * manual Buy/Sell) and EngineModeControl (analysis/demo/live). Locking here only stops
 * the server's autoExecutionListener from opening a NEW trade on its own; manual
 * trading and managing positions already open keep working while locked.
 *
 * Deliberately labeled "AUTO-EXECUTION LOCKED" here, not "AUTOPILOT LOCKED" --
 * RiskGuardianBanner.tsx already uses that exact phrase for the unrelated daily-loss
 * halt. Keep these two labels distinct.
 */
export function AutopilotLockControl() {
  const api = useApi();
  const isFocused = useIsFocused();
  const { data, setData } = usePolledResource("autopilot-lock", () => api.get<AutopilotLockState>("/api/autopilot-lock"), POLL_INTERVAL_MS, isFocused);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "lock" | "unlock") {
    setBusy(true);
    setError(null);
    try {
      const json = await api.post<AutopilotLockState>("/api/autopilot-lock", { action });
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  function toggle(action: "lock" | "unlock") {
    // Locking is the safe direction and needs no confirmation. Unlocking re-arms the
    // autopilot, so it gets a confirm dialog -- same asymmetry KillSwitchControl already
    // establishes for pause/resume.
    if (action === "unlock") {
      Alert.alert("Unlock the autopilot?", "It will resume opening trades on its own.", [
        { text: "Cancel", style: "cancel" },
        { text: "Unlock", style: "destructive", onPress: () => run("unlock") },
      ]);
      return;
    }
    run("lock");
  }

  if (!data) return null;

  return (
    <View style={styles.row}>
      {error && <Text style={styles.error}>{error}</Text>}
      {data.locked ? (
        <Pressable disabled={busy} onPress={() => toggle("unlock")} style={styles.lockedButton}>
          <Text style={styles.lockedText}>🔒 AUTO-EXECUTION LOCKED — Unlock</Text>
        </Pressable>
      ) : (
        <Pressable disabled={busy} onPress={() => toggle("lock")} style={styles.unlockedButton}>
          <Text style={styles.unlockedText}>🔓 Lock Autopilot</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  error: { fontSize: 12, color: DashboardColors.rose },
  lockedButton: { borderRadius: 10, backgroundColor: DashboardColors.amber, paddingHorizontal: 12, paddingVertical: 7 },
  lockedText: { color: "#3f1d00", fontSize: 12, fontWeight: "800" },
  unlockedButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: DashboardColors.border,
    backgroundColor: DashboardColors.surfaceAlt,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  unlockedText: { color: DashboardColors.textSecondary, fontSize: 12, fontWeight: "700" },
});
