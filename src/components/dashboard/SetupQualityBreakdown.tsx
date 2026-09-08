import { StyleSheet, Text, View } from "react-native";
import type { MarketRegime, Signal } from "@/lib/api/types";
import { scoreSetupQuality } from "@/lib/api/setupQualityScore";
import { DashboardColors } from "@/constants/dashboardColors";
import { ConfirmationRow } from "./SignerBBreakdown";

/**
 * Mirrors forex-ai's web SetupQualityBreakdown.tsx: transparent 7-category breakdown of
 * a fired signal's own real data -- explicitly not a claimed "% chance of winning", just
 * how well-confirmed the setup is by data the engine already computed.
 */
export function SetupQualityBreakdown({ signal, regime }: { signal: Signal; regime: MarketRegime }) {
  const score = scoreSetupQuality(signal, regime);

  return (
    <View>
      <View style={styles.headerRow}>
        <Text style={styles.headerLabel}>Setup quality</Text>
        <Text style={styles.headerValue}>{score.total}/100</Text>
      </View>
      <View style={styles.rows}>
        <ConfirmationRow label="SMC (zone/entry)" value={`${score.smc}/30`} tone="neutral" />
        <ConfirmationRow label="Trend" value={`${score.trend}/20`} tone="neutral" />
        <ConfirmationRow label="Momentum" value={`${score.momentum}/15`} tone="neutral" />
        <ConfirmationRow label="Liquidity" value={`${score.liquidity}/10`} tone="neutral" />
        <ConfirmationRow label="Volatility" value={`${score.volatility}/10`} tone="neutral" />
        <ConfirmationRow label="News risk" value={`${score.newsRisk}/10`} tone="neutral" />
        <ConfirmationRow label="Session" value={`${score.session}/5`} tone="neutral" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerLabel: { fontSize: 11, color: DashboardColors.textMuted },
  headerValue: { fontSize: 11, fontWeight: "700", color: DashboardColors.textSecondary },
  rows: { marginTop: 4, gap: 4 },
});
