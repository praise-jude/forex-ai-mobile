import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useIsFocused } from "expo-router";
import { useApi } from "@/lib/api/client";
import { usePolledResource } from "@/lib/api/usePolledResource";
import type { ExecutionPolicyResponse } from "@/lib/api/types";
import { DashboardColors } from "@/constants/dashboardColors";

const POLL_INTERVAL_MS = 15000;

/**
 * Operator-only selectivity control for auto-execution -- raises the floor above what
 * already qualifies as a fireable signal (buy/strong_buy tier). Can only ever make
 * execution MORE selective than the shipped default, so unlike EngineModeControl's LIVE
 * path, no confirmation ceremony is needed here. RN port of forex-ai's
 * ExecutionPolicyControl.tsx -- a segmented Pressable pair stands in for the web
 * version's <select> (React Native has no native equivalent).
 */
export function ExecutionPolicyControl() {
  const api = useApi();
  // Rendered on both the Dashboard tab and the Settings tab -- both stay mounted
  // simultaneously under NativeTabs, so this used to poll from both places at once.
  const isFocused = useIsFocused();
  const { data, setData } = usePolledResource("execution-policy", () => api.get<ExecutionPolicyResponse>("/api/execution-policy"), POLL_INTERVAL_MS, isFocused);
  const [minTier, setMinTier] = useState<"buy" | "strong_buy">("buy");
  const [minRiskRewardInput, setMinRiskRewardInput] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Local form state only ever seeds from the polled value, never fights the user's
  // in-progress edits on every poll tick.
  /* eslint-disable react-hooks/set-state-in-effect -- seeding local form state from a polled external resource, not state derivable from render. */
  useEffect(() => {
    if (!data) return;
    setMinTier(data.minTier);
    setMinRiskRewardInput(String(data.minRiskReward));
  }, [data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function save() {
    const minRiskReward = Number(minRiskRewardInput);
    if (!Number.isFinite(minRiskReward) || minRiskReward < 0) {
      setError("Risk/reward must be a number >= 0");
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const json = await api.post<ExecutionPolicyResponse>("/api/execution-policy", { minTier, minRiskReward });
      setData(json);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  if (!data) return null;

  const dirty = minTier !== data.minTier || minRiskRewardInput !== String(data.minRiskReward);

  function selectTier(tier: "buy" | "strong_buy") {
    setMinTier(tier);
    setSaved(false);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Auto-execute floor</Text>

      <View style={styles.tierRow}>
        <Pressable onPress={() => selectTier("buy")} style={[styles.tierButton, minTier === "buy" && styles.tierButtonActive]}>
          <Text style={[styles.tierText, minTier === "buy" && styles.tierTextActive]}>Buy or higher</Text>
        </Pressable>
        <Pressable onPress={() => selectTier("strong_buy")} style={[styles.tierButton, minTier === "strong_buy" && styles.tierButtonActive]}>
          <Text style={[styles.tierText, minTier === "strong_buy" && styles.tierTextActive]}>Strong buy only</Text>
        </Pressable>
      </View>

      <View style={styles.rrRow}>
        <Text style={styles.label}>R:R ≥</Text>
        <TextInput
          value={minRiskRewardInput}
          onChangeText={(text) => {
            setMinRiskRewardInput(text);
            setSaved(false);
          }}
          keyboardType="decimal-pad"
          style={styles.rrInput}
        />
        <Pressable disabled={busy || !dirty} onPress={save} style={[styles.saveButton, (busy || !dirty) && styles.disabled]}>
          <Text style={styles.saveText}>{busy ? "Saving…" : "Save"}</Text>
        </Pressable>
      </View>

      {saved && !dirty && <Text style={styles.savedText}>Saved</Text>}
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  label: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, color: DashboardColors.textMuted },
  tierRow: { flexDirection: "row", gap: 6 },
  tierButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: DashboardColors.border,
    backgroundColor: DashboardColors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tierButtonActive: { borderColor: DashboardColors.sky, backgroundColor: DashboardColors.skyBg },
  tierText: { fontSize: 11, fontWeight: "600", color: DashboardColors.textSecondary },
  tierTextActive: { color: DashboardColors.sky },
  rrRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  rrInput: {
    width: 56,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: DashboardColors.border,
    backgroundColor: DashboardColors.surfaceAlt,
    color: DashboardColors.textPrimary,
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  saveButton: { borderRadius: 8, borderWidth: 1, borderColor: DashboardColors.border, backgroundColor: DashboardColors.surfaceAlt, paddingHorizontal: 10, paddingVertical: 6 },
  disabled: { opacity: 0.4 },
  saveText: { fontSize: 11, fontWeight: "700", color: DashboardColors.textSecondary },
  savedText: { fontSize: 11, color: DashboardColors.emerald },
  errorText: { fontSize: 11, color: DashboardColors.rose },
});
