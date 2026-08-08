import { StyleSheet, Text, View } from "react-native";
import { DashboardColors } from "@/constants/dashboardColors";

const CONFIG = {
  long: { name: "JUDE", callout: "BUY NOW", ring: DashboardColors.emerald, bg: DashboardColors.emeraldBg, text: DashboardColors.emerald, arrow: "▲" },
  short: { name: "OMINI", callout: "SELL NOW", ring: DashboardColors.rose, bg: DashboardColors.roseBg, text: DashboardColors.rose, arrow: "▼" },
} as const;

/** The Jude/Omini robot badge: green pointing up for a long signal, red pointing down for short. */
export function TradingRobotBadge({ direction }: { direction: "long" | "short" }) {
  const cfg = CONFIG[direction];
  return (
    <View style={styles.row}>
      <View style={[styles.avatar, { borderColor: cfg.ring, backgroundColor: cfg.bg }]}>
        <Text style={styles.emoji}>🤖</Text>
        <View style={[styles.arrowBadge, { backgroundColor: DashboardColors.surface }]}>
          <Text style={[styles.arrow, { color: cfg.text }]}>{cfg.arrow}</Text>
        </View>
      </View>
      <View>
        <Text style={[styles.name, { color: cfg.text }]}>{cfg.name}</Text>
        <Text style={styles.callout}>{cfg.callout}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  emoji: { fontSize: 20 },
  arrowBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  arrow: { fontSize: 9, fontWeight: "800" },
  name: { fontSize: 13, fontWeight: "800", letterSpacing: 0.4 },
  callout: { fontSize: 11, fontWeight: "700", color: DashboardColors.textSecondary },
});
