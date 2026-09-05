import { StyleSheet, Text, View } from "react-native";
import type { PairAnalysisResult, Signal } from "@/lib/api/types";
import { DashboardColors } from "@/constants/dashboardColors";
import { ProbabilityBar } from "./ProbabilityBar";
import { AiConsensusPanel } from "./AiConsensusPanel";
import { PointRouteCard } from "./PointRouteCard";
import { describeNoTradeReason } from "@/lib/api/noTradeReason";

/** The one real "did this fully qualify" check, shared between this card's own STATUS
 * row and OnDemandSignalCheck.tsx's Place Trade gating -- a real signal cleared every
 * SMC/Signer B gate AND every risk-validation check run during analysis. Re-checked
 * again for real at actual execute time regardless (see executionEngine.ts); this is a
 * transparency preview, not the final word. */
export function qualifyingSignal(result: PairAnalysisResult): Signal | null {
  const winning = result.direction === "long" ? result.bullish : result.direction === "short" ? result.bearish : null;
  const winningSignal = winning?.status === "signal" ? winning.signal : null;
  if (!winningSignal) return null;

  const riskAllOk = result.riskValidation
    ? result.riskValidation.spread.allowed &&
      result.riskValidation.priceDrift.allowed &&
      result.riskValidation.correlatedExposure.allowed &&
      result.riskValidation.executionPolicy.allowed
    : false;
  return riskAllOk ? winningSignal : null;
}

const TIMEFRAME_ROW_LABEL: { key: "m15" | "m30" | "h1" | "h4" | "d1"; label: string }[] = [
  { key: "m15", label: "15M" },
  { key: "m30", label: "30M" },
  { key: "h1", label: "1H" },
  { key: "h4", label: "4H" },
  { key: "d1", label: "1D" },
];

function trendLabel(direction: "bullish" | "bearish" | "neutral"): string {
  return direction === "bullish" ? "BUY" : direction === "bearish" ? "SELL" : "NEUTRAL";
}

function trendColor(direction: "bullish" | "bearish" | "neutral"): string {
  return direction === "bullish" ? DashboardColors.emerald : direction === "bearish" ? DashboardColors.rose : DashboardColors.textMuted;
}

/**
 * The final, fully-computed "Check a Pair" result -- section 9 of the spec. Every
 * number/label here traces to a real field on PairAnalysisResult (see
 * pairAnalysisJob.ts); "TRADE QUALIFIED" only ever appears when a real signal cleared
 * every gate AND every risk-validation check. Handing off to the existing Place Trade
 * flow (see OnDemandSignalCheck.tsx) is the caller's responsibility -- this component is
 * display-only and never itself places an order.
 */
export function AnalysisResultCard({ result }: { result: PairAnalysisResult }) {
  const winning = result.direction === "long" ? result.bullish : result.direction === "short" ? result.bearish : null;
  const winningSignal = winning?.status === "signal" ? winning.signal : null;
  const qualifiedSignal = qualifyingSignal(result);
  const qualified = qualifiedSignal !== null;

  const headline = result.conflicted
    ? "⚠️ CONFLICTED ANALYSIS"
    : result.direction === "long"
      ? "🟢 BUY"
      : result.direction === "short"
        ? "🔴 SELL"
        : "⚪ NO TRADE";

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.pair}>{result.pair}</Text>
        <Text style={styles.subheading}>AI TRADE ANALYSIS</Text>
      </View>
      <Text style={styles.headline}>{headline}</Text>

      <ProbabilityBar buyPct={result.buyPct} sellPct={result.sellPct} noTradePct={result.noTradePct} />

      {!winningSignal && (
        <Text style={styles.noTradeReason}>
          {result.direction === "no_trade" && !result.conflicted
            ? (result.bullish?.status === "no_trade" ? describeNoTradeReason(result.bullish.reason, result.regime) : null) ??
              (result.bearish?.status === "no_trade" ? describeNoTradeReason(result.bearish.reason, result.regime) : null) ??
              "No qualifying setup found."
            : null}
        </Text>
      )}

      {winningSignal && (
        <>
          <View style={styles.divider} />
          <PointRouteCard signal={winningSignal} />
        </>
      )}

      <View style={styles.divider} />
      <AiConsensusPanel result={result} />

      <View style={styles.divider} />
      <View style={styles.timeframeRow}>
        {TIMEFRAME_ROW_LABEL.map(({ key, label }) => (
          <View key={key} style={styles.timeframeCell}>
            <Text style={styles.timeframeLabel}>{label}</Text>
            <Text style={[styles.timeframeValue, { color: trendColor(result.timeframeTrends[key]) }]}>
              {trendLabel(result.timeframeTrends[key])}
            </Text>
          </View>
        ))}
      </View>

      {result.riskValidation && (
        <>
          <View style={styles.divider} />
          <View style={styles.riskList}>
            <Text style={styles.subheading}>RISK &amp; TRADE VALIDATION</Text>
            {(
              [
                ["Spread", result.riskValidation.spread],
                ["Price drift", result.riskValidation.priceDrift],
                ["Correlated exposure", result.riskValidation.correlatedExposure],
                ["Execution policy", result.riskValidation.executionPolicy],
              ] as const
            ).map(([label, check]) => (
              <View key={label} style={styles.riskRow}>
                <Text style={styles.riskLabel}>{label}</Text>
                <Text style={[styles.riskValue, { color: check.allowed ? DashboardColors.emerald : DashboardColors.rose }]}>
                  {check.allowed ? "OK" : (check.reason ?? "Blocked")}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}

      <View style={styles.divider} />
      <View style={styles.statusRow}>
        <Text style={styles.statusLabel}>STATUS</Text>
        <Text style={[styles.statusValue, { color: qualified ? DashboardColors.emerald : DashboardColors.textMuted }]}>
          {qualified ? "🟢 TRADE QUALIFIED" : "⚪ NOT QUALIFIED"}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  headerRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  pair: { fontSize: 16, fontWeight: "800", color: DashboardColors.textPrimary },
  subheading: { fontSize: 10, fontWeight: "700", color: DashboardColors.textMuted, letterSpacing: 0.5 },
  headline: { fontSize: 20, fontWeight: "800", color: DashboardColors.textPrimary },
  noTradeReason: { fontSize: 12, color: DashboardColors.textMuted },
  divider: { height: 1, backgroundColor: DashboardColors.border },
  timeframeRow: { flexDirection: "row", justifyContent: "space-between" },
  timeframeCell: { alignItems: "center", gap: 2 },
  timeframeLabel: { fontSize: 10, color: DashboardColors.textMuted },
  timeframeValue: { fontSize: 11, fontWeight: "800" },
  riskList: { gap: 4 },
  riskRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  riskLabel: { fontSize: 11, color: DashboardColors.textMuted },
  riskValue: { fontSize: 11, fontWeight: "700" },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statusLabel: { fontSize: 10, fontWeight: "700", color: DashboardColors.textMuted, letterSpacing: 0.5 },
  statusValue: { fontSize: 13, fontWeight: "800" },
});
