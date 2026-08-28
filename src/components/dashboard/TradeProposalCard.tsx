import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { ExecuteResponse, HigherTimeframeTrends, Signal } from "@/lib/api/types";
import { formatPrice } from "@/lib/api/format";
import { DashboardColors } from "@/constants/dashboardColors";
import { CONFLUENCE_LABEL } from "./SignalsList";

const TREND_ARROW: Record<HigherTimeframeTrends["d1"], string> = { bullish: "▲", bearish: "▼", neutral: "▬" };
const TREND_COLOR: Record<HigherTimeframeTrends["d1"], string> = {
  bullish: DashboardColors.emerald,
  bearish: DashboardColors.rose,
  neutral: DashboardColors.textMuted,
};

const NEWS_LABEL: Record<Signal["newsStatus"], string> = {
  clear: "Low",
  high_impact_soon: "High",
  unavailable: "Unknown",
};

function secondsRemaining(createdAt: number, ttlSeconds: number, now: number): number {
  return Math.max(0, Math.ceil((createdAt + ttlSeconds * 1000 - now) / 1000));
}

// Same as forex-ai's own TradeProposalCard.tsx -- how long an EXPIRED card stays
// visible before it closes itself.
const AUTO_DISMISS_AFTER_EXPIRED_MS = 4000;

/**
 * The AI prepares the complete trade -- it never places it. Rendered in place of the
 * old immediate-execute Buy/Sell button once a proposal is opened; nothing here can
 * itself cause an order to reach MT5 except the explicit Approve action, which the
 * execute route re-validates from scratch (price drift, spread, every risk limit) and
 * will also reject outright once `ttlSeconds` after the signal's own createdAt has
 * passed -- the countdown below is a display of that same server-enforced rule, not a
 * separate client-only limit. RN port of forex-ai's TradeProposalCard.tsx.
 */
export function TradeProposalCard({
  signal,
  trends,
  ttlSeconds,
  defaultRiskPct,
  busy,
  onApprove,
  onReject,
  onDismiss,
}: {
  signal: Signal;
  trends: HigherTimeframeTrends | undefined;
  ttlSeconds: number;
  defaultRiskPct: number;
  busy: boolean;
  onApprove: (riskPctOverride: number) => void;
  onReject: () => Promise<void>;
  /** Closes the card after Wait -- nothing logged, the signal stays in Active Signals
   * so tapping Buy/Sell again reopens a proposal for it until it ages out. */
  onDismiss: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [editingRisk, setEditingRisk] = useState(false);
  const [riskInput, setRiskInput] = useState(String(defaultRiskPct));
  const [rejecting, setRejecting] = useState(false);

  async function handleReject() {
    setRejecting(true);
    try {
      await onReject();
    } finally {
      setRejecting(false);
      onDismiss();
    }
  }

  useEffect(() => {
    const tickId = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tickId);
  }, []);

  const remaining = secondsRemaining(signal.createdAt, ttlSeconds, now);
  const expired = remaining <= 0;

  // Same reasoning as forex-ai's own TradeProposalCard.tsx: auto-closes a few seconds
  // after expiring instead of sitting there forever. Via a ref, not a dependency, so
  // the per-second `now` tick above can't keep resetting this timer before it fires --
  // it only (re)starts on the one real transition that matters, expired false -> true.
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);
  useEffect(() => {
    if (!expired) return;
    const timeoutId = setTimeout(() => onDismissRef.current(), AUTO_DISMISS_AFTER_EXPIRED_MS);
    return () => clearTimeout(timeoutId);
  }, [expired]);
  const isLong = signal.direction === "long";
  const riskPct = Number(riskInput) > 0 ? Number(riskInput) : defaultRiskPct;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.headerText}>
          {signal.pair} — {signal.timeframe} {isLong ? "BUY" : "SELL"} PROPOSAL
        </Text>
        <Text style={[styles.countdown, { color: expired ? DashboardColors.rose : DashboardColors.textMuted }]}>
          {expired ? "EXPIRED" : `${remaining}s`}
        </Text>
      </View>

      {trends && (
        <View style={styles.trendRow}>
          <Text style={styles.trendText}>
            D1 <Text style={{ color: TREND_COLOR[trends.d1] }}>{TREND_ARROW[trends.d1]}</Text>
          </Text>
          <Text style={styles.trendText}>
            H4 <Text style={{ color: TREND_COLOR[trends.h4] }}>{TREND_ARROW[trends.h4]}</Text>
          </Text>
          <Text style={styles.trendText}>
            H1 <Text style={{ color: TREND_COLOR[trends.h1] }}>{TREND_ARROW[trends.h1]}</Text>
          </Text>
          <Text style={[styles.trendText, styles.scoreText]}>Score {signal.confidence.toFixed(0)}/100</Text>
        </View>
      )}

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
          <Text style={styles.gridLabel}>R:R</Text>
          <Text style={styles.gridValue}>1:{signal.riskReward.toFixed(1)}</Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.metaText}>News risk: {NEWS_LABEL[signal.newsStatus]}</Text>
        <Text style={styles.metaText}>Session: {signal.session}</Text>
      </View>
      {signal.confluences.length > 0 && (
        <Text style={styles.metaText}>{signal.confluences.map((c) => CONFLUENCE_LABEL[c]).join(" · ")}</Text>
      )}

      <View style={styles.riskRow}>
        <Text style={styles.metaText}>Risk</Text>
        {editingRisk ? (
          <TextInput
            value={riskInput}
            onChangeText={setRiskInput}
            onBlur={() => setEditingRisk(false)}
            keyboardType="decimal-pad"
            autoFocus
            style={styles.riskInput}
          />
        ) : (
          <Pressable onPress={() => setEditingRisk(true)}>
            <Text style={styles.riskValue}>{riskPct}%</Text>
          </Pressable>
        )}
        <Text style={styles.metaText}>of equity</Text>
      </View>

      <View style={styles.actionsRow}>
        <Pressable
          disabled={busy || expired}
          onPress={() => onApprove(riskPct)}
          style={[styles.approveButton, (busy || expired) && styles.disabled]}
        >
          {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.approveText}>🟢 Approve & Execute</Text>}
        </Pressable>
        <Pressable disabled={busy || rejecting} onPress={handleReject} style={[styles.secondaryButton, (busy || rejecting) && styles.disabled]}>
          <Text style={styles.secondaryText}>{rejecting ? "…" : "🔴 Reject"}</Text>
        </Pressable>
        <Pressable disabled={busy || rejecting} onPress={onDismiss} style={[styles.secondaryButton, (busy || rejecting) && styles.disabled]}>
          <Text style={styles.secondaryText}>⏸ Wait</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 8, borderRadius: 10, borderWidth: 1, borderColor: "rgba(56,189,248,0.35)", backgroundColor: "rgba(2,132,199,0.08)", padding: 10 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerText: { fontSize: 12, fontWeight: "700", color: DashboardColors.sky },
  countdown: { fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] },
  trendRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 },
  trendText: { fontSize: 11, color: DashboardColors.textMuted },
  scoreText: { marginLeft: "auto" },
  grid: { flexDirection: "row", marginTop: 8, gap: 8 },
  gridItem: { flex: 1 },
  gridLabel: { fontSize: 10, color: DashboardColors.textMuted },
  gridValue: { fontSize: 12, fontWeight: "600", color: DashboardColors.textPrimary, marginTop: 1, fontVariant: ["tabular-nums"] },
  metaRow: { flexDirection: "row", gap: 12, marginTop: 6 },
  metaText: { fontSize: 11, color: DashboardColors.textMuted },
  riskRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, borderTopWidth: 1, borderTopColor: DashboardColors.border, paddingTop: 8 },
  riskInput: {
    width: 60,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: DashboardColors.border,
    backgroundColor: DashboardColors.background,
    color: DashboardColors.textPrimary,
    fontSize: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  riskValue: { fontSize: 12, fontWeight: "600", color: DashboardColors.textPrimary, textDecorationLine: "underline" },
  actionsRow: { flexDirection: "row", gap: 6, marginTop: 8 },
  approveButton: { flex: 1, borderRadius: 8, backgroundColor: DashboardColors.emeraldStrong, paddingVertical: 8, alignItems: "center", justifyContent: "center" },
  approveText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  secondaryButton: { borderRadius: 8, borderWidth: 1, borderColor: DashboardColors.border, backgroundColor: DashboardColors.surfaceAlt, paddingVertical: 8, paddingHorizontal: 10, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: DashboardColors.textSecondary, fontSize: 12, fontWeight: "600" },
  disabled: { opacity: 0.5 },
});

export function describeExecuteResponse(result: ExecuteResponse): string {
  switch (result.status) {
    case "filled":
      return `Filled @ ${result.trade.filledEntry ?? result.trade.requestedEntry}`;
    case "rejected":
      return `Rejected: ${result.trade.rejectReason ?? "unknown reason"}`;
    case "blocked":
      return `Blocked: ${result.reason}`;
    case "skipped_sizing":
      return `Skipped: ${result.reason}`;
    case "duplicate":
      return "Already executed";
    case "not_found":
      return "Signal expired";
    case "expired":
      return "Proposal expired — market moved on, wait for a new setup";
    case "confirmation_required":
      return "Could not confirm this trade — try again";
    case "network_error":
      return "Network error — try again";
  }
}
