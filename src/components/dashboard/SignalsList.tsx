import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { CardStatus, Confluence, Signal } from "@/lib/api/types";
import { formatPrice, relativeTime } from "@/lib/api/format";
import { DashboardColors } from "@/constants/dashboardColors";
import { TradingRobotBadge } from "./TradingRobotBadge";

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
};

const TIER_LABEL: Record<Signal["tier"], string> = {
  strong_buy: "Strong buy",
  buy: "Buy",
  watch: "Watch",
};

function ExecuteControl({ signal, status, onExecute }: { signal: Signal; status: CardStatus; onExecute: () => void }) {
  if (signal.tier === "watch") {
    return <Text style={styles.watchNote}>Below confidence threshold — informational only</Text>;
  }

  const isLong = signal.direction === "long";
  const label = isLong ? "Buy" : "Sell";
  const bg = isLong ? DashboardColors.emeraldStrong : DashboardColors.roseStrong;

  if (status.state === "done") {
    const { result } = status;
    switch (result.status) {
      case "filled":
        return (
          <Text style={[styles.resultText, { color: DashboardColors.emerald }]}>
            Filled @ {formatPrice(signal.pair, result.trade.filledEntry ?? result.trade.requestedEntry)}
          </Text>
        );
      case "rejected":
        return <Text style={[styles.resultText, { color: DashboardColors.rose }]}>Rejected: {result.trade.rejectReason ?? "unknown reason"}</Text>;
      case "blocked":
        return <Text style={[styles.resultText, { color: DashboardColors.amber }]}>Blocked: {result.reason}</Text>;
      case "skipped_sizing":
        return <Text style={[styles.resultText, { color: DashboardColors.amber }]}>Skipped: {result.reason}</Text>;
      case "duplicate":
        return <Text style={[styles.resultText, { color: DashboardColors.textMuted }]}>Already executed</Text>;
      case "not_found":
        return <Text style={[styles.resultText, { color: DashboardColors.rose }]}>Signal expired</Text>;
      case "network_error":
        return <Text style={[styles.resultText, { color: DashboardColors.rose }]}>Network error — try again</Text>;
    }
  }

  return (
    <Pressable disabled={status.state === "loading"} onPress={onExecute} style={[styles.executeButton, { backgroundColor: bg }]}>
      {status.state === "loading" ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.executeText}>{label}</Text>}
    </Pressable>
  );
}

function SignalCard({ signal, status, onExecute }: { signal: Signal; status: CardStatus; onExecute: () => void }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <TradingRobotBadge direction={signal.direction} />
        <View style={styles.cardHeaderRight}>
          <Text style={styles.pair}>{signal.pair}</Text>
          <View style={[styles.tierBadge, { backgroundColor: signal.tier === "watch" ? DashboardColors.amberBg : DashboardColors.skyBg }]}>
            <Text style={[styles.tierText, { color: signal.tier === "watch" ? DashboardColors.amber : DashboardColors.sky }]}>
              {TIER_LABEL[signal.tier]} · {signal.confidence.toFixed(0)}%
            </Text>
          </View>
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

      <View style={styles.footerRow}>
        <Text style={styles.footerText}>
          R:R {signal.riskReward.toFixed(1)} · {signal.session}
        </Text>
        <Text style={styles.footerText}>{relativeTime(signal.createdAt)}</Text>
      </View>

      <ExecuteControl signal={signal} status={status} onExecute={onExecute} />
    </View>
  );
}

export function SignalsList({
  signals,
  statuses,
  onExecute,
}: {
  signals: Signal[];
  statuses: Record<string, CardStatus>;
  onExecute: (signal: Signal) => void;
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
              onExecute={() => onExecute(signal)}
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
  tierBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  tierText: { fontSize: 11, fontWeight: "700" },
  subScore: { fontSize: 10, color: DashboardColors.textMuted },
  grid: { flexDirection: "row", marginTop: 10, gap: 10 },
  gridItem: { flex: 1 },
  gridLabel: { fontSize: 10, color: DashboardColors.textMuted },
  gridValue: { fontSize: 12, fontWeight: "600", color: DashboardColors.textPrimary, marginTop: 1 },
  confluenceRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  confluenceChip: { backgroundColor: DashboardColors.surfaceAlt, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  confluenceText: { fontSize: 10, color: DashboardColors.textSecondary },
  footerRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  footerText: { fontSize: 10, color: DashboardColors.textMuted },
  watchNote: { marginTop: 8, fontSize: 11, fontWeight: "600", color: DashboardColors.textMuted },
  executeButton: { marginTop: 8, borderRadius: 8, paddingVertical: 9, alignItems: "center" },
  executeText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  resultText: { marginTop: 8, fontSize: 12, fontWeight: "600" },
});
