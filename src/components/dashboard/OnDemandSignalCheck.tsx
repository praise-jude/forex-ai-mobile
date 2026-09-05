import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { PAIRS, type AnalysisJob, type EngineModeResponse, type ExecuteResponse, type Pair, type PairAnalysisResult, type Timeframe } from "@/lib/api/types";
import { useApi } from "@/lib/api/client";
import { useSettings } from "@/lib/api/SettingsContext";
import { executeSignalRequest } from "@/lib/api/executionClient";
import { describeExecuteResponse } from "./TradeProposalCard";
import { buildConfirmPhrase } from "@/lib/voice/grammar";
import { DashboardColors } from "@/constants/dashboardColors";
import { TimeframeSelector } from "./TimeframeSelector";
import { AnalysisProgressScreen } from "./AnalysisProgressScreen";
import { AnalysisResultCard, qualifyingSignal } from "./AnalysisResultCard";
import { SignalWeakeningMonitor } from "./SignalWeakeningMonitor";

/**
 * Mirrors forex-ai's web OnDemandSignalWidget.tsx. Pick any tracked pair, tap Analyze,
 * and watch a real, multi-stage analysis job (see pairAnalysisJob.ts) run through
 * market data -> structure -> SMC -> Range Engine -> multi-timeframe -> consensus ->
 * risk validation -> final decision, every stage/percentage tied to genuine
 * computation. A qualifying result can then be placed as a real trade via the same
 * publish-then-execute flow the web widget uses -- no separate execution path, and
 * nothing here can itself place an order (see pairAnalysisJob.ts's own Auto Pilot
 * boundary doc comment).
 */
export function OnDemandSignalCheck() {
  const api = useApi();
  const { serverUrl, authHeader } = useSettings();
  const [pair, setPair] = useState<Pair>(PAIRS[0]);
  const [timeframe, setTimeframe] = useState<Timeframe>("15m");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<PairAnalysisResult | null>(null);
  const [failedJob, setFailedJob] = useState<AnalysisJob | null>(null);
  const [invalidated, setInvalidated] = useState(false);

  const [riskPct, setRiskPct] = useState(1);
  const [placing, setPlacing] = useState(false);
  const [placeResult, setPlaceResult] = useState<ExecuteResponse | null>(null);

  // Same default source index.tsx itself reads for a manual Approve tap -- so a risk %
  // entered here matches whatever the account is actually configured to risk per trade.
  useEffect(() => {
    api
      .get<EngineModeResponse>("/api/engine-mode")
      .then((body) => setRiskPct(body.riskPerTradePct))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function analyze() {
    setResult(null);
    setFailedJob(null);
    setPlaceResult(null);
    setInvalidated(false);
    setAnalyzing(true);
  }

  // Registers this on-demand read as a real, tracked signal (journaled, notified --
  // exactly like one the live engine detects) and then executes it through the exact
  // same /api/signals/{id}/execute route every other signal uses, including every one of
  // its risk checks (daily loss, correlation, price drift, spread, sizing).
  async function placeTrade() {
    if (!result) return;
    const signal = qualifyingSignal(result);
    if (!signal) return;
    setPlacing(true);
    setPlaceResult(null);
    try {
      await api.post("/api/signals/evaluate/publish", { signal, regime: result.regime });
      const execResult = await executeSignalRequest(serverUrl, authHeader, signal.id, buildConfirmPhrase(signal), riskPct);
      setPlaceResult(execResult);
    } catch {
      setPlaceResult({ status: "network_error" });
    } finally {
      setPlacing(false);
    }
  }

  const qualified = result ? qualifyingSignal(result) : null;
  const canPlaceTrade = qualified !== null && !invalidated && !placeResult;

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Check a pair</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pairRow}>
        {PAIRS.map((p) => {
          const selected = p === pair;
          return (
            <Pressable
              key={p}
              onPress={() => setPair(p)}
              accessibilityRole="button"
              accessibilityLabel={`Select ${p}`}
              accessibilityState={{ selected }}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{p}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.controlsRow}>
        <TimeframeSelector value={timeframe} onChange={setTimeframe} />
        <Pressable onPress={analyze} disabled={analyzing} style={[styles.analyzeButton, analyzing && styles.analyzeButtonDisabled]}>
          {analyzing ? <ActivityIndicator size="small" color={DashboardColors.sky} /> : <Text style={styles.analyzeButtonText}>Analyze Trade</Text>}
        </Pressable>
      </View>

      {analyzing && (
        <View style={styles.result}>
          <AnalysisProgressScreen
            pair={pair}
            timeframe={timeframe}
            onComplete={(job) => {
              setResult(job.result as PairAnalysisResult);
              setAnalyzing(false);
            }}
            onFailed={(job) => {
              setFailedJob(job);
              setAnalyzing(false);
            }}
          />
        </View>
      )}

      {failedJob && (
        <View style={styles.result}>
          <Text style={styles.errorTitle}>{failedJob.failReason === "stale_data" ? "STALE MARKET DATA" : "ANALYSIS FAILED"}</Text>
          <Text style={styles.errorText}>{failedJob.failMessage}</Text>
        </View>
      )}

      {result && (
        <View style={styles.result}>
          <AnalysisResultCard result={result} />
          {qualified && (result.direction === "long" || result.direction === "short") && (
            <SignalWeakeningMonitor
              pair={pair}
              timeframe={timeframe}
              direction={result.direction}
              originalConfidence={qualified.confidence}
              onLevelChange={(level) => setInvalidated(level === "invalidated")}
            />
          )}
        </View>
      )}

      {canPlaceTrade && (
        <View style={styles.placeRow}>
          <View style={styles.riskField}>
            <Text style={styles.riskLabel}>Risk</Text>
            <TextInput
              value={String(riskPct)}
              onChangeText={(text) => {
                // Number(text) || riskPct previously discarded "0" (falsy) and reverted to
                // the stale value instead of accepting it -- Number.isFinite lets a real 0%
                // through while still rejecting non-numeric input.
                const parsed = Number(text);
                if (Number.isFinite(parsed)) setRiskPct(parsed);
              }}
              keyboardType="numeric"
              style={styles.riskInput}
            />
            <Text style={styles.riskLabel}>% of equity</Text>
          </View>
          <Pressable onPress={placeTrade} disabled={placing} style={[styles.placeButton, placing && styles.analyzeButtonDisabled]}>
            {placing ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.placeButtonText}>🟢 Place Trade</Text>}
          </Pressable>
        </View>
      )}

      {placeResult && <Text style={styles.placeResultText}>{describeExecuteResponse(placeResult)}</Text>}
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
    gap: 10,
  },
  heading: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", color: DashboardColors.textMuted },
  pairRow: { gap: 6, paddingRight: 8 },
  chip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: DashboardColors.border,
    backgroundColor: DashboardColors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipSelected: { borderColor: DashboardColors.sky, backgroundColor: DashboardColors.skyBg },
  chipText: { fontSize: 11, fontWeight: "600", color: DashboardColors.textSecondary },
  chipTextSelected: { color: DashboardColors.sky },
  controlsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  analyzeButton: {
    borderRadius: 8,
    backgroundColor: DashboardColors.skyBg,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 84,
    alignItems: "center",
  },
  analyzeButtonDisabled: { opacity: 0.6 },
  analyzeButtonText: { fontSize: 12, fontWeight: "700", color: DashboardColors.sky },
  errorTitle: { fontSize: 13, fontWeight: "800", color: DashboardColors.rose },
  errorText: { fontSize: 12, fontWeight: "600", color: DashboardColors.amber },
  result: { marginTop: 2 },
  placeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: DashboardColors.border,
    paddingTop: 10,
  },
  riskField: { flexDirection: "row", alignItems: "center", gap: 6 },
  riskLabel: { fontSize: 12, color: DashboardColors.textMuted },
  riskInput: {
    width: 48,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: DashboardColors.border,
    backgroundColor: DashboardColors.surfaceAlt,
    paddingHorizontal: 6,
    paddingVertical: 4,
    color: DashboardColors.textPrimary,
    fontSize: 12,
  },
  placeButton: {
    borderRadius: 8,
    backgroundColor: DashboardColors.emeraldStrong,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: "center",
  },
  placeButtonText: { fontSize: 12, fontWeight: "700", color: "#fff" },
  placeResultText: { fontSize: 12, fontWeight: "600", color: DashboardColors.textSecondary, marginTop: 2 },
});
