import { StyleSheet, Text, View } from "react-native";
import type { PredictionUpdate } from "@/lib/api/types";
import { predictionHeadline, predictionSubline, type PredictionHeadline } from "@/lib/api/predictionLabel";
import { describeNoTradeReason } from "@/lib/api/noTradeReason";
import { DashboardColors } from "@/constants/dashboardColors";
import { CONFLUENCE_LABEL } from "./SignalsList";

const HEADLINE_COLORS: Record<PredictionHeadline, { bg: string; fg: string }> = {
  "STRONG BUY": { bg: DashboardColors.emeraldBg, fg: DashboardColors.emerald },
  BUY: { bg: DashboardColors.emeraldBg, fg: DashboardColors.emerald },
  NEUTRAL: { bg: DashboardColors.surfaceAlt, fg: DashboardColors.textSecondary },
  SELL: { bg: DashboardColors.roseBg, fg: DashboardColors.rose },
  "STRONG SELL": { bg: DashboardColors.roseBg, fg: DashboardColors.rose },
  "NO TRADE": { bg: DashboardColors.surface, fg: DashboardColors.textMuted },
};

/**
 * Mirrors forex-ai's web PredictionCard.tsx. Surfaces the SMC engine's real per-candle
 * evaluation for the selected pair -- either a qualifying Signal (direction/confidence/
 * evidence) or an honest NO TRADE with the real reason it didn't qualify. Every value
 * shown traces to a real field on PredictionUpdate; nothing is fabricated.
 */
export function PredictionCard({ update }: { update: PredictionUpdate | null }) {
  if (!update) {
    return (
      <View style={styles.card}>
        <Text style={styles.evaluating}>Evaluating…</Text>
      </View>
    );
  }

  const headline = predictionHeadline(update.evaluation);
  const subline = predictionSubline(update.evaluation);
  const colors = HEADLINE_COLORS[headline];

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={[styles.headlineBadge, { backgroundColor: colors.bg }]}>
          <Text style={[styles.headlineText, { color: colors.fg }]}>{headline}</Text>
        </View>
        {update.evaluation.status === "signal" && (
          <Text style={styles.confidence}>{update.evaluation.signal.confidence.toFixed(0)}% confidence</Text>
        )}
      </View>

      {subline && <Text style={styles.subline}>{subline}</Text>}

      {update.evaluation.status === "signal" ? (
        <>
          {update.evaluation.signal.confluences.length > 0 && (
            <View style={styles.confluenceRow}>
              {update.evaluation.signal.confluences.map((c) => (
                <View key={c} style={styles.confluenceChip}>
                  <Text style={styles.confluenceText}>{CONFLUENCE_LABEL[c]}</Text>
                </View>
              ))}
            </View>
          )}
          <Text style={styles.subScore}>
            Direction {update.evaluation.signal.directionScore.toFixed(0)}% &middot; Entry {update.evaluation.signal.entryScore.toFixed(0)}%
          </Text>
        </>
      ) : (
        <Text style={styles.reasonText}>{describeNoTradeReason(update.evaluation.reason)}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: DashboardColors.border,
    backgroundColor: DashboardColors.surface,
    padding: 12,
  },
  evaluating: { fontSize: 13, color: DashboardColors.textMuted },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headlineBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  headlineText: { fontSize: 13, fontWeight: "700" },
  confidence: { fontSize: 13, fontWeight: "700", color: DashboardColors.textPrimary },
  subline: { marginTop: 6, fontSize: 11, color: DashboardColors.textSecondary },
  reasonText: { marginTop: 6, fontSize: 11, color: DashboardColors.textSecondary },
  confluenceRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  confluenceChip: { backgroundColor: DashboardColors.surfaceAlt, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  confluenceText: { fontSize: 10, color: DashboardColors.textSecondary },
  subScore: { marginTop: 8, fontSize: 10, color: DashboardColors.textMuted },
});
