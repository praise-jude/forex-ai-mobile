import { StyleSheet, Text, View } from "react-native";
import { useApi } from "@/lib/api/client";
import { usePolling } from "@/lib/api/usePolling";
import { formatPrice } from "@/lib/api/format";
import type { OpenPosition, PositionsResponse } from "@/lib/api/types";
import { DashboardColors } from "@/constants/dashboardColors";

const POLL_INTERVAL_MS = 7000;

function PositionRow({ position }: { position: OpenPosition }) {
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
    </View>
  );
}

export function PositionsList() {
  const api = useApi();
  const { data } = usePolling(() => api.get<PositionsResponse>("/api/positions"), POLL_INTERVAL_MS);

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
            <PositionRow key={position.id} position={position} />
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
});
