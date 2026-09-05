import { StyleSheet, Text, View } from "react-native";
import { DashboardColors } from "@/constants/dashboardColors";

/**
 * The real 3-way BUY/SELL/NO-TRADE distribution from a PairAnalysisResult (see
 * pairAnalysisJob.ts's normalizeDirectionalPercentages -- always sums to 100, every
 * input a real Signer A score, never independently invented). BUY=emerald,
 * SELL=rose, NO TRADE=muted gray, matching this app's existing tone convention
 * (DirectionBadge.tsx). `compact` drops the row labels for the in-progress mini
 * readout (AnalysisProgressScreen); the full result card uses the non-compact form.
 */
export function ProbabilityBar({
  buyPct,
  sellPct,
  noTradePct,
  compact = false,
}: {
  buyPct: number;
  sellPct: number;
  noTradePct: number;
  compact?: boolean;
}) {
  const rows: { key: string; label: string; pct: number; color: string }[] = [
    { key: "buy", label: "BUY", pct: buyPct, color: DashboardColors.emerald },
    { key: "sell", label: "SELL", pct: sellPct, color: DashboardColors.rose },
    { key: "no_trade", label: "NO TRADE", pct: noTradePct, color: DashboardColors.textMuted },
  ];

  return (
    <View style={styles.container}>
      {rows.map((row) => (
        <View key={row.key} style={compact ? styles.compactRow : styles.row}>
          {!compact && <Text style={[styles.label, { color: row.color }]}>{row.label}</Text>}
          <View style={[styles.track, compact && styles.compactTrack]}>
            <View style={[styles.fill, { width: `${Math.round(row.pct)}%`, backgroundColor: row.color }]} />
          </View>
          <Text style={[styles.pct, { color: row.color }]}>{Math.round(row.pct)}%</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6, width: "100%" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  compactRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  label: { fontSize: 11, fontWeight: "800", width: 68 },
  track: { flex: 1, height: 10, borderRadius: 5, backgroundColor: DashboardColors.surfaceAlt, overflow: "hidden" },
  compactTrack: { height: 5, borderRadius: 3 },
  fill: { height: "100%", borderRadius: 5 },
  pct: { fontSize: 11, fontWeight: "800", width: 36, textAlign: "right" },
});
