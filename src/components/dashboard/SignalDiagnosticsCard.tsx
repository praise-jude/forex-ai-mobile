import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useIsFocused } from "expo-router";
import { useApi } from "@/lib/api/client";
import { usePolledResource } from "@/lib/api/usePolledResource";
import { PAIRS, type ExecutedTrade, type Pair, type PredictionUpdate, type SignalsSnapshot } from "@/lib/api/types";
import { predictionHeadline, predictionSubline } from "@/lib/api/predictionLabel";
import { describeNoTradeReason, REGIME_LABEL } from "@/lib/api/noTradeReason";
import { DashboardColors } from "@/constants/dashboardColors";
import { DirectionBadge } from "./DirectionBadge";
import { HEADLINE_TONE } from "./PredictionCard";

const POLL_INTERVAL_MS = 10000;

/** The most recently-updated prediction for a pair, across whichever of its concurrent
 * 15m/30m/1h engines last evaluated -- this card is a per-pair overview, not a
 * per-timeframe drilldown (PredictionCard.tsx already covers that on the Dashboard tab
 * for the selected pair/timeframe). RN port of forex-ai's SignalDiagnosticsPanel.tsx. */
function latestForPair(predictions: PredictionUpdate[], pair: Pair): PredictionUpdate | undefined {
  return predictions.filter((p) => p.pair === pair).sort((a, b) => b.time - a.time)[0];
}

/** The most recent execution attempt for a signal, if any -- a fired signal with no
 * match here simply hasn't been approved/auto-fired yet. Never fabricated. */
function executionFor(executedTrades: ExecutedTrade[], signalId: string): ExecutedTrade | undefined {
  return executedTrades.filter((t) => t.signalId === signalId).sort((a, b) => b.attemptedAt - a.attemptedAt)[0];
}

function ExecutionStatus({ trade }: { trade: ExecutedTrade | undefined }) {
  if (!trade) {
    return <Text style={styles.executionMuted}>Not executed — awaiting approval or a mode that auto-executes.</Text>;
  }
  if (trade.status === "filled") {
    return (
      <Text style={styles.executionOk}>
        ✓ Executed — filled @ {trade.filledEntry} ({trade.account})
      </Text>
    );
  }
  if (trade.status === "rejected") {
    return <Text style={styles.executionBad}>✗ Execution rejected — {trade.rejectReason}</Text>;
  }
  return <Text style={styles.executionPending}>… Execution pending ({trade.account})</Text>;
}

/**
 * All-pairs "why did/didn't AutoPilot trade" overview -- built entirely from data the
 * engine already computes (describeNoTradeReason, predictionHeadline) and /api/signals,
 * the same endpoint the Dashboard tab already polls. Nothing new is invented here; this
 * only surfaces what already exists in one scannable place. Memoized (zero props) and
 * gated on tab focus -- Settings stays mounted under NativeTabs even while another tab
 * is active. Shares the "signals" key with index.tsx's own poll of the same endpoint --
 * since each gates on its own screen's focus, only one is ever actually enabled at a
 * time, and usePolledResource makes that a real guarantee.
 */
export const SignalDiagnosticsCard = memo(function SignalDiagnosticsCard() {
  const api = useApi();
  const isFocused = useIsFocused();
  const { data } = usePolledResource("signals", () => api.get<SignalsSnapshot>("/api/signals"), POLL_INTERVAL_MS, isFocused);

  if (!data) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Why is AutoPilot trading (or not) right now?</Text>
      {PAIRS.map((pair) => {
        const update = latestForPair(data.predictions, pair);
        if (!update) {
          return (
            <View key={pair} style={styles.pairRow}>
              <Text style={styles.evaluating}>
                <Text style={styles.pairLabel}>{pair}</Text> — evaluating…
              </Text>
            </View>
          );
        }

        const evaluation = update.evaluation;
        const headline = predictionHeadline(evaluation);
        const subline = predictionSubline(evaluation);
        const signal = evaluation.status === "signal" ? evaluation.signal : null;
        const trade = signal ? executionFor(data.executedTrades, signal.id) : undefined;

        return (
          <View key={pair} style={styles.pairRow}>
            <View style={styles.headerRow}>
              <Text style={styles.pairLabel}>{pair}</Text>
              <DirectionBadge tone={HEADLINE_TONE[headline]} label={headline} />
              <View style={styles.regimeChip}>
                <Text style={styles.regimeChipText}>{REGIME_LABEL[update.regime]}</Text>
              </View>
              {signal && <Text style={styles.confidenceText}>{signal.confidence.toFixed(0)}% confidence</Text>}
            </View>
            {subline && <Text style={styles.sublineText}>{subline}</Text>}
            <Text style={styles.detailText}>
              {signal
                ? `Qualifying ${signal.tier.replace("_", " ")} setup on ${signal.timeframe}.`
                : evaluation.status === "no_trade"
                  ? describeNoTradeReason(evaluation.reason, update.regime)
                  : null}
            </Text>
            {signal && <ExecutionStatus trade={trade} />}
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { gap: 8 },
  title: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", color: DashboardColors.textMuted, marginBottom: 2 },
  pairRow: { borderRadius: 10, borderWidth: 1, borderColor: DashboardColors.border, backgroundColor: DashboardColors.surfaceAlt, padding: 10, gap: 4 },
  headerRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  pairLabel: { fontSize: 13, fontWeight: "700", color: DashboardColors.textPrimary, width: 62 },
  evaluating: { fontSize: 13, color: DashboardColors.textMuted },
  regimeChip: { backgroundColor: DashboardColors.surface, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  regimeChipText: { fontSize: 10, color: DashboardColors.textSecondary },
  confidenceText: { fontSize: 11, color: DashboardColors.textMuted },
  sublineText: { fontSize: 11, color: DashboardColors.textSecondary },
  detailText: { fontSize: 11, color: DashboardColors.textSecondary },
  executionMuted: { fontSize: 11, color: DashboardColors.textMuted },
  executionOk: { fontSize: 11, color: DashboardColors.emerald },
  executionBad: { fontSize: 11, color: DashboardColors.rose },
  executionPending: { fontSize: 11, color: DashboardColors.amber },
});
