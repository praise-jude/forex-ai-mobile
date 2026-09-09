import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useIsFocused } from "expo-router";
import { useApi } from "@/lib/api/client";
import { usePolledResource } from "@/lib/api/usePolledResource";
import { PAIRS, type ExecuteResponse, type ExecutionConfigResponse, type Pair } from "@/lib/api/types";
import { describeExecuteResponse } from "./TradeProposalCard";
import { DashboardColors } from "@/constants/dashboardColors";

type DryRunResponse =
  | { status: "blocked"; code: string; reason: string }
  | { status: "skipped_sizing"; reason: string }
  | { status: "dry_run_ok"; lots: number; entry: number; stopLoss: number; takeProfit: number; marginRequired: number | null; freeMargin: number }
  | { status: "dry_run_failed"; reason: string }
  | { status: "network_error" };

function describeDryRunResponse(result: DryRunResponse): string {
  switch (result.status) {
    case "dry_run_ok":
      return `✓ Pipeline works -- lots ${result.lots}, entry ${result.entry}, margin required ${result.marginRequired === null ? "n/a" : `$${result.marginRequired.toFixed(2)}`} (free margin $${result.freeMargin.toFixed(2)}). No order was placed.`;
    case "dry_run_failed":
      return `✗ Broker round trip failed: ${result.reason}`;
    case "blocked":
      return `Blocked before reaching the broker: ${result.reason}`;
    case "skipped_sizing":
      return `Skipped: ${result.reason}`;
    case "network_error":
      return "Network error — try again";
  }
}

/**
 * "Does DEMO order placement actually work right now" -- independent of whether the real
 * SMC/range engines currently find a qualifying setup. Always targets DEMO for the real
 * test-trade path, never LIVE, regardless of the current engine mode.
 *
 * A real, confirmed gap (2026-09-09): this deployment has no demo account configured at
 * all, so the DEMO button has been unreachable. The "Dry run" button is the fix -- same
 * real pipeline, targets LIVE (the only real account here) through attemptDryRun, but the
 * final step is a pure, read-only broker margin calculation instead of a real order --
 * proves the whole chain works with zero funds ever at risk. RN port of forex-ai's
 * DemoTestTradeControl.tsx.
 */
export function DemoTestTradeControl() {
  const api = useApi();
  const isFocused = useIsFocused();
  const { data } = usePolledResource("execution-config", () => api.get<ExecutionConfigResponse>("/api/execution-config"), 15000, isFocused);
  const demoConfigured = data?.demo !== null && data?.demo !== undefined;

  const [pair, setPair] = useState<Pair>(PAIRS[0]);
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [busy, setBusy] = useState<"demo" | "dryRun" | null>(null);
  const [result, setResult] = useState<ExecuteResponse | null>(null);
  const [dryRunResult, setDryRunResult] = useState<DryRunResponse | null>(null);

  async function placeTestTrade() {
    setBusy("demo");
    setResult(null);
    setDryRunResult(null);
    try {
      setResult(await api.post<ExecuteResponse>("/api/signals/test-trade", { pair, direction }));
    } catch {
      setResult({ status: "network_error" });
    } finally {
      setBusy(null);
    }
  }

  async function runDryRun() {
    setBusy("dryRun");
    setResult(null);
    setDryRunResult(null);
    try {
      setDryRunResult(await api.post<DryRunResponse>("/api/signals/test-trade", { pair, direction, dryRun: true }));
    } catch {
      setDryRunResult({ status: "network_error" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.subtitle}>
        Proves the real signal → risk-check → sizing → broker pipeline works, independent of whether SMC/the range engine currently find a
        qualifying setup.
      </Text>
      <View style={styles.selectRow}>
        {PAIRS.map((p) => (
          <Pressable key={p} onPress={() => setPair(p)} style={[styles.chip, pair === p && styles.chipActive]}>
            <Text style={[styles.chipText, pair === p && styles.chipTextActive]}>{p}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.selectRow}>
        <Pressable onPress={() => setDirection("long")} style={[styles.chip, direction === "long" && styles.chipActive]}>
          <Text style={[styles.chipText, direction === "long" && styles.chipTextActive]}>Long</Text>
        </Pressable>
        <Pressable onPress={() => setDirection("short")} style={[styles.chip, direction === "short" && styles.chipActive]}>
          <Text style={[styles.chipText, direction === "short" && styles.chipTextActive]}>Short</Text>
        </Pressable>
      </View>
      <View style={styles.buttonRow}>
        <Pressable onPress={runDryRun} disabled={busy !== null} style={[styles.button, styles.dryRunButton, busy !== null && styles.disabled]}>
          <Text style={styles.buttonText}>{busy === "dryRun" ? "Checking…" : "🔬 Dry run (LIVE, no real order)"}</Text>
        </Pressable>
        {demoConfigured && (
          <Pressable onPress={placeTestTrade} disabled={busy !== null} style={[styles.button, styles.demoButton, busy !== null && styles.disabled]}>
            <Text style={styles.buttonText}>{busy === "demo" ? "Placing…" : "🧪 Place DEMO test trade"}</Text>
          </Pressable>
        )}
      </View>
      {!demoConfigured && (
        <Text style={styles.muted}>No demo account is configured -- use &ldquo;Dry run&rdquo; above instead, which is always available and never risks real funds.</Text>
      )}
      {result && <Text style={styles.resultText}>{describeExecuteResponse(result)}</Text>}
      {dryRunResult && <Text style={styles.resultText}>{describeDryRunResponse(dryRunResult)}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  subtitle: { fontSize: 11, color: DashboardColors.textMuted },
  selectRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderRadius: 8, borderWidth: 1, borderColor: DashboardColors.border, backgroundColor: DashboardColors.surfaceAlt, paddingHorizontal: 10, paddingVertical: 6 },
  chipActive: { borderColor: DashboardColors.sky, backgroundColor: DashboardColors.skyBg },
  chipText: { fontSize: 11, fontWeight: "600", color: DashboardColors.textSecondary },
  chipTextActive: { color: DashboardColors.sky },
  buttonRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  dryRunButton: { backgroundColor: DashboardColors.sky },
  demoButton: { backgroundColor: DashboardColors.emerald },
  disabled: { opacity: 0.5 },
  buttonText: { fontSize: 11, fontWeight: "700", color: "#08111f" },
  muted: { fontSize: 11, color: DashboardColors.textMuted },
  resultText: { fontSize: 11, fontWeight: "600", color: DashboardColors.textSecondary },
});
