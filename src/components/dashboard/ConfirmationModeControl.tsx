import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useIsFocused } from "expo-router";
import { useApi } from "@/lib/api/client";
import { usePolledResource } from "@/lib/api/usePolledResource";
import { DashboardColors } from "@/constants/dashboardColors";

type ManualMode = "signal_only" | "confirm";

interface ConfirmationModeResponse {
  manualMode: ManualMode;
  proposalTtlSeconds: number;
}

const POLL_INTERVAL_MS = 15000;

const MODE_LABEL: Record<ManualMode, string> = {
  signal_only: "SIGNAL ONLY — no Buy/Sell shown",
  confirm: "CONFIRM — Buy/Sell shown",
};

/**
 * Whether a fired signal shows a Buy/Sell (Approve) affordance at all. "confirm"
 * (default) shows the Trade Proposal card with Approve/Reject; "signal_only" shows the
 * signal but nothing to act on -- this control existed as an API-only setting with no
 * UI anywhere before (web or mobile), which is exactly why "why don't I have a Buy/Sell
 * button" was unanswerable from inside the app itself. RN port of forex-ai's
 * ConfirmationModeControl.tsx. No confirmation ceremony needed, unlike EngineModeControl's
 * LIVE path -- both values here are safe, neither auto-executes.
 */
export function ConfirmationModeControl() {
  const api = useApi();
  // Rendered on both the Dashboard tab and the Settings tab -- both stay mounted
  // simultaneously under NativeTabs, same reasoning as EngineModeControl/
  // ExecutionPolicyControl.
  const isFocused = useIsFocused();
  const { data, setData } = usePolledResource(
    "confirmation-mode",
    () => api.get<ConfirmationModeResponse>("/api/confirmation-mode"),
    POLL_INTERVAL_MS,
    isFocused
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setMode(manualMode: ManualMode) {
    setBusy(true);
    setError(null);
    try {
      const json = await api.post<ConfirmationModeResponse>("/api/confirmation-mode", { manualMode });
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  if (!data) return null;

  return (
    <View style={styles.container}>
      <View style={[styles.badge, data.manualMode === "confirm" ? styles.badgeOn : styles.badgeOff]}>
        <Text style={[styles.badgeText, { color: data.manualMode === "confirm" ? DashboardColors.emerald : DashboardColors.textSecondary }]}>
          {MODE_LABEL[data.manualMode]}
        </Text>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.row}>
        {data.manualMode !== "confirm" && (
          <Pressable disabled={busy} onPress={() => setMode("confirm")} style={styles.confirmButton}>
            <Text style={styles.confirmButtonText}>Show Buy/Sell buttons</Text>
          </Pressable>
        )}
        {data.manualMode !== "signal_only" && (
          <Pressable disabled={busy} onPress={() => setMode("signal_only")} style={styles.signalOnlyButton}>
            <Text style={styles.signalOnlyButtonText}>Signal Only (hide buttons)</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  badge: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  badgeOn: { backgroundColor: DashboardColors.emeraldBg },
  badgeOff: { backgroundColor: DashboardColors.surfaceAlt },
  badgeText: { fontSize: 11, fontWeight: "700" },
  error: { fontSize: 12, color: DashboardColors.rose },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  confirmButton: { borderRadius: 8, backgroundColor: DashboardColors.sky, paddingHorizontal: 10, paddingVertical: 6 },
  confirmButtonText: { color: "#04202f", fontSize: 12, fontWeight: "700" },
  signalOnlyButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: DashboardColors.border,
    backgroundColor: DashboardColors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  signalOnlyButtonText: { color: DashboardColors.textSecondary, fontSize: 12, fontWeight: "700" },
});
