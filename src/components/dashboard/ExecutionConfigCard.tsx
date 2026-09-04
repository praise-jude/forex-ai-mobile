import { DashboardColors } from "@/constants/dashboardColors";
import { useApi } from "@/lib/api/client";
import type { ExecutionConfig, ExecutionConfigResponse } from "@/lib/api/types";
import { usePolling } from "@/lib/api/usePolling";
import { useIsFocused } from "expo-router";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

// Env-var-backed config changes only on a redeploy -- no need to poll tighter than the
// slower panels on this screen.
const POLL_INTERVAL_MS = 15000;

function ConfigRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>
        {label}
        {hint && <Text style={styles.hint}> ({hint})</Text>}
      </Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

/** Read-only -- these come from env vars (see forex-ai's README "Manual execution"
 * config table), not a live-editable control like EngineModeControl above. RN port of
 * forex-ai's app/settings/page.tsx ExecutionConfigTable. */
function ConfigBlock({
  account,
  config,
}: {
  account: string;
  config: ExecutionConfig;
}) {
  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>{account}</Text>
      <ConfigRow label="Risk per trade" value={`${config.riskPerTradePct}%`} />
      <ConfigRow
        label="Max concurrent positions"
        value={String(config.maxConcurrentPositions)}
      />
      <ConfigRow
        label="Max correlated positions"
        value={String(config.maxCorrelatedPositions)}
      />
      <ConfigRow label="Max daily loss" value={`${config.maxDailyLossPct}%`} />
      <ConfigRow
        label="Max trades per day"
        value={String(config.maxTradesPerDay)}
      />
      <ConfigRow
        label="Max consecutive losses"
        value={String(config.maxConsecutiveLosses)}
        hint={`${config.cooldownMinutes}min cooldown`}
      />
      <ConfigRow
        label="Max spread"
        value={`${(config.maxSpreadFractionOfStop * 100).toFixed(0)}% of stop distance`}
      />
      <ConfigRow
        label="M5 entry confirmation"
        value={config.m5ConfirmationEnabled ? "Enabled" : "Disabled"}
      />
      <ConfigRow
        label="Position management"
        value={config.positionManagementEnabled ? "Enabled" : "Disabled"}
        hint={`break-even @ ${config.breakEvenTriggerR}R, trailing @ ${config.trailingArmTriggerR}R`}
      />
      <ConfigRow
        label="Partial take-profit"
        value={
          config.partialCloseEnabled
            ? `Enabled (${(config.partialCloseFraction * 100).toFixed(0)}% at TP1)`
            : "Disabled"
        }
      />
      <ConfigRow
        label="Graduated de-escalation"
        value={
          config.deEscalationEnabled
            ? `Enabled (half size from ${(config.deEscalationFraction * config.maxDailyLossPct).toFixed(2)}% drawdown)`
            : "Disabled"
        }
        hint={
          config.deEscalationEnabled
            ? `hard halt still at ${config.maxDailyLossPct}%`
            : undefined
        }
      />
      <ConfigRow
        label="Adaptive engine sizing"
        value={
          config.adaptiveEngineSizingEnabled
            ? `Enabled (after ${config.edgeMinSamples} trades)`
            : "Disabled"
        }
      />
      <ConfigRow
        label="Session edge sizing"
        value={
          config.sessionEdgeSizingEnabled
            ? `Enabled (after ${config.edgeMinSamples} trades)`
            : "Disabled"
        }
      />
      <ConfigRow
        label="Alert webhook"
        value={config.alertWebhookUrl ? "Configured" : "Disabled"}
      />
      <ConfigRow
        label="Confidence-weighted sizing"
        value={
          config.confidenceSizingEnabled
            ? `Enabled (buy ${config.riskMultiplierBuy}x, strong_buy ${config.riskMultiplierStrongBuy}x)`
            : "Disabled"
        }
      />
    </View>
  );
}

// Memoized (zero props) so unrelated Settings screen re-renders don't re-render this,
// and gated on tab focus since Settings stays mounted under NativeTabs even while
// another tab is active.
export const ExecutionConfigCard = memo(function ExecutionConfigCard() {
  const api = useApi();
  const isFocused = useIsFocused();
  const { data } = usePolling(
    () => api.get<ExecutionConfigResponse>("/api/execution-config"),
    POLL_INTERVAL_MS,
    isFocused,
  );

  if (!data) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        Risk &amp; execution config{" "}
        <Text style={styles.titleHint}>(env vars — see README)</Text>
      </Text>
      <ConfigBlock account="Live" config={data.live} />
      {data.demo && <ConfigBlock account="Demo" config={data.demo} />}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { gap: 10 },
  title: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: DashboardColors.textMuted,
  },
  titleHint: {
    textTransform: "none",
    fontWeight: "400",
    color: DashboardColors.textMuted,
  },
  block: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: DashboardColors.border,
    backgroundColor: DashboardColors.surfaceAlt,
    padding: 12,
    gap: 2,
  },
  blockTitle: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: DashboardColors.textMuted,
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: DashboardColors.border,
  },
  label: { fontSize: 12, color: DashboardColors.textSecondary, flexShrink: 1 },
  hint: { fontSize: 10, color: DashboardColors.textMuted },
  value: {
    fontSize: 12,
    fontWeight: "700",
    color: DashboardColors.textPrimary,
    fontVariant: ["tabular-nums"],
  },
});
