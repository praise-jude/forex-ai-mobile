import { StyleSheet, Text, View } from "react-native";
import type { PredictionUpdate, Signal } from "@/lib/api/types";
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

const STATUS_COLOR = {
  positive: DashboardColors.emerald,
  negative: DashboardColors.rose,
  neutral: DashboardColors.textMuted,
} as const;

/** Maps one Signer B factor's raw reading to a tone against this signal's own
 * direction -- "unavailable"/"neutral" readings are real, honest non-answers (never
 * fabricated as agreeing or disagreeing), so they stay neutral rather than reading as
 * a disagreement. Mirrors forex-ai's web PredictionCard.tsx. */
function agreeTone<T extends string>(
  value: T | "neutral" | "unavailable",
  direction: "long" | "short",
  bullishValue: T,
  bearishValue: T
): keyof typeof STATUS_COLOR {
  if (value === "unavailable" || value === "neutral") return "neutral";
  const wanted = direction === "long" ? bullishValue : bearishValue;
  return value === wanted ? "positive" : "negative";
}

/** One row of the confirmation-layer breakdown -- always shows the real status,
 * including "unavailable", never a fabricated agree/disagree. */
function ConfirmationRow({ label, value, tone }: { label: string; value: string; tone: keyof typeof STATUS_COLOR }) {
  return (
    <View style={styles.confirmationRow}>
      <Text style={styles.confirmationLabel}>{label}</Text>
      <Text style={[styles.confirmationValue, { color: STATUS_COLOR[tone] }]}>{value}</Text>
    </View>
  );
}

function SignerBBlock({ signal }: { signal: Signal }) {
  return (
    <View style={styles.signerBBlock}>
      <View style={styles.signerBHeaderRow}>
        <Text style={styles.signerBHeading}>Signer B (independent confirmation)</Text>
        <Text style={[styles.signerBHeadline, { color: STATUS_COLOR[signal.signerBDirection === "unavailable" ? "neutral" : "positive"] }]}>
          {signal.signerBDirection === "unavailable" ? "Unavailable" : `${signal.signerBDirection.toUpperCase()} · ${signal.signerBConfidence.toFixed(0)}%`}
        </Text>
      </View>
      <View style={styles.confirmationList}>
        <ConfirmationRow
          label="EMA trend"
          value={signal.signerBEmaTrend === "unavailable" ? "Unavailable" : signal.signerBEmaTrend.charAt(0).toUpperCase() + signal.signerBEmaTrend.slice(1)}
          tone={agreeTone(signal.signerBEmaTrend, signal.direction, "bullish", "bearish")}
        />
        <ConfirmationRow
          label="Supertrend"
          value={signal.supertrendTrend === "unavailable" ? "Unavailable" : signal.supertrendTrend.toUpperCase()}
          tone={agreeTone(signal.supertrendTrend, signal.direction, "up", "down")}
        />
        <ConfirmationRow
          label="RSI divergence"
          value={
            signal.rsiDivergence === "unavailable"
              ? "Unavailable"
              : signal.rsiDivergence === "none"
                ? "None"
                : signal.rsiDivergence.charAt(0).toUpperCase() + signal.rsiDivergence.slice(1)
          }
          tone={
            signal.rsiDivergence === "unavailable" || signal.rsiDivergence === "none"
              ? "neutral"
              : agreeTone(signal.rsiDivergence, signal.direction, "bullish", "bearish")
          }
        />
        <ConfirmationRow
          label="Currency strength"
          value={signal.usdStrengthStatus === "unavailable" ? "Unavailable" : signal.usdStrengthStatus === "supports" ? "Supports" : "Conflicts"}
          tone={signal.usdStrengthStatus === "unavailable" ? "neutral" : signal.usdStrengthStatus === "supports" ? "positive" : "negative"}
        />
        <ConfirmationRow label="Session" value={signal.session} tone="neutral" />
        <ConfirmationRow
          label="News"
          value={signal.newsStatus === "unavailable" ? "Unavailable" : signal.newsStatus === "clear" ? "Clear" : "High-impact today"}
          tone={signal.newsStatus === "unavailable" ? "neutral" : signal.newsStatus === "clear" ? "positive" : "negative"}
        />
      </View>
    </View>
  );
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
            SMC (Signer A) · Direction {update.evaluation.signal.directionScore.toFixed(0)}% · Entry {update.evaluation.signal.entryScore.toFixed(0)}%
          </Text>
          <SignerBBlock signal={update.evaluation.signal} />
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
  signerBBlock: { marginTop: 8, borderTopWidth: 1, borderTopColor: DashboardColors.border, paddingTop: 8 },
  signerBHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  signerBHeading: { fontSize: 10, color: DashboardColors.textMuted },
  signerBHeadline: { fontSize: 10, fontWeight: "700" },
  confirmationList: { marginTop: 6, gap: 4 },
  confirmationRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  confirmationLabel: { fontSize: 10, color: DashboardColors.textMuted },
  confirmationValue: { fontSize: 10, fontWeight: "600" },
});
