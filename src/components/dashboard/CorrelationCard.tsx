import { StyleSheet, Text, View } from "react-native";
import { useApi } from "@/lib/api/client";
import { usePolling } from "@/lib/api/usePolling";
import type { CorrelationResponse } from "@/lib/api/types";
import { DashboardColors } from "@/constants/dashboardColors";

const POLL_INTERVAL_MS = 30000;

function formatAge(ms: number | null): string {
  if (ms === null) return "not yet computed";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  return `${(minutes / 60).toFixed(1)}h ago`;
}

/**
 * "What's actually correlated right now" -- the real rolling Pearson correlation
 * matrix the correlated-exposure risk gate uses (see forex-ai's riskManager.ts /
 * rollingCorrelation.ts). Diagnostic only -- never itself blocks or alters execution.
 * Sign matters: positive correlation means two pairs move together (same-direction
 * positions compound risk), negative means they move oppositely (opposite-direction
 * positions compound risk instead). RN port of forex-ai's CorrelationPanel.tsx.
 */
export function CorrelationCard() {
  const api = useApi();
  const { data } = usePolling(() => api.get<CorrelationResponse>("/api/correlation"), POLL_INTERVAL_MS);

  if (!data) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pair correlation</Text>
      <Text style={styles.subtitle}>What the correlated-exposure risk gate is using right now.</Text>

      {data.entries.length === 0 ? (
        <Text style={styles.emptyText}>
          Not enough daily candle history yet — the risk gate falls back to the static USD-direction/commodity-complex
          grouping in the meantime.
        </Text>
      ) : (
        <>
          <Text style={styles.meta}>
            Computed {formatAge(data.computedAtAgeMs)} · flagged at |correlation| ≥ {data.threshold.toFixed(2)}
          </Text>
          <View style={styles.table}>
            <View style={[styles.row, styles.headerRow]}>
              <Text style={[styles.cell, styles.pairCol, styles.headerText]}>Pairs</Text>
              <Text style={[styles.cell, styles.headerText]}>Correlation</Text>
              <Text style={[styles.cell, styles.headerText]}>Sample</Text>
            </View>
            {data.entries.map((entry) => {
              const flagged = Math.abs(entry.correlation) >= data.threshold;
              return (
                <View key={`${entry.pairA}-${entry.pairB}`} style={styles.row}>
                  <Text style={[styles.cell, styles.pairCol, styles.pairText]}>
                    {entry.pairA} / {entry.pairB}
                  </Text>
                  <Text style={[styles.cell, flagged ? styles.flaggedText : styles.cellText]}>
                    {entry.correlation >= 0 ? "+" : ""}
                    {entry.correlation.toFixed(2)}
                    {flagged ? " ⚑" : ""}
                  </Text>
                  <Text style={[styles.cell, styles.cellText]}>{entry.sampleSize}d</Text>
                </View>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  title: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", color: DashboardColors.textMuted },
  subtitle: { fontSize: 11, color: DashboardColors.textMuted, lineHeight: 15 },
  emptyText: { fontSize: 12, color: DashboardColors.textMuted, lineHeight: 16 },
  meta: { fontSize: 10, color: DashboardColors.textMuted },
  table: { borderRadius: 10, borderWidth: 1, borderColor: DashboardColors.border, backgroundColor: DashboardColors.surface, overflow: "hidden" },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: DashboardColors.border },
  headerRow: { backgroundColor: DashboardColors.surfaceAlt },
  cell: { flex: 1, paddingHorizontal: 8, paddingVertical: 6, fontSize: 11, fontVariant: ["tabular-nums"] },
  pairCol: { flex: 1.6 },
  headerText: { color: DashboardColors.textMuted, fontWeight: "700", textTransform: "uppercase", fontSize: 9 },
  pairText: { color: DashboardColors.textPrimary, fontWeight: "600" },
  cellText: { color: DashboardColors.textSecondary },
  flaggedText: { color: DashboardColors.amber, fontWeight: "700" },
});
