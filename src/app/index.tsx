import { Link, useIsFocused } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useApi } from "@/lib/api/client";
import { usePolling } from "@/lib/api/usePolling";
import { usePolledResource } from "@/lib/api/usePolledResource";
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
import { MarketSessionsPanel } from "@/components/dashboard/MarketSessionsPanel";
import { RiskGuardianBanner } from "@/components/dashboard/RiskGuardianBanner";
import { Watchlist } from "@/components/dashboard/Watchlist";
import { PriceChart } from "@/components/dashboard/PriceChart";
import { PredictionCard } from "@/components/dashboard/PredictionCard";
import { TimeframeSelector } from "@/components/dashboard/TimeframeSelector";
import { TrendDirectionBadge } from "@/components/dashboard/TrendDirectionBadge";
import { SignalsList } from "@/components/dashboard/SignalsList";
import { PositionsList } from "@/components/dashboard/PositionsList";
import { OnDemandSignalCheck } from "@/components/dashboard/OnDemandSignalCheck";
import { ManualTradeCheck } from "@/components/dashboard/ManualTradeCheck";
import { SignalToastStack, type ToastEntry } from "@/components/dashboard/SignalToast";
import { VoiceAssistantPanel } from "@/components/dashboard/VoiceAssistantPanel";
import { DisclaimerFooter } from "@/components/dashboard/DisclaimerFooter";
import { useVoiceAssistant } from "@/lib/voice/useVoiceAssistant";

const SIGNALS_POLL_MS = 5000;

// A hoisted constant, not a function rebuilding this array every render -- feeds into
// stabilizeWatchlist below either way (its content-based comparison would catch a
// freshly-built-but-identical array too), but there's no reason to reallocate it.
const EMPTY_WATCHLIST: WatchlistEntry[] = PAIRS.map((pair) => ({ pair, bid: null, ask: null, time: null }));

/** Reuses each signal's previous-render object reference by id (mutating `cache` in
 * place) so SignalCard's React.memo can actually bail out on an unrelated poll tick --
 * see the doc comment on stableSignalsRef in DashboardScreen. Ids no longer present in
 * `raw` are pruned from the cache so it can't grow unbounded over a long session. */
function stabilizeSignals(cache: Map<string, Signal>, raw: Signal[]): Signal[] {
  const seen = new Set<string>();
  const stabilized = raw.map((signal) => {
    seen.add(signal.id);
    const existing = cache.get(signal.id);
    if (existing) return existing;
    cache.set(signal.id, signal);
    return signal;
  });
  for (const id of cache.keys()) {
    if (!seen.has(id)) cache.delete(id);
  }
  return stabilized;
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

function sameTrends(a: HigherTimeframeTrends, b: HigherTimeframeTrends): boolean {
  return a.d1 === b.d1 && a.h4 === b.h4 && a.h1 === b.h1;
}

/** Unlike signals, a prediction's trends genuinely can change value for the same
 * pair+timeframe key (D1/H4/H1 bias shifts over time) -- so this reuses the previous
 * reference only when the actual bullish/bearish/neutral values are unchanged, not just
 * because the key was seen before. Same purpose as stabilizeSignals: without this,
 * SignalCard's `trends` prop would be a fresh object every poll tick regardless of
 * whether the bias actually moved, defeating its memoization. */
function stabilizeTrendsMap(
  cache: Map<string, HigherTimeframeTrends>,
  raw: Partial<Record<Pair, Partial<Record<Timeframe, HigherTimeframeTrends>>>>
): Partial<Record<Pair, Partial<Record<Timeframe, HigherTimeframeTrends>>>> {
  const seen = new Set<string>();
  const stabilized: Partial<Record<Pair, Partial<Record<Timeframe, HigherTimeframeTrends>>>> = {};
  for (const [pair, byTimeframe] of Object.entries(raw) as [Pair, Partial<Record<Timeframe, HigherTimeframeTrends>>][]) {
    const stableByTimeframe: Partial<Record<Timeframe, HigherTimeframeTrends>> = {};
    for (const [timeframe, trends] of Object.entries(byTimeframe) as [Timeframe, HigherTimeframeTrends][]) {
      const key = `${pair}:${timeframe}`;
      seen.add(key);
      const existing = cache.get(key);
      const stable = existing && sameTrends(existing, trends) ? existing : trends;
      cache.set(key, stable);
      stableByTimeframe[timeframe] = stable;
    }
    stabilized[pair] = stableByTimeframe;
  }
  for (const key of cache.keys()) {
    if (!seen.has(key)) cache.delete(key);
  }
  return stabilized;
}

interface WatchlistCache {
  entries: Map<Pair, WatchlistEntry>;
  // Watchlist itself (not per-row children) is the memoized component, and it receives
  // this whole array as a single prop -- `.map()` always returns a new array reference
  // even when every element inside is unchanged, which would defeat that memoization
  // just as surely as an unstabilized per-item reference would. So the previous
  // render's OUTPUT array is cached too, and reused whenever every element still
  // matches it position-for-position.
  lastOutput: WatchlistEntry[];
}

/** Same purpose as stabilizeSignals/stabilizeTrendsMap, applied to watchlist rows so
 * Watchlist's own memoization isn't defeated by a fresh JSON.parse every poll tick when
 * a given pair's price genuinely hasn't moved. */
function stabilizeWatchlist(cacheRef: WatchlistCache, raw: WatchlistEntry[]): WatchlistEntry[] {
  const seen = new Set<Pair>();
  const stabilized = raw.map((entry) => {
    seen.add(entry.pair);
    const existing = cacheRef.entries.get(entry.pair);
    const stable = existing && existing.bid === entry.bid && existing.ask === entry.ask && existing.time === entry.time ? existing : entry;
    cacheRef.entries.set(entry.pair, stable);
    return stable;
  });
  for (const pair of cacheRef.entries.keys()) {
    if (!seen.has(pair)) cacheRef.entries.delete(pair);
  }

  const { lastOutput } = cacheRef;
  const unchanged = lastOutput.length === stabilized.length && lastOutput.every((entry, i) => entry === stabilized[i]);
  if (unchanged) return lastOutput;
  cacheRef.lastOutput = stabilized;
  return stabilized;
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
  // Every poll response is a fresh JSON.parse -- even a signal whose data hasn't
  // changed arrives as a brand-new object every 5s tick, which would defeat
  // SignalCard's React.memo entirely (its `signal` prop would always look "changed").
  // A signal's own fields never mutate after creation once published (only new ids get
  // appended server-side), so it's safe to reuse the previous render's object for any
  // id seen before, and only treat genuinely new ids as new objects.
  const stableSignalsRef = useRef<Map<string, Signal>>(new Map());
  const stableTrendsRef = useRef<Map<string, HigherTimeframeTrends>>(new Map());
  const stableWatchlistRef = useRef<WatchlistCache>({ entries: new Map(), lastOutput: [] });

  // Every tab (Dashboard/Chat/Journal/Backtest/Settings) stays mounted the whole app
  // session under expo-router's NativeTabs -- switching tabs never unmounts a screen,
  // it only blocks touches on the inactive ones. Without gating on focus, every poll
  // below would keep firing in the background regardless of which tab is actually on
  // screen, compounding across all five. isFocused flips false the instant another tab
  // is selected and true again the instant this one is, so each `enabled` here also
  // doubles as "only poll while this screen is actually visible".
  const isFocused = useIsFocused();

  // Shared "signals" key with SignalDiagnosticsCard.tsx (Settings tab) -- both used to
  // poll /api/signals independently. Since both gate on their own screen's isFocused
  // and only one screen is ever focused at a time, this key is never actually polled
  // from two places at once; usePolledResource just makes that guarantee robust instead
  // of relying on the two components happening to agree.
  const { data: snapshot, error: snapshotError, setData: setSnapshot } = usePolledResource(
    "signals",
    () => api.get<SignalsSnapshot>("/api/signals"),
    SIGNALS_POLL_MS,
    isConfigured && isFocused
  );

  // Confirmation Mode's own state -- drives whether SignalsList shows an execute
  // affordance at all ("signal_only") or the propose-then-approve flow ("confirm").
  const { data: confirmationMode, setData: setConfirmationMode } = usePolling(
    () => api.get<ConfirmationModeResponse>("/api/confirmation-mode"),
    15000,
    isConfigured && isFocused
  );
  // Seeds the proposal card's default "Risk" figure -- the account's actually-configured
  // riskPerTradePct. EngineModeControl polls the exact same "engine-mode" key --
  // usePolledResource dedupes them into one shared interval/request instead of two.
  const { data: engineModeData, setData: setEngineMode } = usePolledResource(
    "engine-mode",
    () => api.get<EngineModeResponse>("/api/engine-mode"),
    7000,
    isConfigured && isFocused
  );

  // Pull-to-refresh: forces an immediate re-fetch of everything this screen shows
  // instead of waiting for the next poll tick. Pushes results through each hook's own
  // setData (not just local state) so the shared poller cache (usePolledResource.ts's
  // registry) updates too -- any other screen/component subscribed to the same
  // "signals"/"engine-mode" keys benefits from the manual refresh as well. Same
  // "keep showing the last known value, never throw" posture as the polling hooks
  // themselves -- a failed refresh leaves stale data in place rather than surfacing an
  // error the user didn't ask to see.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        api.get<SignalsSnapshot>("/api/signals").then(setSnapshot).catch(() => {}),
        api.get<ConfirmationModeResponse>("/api/confirmation-mode").then(setConfirmationMode).catch(() => {}),
        api.get<EngineModeResponse>("/api/engine-mode").then(setEngineMode).catch(() => {}),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [api, setSnapshot, setConfirmationMode, setEngineMode]);

  // Stabilization (reusing prior-render object references for unchanged items, so
  // Watchlist/SignalCard's own memoization isn't defeated by every poll tick's fresh
  // JSON.parse) mutates cache refs -- React Compiler (enabled for this project, see
  // app.json) correctly flags that as unsafe directly in the render body, since ref
  // mutations must be confined to effects/handlers. Done in an effect instead; the one
  // extra render this costs after each poll tick is not something a phone screen can see.
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>(EMPTY_WATCHLIST);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [trends, setTrends] = useState<Partial<Record<Pair, Partial<Record<Timeframe, HigherTimeframeTrends>>>>>({});
  useEffect(() => {
    setWatchlist(stabilizeWatchlist(stableWatchlistRef.current, snapshot?.watchlist ?? EMPTY_WATCHLIST));
    setSignals(stabilizeSignals(stableSignalsRef.current, snapshot?.signals ?? []));
    setTrends(stabilizeTrendsMap(stableTrendsRef.current, buildTrendsMap(snapshot?.predictions ?? [])));
  }, [snapshot]);

  // Same fix as forex-ai's own Dashboard.tsx tonight: a signal past its own TTL
  // previously still showed a live-looking Buy/Sell button with no expiry awareness
  // at all (only the opened TradeProposalCard tracked its own countdown). Ticked
  // independently of confirmationMode's own 15s poll so a stale card actually
  // disappears close to when it expires, not up to 15s late. Filters the already-
  // stabilized `signals` array, so reference equality for surviving items is untouched.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tickId = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(tickId);
  }, []);
  const proposalTtlSeconds = confirmationMode?.proposalTtlSeconds ?? 120;
  const activeSignals = useMemo(
    () => signals.filter((signal) => now - signal.createdAt <= proposalTtlSeconds * 1000),
    [signals, proposalTtlSeconds, now]
  );

  const predictions = buildPredictionMap(snapshot?.predictions ?? []);
  const selectedPrediction = predictions[selectedPair]?.[selectedTimeframe] ?? null;

  const dismissToast = useCallback((key: string) => {
    setToasts((prev) => prev.filter((t) => t.key !== key));
  }, []);

  // Called only from SignalsList's Approve button (and OnDemandSignalCheck/
  // ManualTradeCheck's own place-trade buttons) -- NOT from voice, by explicit operator
  // request (2026-09-03): a spoken "CONFIRM ..." used to call this directly too, and the
  // operator wants every real-money execution gated on an actual button press while
  // using the phone. See useVoiceAssistant's own "hard_confirm" case for the voice side
  // of this. Builds the exact same confirmation phrase the execute route itself requires
  // (buildConfirmPhrase) so callers here never need to know about it individually.
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

  // Stable wrapper for SignalsList's onApprove -- an inline arrow function here would
  // be a new reference every render, defeating SignalCard's own memoization.
  const approveSignal = useCallback(
    (signal: Signal, riskPctOverride: number) => void executeSignal(signal, riskPctOverride),
    [executeSignal]
  );

  const voice = useVoiceAssistant({
    signals,
    statuses: localStatuses,
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
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={DashboardColors.textSecondary} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Forex AI</Text>
            <Text style={styles.subtitle}>SMC signals · JUDE / OMINI</Text>
          </View>
          <View style={styles.headerRight}>
            <ConnectionStatusBadge />
            <MarketSessionsPanel />
          </View>
        </View>

        {snapshotError && <Text style={styles.errorBanner}>{snapshotError}</Text>}

        <RiskGuardianBanner />

        <VoiceAssistantPanel {...voice} />

        <Watchlist entries={watchlist} selectedPair={selectedPair} onSelect={setSelectedPair} />

        <View style={styles.timeframeRow}>
          <View style={styles.trendBadgeSlot}>
            <TrendDirectionBadge trends={selectedPrediction?.trends} />
          </View>
          <TimeframeSelector value={selectedTimeframe} onChange={setSelectedTimeframe} />
        </View>

        <PredictionCard update={selectedPrediction} />

        <View style={styles.card}>
          <PriceChart pair={selectedPair} timeframe={selectedTimeframe} prediction={selectedPrediction} />
        </View>

        <SignalsList
          signals={activeSignals}
          statuses={localStatuses}
          trends={trends}
          manualMode={confirmationMode?.manualMode ?? "confirm"}
          ttlSeconds={proposalTtlSeconds}
          defaultRiskPct={engineModeData?.riskPerTradePct ?? 1}
          onApprove={approveSignal}
          onReject={rejectSignal}
          loaded={snapshot !== null}
        />

        <PositionsList />

        <OnDemandSignalCheck />

        <ManualTradeCheck />

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
  headerRight: { alignItems: "flex-end", gap: 6 },
  title: { fontSize: 20, fontWeight: "800", color: DashboardColors.textPrimary },
  subtitle: { fontSize: 12, color: DashboardColors.textMuted, marginTop: 2 },
  errorBanner: {
    fontSize: 12,
    color: DashboardColors.rose,
    backgroundColor: DashboardColors.roseBg,
    borderRadius: 8,
    padding: 8,
  },
  timeframeRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end" },
  // Pushes the badge to the opposite edge from TimeframeSelector when present, without
  // shifting TimeframeSelector's own position when it isn't (no trends data yet) --
  // unlike web's equivalent row, there's no persistent pair-name text here to anchor the
  // left side, so `justifyContent: "space-between"` alone would visibly jump
  // TimeframeSelector to the left during the brief pre-first-evaluation window.
  trendBadgeSlot: { marginRight: "auto" },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: DashboardColors.border,
    backgroundColor: DashboardColors.surface,
    padding: 14,
  },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: DashboardColors.textPrimary },
  emptyBody: { fontSize: 13, color: DashboardColors.textSecondary, textAlign: "center" },
  emptyLink: { fontSize: 14, fontWeight: "700", color: DashboardColors.sky, marginTop: 8 },
});
