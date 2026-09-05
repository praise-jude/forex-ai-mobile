import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useIsFocused } from "expo-router";
import { useApi } from "@/lib/api/client";
import { usePolledResource } from "@/lib/api/usePolledResource";
import type { CalibrationStatus, DimensionTier, JournalResponse, SignerBCalibrationBucket } from "@/lib/api/types";
import { DashboardColors } from "@/constants/dashboardColors";
import { ProgressBar } from "./ProgressBar";

// Trades close on the order of minutes to hours, not seconds -- matches the Journal
// screen's own poll interval for the same /api/trade-journal endpoint.
const POLL_INTERVAL_MS = 15000;

// Mirrors forex-ai's confidenceScore.ts real thresholds (WATCH_THRESHOLD=70,
// BUY_THRESHOLD=75 as of 2026-08-28, STRONG_BUY_THRESHOLD=90) -- these were previously
// hardcoded as "Buy (90-94)"/"Strong buy (95-100)"/"Watch (80-89)"/"No trade (<80)",
// which had silently drifted out of sync with the real boundaries tierOf() actually
// uses. No server-side module to import the constants from here (client bundle), so
// keep these three numbers in sync with confidenceScore.ts by hand if it's ever tuned.
const WATCH_THRESHOLD = 70;
const BUY_THRESHOLD = 75;
const STRONG_BUY_THRESHOLD = 90;

const SIGNER_A_TIER_LABEL: Record<"buy" | "strong_buy", string> = {
  buy: `Buy (${BUY_THRESHOLD}-${STRONG_BUY_THRESHOLD - 1})`,
  strong_buy: `Strong buy (${STRONG_BUY_THRESHOLD}-100)`,
};

const SIGNER_B_TIER_LABEL: Record<DimensionTier, string> = {
  no_trade: `No trade (<${WATCH_THRESHOLD})`,
  watch: `Watch (${WATCH_THRESHOLD}-${BUY_THRESHOLD - 1})`,
  buy: `Buy (${BUY_THRESHOLD}-${STRONG_BUY_THRESHOLD - 1})`,
  strong_buy: `Strong buy (${STRONG_BUY_THRESHOLD}-100)`,
};

interface CalibrationBucketLike {
  sampleSize: number;
  status: CalibrationStatus;
  winRate: number | null;
  averageR: number | null;
  expectancy: number | null;
}

/** RN port of forex-ai's app/settings/page.tsx CalibrationRow -- real historical
 * performance per confidence tier, so "95% confidence" can be checked against what
 * actually happened instead of trusted as a probability. Read-only measurement, never
 * wired into position sizing. Shared by both Signer A's and Signer B's buckets --
 * `label` is computed by the caller since the two use different tier vocabularies. */
function CalibrationRow({ label, bucket, minSamples }: { label: string; bucket: CalibrationBucketLike; minSamples: number }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <Text style={styles.tierLabel}>{label}</Text>
        <Text style={styles.sampleCount}>{bucket.sampleSize} closed trades</Text>
      </View>
      {bucket.status === "insufficient_data" ? (
        <ProgressBar value={bucket.sampleSize} max={minSamples} label={`${bucket.sampleSize} of ${minSamples} closed trades`} />
      ) : (
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Real win rate</Text>
            <Text style={styles.statValue}>{bucket.winRate === null ? "—" : `${bucket.winRate.toFixed(1)}%`}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Average R</Text>
            <Text style={styles.statValue}>{bucket.averageR?.toFixed(2)}R</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Expectancy</Text>
            <Text style={styles.statValue}>{bucket.expectancy?.toFixed(2)}R</Text>
          </View>
        </View>
      )}
    </View>
  );
}

/** "Is Signer B actually pulling its weight, or just rubber-stamping Signer A" -- a
 * fired signal always has Signer B agreeing on direction (decisionMatrix.ts holds on
 * any disagreement/neutral read), so the interesting comparison is whether Signer B's
 * own confidence level predicts real outcomes, not agree/disagree (always "agree"). RN
 * port of forex-ai's app/settings/page.tsx SignerBScorecard. */
function SignerBScorecard({ buckets, minSamples }: { buckets: SignerBCalibrationBucket[]; minSamples: number }) {
  return (
    <View style={styles.subsection}>
      <Text style={styles.subsectionTitle}>Signer B (independent confirmation)</Text>
      <Text style={styles.subtitle}>
        Every fired signal already has Signer B agreeing with Signer A on direction — this checks whether Signer B&apos;s own
        confidence level actually tracks real outcomes.
      </Text>
      {buckets.map((bucket) => (
        <CalibrationRow key={bucket.tier} label={SIGNER_B_TIER_LABEL[bucket.tier]} bucket={bucket} minSamples={minSamples} />
      ))}
    </View>
  );
}

// Memoized (zero props) and gated on tab focus -- Settings stays mounted under
// NativeTabs even while another tab is active. Shares the "trade-journal" key with
// JournalPanel.tsx (Journal tab) -- both used to poll /api/trade-journal
// independently; since each gates on its own screen's focus, only one is ever
// actually enabled at a time, and usePolledResource makes that a real guarantee
// instead of relying on the two components happening to agree.
export const ConfidenceCalibrationCard = memo(function ConfidenceCalibrationCard() {
  const api = useApi();
  const isFocused = useIsFocused();
  const { data } = usePolledResource("trade-journal", () => api.get<JournalResponse>("/api/trade-journal"), POLL_INTERVAL_MS, isFocused);

  if (!data) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Confidence calibration</Text>
      <Text style={styles.subtitle}>
        Real historical performance per confidence tier — confidence-weighted sizing will only ever use these numbers once a
        tier has enough samples to trust, never the raw AI score alone.
      </Text>
      <View style={styles.subsection}>
        <Text style={styles.subsectionTitle}>Signer A (SMC)</Text>
        {data.confidenceCalibration.map((bucket) => (
          <CalibrationRow key={bucket.tier} label={SIGNER_A_TIER_LABEL[bucket.tier]} bucket={bucket} minSamples={data.calibrationMinSamples} />
        ))}
      </View>
      <SignerBScorecard buckets={data.signerBCalibration} minSamples={data.calibrationMinSamples} />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { gap: 10 },
  title: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", color: DashboardColors.textMuted },
  subtitle: { fontSize: 11, color: DashboardColors.textMuted, lineHeight: 15 },
  subsection: { gap: 8, marginTop: 4 },
  subsectionTitle: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", color: DashboardColors.textMuted },
  row: { borderRadius: 12, borderWidth: 1, borderColor: DashboardColors.border, backgroundColor: DashboardColors.surfaceAlt, padding: 12, gap: 6 },
  rowHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tierLabel: { fontSize: 13, fontWeight: "700", color: DashboardColors.textPrimary },
  sampleCount: { fontSize: 11, color: DashboardColors.textMuted },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  statItem: { gap: 1 },
  statLabel: { fontSize: 10, color: DashboardColors.textMuted },
  statValue: { fontSize: 13, fontWeight: "700", color: DashboardColors.textPrimary, fontVariant: ["tabular-nums"] },
});
