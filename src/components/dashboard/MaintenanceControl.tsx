import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useApi } from "@/lib/api/client";
import { DashboardColors } from "@/constants/dashboardColors";

type CheckStatus = "pass" | "warning" | "fail" | "not_configured";
interface RepairAction {
  type: "reconnect" | "refresh_market_data";
  account?: string;
  pair?: string;
  timeframe?: string;
}
interface CheckItem {
  label: string;
  status: CheckStatus;
  detail: string;
  repair?: RepairAction;
}
interface MaintenanceSection {
  name: string;
  healthPct: number;
  items: CheckItem[];
}
interface MaintenanceReport {
  generatedAt: number;
  overallHealthPct: number;
  sections: MaintenanceSection[];
  last24h: { totalEvaluated: number; qualified: number; rejected: number; topBlockers: { reasonCode: string; count: number }[] };
  recentExecutionErrors: { reason: string; count: number }[];
  problemsFound: number;
  safeRepairsAvailable: number;
  manualApprovalRequired: number;
  criticalIssues: number;
  availableRepairs: { section: string; label: string; action: RepairAction }[];
  lastQualifiedSignal: {
    pair: string;
    source: string;
    tier: string;
    confidence: number;
    createdAt: number;
    outcome: "executed" | "rejected" | "not_executed";
    outcomeDetail: string;
  } | null;
  autoExecutionActivity: {
    signalsSeen: number;
    lastSignalSeenAt: number | null;
    lastSignalSeen: { pair: string; tier: string; source: string } | null;
    attemptsTotal: number;
    filledTotal: number;
    recentAttempts: { pair: string; tier: string; source: string; direction: string; account: string | null; result: string; at: number }[];
  };
}
interface RepairOutcome {
  label: string;
  applied: boolean;
  success: boolean;
  message: string;
}

const STATUS_STYLE: Record<CheckStatus, { icon: string; color: string }> = {
  pass: { icon: "✓", color: DashboardColors.emerald },
  warning: { icon: "⚠", color: DashboardColors.amber },
  fail: { icon: "✗", color: DashboardColors.rose },
  not_configured: { icon: "–", color: DashboardColors.textMuted },
};

function healthColor(pct: number): string {
  if (pct >= 90) return DashboardColors.emerald;
  if (pct >= 70) return DashboardColors.amber;
  return DashboardColors.rose;
}

function healthBadge(pct: number): string {
  if (pct >= 90) return "🟢 HEALTHY";
  if (pct >= 70) return "🟡 WARNING";
  return "🔴 CRITICAL";
}

/**
 * A permanent, on-demand health check (operator request, 2026-09-09) with a real Safe
 * Repair mode (added 2026-09-10). Scan reads real state and never changes anything.
 * "Apply Safe Repairs" applies only the two repair kinds this codebase can genuinely do
 * without any risk (reconnect, refresh stale market data -- see forex-ai's
 * maintenanceCheck.ts for why nothing else qualifies) -- every other problem the scan
 * finds is a deliberate safety state with its own dedicated control elsewhere in this
 * app, and is deliberately NOT duplicated here. RN port of forex-ai's
 * MaintenanceControl.tsx.
 */
export function MaintenanceControl() {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<MaintenanceReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [repairing, setRepairing] = useState(false);
  const [repairResults, setRepairResults] = useState<RepairOutcome[]>([]);

  async function runScan() {
    setOpen(true);
    setBusy(true);
    setError(null);
    setRepairResults([]);
    try {
      setReport(await api.get<MaintenanceReport>("/api/maintenance"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  async function applySafeRepairs() {
    if (!report) return;
    setRepairing(true);
    setRepairResults([]);
    const results: RepairOutcome[] = [];
    for (const repair of report.availableRepairs) {
      try {
        const outcome = await api.post<RepairOutcome>("/api/maintenance", { action: repair.action });
        results.push(outcome);
      } catch {
        results.push({ label: repair.label, applied: false, success: false, message: "Network error" });
      }
      setRepairResults([...results]);
    }
    setRepairing(false);
    await runScan();
  }

  return (
    <View style={styles.container}>
      <Pressable onPress={runScan} style={styles.button}>
        <Text style={styles.buttonText}>🔧 Autopilot Maintenance</Text>
      </Pressable>

      {open && (
        <View style={styles.panel}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Autopilot Maintenance</Text>
            <Pressable onPress={() => setOpen(false)}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
          <Text style={styles.subtitle}>
            Scan reads real system state and changes nothing. Safe Repair only ever reconnects a dropped connection or refreshes stale market
            data -- both already run automatically in this app; this just lets you trigger them right now instead of waiting.
          </Text>

          {busy && <Text style={styles.muted}>Running scan…</Text>}
          {error && <Text style={styles.errorText}>{error}</Text>}

          {report && !busy && (
            <>
              <View style={styles.overallRow}>
                <Text style={styles.overallLabel}>OVERALL HEALTH</Text>
                <Text style={[styles.overallValue, { color: healthColor(report.overallHealthPct) }]}>
                  {report.overallHealthPct}% {healthBadge(report.overallHealthPct)}
                </Text>
              </View>

              <View style={styles.summaryGrid}>
                <View style={styles.summaryCell}>
                  <Text style={styles.muted}>Problems found</Text>
                  <Text style={styles.summaryValue}>{report.problemsFound}</Text>
                </View>
                <View style={styles.summaryCell}>
                  <Text style={styles.muted}>Safe repairs available</Text>
                  <Text style={[styles.summaryValue, { color: DashboardColors.sky }]}>{report.safeRepairsAvailable}</Text>
                </View>
                <View style={styles.summaryCell}>
                  <Text style={styles.muted}>Manual approval needed</Text>
                  <Text style={[styles.summaryValue, { color: DashboardColors.amber }]}>{report.manualApprovalRequired}</Text>
                </View>
                <View style={styles.summaryCell}>
                  <Text style={styles.muted}>Critical issues</Text>
                  <Text style={[styles.summaryValue, { color: DashboardColors.rose }]}>{report.criticalIssues}</Text>
                </View>
              </View>

              {report.safeRepairsAvailable > 0 && (
                <View style={{ gap: 4 }}>
                  <Pressable onPress={applySafeRepairs} disabled={repairing} style={[styles.repairButton, repairing && styles.disabled]}>
                    <Text style={styles.repairButtonText}>{repairing ? "Applying…" : `Apply Safe Repairs (${report.availableRepairs.length})`}</Text>
                  </Pressable>
                  {report.availableRepairs.map((r) => (
                    <Text key={`${r.section}-${r.label}`} style={styles.muted}>
                      • {r.label} ({r.section})
                    </Text>
                  ))}
                </View>
              )}

              {repairResults.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionName}>Repair Results</Text>
                  {repairResults.map((r) => (
                    <Text key={r.label} style={{ fontSize: 11, color: r.success ? DashboardColors.emerald : DashboardColors.rose }}>
                      {r.success ? "✓" : "✗"} {r.label}: {r.message}
                    </Text>
                  ))}
                </View>
              )}

              {report.sections.map((section) => (
                <View key={section.name} style={styles.section}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionName}>{section.name}</Text>
                    <Text style={[styles.sectionHealth, { color: healthColor(section.healthPct) }]}>{section.healthPct}%</Text>
                  </View>
                  {section.items.map((item) => (
                    <View key={item.label} style={styles.itemRow}>
                      <Text style={[styles.itemIcon, { color: STATUS_STYLE[item.status].color }]}>{STATUS_STYLE[item.status].icon}</Text>
                      <Text style={styles.itemLabel}>{item.label}:</Text>
                      <Text style={styles.itemDetail}>{item.detail}</Text>
                      {item.status !== "pass" && item.status !== "not_configured" && (
                        <Text style={[styles.muted, { color: item.repair ? DashboardColors.sky : DashboardColors.textMuted }]}>
                          {item.repair ? "(safe repair available)" : "(needs your own review)"}
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              ))}

              <View style={styles.section}>
                <Text style={styles.sectionName}>Last Qualified Signal</Text>
                {report.lastQualifiedSignal ? (
                  <>
                    <Text style={styles.itemDetail}>
                      {report.lastQualifiedSignal.pair} · {report.lastQualifiedSignal.source} · {report.lastQualifiedSignal.tier} ·{" "}
                      {report.lastQualifiedSignal.confidence}% · {new Date(report.lastQualifiedSignal.createdAt).toLocaleString()}
                    </Text>
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "700",
                        color:
                          report.lastQualifiedSignal.outcome === "executed"
                            ? DashboardColors.emerald
                            : report.lastQualifiedSignal.outcome === "rejected"
                              ? DashboardColors.rose
                              : DashboardColors.amber,
                      }}
                    >
                      {report.lastQualifiedSignal.outcome.replace("_", " ").toUpperCase()} — {report.lastQualifiedSignal.outcomeDetail}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.muted}>No buy/strong-buy signal in the recent window yet.</Text>
                )}
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionName}>Auto-Execution Activity (since boot)</Text>
                <Text style={styles.itemDetail}>
                  {report.autoExecutionActivity.signalsSeen} signal{report.autoExecutionActivity.signalsSeen === 1 ? "" : "s"} reached the listener ·{" "}
                  {report.autoExecutionActivity.attemptsTotal} attempt{report.autoExecutionActivity.attemptsTotal === 1 ? "" : "s"} ·{" "}
                  {report.autoExecutionActivity.filledTotal} filled
                </Text>
                {report.autoExecutionActivity.recentAttempts.length === 0 ? (
                  <Text style={styles.muted}>No execution attempts yet since restart.</Text>
                ) : (
                  report.autoExecutionActivity.recentAttempts.slice(0, 5).map((a, i) => (
                    <Text key={i} style={styles.muted}>
                      <Text style={a.result === "filled" ? { fontWeight: "700", color: DashboardColors.emerald } : undefined}>{a.result}</Text> —{" "}
                      {a.pair} {a.tier} ({a.source}) {a.direction} · {new Date(a.at).toLocaleTimeString()}
                    </Text>
                  ))
                )}
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionName}>Why No Trade -- Last 24 Hours</Text>
                <Text style={styles.muted}>
                  Evaluated {report.last24h.totalEvaluated.toLocaleString()} times -- {report.last24h.qualified} qualified, {report.last24h.rejected.toLocaleString()} rejected.
                </Text>
                {report.last24h.topBlockers.length > 0 && (
                  <>
                    <Text style={styles.itemLabel}>Top blockers:</Text>
                    {report.last24h.topBlockers.map((b) => (
                      <Text key={b.reasonCode} style={styles.muted}>
                        {b.reasonCode}: {b.count.toLocaleString()}
                      </Text>
                    ))}
                  </>
                )}
              </View>

              {report.recentExecutionErrors.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionName}>Execution Errors -- Last 24 Hours</Text>
                  {report.recentExecutionErrors.map((e) => (
                    <Text key={e.reason} style={styles.errorText}>
                      {e.count}x: {e.reason}
                    </Text>
                  ))}
                </View>
              )}

              <Text style={styles.generatedAt}>Generated {new Date(report.generatedAt).toLocaleString()}</Text>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  button: { alignSelf: "flex-start", borderRadius: 8, borderWidth: 1, borderColor: DashboardColors.border, backgroundColor: DashboardColors.surfaceAlt, paddingHorizontal: 12, paddingVertical: 6 },
  buttonText: { fontSize: 11, fontWeight: "700", color: DashboardColors.textSecondary },
  panel: { gap: 10, borderRadius: 10, borderWidth: 1, borderColor: DashboardColors.border, backgroundColor: DashboardColors.surface, padding: 12 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 14, fontWeight: "800", color: DashboardColors.textPrimary },
  closeText: { fontSize: 11, color: DashboardColors.textMuted },
  subtitle: { fontSize: 11, color: DashboardColors.textMuted },
  muted: { fontSize: 11, color: DashboardColors.textMuted },
  errorText: { fontSize: 11, color: DashboardColors.rose },
  overallRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 8, backgroundColor: DashboardColors.surfaceAlt, paddingHorizontal: 10, paddingVertical: 8 },
  overallLabel: { fontSize: 11, fontWeight: "700", color: DashboardColors.textMuted },
  overallValue: { fontSize: 15, fontWeight: "800" },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, borderRadius: 8, backgroundColor: DashboardColors.surfaceAlt, padding: 8 },
  summaryCell: { minWidth: "40%", gap: 2 },
  summaryValue: { fontSize: 15, fontWeight: "800", color: DashboardColors.textPrimary },
  repairButton: { alignSelf: "flex-start", borderRadius: 8, backgroundColor: DashboardColors.sky, paddingHorizontal: 12, paddingVertical: 8 },
  repairButtonText: { fontSize: 11, fontWeight: "700", color: "#08111f" },
  disabled: { opacity: 0.5 },
  section: { gap: 4, borderRadius: 8, borderWidth: 1, borderColor: DashboardColors.border, padding: 8 },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionName: { fontSize: 11, fontWeight: "800", color: DashboardColors.textSecondary, textTransform: "uppercase" },
  sectionHealth: { fontSize: 11, fontWeight: "800" },
  itemRow: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  itemIcon: { fontSize: 11, fontWeight: "800" },
  itemLabel: { fontSize: 11, fontWeight: "700", color: DashboardColors.textSecondary },
  itemDetail: { fontSize: 11, color: DashboardColors.textMuted, flexShrink: 1 },
  generatedAt: { fontSize: 10, color: DashboardColors.textMuted },
});
