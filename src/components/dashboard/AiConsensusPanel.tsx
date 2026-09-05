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

function verdictLabel(direction: EngineVerdict["direction"]): string {
  if (direction === "unavailable") return "Unavailable";
  if (direction === "neutral") return "Neutral";
  return direction === "long" ? "BUY" : "SELL";
}

/** Every row here traces to a real, already-computed engine verdict (see
 * pairAnalysisJob.ts's `engines` field) -- "Unavailable" means that engine genuinely
 * never reached a directional read (e.g. Signer B when the killzone gate blocked
 * before it could run), never a fabricated stand-in for a real answer. Tone is neutral
 * for "neutral"/"unavailable" -- only a real agree/disagree against the winning
 * direction is colored positive/negative, same honesty rule as SignerBBreakdown.tsx's
 * own agreeTone. */
export function AiConsensusPanel({ result }: { result: Pick<PairAnalysisResult, "engines" | "direction" | "conflicted"> }) {
  const winningDirection = result.direction === "long" ? "long" : result.direction === "short" ? "short" : null;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.headerLabel}>AI CONSENSUS</Text>
        {result.conflicted && <Text style={styles.conflictBadge}>⚠️ CONFLICTED ANALYSIS</Text>}
      </View>
      <View style={styles.list}>
        {result.engines.map((verdict) => {
          const tone: keyof typeof STATUS_COLOR =
            verdict.direction === "neutral" || verdict.direction === "unavailable" || !winningDirection
              ? "neutral"
              : verdict.direction === winningDirection
                ? "positive"
                : "negative";
          return <ConfirmationRow key={verdict.engine} label={ENGINE_LABEL[verdict.engine]} value={verdictLabel(verdict.direction)} tone={tone} />;
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerLabel: { fontSize: 11, fontWeight: "800", color: DashboardColors.textPrimary, letterSpacing: 0.5 },
  conflictBadge: { fontSize: 11, fontWeight: "700", color: DashboardColors.amber },
  list: { gap: 4 },
});
