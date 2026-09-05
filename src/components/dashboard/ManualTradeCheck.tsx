import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { PAIRS, type EngineModeResponse, type ExecuteResponse, type Pair, type Signal } from "@/lib/api/types";
import { ApiError, useApi } from "@/lib/api/client";
import { useSettings } from "@/lib/api/SettingsContext";
import { executeSignalRequest } from "@/lib/api/executionClient";
import { formatPrice } from "@/lib/api/format";
import { describeExecuteResponse } from "./TradeProposalCard";
import { buildConfirmPhrase } from "@/lib/voice/grammar";
import { DashboardColors } from "@/constants/dashboardColors";

interface ManualSignalResponse {
  signal?: Signal;
  error?: string;
}

interface SuggestResponse {
  entry?: number;
  stopLoss?: number;
  takeProfit?: number;
  error?: string;
}

/** One plain sentence covering exactly what will happen at each price level -- mirrors
 * forex-ai's web manualTradeSuggestion.ts's describeManualTradePlan exactly (see that
 * file's own doc comment); hand-copied here for the same reason every other type/helper
 * in this app is (see lib/api/types.ts's own top-of-file note) -- this app isn't set up
 * as a monorepo-shared library with the web app. */
function describeManualTradePlan(pair: Pair, direction: "long" | "short", entry: number, stopLoss: number, takeProfit: number): string {
  const action = direction === "long" ? "Buy" : "Sell";
  const worseWord = direction === "long" ? "falls" : "rises";
  const betterWord = direction === "long" ? "rises" : "falls";
  return (
    `${action} ${pair} now, around ${formatPrice(pair, entry)}. ` +
    `If price ${worseWord} to ${formatPrice(pair, stopLoss)}, this trade exits automatically to limit the loss. ` +
    `If price ${betterWord} to ${formatPrice(pair, takeProfit)}, this trade exits automatically to lock in the profit.`
  );
}

/**
 * Mirrors forex-ai's web ManualTradeWidget.tsx. Pick a pair and Buy/Sell, the AI fills in
 * a suggested stop-loss/take-profit from that pair's own real recent volatility (the same
 * /api/signals/manual/suggest endpoint the web widget calls), review or edit, then place --
 * entirely the operator's own call, independent of whether the SMC/range engines currently
 * see a qualifying setup. Two-step, same as every other manual execution path in this app:
 * registers the hand-built trade as a real signal (/api/signals/manual), then executes it
 * through the exact same /api/signals/{id}/execute route (and all its risk checks) every
 * other signal uses. No embedded chart here (unlike the web version originally had) --
 * confirmed real cause of extra background load/page-load issues there, and the
 * AI-suggested price already covers what the chart was for.
 */
export function ManualTradeCheck() {
  const api = useApi();
  const { serverUrl, authHeader } = useSettings();
  const [pair, setPair] = useState<Pair>(PAIRS[0]);
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [entry, setEntry] = useState<number | null>(null);
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [riskPct, setRiskPct] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placeResult, setPlaceResult] = useState<ExecuteResponse | null>(null);

  useEffect(() => {
    api
      .get<EngineModeResponse>("/api/engine-mode")
      .then((body) => setRiskPct(body.riskPerTradePct))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-fills a starting stop-loss/take-profit whenever the pair or direction changes --
  // see the web widget's own doc comment on why (the operator's job is then just to
  // glance and place, not compute levels from scratch). Never overwrites a value while a
  // request is in flight for a pair/direction combo that's already been superseded.
  useEffect(() => {
    let cancelled = false;
    api
      .get<SuggestResponse>(`/api/signals/manual/suggest?pair=${encodeURIComponent(pair)}&direction=${direction}`)
      .then((body) => {
        if (cancelled) return;
        if (typeof body.entry === "number") setEntry(body.entry);
        if (typeof body.stopLoss === "number" && typeof body.takeProfit === "number") {
          setStopLoss(formatPrice(pair, body.stopLoss));
          setTakeProfit(formatPrice(pair, body.takeProfit));
        }
      })
      .catch(() => {
        // Best-effort -- the operator can still type their own levels if this fails.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pair, direction]);

  async function placeTrade() {
    setError(null);
    setPlaceResult(null);
    const stopLossNum = Number(stopLoss);
    const takeProfitNum = Number(takeProfit);
    if (!stopLoss || !Number.isFinite(stopLossNum)) {
      setError("Enter a stop-loss price.");
      return;
    }
    if (!takeProfit || !Number.isFinite(takeProfitNum)) {
      setError("Enter a take-profit price.");
      return;
    }

    setSubmitting(true);
    try {
      const body = await api.post<ManualSignalResponse>("/api/signals/manual", {
        pair,
        direction,
        stopLoss: stopLossNum,
        takeProfit: takeProfitNum,
      });
      if (!body.signal) {
        setError(body.error ?? "Couldn't place that trade.");
        return;
      }
      const execResult = await executeSignalRequest(serverUrl, authHeader, body.signal.id, buildConfirmPhrase(body.signal), riskPct);
      setPlaceResult(execResult);
      if (execResult.status === "filled") {
        setStopLoss("");
        setTakeProfit("");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reach the server -- check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const planText =
    entry !== null && Number.isFinite(Number(stopLoss)) && Number.isFinite(Number(takeProfit))
      ? describeManualTradePlan(pair, direction, entry, Number(stopLoss), Number(takeProfit))
      : null;

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Manual trade</Text>
      <Text style={styles.subtext}>
        Place a trade you decide on yourself, whether or not the AI currently sees a qualifying setup. Pick a pair and Buy/Sell --
        the AI fills in a suggested stop-loss and take-profit for you, which you can leave as-is or edit before placing.
      </Text>

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

      <View style={styles.directionRow}>
        <Pressable
          onPress={() => setDirection("long")}
          style={[styles.directionButton, styles.directionButtonLeft, direction === "long" && styles.buyButtonSelected]}
        >
          <Text style={[styles.directionButtonText, direction === "long" && styles.directionButtonTextSelected]}>Buy</Text>
        </Pressable>
        <Pressable
          onPress={() => setDirection("short")}
          style={[styles.directionButton, styles.directionButtonRight, direction === "short" && styles.sellButtonSelected]}
        >
          <Text style={[styles.directionButtonText, direction === "short" && styles.directionButtonTextSelected]}>Sell</Text>
        </Pressable>
      </View>

      {entry !== null && (
        <Text style={styles.priceText}>
          Current price: <Text style={styles.priceValue}>{formatPrice(pair, entry)}</Text>
        </Text>
      )}

      {planText ? (
        <Text style={styles.planText}>{planText}</Text>
      ) : (
        <Text style={styles.hintText}>Stop-loss and take-profit below are AI-suggested from this pair&rsquo;s recent volatility.</Text>
      )}

      <View style={styles.fieldsRow}>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Stop-loss</Text>
          <TextInput value={stopLoss} onChangeText={setStopLoss} keyboardType="numeric" placeholder="price" style={styles.fieldInput} />
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Take-profit</Text>
          <TextInput value={takeProfit} onChangeText={setTakeProfit} keyboardType="numeric" placeholder="price" style={styles.fieldInput} />
        </View>
        <View style={styles.riskField}>
          <Text style={styles.fieldLabel}>Risk %</Text>
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
        </View>
      </View>

      <Pressable
        onPress={placeTrade}
        disabled={submitting}
        style={[styles.placeButton, direction === "long" ? styles.placeButtonBuy : styles.placeButtonSell, submitting && styles.placeButtonDisabled]}
      >
        {submitting ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.placeButtonText}>{direction === "long" ? "🟢 Place Buy" : "🔴 Place Sell"}</Text>
        )}
      </Pressable>

      {error && <Text style={styles.errorText}>{error}</Text>}
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
  subtext: { fontSize: 11, color: DashboardColors.textMuted, lineHeight: 16 },
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
  directionRow: { flexDirection: "row", borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: DashboardColors.border },
  directionButton: { flex: 1, paddingVertical: 8, alignItems: "center", backgroundColor: DashboardColors.surfaceAlt },
  directionButtonLeft: {},
  directionButtonRight: {},
  buyButtonSelected: { backgroundColor: DashboardColors.emeraldStrong },
  sellButtonSelected: { backgroundColor: DashboardColors.roseStrong },
  directionButtonText: { fontSize: 13, fontWeight: "700", color: DashboardColors.textSecondary },
  directionButtonTextSelected: { color: "#fff" },
  priceText: { fontSize: 12, color: DashboardColors.textMuted },
  priceValue: { fontWeight: "700", color: DashboardColors.textPrimary },
  planText: {
    fontSize: 13,
    color: DashboardColors.sky,
    backgroundColor: DashboardColors.skyBg,
    borderRadius: 8,
    padding: 10,
    lineHeight: 18,
  },
  hintText: { fontSize: 11, color: DashboardColors.textMuted },
  fieldsRow: { flexDirection: "row", gap: 8 },
  field: { flex: 1 },
  fieldLabel: { fontSize: 11, color: DashboardColors.textMuted, marginBottom: 4 },
  fieldInput: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: DashboardColors.border,
    backgroundColor: DashboardColors.surfaceAlt,
    paddingHorizontal: 8,
    paddingVertical: 6,
    color: DashboardColors.textPrimary,
    fontSize: 13,
  },
  riskField: { width: 64 },
  riskInput: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: DashboardColors.border,
    backgroundColor: DashboardColors.surfaceAlt,
    paddingHorizontal: 8,
    paddingVertical: 6,
    color: DashboardColors.textPrimary,
    fontSize: 13,
  },
  placeButton: { borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  placeButtonBuy: { backgroundColor: DashboardColors.emeraldStrong },
  placeButtonSell: { backgroundColor: DashboardColors.roseStrong },
  placeButtonDisabled: { opacity: 0.6 },
  placeButtonText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  errorText: { fontSize: 12, fontWeight: "600", color: DashboardColors.amber },
  placeResultText: { fontSize: 12, fontWeight: "600", color: DashboardColors.textSecondary },
});
