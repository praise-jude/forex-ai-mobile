import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useApi } from "@/lib/api/client";
import { usePolling } from "@/lib/api/usePolling";
import type { AnalysisJob, AnalysisStage, Pair, Timeframe } from "@/lib/api/types";
import { DashboardColors } from "@/constants/dashboardColors";
import { ProbabilityBar } from "./ProbabilityBar";

const POLL_INTERVAL_MS = 200;

/** Mirrors forex-ai (web)'s lib/market/pairAnalysisJob.ts ANALYSIS_STAGE_PCT -- the same
 * real stage-completion percentages, kept in sync by hand since mobile can't import
 * directly from the web repo. The job's own `stage` field (not a client-side timer)
 * drives which of these is shown. */
const STAGE_PCT: Record<AnalysisStage, number> = {
  market_data: 15,
  structure: 30,
  smc_engine: 45,
  range_engine: 60,
  multi_timeframe: 75,
  consensus: 85,
  risk_validation: 95,
  final: 100,
};

const STAGE_LABEL: Record<AnalysisStage, string> = {
  market_data: "Loading Market Data",
  structure: "Reading Market Structure",
  smc_engine: "Running SMC Engine",
  range_engine: "Running Range Engine",
  multi_timeframe: "Multi-Timeframe Analysis",
  consensus: "AI Consensus",
  risk_validation: "Risk & Trade Validation",
  final: "Final Decision",
};

const STAGE_DETAIL: Record<AnalysisStage, string> = {
  market_data: "Price, spread, candles, data freshness",
  structure: "Swings, liquidity sweeps, BOS/CHoCH",
  smc_engine: "Order blocks, fair value gaps, Signer A score",
  range_engine: "Trending vs. ranging vs. breakout",
  multi_timeframe: "15M · 30M · 1H · 4H · 1D agreement",
  consensus: "Combining every engine's real verdict",
  risk_validation: "Spread, drift, correlation, policy",
  final: "Locking in the validated result",
};

export function AnalysisProgressScreen({
  pair,
  timeframe,
  onComplete,
  onFailed,
}: {
  pair: Pair;
  timeframe: Timeframe;
  onComplete: (job: AnalysisJob) => void;
  onFailed: (job: AnalysisJob) => void;
}) {
  const api = useApi();
  const [jobId, setJobId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  // Fired once on mount (empty dep array intentional -- pair/timeframe are fixed for the
  // lifetime of this screen; a different pair/timeframe means a new screen instance).
  useEffect(() => {
    let cancelled = false;
    void api
      .post<{ jobId: string }>("/api/signals/analyze", { pair, timeframe })
      .then((res) => {
        if (!cancelled) setJobId(res.jobId);
      })
      .catch((err) => {
        if (!cancelled) setStartError(err instanceof Error ? err.message : "Couldn't start analysis.");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately once-per-mount, see comment above.
  }, []);

  const { data: job } = usePolling<AnalysisJob>(() => api.get<AnalysisJob>(`/api/signals/analyze/${jobId}`), POLL_INTERVAL_MS, jobId !== null);

  if (job?.status === "complete") {
    onComplete(job);
    return null;
  }
  if (job?.status === "failed") {
    onFailed(job);
    return null;
  }

  if (startError) {
    return (
      <View style={styles.container}>
        <Text style={styles.failedTitle}>ANALYSIS FAILED</Text>
        <Text style={styles.failedText}>{startError}</Text>
      </View>
    );
  }

  const stage = job?.stage ?? "market_data";
  const pct = STAGE_PCT[stage];
  const result = job?.result;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>AI ANALYZING {pair}</Text>

      <View style={styles.ringWrap}>
        <Text style={styles.pct}>{pct}%</Text>
      </View>

      <Text style={styles.stageLabel}>{STAGE_LABEL[stage]}</Text>
      <Text style={styles.stageDetail}>{STAGE_DETAIL[stage]}</Text>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>

      {/* Live-updating, never a client-side guess -- these fields only appear on the job
       * once the real "consensus" stage has actually finished computing them (see
       * pairAnalysisJob.ts's incremental result-building). */}
      {result?.buyPct !== undefined && result.sellPct !== undefined && result.noTradePct !== undefined && (
        <View style={styles.liveProbability}>
          <Text style={styles.liveProbabilityLabel}>ANALYZING... {pct}%</Text>
          <ProbabilityBar buyPct={result.buyPct} sellPct={result.sellPct} noTradePct={result.noTradePct} compact />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 10, alignItems: "center" },
  title: { fontSize: 14, fontWeight: "800", color: DashboardColors.textPrimary, letterSpacing: 0.5 },
  ringWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 6,
    borderColor: DashboardColors.sky,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 8,
  },
  pct: { fontSize: 28, fontWeight: "800", color: DashboardColors.sky },
  stageLabel: { fontSize: 15, fontWeight: "700", color: DashboardColors.textPrimary },
  stageDetail: { fontSize: 12, color: DashboardColors.textMuted, textAlign: "center" },
  track: { width: "100%", height: 6, borderRadius: 3, backgroundColor: DashboardColors.surfaceAlt, overflow: "hidden", marginTop: 4 },
  fill: { height: "100%", backgroundColor: DashboardColors.sky },
  liveProbability: { width: "100%", marginTop: 14, gap: 6 },
  liveProbabilityLabel: { fontSize: 11, fontWeight: "700", color: DashboardColors.textMuted, textAlign: "center" },
  failedTitle: { fontSize: 15, fontWeight: "800", color: DashboardColors.rose },
  failedText: { fontSize: 12, color: DashboardColors.textSecondary, textAlign: "center" },
});
