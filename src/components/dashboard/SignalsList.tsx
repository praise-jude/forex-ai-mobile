import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { CardStatus, Confluence, HigherTimeframeTrends, Signal } from "@/lib/api/types";
import { formatPrice, relativeTime } from "@/lib/api/format";
import { DashboardColors } from "@/constants/dashboardColors";
import { TradingRobotBadge } from "./TradingRobotBadge";
import { DirectionBadge, directionTone } from "./DirectionBadge";
import { SignerBBreakdown } from "./SignerBBreakdown";
import { TradeProposalCard, describeExecuteResponse } from "./TradeProposalCard";

// Exported for reuse by PredictionCard.tsx -- one place a confluence tag's display
// name is defined, not duplicated between the two components that show them.
export const CONFLUENCE_LABEL: Record<Confluence, string> = {
  liquidity_sweep: "Liquidity sweep",
  bos: "Structure break (BOS)",
  choch: "Change of character (CHoCH)",
  fvg: "Fair value gap",
  order_block: "Order block",
  killzone: "Killzone",
  ema_trend: "EMA trend",
  rsi_momentum: "RSI momentum",
  macd_crossover: "MACD",
  volume: "Volume",
  trend_ema_stack: "EMA stack",
  market_structure: "Market structure",
  adx: "ADX",
  candlestick: "Candlestick",
  multi_timeframe: "D1/H4/H1 agreement",
  supertrend: "Supertrend",
  currency_strength: "Currency strength",
  rsi_divergence: "RSI divergence",
};

const TIER_LABEL: Record<Signal["tier"], string> = {
  strong_buy: "Strong buy",
  buy: "Buy",
  watch: "Watch",
};

const RESULT_TONE_COLOR: Record<"positive" | "negative" | "neutral", string> = {
  positive: DashboardColors.emerald,
  negative: DashboardColors.rose,
  neutral: DashboardColors.textMuted,
};

function resultTone(status: string): "positive" | "negative" | "neutral" {
  if (status === "filled") return "positive";
  if (status === "duplicate" || status === "confirmation_required") return "neutral";
  return "negative";
}

/**
 * The AI never places a trade on its own -- a signal only ever becomes a Trade Proposal
 * (see TradeProposalCard) once the user deliberately taps Buy/Sell, and even then
 * nothing reaches MT5 without a further explicit Approve. In "signal_only" mode there's
 * no execute affordance at all. RN port of forex-ai's SignalsPanel.tsx ExecuteControl.
 */
function ExecuteControl({
  signal,
  status,
  trends,
  manualMode,
  ttlSeconds,
  defaultRiskPct,
  onApprove,
  onReject,
}: {
  signal: Signal;
  status: CardStatus;
  trends: HigherTimeframeTrends | undefined;
  manualMode: "signal_only" | "confirm";
  ttlSeconds: number;
  defaultRiskPct: number;
  onApprove: (riskPctOverride: number) => void;
  onReject: () => Promise<void>;
}) {
  const [proposalOpen, setProposalOpen] = useState(false);

  if (signal.tier === "watch") {
    return <Text style={styles.watchNote}>Below confidence threshold — informational only</Text>;
  }

  if (status.state === "done") {
    return (
      <Text style={[styles.resultText, { color: RESULT_TONE_COLOR[resultTone(status.result.status)] }]}>
        {describeExecuteResponse(status.result)}
      </Text>
    );
  }

  if (manualMode === "signal_only") {
    return <Text style={styles.watchNote}>Signal Only mode — nothing executes automatically</Text>;
  }

  if (proposalOpen) {
    return (
      <TradeProposalCard
        signal={signal}
        trends={trends}
        ttlSeconds={ttlSeconds}
        defaultRiskPct={defaultRiskPct}
        busy={status.state === "loading"}
        onApprove={onApprove}
        onReject={onReject}
        onDismiss={() => setProposalOpen(false)}
      />
    );
  }

  const isLong = signal.direction === "long";
  const label = isLong ? "Buy" : "Sell";
  const bg = isLong ? DashboardColors.emeraldStrong : DashboardColors.roseStrong;

  return (
    <Pressable onPress={() => setProposalOpen(true)} style={[styles.executeButton, { backgroundColor: bg }]}>
      <Text style={styles.executeText}>{label}</Text>
    </Pressable>
  );
}

function SignalCard({
  signal,
  status,
  trends,
  manualMode,
  ttlSeconds,
  defaultRiskPct,
  onApprove,
  onReject,
}: {
  signal: Signal;
  status: CardStatus;
  trends: HigherTimeframeTrends | undefined;
  manualMode: "signal_only" | "confirm";
  ttlSeconds: number;
  defaultRiskPct: number;
  onApprove: (riskPctOverride: number) => void;
  onReject: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <TradingRobotBadge direction={signal.direction} />
        <View style={styles.cardHeaderRight}>
          <Text style={styles.pair}>{signal.pair}</Text>
          <DirectionBadge tone={directionTone(signal.direction)} label={`${TIER_LABEL[signal.tier]} · ${signal.confidence.toFixed(0)}% · ${signal.timeframe}`} />
          <Text style={styles.subScore}>
            {signal.source === "tradingview" ? "Source: TradingView" : `Direction ${signal.directionScore.toFixed(0)}% · Entry ${signal.entryScore.toFixed(0)}%`}
          </Text>
        </View>
      </View>

      <View style={styles.grid}>
        <View style={styles.gridItem}>
          <Text style={styles.gridLabel}>Entry</Text>
          <Text style={styles.gridValue}>{formatPrice(signal.pair, signal.entry)}</Text>
        </View>
        <View style={styles.gridItem}>
          <Text style={styles.gridLabel}>SL</Text>
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
      </View>

      {signal.confluences.length > 0 && (
        <View style={styles.confluenceRow}>
          {signal.confluences.map((c) => (
            <View key={c} style={styles.confluenceChip}>
              <Text style={styles.confluenceText}>{CONFLUENCE_LABEL[c]}</Text>
            </View>
          ))}
        </View>
      )}

      {signal.source !== "tradingview" && (
        <>
          <Pressable onPress={() => setExpanded((prev) => !prev)} accessibilityRole="button" accessibilityLabel={expanded ? "Hide analysis" : "View analysis"}>
            <Text style={styles.viewAnalysisText}>{expanded ? "Hide analysis ▲" : "View analysis ▾"}</Text>
          </Pressable>
          {expanded && (
            <View style={styles.signerBBlock}>
              <SignerBBreakdown signal={signal} />
            </View>
          )}
        </>
      )}

      <View style={styles.footerRow}>
        <Text style={styles.footerText}>
          R:R {signal.riskReward.toFixed(1)} · {signal.session}
        </Text>
        <Text style={styles.footerText}>{relativeTime(signal.createdAt)}</Text>
      </View>

      <ExecuteControl
        signal={signal}
        status={status}
        trends={trends}
        manualMode={manualMode}
        ttlSeconds={ttlSeconds}
        defaultRiskPct={defaultRiskPct}
        onApprove={onApprove}
        onReject={onReject}
      />
    </View>
  );
}

export function SignalsList({
  signals,
  statuses,
  trends,
  manualMode,
  ttlSeconds,
  defaultRiskPct,
  onApprove,
  onReject,
}: {
  signals: Signal[];
  statuses: Record<string, CardStatus>;
  /** Per pair/timeframe D1/H4/H1 bias, from the same predictions map Dashboard already
   * keeps -- optional so a signal without a matching prediction just skips the trend row. */
  trends?: Partial<Record<Signal["pair"], Partial<Record<Signal["timeframe"], HigherTimeframeTrends>>>>;
  /** Confirmation Mode's current manual-execution mode -- "signal_only" shows no execute
   * affordance at all, "confirm" is the default propose-then-approve flow. */
  manualMode: "signal_only" | "confirm";
  ttlSeconds: number;
  defaultRiskPct: number;
  onApprove: (signal: Signal, riskPctOverride: number) => void;
  onReject: (signal: Signal) => Promise<void>;
}) {
  return (
    <View>
      <Text style={styles.heading}>Active signals</Text>
      {signals.length === 0 ? (
        <Text style={styles.empty}>No signals yet — watching for setups.</Text>
      ) : (
        <View style={styles.list}>
          {signals.map((signal) => (
            <SignalCard
              key={signal.id}
              signal={signal}
              status={statuses[signal.id] ?? { state: "idle" }}
              trends={trends?.[signal.pair]?.[signal.timeframe]}
              manualMode={manualMode}
              ttlSeconds={ttlSeconds}
              defaultRiskPct={defaultRiskPct}
              onApprove={(riskPctOverride) => onApprove(signal, riskPctOverride)}
              onReject={() => onReject(signal)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: DashboardColors.textMuted,
    marginBottom: 8,
  },
  empty: { textAlign: "center", paddingVertical: 24, color: DashboardColors.textMuted, fontSize: 13 },
  list: { gap: 10 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: DashboardColors.border,
    backgroundColor: DashboardColors.surface,
    padding: 12,
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  cardHeaderRight: { alignItems: "flex-end", gap: 3 },
  pair: { fontSize: 15, fontWeight: "700", color: DashboardColors.textPrimary },
  subScore: { fontSize: 10, color: DashboardColors.textMuted },
  grid: { flexDirection: "row", marginTop: 10, gap: 10 },
  gridItem: { flex: 1 },
  gridLabel: { fontSize: 10, color: DashboardColors.textMuted },
  gridValue: { fontSize: 12, fontWeight: "600", color: DashboardColors.textPrimary, marginTop: 1 },
  confluenceRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  confluenceChip: { backgroundColor: DashboardColors.surfaceAlt, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  confluenceText: { fontSize: 10, color: DashboardColors.textSecondary },
  viewAnalysisText: { marginTop: 10, fontSize: 11, fontWeight: "600", color: DashboardColors.sky },
  signerBBlock: { marginTop: 8, borderTopWidth: 1, borderTopColor: DashboardColors.border, paddingTop: 8 },
  footerRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  footerText: { fontSize: 10, color: DashboardColors.textMuted },
  watchNote: { marginTop: 8, fontSize: 11, fontWeight: "600", color: DashboardColors.textMuted },
  executeButton: { marginTop: 8, borderRadius: 8, paddingVertical: 9, alignItems: "center" },
  executeText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  resultText: { marginTop: 8, fontSize: 12, fontWeight: "600" },
});
