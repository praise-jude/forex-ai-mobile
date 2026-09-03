import { StyleSheet, Text, View } from "react-native";
import { useIsFocused } from "expo-router";
import { useApi } from "@/lib/api/client";
import { usePolling } from "@/lib/api/usePolling";
import { formatDurationRange, formatPrice } from "@/lib/api/format";
import type { DurationStats, OpenPosition, Pair, PositionRiskAssessment, PositionsResponse } from "@/lib/api/types";
import { DashboardColors } from "@/constants/dashboardColors";

// Real closed-trade duration data changes only when a trade actually closes -- far
// rarer than POLL_INTERVAL_MS's 1s cadence, so this gets its own slower interval.
const DURATION_POLL_INTERVAL_MS = 5 * 60_000;

/** Whether an open, currently-losing position has already run longer than 75% of past
 * trades on this pair took to hit their own stop -- a real, data-grounded "this is
 * taking longer than usual to turn around" cue, never an automated close. The app
 * surfaces the signal; the human decides whether to close manually. */
function isRunningLongForALoss(position: OpenPosition, stats: DurationStats | null): boolean {
  if (position.profit >= 0 || position.openedAt === undefined) return false;
  if (stats?.stopLoss.status !== "calibrated" || stats.stopLoss.p75Ms === null) return false;
  return Date.now() - position.openedAt > stats.stopLoss.p75Ms;
}

// Same fix as forex-ai's own PositionsPanel.tsx tonight: 1s instead of 7s so the P/L
// number feels like it's actually counting, matching Exness's own platform -- safe to
// poll this fast since getOpenPositions is a cheap read of MetaApi's already-synced
// local terminal state, never a live broker round-trip. Already gated on `isFocused`
// below, so this only runs while the screen is actually visible.
const POLL_INTERVAL_MS = 1000;

const RISK_BADGE_COLOR: Record<PositionRiskAssessment["level"], string> = {
  aligned: DashboardColors.textMuted,
  caution: DashboardColors.amber,
  warning: DashboardColors.rose,
};

const RISK_BADGE_LABEL: Record<PositionRiskAssessment["level"], string> = {
  aligned: "Aligned",
  caution: "Caution",
  warning: "Warning",
};

function PositionRow({ position, risk, isFocused }: { position: OpenPosition; risk: PositionRiskAssessment | undefined; isFocused: boolean }) {
  const api = useApi();
  const isLong = position.direction === "long";
  const inProfit = position.profit >= 0;
  const { data: durationStats } = usePolling(
    () => api.get<DurationStats>(`/api/trade-journal/duration?pair=${encodeURIComponent(position.pair as Pair)}`),
    DURATION_POLL_INTERVAL_MS,
    isFocused
  );
  const runningLong = isRunningLongForALoss(position, durationStats);
  // Whichever side is actually relevant right now -- a losing position wants the
  // typical time-to-stop window, a winning one wants time-to-target instead. See
  // forex-ai's own PositionsPanel.tsx for the same reasoning.
  const relevantBucket = inProfit ? durationStats?.takeProfit : durationStats?.stopLoss;

  return (
    <View style={styles.row}>
      <View style={styles.topLine}>
        <View style={styles.leftGroup}>
          <Text style={[styles.direction, { color: isLong ? DashboardColors.emerald : DashboardColors.rose }]}>
            {isLong ? "LONG" : "SHORT"}
          </Text>
          <Text style={styles.pair}>{position.pair}</Text>
        </View>
        <Text style={[styles.profit, { color: inProfit ? DashboardColors.emerald : DashboardColors.rose }]}>
          {inProfit ? "+" : ""}
          {position.profit.toFixed(2)}
        </Text>
      </View>
      <View style={styles.bottomLine}>
        <Text style={styles.meta}>{position.lots} lots</Text>
        <Text style={styles.meta}>
          {formatPrice(position.pair, position.openPrice)} → {formatPrice(position.pair, position.currentPrice)}
        </Text>
      </View>
      {/* A real, historically-grounded read on this pair's own past trades -- never a
          timing prediction for THIS position. Reassuring context on a winner, an
          explicit caution cue on a loser running past the typical time-to-stop window. */}
      {relevantBucket?.status === "calibrated" && relevantBucket.p25Ms !== null && relevantBucket.p75Ms !== null && (
        <View style={styles.bottomLine}>
          <Text style={styles.meta}>Typical {inProfit ? "time to target" : "time to stop"}</Text>
          <Text style={styles.meta}>{formatDurationRange(relevantBucket.p25Ms, relevantBucket.p75Ms)}</Text>
        </View>
      )}
      {runningLong && (
        <View style={styles.cautionBanner}>
          <Text style={styles.cautionText}>Open longer than 75% of past losses on this pair took to hit stop — worth a manual look.</Text>
        </View>
      )}
      {risk && (
        <View style={styles.riskLine}>
          <View style={[styles.riskBadge, { backgroundColor: `${RISK_BADGE_COLOR[risk.level]}26` }]}>
            <Text style={[styles.riskBadgeText, { color: RISK_BADGE_COLOR[risk.level] }]}>{RISK_BADGE_LABEL[risk.level]}</Text>
          </View>
          {risk.level !== "aligned" && (
            <View style={styles.riskTextGroup}>
              <Text style={styles.riskReason}>{risk.reason}</Text>
              {/* Mirrors forex-ai's web PositionsPanel.tsx -- only ever set for
                  "caution", a real current distance, never a time estimate. */}
              {risk.distancePct !== null && (
                <Text style={styles.riskDistance}>Gap: {risk.distancePct.toFixed(2)}% (smaller = closer to clearing)</Text>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

export function PositionsList() {
  const api = useApi();
  // Gated on tab focus -- the Dashboard tab stays mounted under NativeTabs even while
  // another tab is active.
  const isFocused = useIsFocused();
  const { data } = usePolling(() => api.get<PositionsResponse>("/api/positions"), POLL_INTERVAL_MS, isFocused);

  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.heading}>Open positions {data ? `(${data.account})` : ""}</Text>
        <Text style={styles.tradesToday}>{data ? `${data.tradesToday} trades today` : ""}</Text>
      </View>
      {!data || data.positions.length === 0 ? (
        <Text style={styles.empty}>{data ? "No open positions." : "Loading positions…"}</Text>
      ) : (
        <View style={styles.list}>
          {data.positions.map((position) => (
            <PositionRow key={position.id} position={position} risk={data.risk[position.id]} isFocused={isFocused} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  heading: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", color: DashboardColors.textMuted },
  tradesToday: { fontSize: 10, color: DashboardColors.textMuted },
  empty: { textAlign: "center", paddingVertical: 24, color: DashboardColors.textMuted, fontSize: 13 },
  list: { gap: 8 },
  row: { borderRadius: 12, borderWidth: 1, borderColor: DashboardColors.border, backgroundColor: DashboardColors.surface, padding: 10 },
  topLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  leftGroup: { flexDirection: "row", alignItems: "center", gap: 6 },
  direction: { fontSize: 11, fontWeight: "800" },
  pair: { fontSize: 12, fontWeight: "700", color: DashboardColors.textPrimary },
  profit: { fontSize: 12, fontWeight: "700" },
  bottomLine: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  meta: { fontSize: 11, color: DashboardColors.textMuted },
  riskLine: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: DashboardColors.border },
  riskBadge: { borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
  riskBadgeText: { fontSize: 9, fontWeight: "700" },
  riskTextGroup: { flex: 1, gap: 2 },
  riskReason: { fontSize: 10.5, lineHeight: 14, color: DashboardColors.textMuted },
  riskDistance: { fontSize: 9.5, lineHeight: 13, color: DashboardColors.textMuted, opacity: 0.75 },
  cautionBanner: {
    marginTop: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: `${DashboardColors.amber}4d`,
    backgroundColor: `${DashboardColors.amber}1a`,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  cautionText: { fontSize: 10.5, lineHeight: 14, color: DashboardColors.amber },
});
