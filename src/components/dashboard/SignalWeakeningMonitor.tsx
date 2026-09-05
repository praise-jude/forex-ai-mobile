import { useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useApi } from "@/lib/api/client";
import { usePolling } from "@/lib/api/usePolling";
import type { Pair, SignalRecheckResponse, Timeframe } from "@/lib/api/types";
import { DashboardColors } from "@/constants/dashboardColors";

const RECHECK_INTERVAL_MS = 10_000;
// A drop of at least this many confidence points from the original read counts as a
// real, meaningful weakening -- ordinary poll-to-poll noise in a still-valid setup
// shouldn't flip the banner on and off.
const WEAKENING_DROP_THRESHOLD = 15;

export type WeakeningLevel = "steady" | "weakening" | "invalidated";

/**
 * Section 11 of the spec: after a "Check a Pair" result shows a real BUY/SELL, keep
 * watching whether that specific setup still holds up. Polls the real
 * /api/signals/analyze/recheck endpoint every ~10s -- never a client-side decaying
 * number. "Invalidated" fires when either the original direction's own candidate no
 * longer independently qualifies at all, or the OPPOSITE direction has become a real,
 * qualifying signal in the meantime (a genuine reversal -- the same condition
 * positionInvalidation.ts already treats as a hard invalidation for an open position).
 * "Weakening" fires on a real, meaningful confidence drop that hasn't yet crossed into
 * full invalidation. Calls onLevelChange only on an actual level transition, so the
 * parent (OnDemandSignalCheck.tsx) can gate "Place Trade" once truly invalidated
 * without re-firing on every poll tick.
 */
export function SignalWeakeningMonitor({
  pair,
  timeframe,
  direction,
  originalConfidence,
  onLevelChange,
}: {
  pair: Pair;
  timeframe: Timeframe;
  direction: "long" | "short";
  originalConfidence: number;
  onLevelChange?: (level: WeakeningLevel) => void;
}) {
  const api = useApi();
  const { data } = usePolling<SignalRecheckResponse>(
    () => api.get<SignalRecheckResponse>(`/api/signals/analyze/recheck?pair=${encodeURIComponent(pair)}&timeframe=${timeframe}&direction=${direction}`),
    RECHECK_INTERVAL_MS
  );

  // A pure, render-time derivation from the latest real poll response -- not stored as
  // its own state, so there's nothing to keep in sync; `level` is always exactly what
  // the most recent real data implies.
  let level: WeakeningLevel = "steady";
  if (data) {
    const currentConfidence = data.evaluation.status === "signal" ? data.evaluation.signal.confidence : 0;
    level =
      data.opposingSignal || data.evaluation.status !== "signal"
        ? "invalidated"
        : originalConfidence - currentConfidence >= WEAKENING_DROP_THRESHOLD
          ? "weakening"
          : "steady";
  }

  // The one real side effect here: telling the parent once the level actually
  // transitions (e.g. to gate "Place Trade" on invalidation) -- never fires again for
  // the same level on a later poll tick that didn't change anything.
  const previousLevelRef = useRef<WeakeningLevel>("steady");
  useEffect(() => {
    if (previousLevelRef.current === level) return;
    previousLevelRef.current = level;
    onLevelChange?.(level);
  }, [level, onLevelChange]);

  if (level === "steady") return null;

  return (
    <View style={[styles.banner, level === "invalidated" ? styles.invalidatedBanner : styles.weakeningBanner]}>
      <Text style={[styles.text, { color: level === "invalidated" ? DashboardColors.rose : DashboardColors.amber }]}>
        {level === "invalidated" ? `🔴 ${direction === "long" ? "BUY" : "SELL"} SETUP INVALIDATED` : "⚠️ SIGNAL WEAKENING"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, marginTop: 4 },
  weakeningBanner: { borderColor: "#b45309", backgroundColor: "rgba(180,83,9,0.2)" },
  invalidatedBanner: { borderColor: "#9f1239", backgroundColor: "rgba(159,18,57,0.2)" },
  text: { fontSize: 11, fontWeight: "800", textAlign: "center" },
});
