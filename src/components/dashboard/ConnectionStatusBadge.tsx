import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useApi } from "@/lib/api/client";
import { formatAgo } from "@/lib/api/format";
import { usePolling } from "@/lib/api/usePolling";
import type { ConnectionStatusResponse, ConnectionStatusValue } from "@/lib/api/types";
import { DashboardColors } from "@/constants/dashboardColors";

// /api/connection-status is a synchronous in-memory read on the backend -- no external
// I/O, so polling tightly costs nothing server-side. Was 7000ms; 3000ms here (a bit more
// conservative than the web dashboard's 2000ms, given mobile battery/data constraints)
// still cuts worst-case staleness by more than half.
const POLL_INTERVAL_MS = 3000;

const STATUS_LABEL: Record<ConnectionStatusValue, string> = {
  live: "MT5 LIVE",
  reconnecting: "MT5 RECONNECTING",
  disconnected: "MT5 DISCONNECTED",
};

const STATUS_COLOR: Record<ConnectionStatusValue, string> = {
  live: DashboardColors.emerald,
  reconnecting: DashboardColors.amber,
  disconnected: DashboardColors.rose,
};

export function ConnectionStatusBadge() {
  const api = useApi();
  const [now, setNow] = useState(() => Date.now());
  const { data } = usePolling(() => api.get<ConnectionStatusResponse>("/api/connection-status"), POLL_INTERVAL_MS);

  // Ticks independently of the poll so "updated Xs ago" stays reasonably fresh between
  // fetches -- matched to POLL_INTERVAL_MS (not 1s): a second-level countdown here would
  // be imperceptible (unlike RiskGuardianBanner's cooldown timer, which genuinely
  // benefits from 1s precision), so there's no reason to run a faster 1Hz timer for the
  // whole time the dashboard is on screen just for this label.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  if (!data) return null;

  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: STATUS_COLOR[data.status] }]} />
      <Text style={styles.label}>{STATUS_LABEL[data.status]}</Text>
      <Text style={styles.ago}>· {formatAgo(data.lastUpdateAt, now)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { color: DashboardColors.textSecondary, fontSize: 12, fontWeight: "600" },
  ago: { color: DashboardColors.textMuted, fontSize: 12 },
});
