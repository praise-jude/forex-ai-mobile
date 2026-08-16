import { StyleSheet, Text, View } from "react-native";
import type { NoTradeReason, PredictionUpdate } from "@/lib/api/types";
import { predictionHeadline, predictionSubline, type PredictionHeadline } from "@/lib/api/predictionLabel";
import { describeNoTradeReason } from "@/lib/api/noTradeReason";
import { TIMEFRAME_MS } from "@/lib/api/timeframes";
import { DashboardColors } from "@/constants/dashboardColors";
import { CONFLUENCE_LABEL } from "./SignalsList";
import { DirectionBadge, type BadgeTone } from "./DirectionBadge";
import { SignerBBreakdown } from "./SignerBBreakdown";

export const HEADLINE_TONE: Record<PredictionHeadline, BadgeTone> = {
  "STRONG BUY": "positive",
  BUY: "positive",
  NEUTRAL: "neutral",
  SELL: "negative",
  "STRONG SELL": "negative",
  "NO TRADE": "neutral",
};

// A signal that's more than this many of its own timeframe bars old is shown as
// outdated -- predictions refresh every closed candle, so anything holding this long
// past its own creation is more likely a stalled poll than a fresh read.
const STALE_BAR_MULTIPLE = 3;

function isStale(createdAt: number, timeframe: keyof typeof TIMEFRAME_MS): boolean {
  return Date.now() - createdAt > TIMEFRAME_MS[timeframe] * STALE_BAR_MULTIPLE;
}

/** Reason-specific status badge for the no_trade branch -- CONFLICTING/NEUTRAL only
 * ever come from a genuine Signer B read (never fabricated); every other gate reads as
 * a plain WAIT. Mirrors forex-ai's web PredictionCard.tsx. */
function noTradeStatus(reason: NoTradeReason): { tone: BadgeTone; label: string } {
  if (reason.code === "signer_conflict") return { tone: "negative", label: "CONFLICTING" };
  if (reason.code === "signer_b_neutral") return { tone: "neutral", label: "NEUTRAL" };
  return { tone: "neutral", label: "WAIT" };
}

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

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <DirectionBadge tone={HEADLINE_TONE[headline]} label={headline} />
        {update.evaluation.status === "signal" && (
          <Text style={styles.confidence}>{update.evaluation.signal.confidence.toFixed(0)}% confidence</Text>
        )}
      </View>

      {subline && <Text style={styles.subline}>{subline}</Text>}

      {update.evaluation.status === "signal" ? (
        <>
          {isStale(update.evaluation.signal.createdAt, update.evaluation.signal.timeframe) && (
            <Text style={styles.staleText}>⚠️ Analysis outdated -- waiting on a fresh candle close.</Text>
          )}
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
            SMC (Signer A) · Direction {update.evaluation.signal.directionScore.toFixed(0)}% · Entry {update.evaluation.signal.entryScore.toFixed(0)}%
          </Text>
          <View style={styles.signerBBlock}>
            <SignerBBreakdown signal={update.evaluation.signal} />
          </View>
        </>
      ) : (
        <>
          <View style={styles.statusRow}>
            <DirectionBadge tone={noTradeStatus(update.evaluation.reason).tone} label={noTradeStatus(update.evaluation.reason).label} />
            {update.evaluation.reason.code === "signer_conflict" && (
              <Text style={styles.statusDetail}>
                SMC {update.evaluation.reason.impliedDirection === "long" ? "BUY" : "SELL"} · Signer B{" "}
                {update.evaluation.reason.signerBDirection === "long" ? "BUY" : "SELL"} ({update.evaluation.reason.signerBConfidence.toFixed(0)}%)
              </Text>
            )}
          </View>
          <Text style={styles.reasonText}>{describeNoTradeReason(update.evaluation.reason)}</Text>
        </>
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
  confidence: { fontSize: 13, fontWeight: "700", color: DashboardColors.textPrimary },
  subline: { marginTop: 6, fontSize: 11, color: DashboardColors.textSecondary },
  staleText: { marginTop: 6, fontSize: 11, fontWeight: "700", color: DashboardColors.amber },
  reasonText: { marginTop: 6, fontSize: 11, color: DashboardColors.textSecondary },
  statusRow: { marginTop: 6, flexDirection: "row", alignItems: "center", gap: 8 },
  statusDetail: { fontSize: 11, color: DashboardColors.textMuted },
  confluenceRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  confluenceChip: { backgroundColor: DashboardColors.surfaceAlt, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  confluenceText: { fontSize: 10, color: DashboardColors.textSecondary },
  subScore: { marginTop: 8, fontSize: 10, color: DashboardColors.textMuted },
  signerBBlock: { marginTop: 8, borderTopWidth: 1, borderTopColor: DashboardColors.border, paddingTop: 8 },
});
