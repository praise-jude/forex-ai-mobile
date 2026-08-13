import { Link } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useApi } from "@/lib/api/client";
import { usePolling } from "@/lib/api/usePolling";
import { useSettings } from "@/lib/api/SettingsContext";
import { executeSignalRequest, rejectSignalRequest } from "@/lib/api/executionClient";
import { buildConfirmPhrase } from "@/lib/voice/grammar";
import {
  statusFromTrade,
  PAIRS,
  type CardStatus,
  type ConfirmationModeResponse,
  type EngineModeResponse,
  type HigherTimeframeTrends,
  type Pair,
  type PredictionUpdate,
  type Signal,
  type SignalsSnapshot,
  type Timeframe,
  type WatchlistEntry,
} from "@/lib/api/types";
import { DashboardColors } from "@/constants/dashboardColors";
import { ConnectionStatusBadge } from "@/components/dashboard/ConnectionStatusBadge";
import { EngineModeControl } from "@/components/dashboard/EngineModeControl";
import { KillSwitchControl } from "@/components/dashboard/KillSwitchControl";
import { EmergencyStopControl } from "@/components/dashboard/EmergencyStopControl";
import { ExecutionPolicyControl } from "@/components/dashboard/ExecutionPolicyControl";
import { RiskGuardianBanner } from "@/components/dashboard/RiskGuardianBanner";
import { Watchlist } from "@/components/dashboard/Watchlist";
import { PriceChart } from "@/components/dashboard/PriceChart";
import { PredictionCard } from "@/components/dashboard/PredictionCard";
import { TimeframeSelector } from "@/components/dashboard/TimeframeSelector";
import { SignalsList } from "@/components/dashboard/SignalsList";
import { PositionsList } from "@/components/dashboard/PositionsList";
import { SignalToastStack, type ToastEntry } from "@/components/dashboard/SignalToast";
import { VoiceAssistantPanel } from "@/components/dashboard/VoiceAssistantPanel";
import { DisclaimerFooter } from "@/components/dashboard/DisclaimerFooter";
import { useVoiceAssistant } from "@/lib/voice/useVoiceAssistant";

const SIGNALS_POLL_MS = 5000;

function emptyWatchlist(): WatchlistEntry[] {
  return PAIRS.map((pair) => ({ pair, bid: null, ask: null, time: null }));
}

function buildPredictionMap(updates: PredictionUpdate[]): Partial<Record<Pair, Partial<Record<Timeframe, PredictionUpdate>>>> {
  const map: Partial<Record<Pair, Partial<Record<Timeframe, PredictionUpdate>>>> = {};
  for (const update of updates) {
    map[update.pair] = { ...map[update.pair], [update.timeframe]: update };
  }
  return map;
}

function buildTrendsMap(
  updates: PredictionUpdate[]
): Partial<Record<Pair, Partial<Record<Timeframe, HigherTimeframeTrends>>>> {
  const map: Partial<Record<Pair, Partial<Record<Timeframe, HigherTimeframeTrends>>>> = {};
  for (const update of updates) {
    map[update.pair] = { ...map[update.pair], [update.timeframe]: update.trends };
  }
  return map;
}

export default function DashboardScreen() {
  const { isConfigured, loaded, serverUrl, authHeader } = useSettings();
  const api = useApi();

  const [selectedPair, setSelectedPair] = useState<Pair>(PAIRS[0]);
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>("15m");
  const [localStatuses, setLocalStatuses] = useState<Record<string, CardStatus>>({});
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const seenSignalIds = useRef<Set<string>>(new Set());
  const firstSnapshot = useRef(true);

  const { data: snapshot, error: snapshotError } = usePolling(
    () => api.get<SignalsSnapshot>("/api/signals"),
    SIGNALS_POLL_MS,
    isConfigured
  );

  // Confirmation Mode's own state -- drives whether SignalsList shows an execute
  // affordance at all ("signal_only") or the propose-then-approve flow ("confirm").
  const { data: confirmationMode } = usePolling(
    () => api.get<ConfirmationModeResponse>("/api/confirmation-mode"),
    15000,
    isConfigured
  );
  // Seeds the proposal card's default "Risk" figure -- the account's actually-configured
  // riskPerTradePct. EngineModeControl polls the same endpoint independently; both are
  // cheap, infrequent GETs so no dedup mechanism is needed here (unlike the web app's
  // usePolledResource, mobile's usePolling is per-hook by design, see its own doc comment).
  const { data: engineModeData } = usePolling(() => api.get<EngineModeResponse>("/api/engine-mode"), 7000, isConfigured);

  const watchlist = snapshot?.watchlist ?? emptyWatchlist();
  const signals = snapshot?.signals ?? [];
  const predictions = buildPredictionMap(snapshot?.predictions ?? []);
  const trends = buildTrendsMap(snapshot?.predictions ?? []);
  const selectedPrediction = predictions[selectedPair]?.[selectedTimeframe] ?? null;

  const dismissToast = useCallback((key: string) => {
    setToasts((prev) => prev.filter((t) => t.key !== key));
  }, []);

  // The same function both SignalsList's Approve button and the voice assistant's
  // hard-confirm path call -- voice execution is never a separate code path, so it can
  // never bypass the backend's risk checks. Builds the exact same confirmation phrase
  // the execute route itself requires (buildConfirmPhrase, shared with voice) so callers
  // here never need to know about it individually.
  const executeSignal = useCallback(
    async (signal: Signal, riskPctOverride?: number) => {
      setLocalStatuses((prev) => ({ ...prev, [signal.id]: { state: "loading" } }));
      const result = await executeSignalRequest(serverUrl, authHeader, signal.id, buildConfirmPhrase(signal), riskPctOverride);
      setLocalStatuses((prev) => ({ ...prev, [signal.id]: { state: "done", result } }));
      return result;
    },
    [serverUrl, authHeader]
  );

  const rejectSignal = useCallback(
    async (signal: Signal) => {
      await rejectSignalRequest(serverUrl, authHeader, signal.id);
    },
    [serverUrl, authHeader]
  );

  const voice = useVoiceAssistant({
    signals,
    statuses: localStatuses,
    executeSignal: (signal) => void executeSignal(signal),
    selectedPair,
    selectedTimeframe,
    predictions,
  });

  // Synchronizes local notification/status state with the polled server feed -- new
  // signals become toasts (and a JUDE voice announcement), executed trades seed a card's
  // status -- which is exactly the "subscribe to an external system" case effects are
  // for, not state derivable from props/render alone (it accumulates over time and needs
  // the seenSignalIds dedup ref).
  useEffect(() => {
    if (!snapshot) return;

    const seeded: Record<string, CardStatus> = {};
    for (const trade of snapshot.executedTrades) {
      const status = statusFromTrade(trade);
      if (status) seeded[trade.signalId] = status;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- accumulating notification state from a polled external feed, not state derivable from render.
    setLocalStatuses((prev) => ({ ...seeded, ...prev }));

    const newToasts: ToastEntry[] = [];
    for (const signal of snapshot.signals) {
      if (seenSignalIds.current.has(signal.id)) continue;
      seenSignalIds.current.add(signal.id);
      // Watch-tier signals are informational only -- match the web dashboard by not
      // popping a toast (or a JUDE announcement) for them, and never toast for signals
      // already on record on the very first poll (that would replay every recent signal
      // as "new" on app open).
      if (!firstSnapshot.current && signal.tier !== "watch") {
        newToasts.push({ key: `${signal.id}-${Date.now()}`, signal });
        voice.onSignal(signal);
      }
    }
    if (newToasts.length > 0) setToasts((prev) => [...prev, ...newToasts]);
    firstSnapshot.current = false;

    // Fed to every pair, not just selectedPair -- onPredictionChange itself decides
    // whether to actually speak (only for the currently selected pair) vs silently
    // track the headline so a background pair's change doesn't misfire once selected.
    for (const update of snapshot.predictions) voice.onPredictionChange(update);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- voice.onSignal/onPredictionChange have stable identities (see useVoiceAssistant's own empty-deps useCallback); omitted so this effect doesn't re-run on every voice-state change.
  }, [snapshot]);

  if (!loaded) return null;

  if (!isConfigured) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Not connected yet</Text>
          <Text style={styles.emptyBody}>Set the dashboard server URL and password in Settings to see live signals.</Text>
          <Link href="/settings" style={styles.emptyLink}>
            Go to Settings →
          </Link>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Forex AI</Text>
            <Text style={styles.subtitle}>SMC signals · JUDE / OMINI</Text>
          </View>
          <ConnectionStatusBadge />
        </View>

        {snapshotError && <Text style={styles.errorBanner}>{snapshotError}</Text>}

        <RiskGuardianBanner />

        <View style={styles.card}>
          <EngineModeControl />
          <View style={styles.controlsDivider} />
          <KillSwitchControl account="live" />
          <View style={styles.controlsDivider} />
          <EmergencyStopControl account="live" />
          <View style={styles.controlsDivider} />
          <ExecutionPolicyControl />
        </View>

        <VoiceAssistantPanel {...voice} />

        <Watchlist entries={watchlist} selectedPair={selectedPair} onSelect={setSelectedPair} />

        <View style={styles.timeframeRow}>
          <TimeframeSelector value={selectedTimeframe} onChange={setSelectedTimeframe} />
        </View>

        <PredictionCard update={selectedPrediction} />

        <View style={styles.card}>
          <PriceChart pair={selectedPair} timeframe={selectedTimeframe} prediction={selectedPrediction} />
        </View>

        <SignalsList
          signals={signals}
          statuses={localStatuses}
          trends={trends}
          manualMode={confirmationMode?.manualMode ?? "confirm"}
          ttlSeconds={confirmationMode?.proposalTtlSeconds ?? 120}
          defaultRiskPct={engineModeData?.riskPerTradePct ?? 1}
          onApprove={(signal, riskPctOverride) => void executeSignal(signal, riskPctOverride)}
          onReject={rejectSignal}
        />

        <PositionsList />

        <DisclaimerFooter />
      </ScrollView>

      <SignalToastStack toasts={toasts} onDismiss={dismissToast} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: DashboardColors.background },
  scrollContent: { padding: 16, gap: 16, paddingBottom: 100 },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  title: { fontSize: 20, fontWeight: "800", color: DashboardColors.textPrimary },
  subtitle: { fontSize: 12, color: DashboardColors.textMuted, marginTop: 2 },
  errorBanner: {
    fontSize: 12,
    color: DashboardColors.rose,
    backgroundColor: DashboardColors.roseBg,
    borderRadius: 8,
    padding: 8,
  },
  timeframeRow: { flexDirection: "row", justifyContent: "flex-end" },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: DashboardColors.border,
    backgroundColor: DashboardColors.surface,
    padding: 14,
  },
  controlsDivider: { height: 1, backgroundColor: DashboardColors.border, marginVertical: 12 },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: DashboardColors.textPrimary },
  emptyBody: { fontSize: 13, color: DashboardColors.textSecondary, textAlign: "center" },
  emptyLink: { fontSize: 14, fontWeight: "700", color: DashboardColors.sky, marginTop: 8 },
});
