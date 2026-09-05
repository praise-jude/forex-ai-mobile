import { StyleSheet, Text, View } from "react-native";
import type { Signal } from "@/lib/api/types";
import { formatPrice } from "@/lib/api/format";
import { DashboardColors } from "@/constants/dashboardColors";

/**
 * Entry ("Point A") -> stop-loss/TP1/TP2 ("Point B") -- every number is the real,
 * already-computed Signal field (see signalEngine.ts's own entry/SL/TP construction),
 * nothing projected or estimated here beyond what the engine already decided. The
 * arrows are a presentation device for a real, already-fixed route, never a claim about
 * a guaranteed future price path.
 */
export function PointRouteCard({ signal }: { signal: Signal }) {
  const isLong = signal.direction === "long";
  const arrow = isLong ? "↗" : "↘";

  return (
    <View style={styles.container}>
      <View style={styles.pointRow}>
        <View style={styles.point}>
          <Text style={styles.pointLabel}>POINT A</Text>
          <Text style={styles.pointHint}>Potential Entry</Text>
          <Text style={styles.pointPrice}>{formatPrice(signal.pair, signal.entry)}</Text>
        </View>
        <Text style={[styles.routeArrows, { color: isLong ? DashboardColors.emerald : DashboardColors.rose }]}>
          {arrow} {arrow} {arrow}
        </Text>
        <View style={styles.point}>
          <Text style={styles.pointLabel}>POINT B</Text>
          <Text style={styles.pointHint}>Projected Target</Text>
          <Text style={styles.pointPrice}>{formatPrice(signal.pair, signal.takeProfit)}</Text>
        </View>
      </View>

      <View style={styles.grid}>
        <View style={styles.gridItem}>
          <Text style={styles.gridLabel}>STOP LOSS</Text>
          <Text style={[styles.gridValue, { color: DashboardColors.rose }]}>{formatPrice(signal.pair, signal.stopLoss)}</Text>
        </View>
        <View style={styles.gridItem}>
          <Text style={styles.gridLabel}>TP1</Text>
          <Text style={[styles.gridValue, { color: DashboardColors.emerald }]}>{formatPrice(signal.pair, signal.takeProfit)}</Text>
        </View>
        <View style={styles.gridItem}>
          <Text style={styles.gridLabel}>TP2</Text>
          <Text style={[styles.gridValue, { color: DashboardColors.emerald }]}>{formatPrice(signal.pair, signal.takeProfit2)}</Text>
        </View>
        <View style={styles.gridItem}>
          <Text style={styles.gridLabel}>RISK/REWARD</Text>
          <Text style={styles.gridValue}>1:{signal.riskReward.toFixed(1)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  pointRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  point: { flex: 1, gap: 2, alignItems: "center" },
  pointLabel: { fontSize: 10, fontWeight: "800", color: DashboardColors.textMuted, letterSpacing: 0.5 },
  pointHint: { fontSize: 10, color: DashboardColors.textMuted },
  pointPrice: { fontSize: 15, fontWeight: "800", color: DashboardColors.textPrimary },
  routeArrows: { fontSize: 16, fontWeight: "800" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  gridItem: { minWidth: "45%", flex: 1, gap: 2 },
  gridLabel: { fontSize: 10, color: DashboardColors.textMuted, letterSpacing: 0.5 },
  gridValue: { fontSize: 13, fontWeight: "700", color: DashboardColors.textPrimary },
});
