import { StyleSheet, Text, View } from "react-native";
import { DashboardColors } from "@/constants/dashboardColors";

/**
 * Signer B's own independent directional confidence (see PairAnalysisResult.marketBias's
 * doc comment in src/lib/api/types.ts) -- a deliberately SEPARATE reading from
 * ProbabilityBar's BUY/SELL/NO TRADE bar shown above it on the same card. That bar
 * answers "did a genuine trade setup qualify" and correctly shows 0%/0%/100% the moment
 * SMC/Range Engine hit a hard gate -- which is most real checks, even during a clearly-
 * trending, clearly-moving market, since neither engine is built to trade a quiet trend
 * continuation (SMC hunts liquidity-sweep reversals; Range Engine only acts in a ranging
 * regime). This bar answers a different, always-attempted question instead: what does
 * the broader trend/momentum/currency-strength/session read lean toward right now,
 * regardless of whether SMC's own additional structural gates ever found anything.
 *
 * Never a trade signal on its own -- Signer B alone cannot execute anything (see
 * forex-ai's decisionMatrix.ts) -- and never fabricated: "Unavailable" is shown honestly
 * when the same killzone/insufficient-data gates that block the BUY/SELL bar entirely
 * also block this. Mirrors forex-ai's MarketBiasBar.tsx.
 */
export function MarketBiasBar({
  direction,
  confidence,
}: {
  direction: "long" | "short" | "neutral" | "unavailable";
  confidence: number;
}) {
  if (direction === "unavailable") {
    return (
      <View style={styles.unavailableRow}>
        <Text style={styles.unavailableLabel}>MARKET BIAS</Text>
        <Text style={styles.unavailableText}>Unavailable — outside the killzone or not enough data yet</Text>
      </View>
    );
  }

  const label = direction === "long" ? "BUY" : direction === "short" ? "SELL" : "NEUTRAL";
  const color = direction === "long" ? DashboardColors.emerald : direction === "short" ? DashboardColors.rose : DashboardColors.textMuted;
  const pct = direction === "neutral" ? 0 : confidence;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.headerLabel}>MARKET BIAS (SIGNER B — CONTEXT ONLY)</Text>
        <Text style={[styles.pct, { color }]}>
          {label} {Math.round(pct)}%
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(pct)}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 4, width: "100%" },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerLabel: { fontSize: 10, fontWeight: "800", color: DashboardColors.textMuted, letterSpacing: 0.3 },
  pct: { fontSize: 11, fontWeight: "800" },
  track: { height: 5, borderRadius: 3, backgroundColor: DashboardColors.surfaceAlt, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3 },
  unavailableRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, width: "100%" },
  unavailableLabel: { fontSize: 10, fontWeight: "800", color: DashboardColors.textMuted, letterSpacing: 0.3 },
  unavailableText: { fontSize: 10, color: DashboardColors.textMuted, flexShrink: 1, textAlign: "right" },
});
