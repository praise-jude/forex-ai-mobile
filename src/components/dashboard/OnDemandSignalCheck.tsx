import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { PAIRS, type Pair, type PredictionUpdate, type Timeframe } from "@/lib/api/types";
import { ApiError, useApi } from "@/lib/api/client";
import { DashboardColors } from "@/constants/dashboardColors";
import { PredictionCard } from "./PredictionCard";
import { TimeframeSelector } from "./TimeframeSelector";

/**
 * Mirrors forex-ai's web OnDemandSignalWidget.tsx. Pick any tracked pair, tap Analyze,
 * get the real SMC engine's current read for it right now via the same
 * /api/signals/evaluate endpoint the web dashboard calls -- not a separate or
 * simplified analysis.
 */
export function OnDemandSignalCheck() {
  const api = useApi();
  const [pair, setPair] = useState<Pair>(PAIRS[0]);
  const [timeframe, setTimeframe] = useState<Timeframe>("15m");
  const [result, setResult] = useState<PredictionUpdate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyze() {
    setLoading(true);
    setError(null);
    try {
      const update = await api.get<PredictionUpdate>(`/api/signals/evaluate?pair=${encodeURIComponent(pair)}&timeframe=${timeframe}`);
      setResult(update);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't analyze that pair right now.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

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
        <Pressable onPress={analyze} disabled={loading} style={[styles.analyzeButton, loading && styles.analyzeButtonDisabled]}>
          {loading ? <ActivityIndicator size="small" color={DashboardColors.sky} /> : <Text style={styles.analyzeButtonText}>Analyze</Text>}
        </Pressable>
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}
      {result && (
        <View style={styles.result}>
          <PredictionCard update={result} />
        </View>
      )}
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
  errorText: { fontSize: 12, fontWeight: "600", color: DashboardColors.amber },
  result: { marginTop: 2 },
});
