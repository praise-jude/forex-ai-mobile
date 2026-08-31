import { StyleSheet, Text, View } from "react-native";
import type { HigherTimeframeTrends } from "@/lib/api/types";
import { DashboardColors } from "@/constants/dashboardColors";

type BigDirection = "up" | "down" | "mixed";

// Mirrors forex-ai's web TrendDirectionBadge.tsx. Majority of the same D1/H4/H1
// EMA50/200 reads -- 2-of-3 agreeing wins; anything else (a genuine split, or any
// "neutral" reads pulling it apart) is honestly shown as MIXED rather than picking a
// side arbitrarily.
function bigDirection(trends: HigherTimeframeTrends): BigDirection {
  const values = [trends.d1, trends.h4, trends.h1];
  const bullish = values.filter((v) => v === "bullish").length;
  const bearish = values.filter((v) => v === "bearish").length;
  if (bullish >= 2) return "up";
  if (bearish >= 2) return "down";
  return "mixed";
}

const CONFIG: Record<BigDirection, { arrow: string; label: string; color: string; background: string; border: string }> = {
  up: { arrow: "▲", label: "UP", color: DashboardColors.emerald, background: DashboardColors.emeraldBg, border: DashboardColors.emeraldStrong },
  down: { arrow: "▼", label: "DOWN", color: DashboardColors.rose, background: DashboardColors.roseBg, border: DashboardColors.roseStrong },
  mixed: { arrow: "—", label: "MIXED", color: DashboardColors.textSecondary, background: DashboardColors.surfaceAlt, border: DashboardColors.border },
};

/**
 * A single big, always-visible verdict for the currently selected pair -- mirrors
 * forex-ai's web TrendDirectionBadge.tsx. Purely a re-summary of real data this app
 * already computes and receives elsewhere (D1/H4/H1 trend), never a new signal or a
 * reason to trade on its own.
 */
export function TrendDirectionBadge({ trends }: { trends: HigherTimeframeTrends | undefined }) {
  if (!trends) return null;
  const config = CONFIG[bigDirection(trends)];

  return (
    <View style={[styles.badge, { backgroundColor: config.background, borderColor: config.border }]}>
      <Text style={[styles.arrow, { color: config.color }]}>{config.arrow}</Text>
      <Text style={[styles.label, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  arrow: { fontSize: 20, lineHeight: 22 },
  label: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
});
