import { StyleSheet, Text, View } from "react-native";
import { useApi } from "@/lib/api/client";
import { usePolling } from "@/lib/api/usePolling";
import type { ConfidenceCalibrationBucket, JournalResponse } from "@/lib/api/types";
import { DashboardColors } from "@/constants/dashboardColors";

// Trades close on the order of minutes to hours, not seconds -- matches the Journal
// screen's own poll interval for the same /api/trade-journal endpoint.
const POLL_INTERVAL_MS = 15000;

const TIER_LABEL: Record<ConfidenceCalibrationBucket["tier"], string> = {
  buy: "Buy (90-94)",
  strong_buy: "Strong buy (95-100)",
};

/** RN port of forex-ai's app/settings/page.tsx CalibrationRow -- real historical
 * performance per confidence tier, so "95% confidence" can be checked against what
 * actually happened instead of trusted as a probability. Read-only measurement, never
 * wired into position sizing. */
function CalibrationRow({ bucket, minSamples }: { bucket: ConfidenceCalibrationBucket; minSamples: number }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <Text style={styles.tierLabel}>{TIER_LABEL[bucket.tier]}</Text>
        <Text style={styles.sampleCount}>{bucket.sampleSize} closed trades</Text>
      </View>
      {bucket.status === "insufficient_data" ? (
        <Text style={styles.insufficientText}>
          Insufficient data — needs {minSamples}, have {bucket.sampleSize}. Using base risk only; no calibrated adjustment is
          possible yet.
        </Text>
      ) : (
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Real win rate</Text>
            <Text style={styles.statValue}>{bucket.winRate?.toFixed(1)}%</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Average R</Text>
            <Text style={styles.statValue}>{bucket.averageR?.toFixed(2)}R</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Expectancy</Text>
            <Text style={styles.statValue}>{bucket.expectancy?.toFixed(2)}R</Text>
          </View>
        </View>
      )}
    </View>
  );
}

export function ConfidenceCalibrationCard() {
  const api = useApi();
  const { data } = usePolling(() => api.get<JournalResponse>("/api/trade-journal"), POLL_INTERVAL_MS);

  if (!data) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Confidence calibration</Text>
      <Text style={styles.subtitle}>
        Real historical performance per confidence tier — confidence-weighted sizing will only ever use these numbers once a
        tier has enough samples to trust, never the raw AI score alone.
      </Text>
      {data.confidenceCalibration.map((bucket) => (
        <CalibrationRow key={bucket.tier} bucket={bucket} minSamples={data.calibrationMinSamples} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  title: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", color: DashboardColors.textMuted },
  subtitle: { fontSize: 11, color: DashboardColors.textMuted, lineHeight: 15 },
  row: { borderRadius: 12, borderWidth: 1, borderColor: DashboardColors.border, backgroundColor: DashboardColors.surfaceAlt, padding: 12, gap: 6 },
  rowHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tierLabel: { fontSize: 13, fontWeight: "700", color: DashboardColors.textPrimary },
  sampleCount: { fontSize: 11, color: DashboardColors.textMuted },
  insufficientText: { fontSize: 12, color: DashboardColors.amber, lineHeight: 16 },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  statItem: { gap: 1 },
  statLabel: { fontSize: 10, color: DashboardColors.textMuted },
  statValue: { fontSize: 13, fontWeight: "700", color: DashboardColors.textPrimary, fontVariant: ["tabular-nums"] },
});
