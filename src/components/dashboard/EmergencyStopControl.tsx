import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useApi } from "@/lib/api/client";
import type { CloseAllResult } from "@/lib/api/types";
import { DashboardColors } from "@/constants/dashboardColors";

/**
 * Pairs with KillSwitchControl (which stops new trades from being opened) -- this is
 * the destructive counterpart: closes every currently-open position on whichever
 * account a tap targets. Gated behind its own confirm dialog, same "resuming/destructive
 * actions get a confirm, pausing doesn't" asymmetry KillSwitchControl already
 * establishes. RN port of forex-ai's EmergencyStopControl.tsx.
 */
export function EmergencyStopControl({ account = "live" }: { account?: "live" | "demo" }) {
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CloseAllResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function closeAll() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const data = await api.post<CloseAllResult>("/api/positions/close-all");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  function confirmCloseAll() {
    Alert.alert(`Close ALL open ${account.toUpperCase()} positions?`, "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Close All", style: "destructive", onPress: () => void closeAll() },
    ]);
  }

  return (
    <View style={styles.row}>
      <Pressable disabled={busy} onPress={confirmCloseAll} style={[styles.button, busy && styles.disabled]}>
        <Text style={styles.buttonText}>{busy ? "Closing…" : "🛑 Close All Positions"}</Text>
      </Pressable>
      {error && <Text style={styles.error}>{error}</Text>}
      {result && (
        <Text style={styles.resultText}>
          Closed {result.closed.length}
          {result.failed.length > 0 && <Text style={{ color: DashboardColors.amber }}> · {result.failed.length} failed</Text>}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  button: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(159,18,57,0.6)",
    backgroundColor: DashboardColors.surface,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  disabled: { opacity: 0.6 },
  buttonText: { fontSize: 12, fontWeight: "800", color: DashboardColors.rose },
  error: { fontSize: 12, color: DashboardColors.rose },
  resultText: { fontSize: 12, color: DashboardColors.textMuted },
});
