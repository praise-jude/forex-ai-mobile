import { StyleSheet, Text, View } from "react-native";
import type { EngineVerdict, PairAnalysisResult } from "@/lib/api/types";
import { DashboardColors } from "@/constants/dashboardColors";
import { ConfirmationRow, STATUS_COLOR } from "./SignerBBreakdown";

const ENGINE_LABEL: Record<EngineVerdict["engine"], string> = {
  smc: "SMC",
  signer_b: "Signer B",
  range_engine: "Range Engine",
  timeframe_15m: "15M",
  timeframe_30m: "30M",
  timeframe_1h: "1H",
  timeframe_4h: "4H",
  timeframe_1d: "1D",
};

// These aren't equal votes -- SMC proposes the trade, Signer B can independently veto
// it (a real hard gate, see decisionMatrix.ts), and everything else is context that
// never overrides either one. Shown so the panel doesn't read like a tally where
// "3 agree, 2 disagree" would mean anything -- it doesn't.
const ENGINE_ROLE: Record<EngineVerdict["engine"], string> = {
  smc: "finds the setup",
  signer_b: "independent check — can block SMC",
  range_engine: "context only, not a vote",
  timeframe_15m: "trend backdrop, not a vote",
  timeframe_30m: "trend backdrop, not a vote",
  timeframe_1h: "trend backdrop, not a vote",
  timeframe_4h: "trend backdrop, not a vote",
  timeframe_1d: "trend backdrop, not a vote",
};

function verdictLabel(direction: EngineVerdict["direction"]): string {
  if (direction === "unavailable") return "Unavailable";
  if (direction === "neutral") return "Neutral";
  return direction === "long" ? "BUY" : "SELL";
}

/** Plain-English synthesis of WHY the final answer is what it is -- not a new decision,
 * just narrating the real one decisionMatrix.ts/evaluateSignalDualDirection already
 * made, using the actual reason code when a candidate was found and blocked. Mirrors
 * forex-ai (web)'s identical helper. */
function bottomLine(result: Pick<PairAnalysisResult, "direction" | "conflicted" | "bullish" | "bearish">): string {
  if (result.conflicted) {
    return "SMC found a real setup on BOTH sides at once, and each independently cleared Signer B -- a genuine contradiction, so it's NO TRADE rather than guessing which one to trust.";
  }
  if (result.direction === "long" || result.direction === "short") {
    const label = result.direction === "long" ? "BUY" : "SELL";
    return `SMC found a ${label} setup and Signer B's independent check agrees -- that's why the final answer is ${label}.`;
  }
  const attempted = result.bullish?.status === "no_trade" ? result.bullish : result.bearish?.status === "no_trade" ? result.bearish : null;
  if (attempted?.status === "no_trade") {
    if (attempted.reason.code === "signer_b_neutral") {
      return "SMC found a possible setup, but Signer B (the independent second check) came back Neutral -- both have to agree before a trade counts, so it's NO TRADE.";
    }
    if (attempted.reason.code === "signer_conflict") {
      return "SMC found a setup, but Signer B's independent check pointed the opposite way -- both have to agree before a trade counts, so it's NO TRADE.";
    }
  }
  return "SMC didn't find a setup that cleared every check on either side right now. Range Engine and the timeframe rows below are context, not votes, so they don't override that.";
}

/** Every row here traces to a real, already-computed engine verdict (see
 * pairAnalysisJob.ts's `engines` field) -- "Unavailable" means that engine genuinely
 * never reached a directional read (e.g. Signer B when the killzone gate blocked
 * before it could run), never a fabricated stand-in for a real answer. Tone is neutral
 * for "neutral"/"unavailable" -- only a real agree/disagree against the winning
 * direction is colored positive/negative, same honesty rule as SignerBBreakdown.tsx's
 * own agreeTone. */
export function AiConsensusPanel({
  result,
}: {
  result: Pick<PairAnalysisResult, "engines" | "direction" | "conflicted" | "bullish" | "bearish">;
}) {
  const winningDirection = result.direction === "long" ? "long" : result.direction === "short" ? "short" : null;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.headerLabel}>AI CONSENSUS</Text>
        {result.conflicted && <Text style={styles.conflictBadge}>⚠️ CONFLICTED ANALYSIS</Text>}
      </View>
      <Text style={styles.bottomLine}>{bottomLine(result)}</Text>
      <View style={styles.list}>
        {result.engines.map((verdict) => {
          const tone: keyof typeof STATUS_COLOR =
            verdict.direction === "neutral" || verdict.direction === "unavailable" || !winningDirection
              ? "neutral"
              : verdict.direction === winningDirection
                ? "positive"
                : "negative";
          return (
            <View key={verdict.engine}>
              <ConfirmationRow label={ENGINE_LABEL[verdict.engine]} value={verdictLabel(verdict.direction)} tone={tone} />
              <Text style={styles.roleText}>{ENGINE_ROLE[verdict.engine]}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerLabel: { fontSize: 11, fontWeight: "800", color: DashboardColors.textPrimary, letterSpacing: 0.5 },
  conflictBadge: { fontSize: 11, fontWeight: "700", color: DashboardColors.amber },
  bottomLine: {
    fontSize: 11,
    lineHeight: 15,
    color: DashboardColors.textSecondary,
    backgroundColor: DashboardColors.surfaceAlt,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  list: { gap: 6 },
  roleText: { fontSize: 10, fontStyle: "italic", color: DashboardColors.textMuted },
});
