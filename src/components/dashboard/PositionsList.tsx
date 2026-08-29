import { StyleSheet, Text, View } from "react-native";
import { useIsFocused } from "expo-router";
import { useApi } from "@/lib/api/client";
import { usePolling } from "@/lib/api/usePolling";
import { formatPrice } from "@/lib/api/format";
import type { OpenPosition, PositionRiskAssessment, PositionsResponse } from "@/lib/api/types";
import { DashboardColors } from "@/constants/dashboardColors";

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

function PositionRow({ position, risk }: { position: OpenPosition; risk: PositionRiskAssessment | undefined }) {
  const isLong = position.direction === "long";
  const inProfit = position.profit >= 0;

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
      {risk && (
        <View style={styles.riskLine}>
          <View style={[styles.riskBadge, { backgroundColor: `${RISK_BADGE_COLOR[risk.level]}26` }]}>
            <Text style={[styles.riskBadgeText, { color: RISK_BADGE_COLOR[risk.level] }]}>{RISK_BADGE_LABEL[risk.level]}</Text>
          </View>
          {risk.level !== "aligned" && <Text style={styles.riskReason}>{risk.reason}</Text>}
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
            <PositionRow key={position.id} position={position} risk={data.risk[position.id]} />
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
  riskReason: { flex: 1, fontSize: 10.5, lineHeight: 14, color: DashboardColors.textMuted },
});
