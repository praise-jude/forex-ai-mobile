import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useIsFocused } from "expo-router";
import { useApi } from "@/lib/api/client";
import { usePolledResource } from "@/lib/api/usePolledResource";
import type { EngineMode, EngineModeResponse } from "@/lib/api/types";
import { DashboardColors } from "@/constants/dashboardColors";

const LIVE_CONFIRMATION_PHRASE = "ENABLE LIVE TRADING";
const POLL_INTERVAL_MS = 7000;

const MODE_LABEL: Record<EngineMode, string> = {
  analysis: "ANALYSIS ONLY",
  demo: "DEMO AUTO-TRADE",
  live: "LIVE AUTO-TRADE",
};

const MODE_COLOR: Record<EngineMode, { bg: string; text: string }> = {
  analysis: { bg: DashboardColors.surfaceAlt, text: DashboardColors.textSecondary },
  demo: { bg: DashboardColors.skyBg, text: DashboardColors.sky },
  live: { bg: DashboardColors.roseBg, text: DashboardColors.rose },
};

export function EngineModeControl() {
  const api = useApi();
  // Rendered on both the Dashboard tab and the Settings tab, both of which stay
  // mounted simultaneously (expo-router's NativeTabs never unmounts an inactive tab) --
  // each instance gates on its own screen's focus so only the visible one actually
  // contributes to the shared "engine-mode" poll (see usePolledResource's own dedup).
  const isFocused = useIsFocused();
  // Shared with index.tsx, which polls this exact same "engine-mode" key --
  // usePolledResource dedupes them into a single interval/request instead of two.
  const { data, setData } = usePolledResource("engine-mode", () => api.get<EngineModeResponse>("/api/engine-mode"), POLL_INTERVAL_MS, isFocused);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showLiveConfirm, setShowLiveConfirm] = useState(false);
  const [phraseInput, setPhraseInput] = useState("");

  async function setMode(mode: EngineMode, confirmationPhrase?: string) {
    setBusy(true);
    setError(null);
    try {
      const json = await api.post<{ mode?: EngineMode; message?: string }>("/api/engine-mode", { mode, confirmationPhrase });
      if (!json.mode) {
        setError(json.message ?? "Request failed");
        return;
      }
      if (data) setData({ ...data, mode: json.mode });
      setShowLiveConfirm(false);
      setPhraseInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  if (!data) return null;
  const colors = MODE_COLOR[data.mode];

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={[styles.badge, { backgroundColor: colors.bg }]}>
          <Text style={[styles.badgeText, { color: colors.text }]}>MODE: {MODE_LABEL[data.mode]}</Text>
        </View>
        {busy && <ActivityIndicator size="small" color={DashboardColors.textSecondary} />}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.row}>
        {data.mode !== "analysis" && (
          <Pressable disabled={busy} onPress={() => setMode("analysis")} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Back to Analysis</Text>
          </Pressable>
        )}
        {data.mode !== "demo" && (
          <Pressable
            disabled={busy || !data.demoConfigured}
            onPress={() => setMode("demo")}
            style={[styles.demoButton, !data.demoConfigured && styles.disabled]}
          >
            <Text style={styles.demoButtonText}>Enable Demo</Text>
          </Pressable>
        )}
        {data.mode !== "live" && (
          <Pressable disabled={busy} onPress={() => setShowLiveConfirm(true)} style={styles.liveButton}>
            <Text style={styles.liveButtonText}>Enable Live…</Text>
          </Pressable>
        )}
      </View>

      <Modal visible={showLiveConfirm} transparent animationType="fade" onRequestClose={() => setShowLiveConfirm(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Enable live auto-trading?</Text>
            <Text style={styles.modalBody}>
              Type <Text style={styles.modalPhrase}>{LIVE_CONFIRMATION_PHRASE}</Text> to confirm. This places real orders
              automatically the instant a signal is confirmed.
            </Text>
            <TextInput
              value={phraseInput}
              onChangeText={setPhraseInput}
              placeholder={LIVE_CONFIRMATION_PHRASE}
              placeholderTextColor={DashboardColors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              style={styles.modalInput}
            />
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => {
                  setShowLiveConfirm(false);
                  setPhraseInput("");
                }}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={busy || phraseInput.trim() !== LIVE_CONFIRMATION_PHRASE}
                onPress={() => setMode("live", phraseInput)}
                style={[styles.confirmButton, phraseInput.trim() !== LIVE_CONFIRMATION_PHRASE && styles.disabled]}
              >
                <Text style={styles.confirmButtonText}>Confirm</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  error: { fontSize: 12, color: DashboardColors.rose },
  secondaryButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: DashboardColors.border,
    backgroundColor: DashboardColors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  secondaryButtonText: { color: DashboardColors.textSecondary, fontSize: 12, fontWeight: "700" },
  demoButton: { borderRadius: 8, backgroundColor: DashboardColors.sky, paddingHorizontal: 10, paddingVertical: 6 },
  demoButtonText: { color: "#04202f", fontSize: 12, fontWeight: "700" },
  liveButton: { borderRadius: 8, backgroundColor: DashboardColors.roseStrong, paddingHorizontal: 10, paddingVertical: 6 },
  liveButtonText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  disabled: { opacity: 0.4 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: DashboardColors.surface, borderRadius: 16, padding: 18, gap: 12 },
  modalTitle: { fontSize: 16, fontWeight: "800", color: DashboardColors.textPrimary },
  modalBody: { fontSize: 13, color: DashboardColors.textSecondary, lineHeight: 18 },
  modalPhrase: { fontWeight: "800", color: DashboardColors.rose },
  modalInput: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: DashboardColors.roseStrong,
    color: DashboardColors.textPrimary,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 16, alignItems: "center" },
  cancelText: { color: DashboardColors.textSecondary, fontSize: 13, fontWeight: "600" },
  confirmButton: { borderRadius: 8, backgroundColor: DashboardColors.roseStrong, paddingHorizontal: 14, paddingVertical: 8 },
  confirmButtonText: { color: "#fff", fontSize: 13, fontWeight: "800" },
});
