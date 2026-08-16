import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useIsFocused } from "expo-router";
import { useApi } from "@/lib/api/client";
import { usePolledResource } from "@/lib/api/usePolledResource";
import type { KillSwitchState } from "@/lib/api/types";
import { DashboardColors } from "@/constants/dashboardColors";

export function KillSwitchControl({ account = "live" }: { account?: "live" | "demo" }) {
  const api = useApi();
  // Gated on tab focus -- Settings stays mounted under NativeTabs even while another
  // tab is active.
  const isFocused = useIsFocused();
  const { data, setData } = usePolledResource(`kill-switch:${account}`, () => api.get<KillSwitchState>(`/api/kill-switch?account=${account}`), 15000, isFocused);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "pause" | "resume") {
    setBusy(true);
    setError(null);
    try {
      const json = await api.post<KillSwitchState & { message?: string }>("/api/kill-switch", { action, account });
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  function toggle(action: "pause" | "resume") {
    // Stopping is always the safe direction and needs no confirmation. Resuming re-arms
    // real execution, so it gets a confirm dialog even though pausing doesn't.
    if (action === "resume") {
      Alert.alert("Resume trading?", "Buy/Sell buttons will be able to place real orders again.", [
        { text: "Cancel", style: "cancel" },
        { text: "Resume", style: "destructive", onPress: () => run("resume") },
      ]);
      return;
    }
    run("pause");
  }

  if (!data) return null;
  const label = account === "demo" ? "DEMO" : "LIVE";

  if (data.envControlled) {
    return (
      <View style={[styles.pill, { borderColor: "rgba(245,158,11,0.4)", backgroundColor: DashboardColors.amberBg }]}>
        <Text style={[styles.pillText, { color: DashboardColors.amber }]}>🛑 {label} PAUSED (platform switch)</Text>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      {error && <Text style={styles.error}>{error}</Text>}
      {data.active ? (
        <Pressable disabled={busy} onPress={() => toggle("resume")} style={styles.resumeButton}>
          <Text style={styles.resumeText}>▶ RESUME {label}</Text>
        </Pressable>
      ) : (
        <Pressable disabled={busy} onPress={() => toggle("pause")} style={styles.stopButton}>
          <Text style={styles.stopText}>🛑 STOP {label}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  error: { fontSize: 12, color: DashboardColors.rose },
  pill: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  pillText: { fontSize: 12, fontWeight: "700" },
  stopButton: { borderRadius: 10, backgroundColor: DashboardColors.roseStrong, paddingHorizontal: 12, paddingVertical: 7 },
  stopText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  resumeButton: { borderRadius: 10, backgroundColor: DashboardColors.emeraldStrong, paddingHorizontal: 12, paddingVertical: 7 },
  resumeText: { color: "#fff", fontSize: 12, fontWeight: "800" },
});
