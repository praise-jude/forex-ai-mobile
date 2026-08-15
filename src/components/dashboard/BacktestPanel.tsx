import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useApi } from "@/lib/api/client";
import { usePolling } from "@/lib/api/usePolling";
import {
  BACKTEST_TIMEFRAMES,
  DEFAULT_LOOKBACK_DAYS,
  MAX_LOOKBACK_DAYS,
  PAIRS,
  type BacktestJob,
  type BacktestListResponse,
  type BacktestRequest,
  type Pair,
  type Timeframe,
} from "@/lib/api/types";
import { DashboardColors } from "@/constants/dashboardColors";

const POLL_INTERVAL_MS = 3000;

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

function DisclosureBanner({ realistic }: { realistic: boolean }) {
  return (
    <View style={styles.disclosureBox}>
      <Text style={styles.disclosureTitle}>Backtest limitations — read before trusting these numbers</Text>
      <Text style={styles.disclosureBullet}>
        • Historical news blackout isn&apos;t simulated (always reads &quot;clear&quot; for past dates), and currency-strength
        confirmation is excluded from Signer B&apos;s vote for the same reason.
      </Text>
      {realistic ? (
        <>
          <Text style={styles.disclosureBullet}>
            • Position management (break-even, trailing stop) is simulated using this account&apos;s real triggers — early
            invalidation and partial take-profit aren&apos;t.
          </Text>
          <Text style={styles.disclosureBullet}>
            • Sizing uses real lot-size math against a fixed hypothetical starting equity (not compounding). Spread cost is
            approximated as a fixed fraction of each trade&apos;s stop distance.
          </Text>
        </>
      ) : (
        <Text style={styles.disclosureBullet}>
          • Position management isn&apos;t simulated (fixed SL vs. TP1 only), and sizing uses a fixed hypothetical stake, not
          real lot sizing/spread/compounding.
        </Text>
      )}
      <Text style={styles.disclosureFooter}>Results likely skew more optimistic than live trading.</Text>
    </View>
  );
}

function RunForm({ onStart, busy, disabled }: { onStart: (request: BacktestRequest) => void; busy: boolean; disabled: boolean }) {
  const [selectedPairs, setSelectedPairs] = useState<Pair[]>([]);
  const [allPairs, setAllPairs] = useState(false);
  const [timeframe, setTimeframe] = useState<Timeframe>("15m");
  const [lookbackDays, setLookbackDays] = useState(String(DEFAULT_LOOKBACK_DAYS));
  const [realistic, setRealistic] = useState(false);

  function togglePair(pair: Pair) {
    setSelectedPairs((prev) => (prev.includes(pair) ? prev.filter((p) => p !== pair) : [...prev, pair]));
  }

  const effectivePairs = allPairs ? PAIRS : selectedPairs;
  const parsedLookback = Math.min(MAX_LOOKBACK_DAYS, Math.max(1, Number.parseInt(lookbackDays, 10) || 1));
  const canSubmit = effectivePairs.length > 0 && !busy && !disabled;

  return (
    <View style={styles.formCard}>
      <Text style={styles.formLabel}>Pairs</Text>
      <Pressable style={styles.checkboxRow} onPress={() => setAllPairs((v) => !v)}>
        <View style={[styles.checkbox, allPairs && styles.checkboxChecked]}>{allPairs && <Text style={styles.checkboxMark}>✓</Text>}</View>
        <Text style={styles.checkboxLabel}>All pairs ({PAIRS.length})</Text>
      </Pressable>

      {!allPairs && (
        <View style={styles.chipRow}>
          {PAIRS.map((pair) => {
            const selected = selectedPairs.includes(pair);
            return (
              <Pressable key={pair} onPress={() => togglePair(pair)} style={[styles.chip, selected && styles.chipSelected]}>
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{pair}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <Text style={styles.formLabel}>Timeframe</Text>
      <View style={styles.chipRow}>
        {BACKTEST_TIMEFRAMES.map((tf) => {
          const selected = tf === timeframe;
          return (
            <Pressable key={tf} onPress={() => setTimeframe(tf)} style={[styles.chip, selected && styles.chipSelected]}>
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{tf}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.lookbackRow}>
        <Text style={styles.formLabel}>Lookback (days, max {MAX_LOOKBACK_DAYS})</Text>
        <TextInput
          value={lookbackDays}
          onChangeText={setLookbackDays}
          onBlur={() => setLookbackDays(String(parsedLookback))}
          keyboardType="number-pad"
          style={styles.lookbackInput}
        />
      </View>

      <Pressable style={styles.checkboxRow} onPress={() => setRealistic((v) => !v)}>
        <View style={[styles.checkbox, realistic && styles.checkboxChecked]}>{realistic && <Text style={styles.checkboxMark}>✓</Text>}</View>
        <View style={styles.flexShrink}>
          <Text style={styles.checkboxLabel}>Realistic mode</Text>
          <Text style={styles.checkboxHint}>
            Simulates break-even/trailing stop, real lot sizing, and spread cost. Slower to start (fetches real symbol specs
            first).
          </Text>
        </View>
      </Pressable>

      <Pressable
        disabled={!canSubmit}
        onPress={() => onStart({ pairs: effectivePairs, timeframe, lookbackDays: parsedLookback, realistic })}
        style={[styles.runButton, !canSubmit && styles.disabled]}
      >
        {busy ? <ActivityIndicator size="small" color="#04202f" /> : <Text style={styles.runButtonText}>Run backtest</Text>}
      </Pressable>
    </View>
  );
}

function ProgressView({ job, onCancel }: { job: BacktestJob; onCancel: () => void }) {
  const barPct = job.progress.barsTotal > 0 ? Math.round((job.progress.barsEvaluated / job.progress.barsTotal) * 100) : 0;
  return (
    <View style={styles.formCard}>
      <View style={styles.progressHeader}>
        <Text style={styles.progressTitle}>
          {job.status === "queued" ? "Queued…" : "Running…"} pair {job.progress.pairsDone + 1} of {job.progress.pairsTotal}
        </Text>
        <Pressable onPress={onCancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${barPct}%` }]} />
      </View>
      <Text style={styles.statHint}>
        {job.progress.barsEvaluated.toLocaleString()} / {job.progress.barsTotal.toLocaleString()} bars in the current pair
      </Text>
    </View>
  );
}

function ResultsView({ job }: { job: BacktestJob }) {
  if (job.status === "failed") {
    return (
      <View style={styles.failedBox}>
        <Text style={styles.failedText}>Backtest failed: {job.error}</Text>
      </View>
    );
  }
  if (!job.result) return null;
  const { stats, profitFactor, sharpeRatio, streaks, scoreRangeBreakdown, openAtWindowEnd, perPair } = job.result;
  const averageRTone = stats.averageR === null ? undefined : stats.averageR >= 0 ? "positive" : "negative";
  const realistic = job.request.realistic === true;

  return (
    <View style={styles.resultsGap}>
      <View style={[styles.modeBadge, realistic ? styles.modeBadgeRealistic : styles.modeBadgeIdealized]}>
        <Text style={[styles.modeBadgeText, { color: realistic ? DashboardColors.sky : DashboardColors.textMuted }]}>
          {realistic ? "Realistic mode" : "Idealized mode"}
        </Text>
      </View>
      <DisclosureBanner realistic={realistic} />

      <View style={styles.statsGrid}>
        <StatTile label="Trades" value={String(stats.count)} hint={openAtWindowEnd > 0 ? `${openAtWindowEnd} still open at window end` : undefined} />
        <StatTile label="Win rate" value={stats.count === 0 ? "—" : `${stats.winRate.toFixed(0)}%`} />
        <StatTile label="Record" value={`${stats.wins}W / ${stats.losses}L`} />
        <StatTile
          label="Average R"
          value={stats.averageR === null ? "—" : `${stats.averageR >= 0 ? "+" : ""}${stats.averageR.toFixed(2)}R`}
          tone={averageRTone}
        />
        <StatTile label="Max drawdown" value={stats.maxDrawdownR === null ? "—" : `${stats.maxDrawdownR.toFixed(2)}R`} tone="negative" />
        <StatTile label="Profit factor" value={profitFactor === null ? "—" : profitFactor.toFixed(2)} />
        <StatTile label="Sharpe (per-trade)" value={sharpeRatio === null ? "—" : sharpeRatio.toFixed(2)} />
        <StatTile label="Win / loss streaks" value={`${streaks.maxConsecutiveWins} / ${streaks.maxConsecutiveLosses}`} />
      </View>

      <View>
        <Text style={styles.sectionHeading}>Results by signal score</Text>
        <View style={styles.breakdownTable}>
          <View style={[styles.breakdownRow, styles.breakdownHeaderRow]}>
            <Text style={[styles.breakdownCell, styles.breakdownGroupCol, styles.breakdownHeaderText]}>Score</Text>
            <Text style={[styles.breakdownCell, styles.breakdownHeaderText]}>Trades</Text>
            <Text style={[styles.breakdownCell, styles.breakdownHeaderText]}>Win rate</Text>
            <Text style={[styles.breakdownCell, styles.breakdownHeaderText]}>Avg R</Text>
          </View>
          {scoreRangeBreakdown.map((bucket) => (
            <View key={bucket.range} style={styles.breakdownRow}>
              <Text style={[styles.breakdownCell, styles.breakdownGroupCol, styles.breakdownGroupText]}>{bucket.range}</Text>
              <Text style={styles.breakdownCell}>{bucket.count}</Text>
              <Text style={styles.breakdownCell}>{bucket.count === 0 ? "—" : `${bucket.winRate.toFixed(0)}%`}</Text>
              <Text style={styles.breakdownCell}>
                {bucket.averageR === null ? "—" : `${bucket.averageR >= 0 ? "+" : ""}${bucket.averageR.toFixed(2)}R`}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {perPair.length > 1 && (
        <View>
          <Text style={styles.sectionHeading}>Results by pair</Text>
          <View style={styles.breakdownTable}>
            <View style={[styles.breakdownRow, styles.breakdownHeaderRow]}>
              <Text style={[styles.breakdownCell, styles.breakdownGroupCol, styles.breakdownHeaderText]}>Pair</Text>
              <Text style={[styles.breakdownCell, styles.breakdownHeaderText]}>Trades</Text>
              <Text style={[styles.breakdownCell, styles.breakdownHeaderText]}>Win rate</Text>
              <Text style={[styles.breakdownCell, styles.breakdownHeaderText]}>Avg R</Text>
            </View>
            {perPair.map(({ pair, stats: pairStats }) => (
              <View key={pair} style={styles.breakdownRow}>
                <Text style={[styles.breakdownCell, styles.breakdownGroupCol, styles.breakdownGroupText]}>{pair}</Text>
                <Text style={styles.breakdownCell}>{pairStats.count}</Text>
                <Text style={styles.breakdownCell}>{pairStats.count === 0 ? "—" : `${pairStats.winRate.toFixed(0)}%`}</Text>
                <Text style={styles.breakdownCell}>
                  {pairStats.averageR === null ? "—" : `${pairStats.averageR >= 0 ? "+" : ""}${pairStats.averageR.toFixed(2)}R`}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

export function BacktestPanel() {
  const api = useApi();
  const { data, setData } = usePolling(() => api.get<BacktestListResponse>("/api/backtest"), POLL_INTERVAL_MS);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(request: BacktestRequest) {
    setStarting(true);
    setError(null);
    try {
      const job = await api.post<BacktestJob>("/api/backtest", request);
      if (data) setData({ ...data, current: job });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start backtest");
    } finally {
      setStarting(false);
    }
  }

  async function cancel() {
    if (!data?.current) return;
    try {
      await api.del(`/api/backtest/${data.current.id}`);
    } catch {
      // Best-effort -- the next poll tick will reflect the real state either way.
    }
  }

  const current = data?.current ?? null;
  const isActive = current?.status === "queued" || current?.status === "running";
  const showResults = current && (current.status === "completed" || current.status === "failed" || current.status === "cancelled");

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <RunForm onStart={start} busy={starting} disabled={isActive} />
      {error && <Text style={styles.errorText}>{error}</Text>}
      {isActive && current && <ProgressView job={current} onCancel={cancel} />}
      {showResults && current && <ResultsView job={current} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: 16, gap: 16, paddingBottom: 100 },
  formCard: { borderRadius: 14, borderWidth: 1, borderColor: DashboardColors.border, backgroundColor: DashboardColors.surface, padding: 14, gap: 10 },
  formLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, color: DashboardColors.textMuted },
  checkboxRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: DashboardColors.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkboxChecked: { backgroundColor: DashboardColors.sky, borderColor: DashboardColors.sky },
  checkboxMark: { color: "#04202f", fontSize: 12, fontWeight: "800" },
  checkboxLabel: { fontSize: 13, fontWeight: "600", color: DashboardColors.textPrimary },
  checkboxHint: { fontSize: 11, color: DashboardColors.textMuted, marginTop: 2 },
  flexShrink: { flexShrink: 1 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderRadius: 8, borderWidth: 1, borderColor: DashboardColors.border, backgroundColor: DashboardColors.surfaceAlt, paddingHorizontal: 10, paddingVertical: 6 },
  chipSelected: { borderColor: DashboardColors.sky, backgroundColor: DashboardColors.skyBg },
  chipText: { fontSize: 11, fontWeight: "600", color: DashboardColors.textSecondary },
  chipTextSelected: { color: DashboardColors.sky },
  lookbackRow: { gap: 6 },
  lookbackInput: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: DashboardColors.border,
    backgroundColor: DashboardColors.surfaceAlt,
    color: DashboardColors.textPrimary,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    width: 90,
  },
  runButton: { borderRadius: 10, backgroundColor: DashboardColors.sky, paddingVertical: 12, alignItems: "center" },
  runButtonText: { color: "#04202f", fontWeight: "800", fontSize: 14 },
  disabled: { opacity: 0.4 },
  errorText: { fontSize: 12, color: DashboardColors.rose },
  progressHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  progressTitle: { fontSize: 13, fontWeight: "700", color: DashboardColors.textPrimary },
  cancelText: { fontSize: 12, fontWeight: "700", color: DashboardColors.rose },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: DashboardColors.surfaceAlt, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: DashboardColors.sky },
  failedBox: { borderRadius: 12, borderWidth: 1, borderColor: DashboardColors.roseStrong, backgroundColor: DashboardColors.roseBg, padding: 14 },
  failedText: { fontSize: 13, color: DashboardColors.rose },
  resultsGap: { gap: 12 },
  modeBadge: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  modeBadgeRealistic: { backgroundColor: DashboardColors.skyBg },
  modeBadgeIdealized: { backgroundColor: DashboardColors.surfaceAlt },
  modeBadgeText: { fontSize: 11, fontWeight: "700" },
  disclosureBox: { borderRadius: 10, borderWidth: 1, borderColor: DashboardColors.amber, backgroundColor: DashboardColors.amberBg, padding: 12, gap: 4 },
  disclosureTitle: { fontSize: 12, fontWeight: "800", color: DashboardColors.amber },
  disclosureBullet: { fontSize: 11, color: DashboardColors.textSecondary, lineHeight: 16 },
  disclosureFooter: { fontSize: 11, fontWeight: "700", color: DashboardColors.amber, marginTop: 2 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statTile: { flexBasis: "47%", flexGrow: 1, borderRadius: 10, borderWidth: 1, borderColor: DashboardColors.border, backgroundColor: DashboardColors.surfaceAlt, padding: 10 },
  statLabel: { fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, color: DashboardColors.textMuted },
  statValue: { marginTop: 4, fontSize: 16, fontWeight: "700", fontVariant: ["tabular-nums"] },
  statHint: { marginTop: 2, fontSize: 10, color: DashboardColors.textMuted },
  sectionHeading: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", color: DashboardColors.textMuted, marginBottom: 8 },
  breakdownTable: { borderRadius: 10, borderWidth: 1, borderColor: DashboardColors.border, backgroundColor: DashboardColors.surface, overflow: "hidden" },
  breakdownRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: DashboardColors.border },
  breakdownHeaderRow: { backgroundColor: DashboardColors.surfaceAlt },
  breakdownCell: { flex: 1, paddingHorizontal: 10, paddingVertical: 8, fontSize: 11, color: DashboardColors.textSecondary, fontVariant: ["tabular-nums"] },
  breakdownGroupCol: { flex: 1.4 },
  breakdownGroupText: { color: DashboardColors.textPrimary, fontWeight: "600" },
  breakdownHeaderText: { color: DashboardColors.textMuted, fontWeight: "700", textTransform: "uppercase", fontSize: 10 },
});
