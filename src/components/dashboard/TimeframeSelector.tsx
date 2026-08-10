import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Timeframe } from "@/lib/api/types";
import { DashboardColors } from "@/constants/dashboardColors";

// The three timeframes that actually have their own independent SMC signal engine
// (see SIGNAL_TIMEFRAMES in forex-ai's metaApiConnection.ts) -- 5m/4h/1d are tracked for
// charting and higher-timeframe trend confirmation, but never generate their own
// predictions, so there's nothing for a user to select them into here. Mirrors web's
// TimeframeSelector.tsx.
const SELECTABLE_TIMEFRAMES: Timeframe[] = ["15m", "30m", "1h"];

export function TimeframeSelector({ value, onChange }: { value: Timeframe; onChange: (timeframe: Timeframe) => void }) {
  return (
    <View style={styles.container}>
      {SELECTABLE_TIMEFRAMES.map((timeframe) => {
        const selected = timeframe === value;
        return (
          <Pressable key={timeframe} onPress={() => onChange(timeframe)} style={[styles.pill, selected && styles.pillSelected]}>
            <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{timeframe}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "center", gap: 2, borderRadius: 8, backgroundColor: DashboardColors.surfaceAlt, padding: 2 },
  pill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  pillSelected: { backgroundColor: DashboardColors.skyBg },
  pillText: { fontSize: 11, fontWeight: "700", color: DashboardColors.textMuted },
  pillTextSelected: { color: DashboardColors.sky },
});
