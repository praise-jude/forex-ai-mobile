import { StyleSheet, Text, View } from "react-native";
import { DashboardColors } from "@/constants/dashboardColors";

/**
 * "How close is this to having real evidence behind it" -- every insufficient_data
 * calibration/breakdown bucket in this app (confidence calibration, Signer B
 * calibration, confluence-edge analytics) shares the exact same shape (sampleSize vs.
 * a minSamples threshold), so this is the one shared visual for all of them. RN port
 * of forex-ai's ProgressBar.tsx. Amber (not emerald/rose) since this is neither a
 * positive nor negative outcome -- it's progress toward having enough data to know.
 */
export function ProgressBar({ value, max, label }: { value: number; max: number; label?: string }) {
  // max=0 (e.g. a calibration bucket before any threshold is defined) would otherwise
  // divide to Infinity/NaN, producing an invalid "NaN%" width style.
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <View style={styles.container}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
      {label && <Text style={styles.label}>{label}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 4 },
  track: { height: 6, borderRadius: 3, backgroundColor: DashboardColors.surfaceAlt, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: DashboardColors.amber, borderRadius: 3 },
  label: { fontSize: 11, color: DashboardColors.amber },
});
