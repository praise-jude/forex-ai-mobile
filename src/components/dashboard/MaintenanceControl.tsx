import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useApi } from "@/lib/api/client";
import { DashboardColors } from "@/constants/dashboardColors";

type CheckStatus = "pass" | "warning" | "fail" | "not_configured";
interface CheckItem {
  label: string;
  status: CheckStatus;
  detail: string;
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
 * A permanent, on-demand health check (operator request, 2026-09-09) -- consolidates
 * every real gate/subsystem check this session verified manually into one button.
 * SCAN ONLY: never changes anything, only reads and reports real state. RN port of
 * forex-ai's MaintenanceControl.tsx.
 */
export function MaintenanceControl() {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<MaintenanceReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runScan() {
    setOpen(true);
    setBusy(true);
    setError(null);
    try {
      setReport(await api.get<MaintenanceReport>("/api/maintenance"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error — try again");
    } finally {
      setBusy(false);
    }
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
          <Text style={styles.subtitle}>Scan only -- reads real system state, changes nothing. Re-run any time you suspect something is broken.</Text>

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
                    </View>
                  ))}
                </View>
              ))}

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
