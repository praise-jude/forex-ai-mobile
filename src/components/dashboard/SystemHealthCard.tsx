import { memo } from "react";
import { useIsFocused } from "expo-router";
import { useApi } from "@/lib/api/client";
import { usePolling } from "@/lib/api/usePolling";
import { StyleSheet, Text, View } from "react-native";
import type { AccountKey, SystemHealthAccount, SystemHealthResponse } from "@/lib/api/types";
import { DashboardColors } from "@/constants/dashboardColors";

// Every field here is already cached/fetched by the persistent live/demo MetaApi
// connection server-side -- polling this is a synchronous in-memory read with no real
// network round-trip on each tick, same as the web dashboard's SystemHealthPanel.
const POLL_INTERVAL_MS = 10000;

function CheckRow({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <View style={styles.checkRow}>
      <Text style={styles.checkLabel}>{label}</Text>
      <View style={styles.checkValueRow}>
        <View style={[styles.dot, { backgroundColor: ok ? DashboardColors.emerald : DashboardColors.rose }]} />
        <Text style={[styles.checkValue, { color: ok ? DashboardColors.textPrimary : DashboardColors.rose }]}>{value}</Text>
      </View>
    </View>
  );
}

function AccountHealthBlock({ account, health }: { account: AccountKey; health: SystemHealthAccount }) {
  const connected = health.connectionStatus.status === "live";
  const info = health.accountInfo;
  const freshPairs = health.pairs.filter((p) => !p.stale).length;

  return (
    <View style={styles.accountBlock}>
      <Text style={styles.accountTitle}>{account === "live" ? "Live" : "Demo"}</Text>
      <CheckRow label="MT5 connection" ok={connected} value={connected ? "Connected" : health.connectionStatus.status} />
      {info ? (
        <>
          <CheckRow label="Trading permission" ok={info.tradeAllowed} value={info.tradeAllowed ? "Enabled" : "Disabled"} />
          <View style={styles.checkRow}>
            <Text style={styles.checkLabel}>Balance / Equity</Text>
            <Text style={styles.checkValue}>
              {info.balance.toFixed(2)} / {info.equity.toFixed(2)}
            </Text>
          </View>
          <View style={styles.checkRow}>
            <Text style={styles.checkLabel}>Free margin</Text>
            <Text style={styles.checkValue}>{info.freeMargin.toFixed(2)}</Text>
          </View>
        </>
      ) : (
        <CheckRow label="Account info" ok={false} value="Unavailable" />
      )}
      <View style={styles.checkRow}>
        <Text style={styles.checkLabel}>Pairs ticking</Text>
        <Text style={styles.checkValue}>
          {freshPairs} / {health.pairs.length}
        </Text>
      </View>
    </View>
  );
}

// Memoized (zero props -- always "equal" once mounted) so unrelated re-renders of the
// Settings screen (e.g. every keystroke in the server URL/password fields) don't also
// re-render this. Also gated on tab focus -- Settings stays mounted under NativeTabs
// even while another tab is active, so this would otherwise keep polling in the
// background regardless of which screen is actually visible.
export const SystemHealthCard = memo(function SystemHealthCard() {
  const api = useApi();
  const isFocused = useIsFocused();
  const { data } = usePolling(() => api.get<SystemHealthResponse>("/api/system-health"), POLL_INTERVAL_MS, isFocused);

  if (!data) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>System health</Text>
      <AccountHealthBlock account="live" health={data.live} />
      {data.demo && <AccountHealthBlock account="demo" health={data.demo} />}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { gap: 10 },
  title: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", color: DashboardColors.textMuted },
  accountBlock: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: DashboardColors.border,
    backgroundColor: DashboardColors.surfaceAlt,
    padding: 12,
    gap: 6,
  },
  accountTitle: { fontSize: 12, fontWeight: "800", color: DashboardColors.textPrimary, marginBottom: 2 },
  checkRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  checkLabel: { fontSize: 12, color: DashboardColors.textSecondary },
  checkValueRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  checkValue: { fontSize: 12, fontWeight: "700", color: DashboardColors.textPrimary, fontVariant: ["tabular-nums"] },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
});
