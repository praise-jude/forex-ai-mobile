import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useApi } from "@/lib/api/client";
import { usePolling } from "@/lib/api/usePolling";
import { formatPrice } from "@/lib/api/format";
import type { JournalEntry, JournalResponse, PerformanceStats, SignalFunnelStats } from "@/lib/api/types";
import { DashboardColors } from "@/constants/dashboardColors";

// Trades close on the order of minutes to hours, not seconds -- a slow poll is plenty
// responsive for a screen that isn't the primary live-trading surface.
const POLL_INTERVAL_MS = 15000;

// Journal entries can be days or weeks old, unlike SignalsList's relativeTime (which
// only ever needs to express minutes/hours for a live-fired signal) -- this one also
// expresses days.
function relativeTime(fromMs: number): string {
  const seconds = Math.round((Date.now() - fromMs) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

const REASON_LABEL: Record<JournalEntry["reason"], string> = {
  stop_loss: "Stop loss",
  take_profit: "Take profit",
  invalidation: "Invalidation exit",
  manual: "Manual close",
  other: "Closed",
};

function StatTile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "positive" | "negative" }) {
  const valueColor = tone === "positive" ? DashboardColors.emerald : tone === "negative" ? DashboardColors.rose : DashboardColors.textPrimary;
  return (
    <View style={styles.statTile}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: valueColor }]}>{value}</Text>
      {hint && <Text style={styles.statHint}>{hint}</Text>}
    </View>
  );
}

function StatsSummary({ stats, openCount }: { stats: PerformanceStats; openCount: number }) {
  const averageRTone = stats.averageR === null ? undefined : stats.averageR >= 0 ? "positive" : "negative";

  return (
    <View style={styles.statsGrid}>
      <StatTile label="Trades" value={String(stats.count + openCount)} hint={openCount > 0 ? `${openCount} open` : undefined} />
      <StatTile label="Win rate" value={stats.count === 0 ? "—" : `${stats.winRate.toFixed(0)}%`} />
      <StatTile label="Record" value={`${stats.wins}W / ${stats.losses}L`} />
      <StatTile
        label="Average R"
        value={stats.averageR === null ? "—" : `${stats.averageR >= 0 ? "+" : ""}${stats.averageR.toFixed(2)}R`}
        tone={averageRTone}
      />
      <StatTile label="Max drawdown" value={stats.maxDrawdownR === null ? "—" : `${stats.maxDrawdownR.toFixed(2)}R`} tone="negative" />
    </View>
  );
}

/** "AI signal performance" -- was the AI's signal-to-decision pipeline healthy (did
 * proposals get a real decision, or mostly expire/get blocked) -- kept visually distinct
 * from the executed-trade StatsSummary above, which is "actual executed trade
 * performance" and only ever reflects real closed trades. */
function SignalFunnelSummary({ funnel }: { funnel: SignalFunnelStats }) {
  const total = funnel.approved + funnel.rejected + funnel.expired + funnel.blocked;
  if (total === 0) return null;

  return (
    <View>
      <Text style={styles.sectionHeading}>AI signal performance (proposals, not trades)</Text>
      <View style={styles.statsGrid}>
        <StatTile label="Approved" value={String(funnel.approved)} tone="positive" />
        <StatTile label="Rejected" value={String(funnel.rejected)} />
        <StatTile label="Expired" value={String(funnel.expired)} tone="negative" />
        <StatTile label="Blocked" value={String(funnel.blocked)} />
      </View>
    </View>
  );
}

function EntryRow({ entry }: { entry: JournalEntry }) {
  const isLong = entry.direction === "long";
  const inProfit = entry.profit >= 0;

  return (
    <View style={styles.entryRow}>
      <View style={styles.entryTop}>
        <View style={styles.entryTopLeft}>
          <Text style={[styles.entryDirection, { color: isLong ? DashboardColors.emerald : DashboardColors.rose }]}>
            {isLong ? "LONG" : "SHORT"}
          </Text>
          <Text style={styles.entryPair}>{entry.pair}</Text>
          {entry.context && <Text style={styles.entryMuted}>Setup quality {entry.context.setupQuality.total}/100</Text>}
        </View>
        <Text style={[styles.entryProfit, { color: inProfit ? DashboardColors.emerald : DashboardColors.rose }]}>
          {inProfit ? "+" : ""}
          {entry.profit.toFixed(2)}
          {entry.rMultiple !== null && ` (${entry.rMultiple >= 0 ? "+" : ""}${entry.rMultiple.toFixed(2)}R)`}
        </Text>
      </View>
      <View style={styles.entryBottom}>
        <Text style={styles.entryMuted}>
          {REASON_LABEL[entry.reason]}
          {entry.context && ` · ${entry.context.regime.replace(/_/g, " ")}`}
        </Text>
        <Text style={styles.entryMuted}>
          {formatPrice(entry.pair, entry.entryPrice)} → {formatPrice(entry.pair, entry.exitPrice)} · {relativeTime(entry.closedAt)}
        </Text>
      </View>
    </View>
  );
}

export function JournalPanel() {
  const api = useApi();
  const { data } = usePolling(() => api.get<JournalResponse>("/api/trade-journal"), POLL_INTERVAL_MS);

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      {data && <StatsSummary stats={data.stats} openCount={data.openCount} />}
      {data && <SignalFunnelSummary funnel={data.signalFunnel} />}

      <View>
        <Text style={styles.sectionHeading}>Closed trades</Text>
        {!data || data.entries.length === 0 ? (
          <Text style={styles.empty}>No closed trades yet — entries appear here once a trade this app opened closes.</Text>
        ) : (
          <View style={styles.entryList}>
            {data.entries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} />
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: 16, gap: 16, paddingBottom: 100 },
  sectionHeading: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: DashboardColors.textMuted,
    marginBottom: 8,
  },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statTile: {
    flexBasis: "47%",
    flexGrow: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: DashboardColors.border,
    backgroundColor: DashboardColors.surfaceAlt,
    padding: 10,
  },
  statLabel: { fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, color: DashboardColors.textMuted },
  statValue: { marginTop: 4, fontSize: 16, fontWeight: "700", fontVariant: ["tabular-nums"] },
  statHint: { marginTop: 2, fontSize: 10, color: DashboardColors.textMuted },
  empty: { textAlign: "center", paddingVertical: 24, color: DashboardColors.textMuted, fontSize: 13 },
  entryList: { gap: 8 },
  entryRow: { borderRadius: 10, borderWidth: 1, borderColor: DashboardColors.border, backgroundColor: DashboardColors.surfaceAlt, padding: 10, gap: 4 },
  entryTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  entryTopLeft: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  entryDirection: { fontSize: 11, fontWeight: "700" },
  entryPair: { fontSize: 12, fontWeight: "700", color: DashboardColors.textPrimary },
  entryProfit: { fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] },
  entryBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  entryMuted: { fontSize: 11, color: DashboardColors.textMuted },
});
