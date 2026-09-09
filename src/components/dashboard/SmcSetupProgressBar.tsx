import { StyleSheet, Text, View } from "react-native";
import { DashboardColors } from "@/constants/dashboardColors";

/**
 * SMC's own genuine progress toward a real setup (see PairAnalysisResult.smcSetupProgress's
 * doc comment in src/lib/api/types.ts). `pct` is null (never fabricated) for a reason with
 * no natural continuous ratio -- rendered as label-only, no bar, in that case. Mirrors
 * forex-ai's SmcSetupProgressBar.tsx.
 */
export function SmcSetupProgressBar({ pct, label }: { pct: number | null; label: string }) {
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.headerLabel}>SMC SETUP PROGRESS</Text>
        <Text style={styles.value}>{pct === null ? label : `${label} (${Math.round(pct)}%)`}</Text>
      </View>
      {pct !== null && (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.round(pct)}%` }]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 4, width: "100%" },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  headerLabel: { fontSize: 10, fontWeight: "800", color: DashboardColors.textMuted, letterSpacing: 0.3 },
  value: { fontSize: 11, fontWeight: "800", color: DashboardColors.sky, flexShrink: 1, textAlign: "right" },
  track: { height: 5, borderRadius: 3, backgroundColor: DashboardColors.surfaceAlt, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3, backgroundColor: DashboardColors.sky },
});
