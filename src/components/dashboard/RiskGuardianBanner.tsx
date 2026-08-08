import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useApi } from "@/lib/api/client";
import { formatRemaining } from "@/lib/api/format";
import { usePolling } from "@/lib/api/usePolling";
import type { RiskStatusResponse } from "@/lib/api/types";
import { DashboardColors } from "@/constants/dashboardColors";

const POLL_INTERVAL_MS = 7000;

/** Renders nothing when nothing is active -- this is a guardian-tripped alert, not a
 * status-quo indicator (ConnectionStatusBadge/EngineModeControl already cover normal state). */
export function RiskGuardianBanner() {
  const api = useApi();
  const { data } = usePolling(() => api.get<RiskStatusResponse>("/api/risk-status"), POLL_INTERVAL_MS);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!data) return null;

  const cooldownActive = data.cooldownUntil !== null && data.cooldownUntil > now;

  if (data.haltedForToday) {
    return (
      <View style={[styles.banner, { borderColor: "#9f1239", backgroundColor: "rgba(159,18,57,0.25)" }]}>
        <Text style={[styles.title, { color: DashboardColors.rose }]}>AUTOPILOT LOCKED</Text>
        <Text style={styles.body}>
          Daily loss limit ({data.maxDailyLossPct}%) reached on {data.account}. No new trades until the next trading day.
        </Text>
      </View>
    );
  }

  if (cooldownActive && data.cooldownUntil) {
    return (
      <View style={[styles.banner, { borderColor: "#b45309", backgroundColor: "rgba(180,83,9,0.25)" }]}>
        <Text style={[styles.title, { color: DashboardColors.amber }]}>COOLDOWN ACTIVE</Text>
        <Text style={styles.body}>
          {data.maxConsecutiveLosses} consecutive losses on {data.account} — resumes in {formatRemaining(data.cooldownUntil, now)}.
        </Text>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  banner: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, gap: 2 },
  title: { fontSize: 13, fontWeight: "800" },
  body: { fontSize: 13, color: DashboardColors.textPrimary },
});
