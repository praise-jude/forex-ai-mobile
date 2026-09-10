import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useIsFocused } from "expo-router";
import Svg, { Path } from "react-native-svg";
import { useApi } from "@/lib/api/client";
import { usePolling } from "@/lib/api/usePolling";
import type { SystemAlert, SystemAlertSeverity, SystemAlertsResponse } from "@/lib/api/types";
import { DashboardColors } from "@/constants/dashboardColors";

// /api/system-alerts is a synchronous in-memory read on the backend (same as
// /api/connection-status and /api/risk-status) -- cheap to poll. 5000ms matches the web
// dashboard's SystemAlertBell; a touch slower than ConnectionStatusBadge's 3000ms since
// this is a summary indicator, not the primary connection read.
const POLL_INTERVAL_MS = 5000;

const SEVERITY_COLOR: Record<SystemAlertSeverity, string> = {
  critical: DashboardColors.rose,
  warning: DashboardColors.amber,
  info: DashboardColors.sky,
};

const SEVERITY_PILL_BG: Record<SystemAlertSeverity, string> = {
  critical: DashboardColors.roseBg,
  warning: DashboardColors.amberBg,
  info: DashboardColors.skyBg,
};

function BellIcon({ color }: { color: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 20 20" fill="none">
      <Path
        d="M10 2.5a4.5 4.5 0 0 0-4.5 4.5c0 3.5-1.2 4.9-1.8 5.6-.3.3-.1.9.4.9h11.8c.5 0 .7-.6.4-.9-.6-.7-1.8-2.1-1.8-5.6A4.5 4.5 0 0 0 10 2.5Z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <Path d="M8.5 16.5a1.5 1.5 0 0 0 3 0" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

/** Header indicator mirroring the web dashboard's SystemAlertBell -- dim "All clear"
 * when healthy, tinted with a count when not. Tapping opens a modal list of what's
 * wrong. Gated on tab focus, same as ConnectionStatusBadge (the Dashboard tab stays
 * mounted under NativeTabs even when another tab is showing). */
export function SystemAlertBell() {
  const api = useApi();
  const isFocused = useIsFocused();
  const { data } = usePolling(() => api.get<SystemAlertsResponse>("/api/system-alerts"), POLL_INTERVAL_MS, isFocused);
  const [open, setOpen] = useState(false);

  const alerts: SystemAlert[] = data?.alerts ?? [];
  const count = alerts.length;
  const severity = data?.highestSeverity ?? null;

  const pillColor = severity ? SEVERITY_COLOR[severity] : DashboardColors.textMuted;
  const pillBg = severity ? SEVERITY_PILL_BG[severity] : DashboardColors.surfaceAlt;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={count > 0 ? `${count} system alert${count === 1 ? "" : "s"}` : "System status: all clear"}
        style={[styles.pill, { backgroundColor: pillBg }]}
      >
        <BellIcon color={pillColor} />
        <Text style={[styles.pillLabel, { color: pillColor }]}>
          {count > 0 ? `${count} alert${count === 1 ? "" : "s"}` : "All clear"}
        </Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          {/* Inner Pressable stops a tap on the card itself from closing the modal. */}
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>System status</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={10}>
                <Text style={styles.close}>Done</Text>
              </Pressable>
            </View>

            {count === 0 ? (
              <Text style={styles.allClear}>
                All clear — auto-trading, the MT5 connection, execution, and risk checks are healthy.
              </Text>
            ) : (
              <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
                {alerts.map((alert) => (
                  <View
                    key={alert.id}
                    style={[styles.row, { borderLeftColor: SEVERITY_COLOR[alert.severity] }]}
                  >
                    <Text style={styles.rowTitle}>{alert.title}</Text>
                    <Text style={styles.rowDetail}>{alert.detail}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: DashboardColors.border,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  pillLabel: { fontSize: 12, fontWeight: "700" },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: 24,
  },
  sheet: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: DashboardColors.border,
    backgroundColor: DashboardColors.surface,
    overflow: "hidden",
    maxHeight: "80%",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: DashboardColors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sheetTitle: { fontSize: 13, fontWeight: "800", color: DashboardColors.textPrimary },
  close: { fontSize: 13, fontWeight: "700", color: DashboardColors.sky },
  allClear: { fontSize: 13, color: DashboardColors.textSecondary, padding: 14 },
  list: { flexGrow: 0 },
  listContent: { paddingVertical: 4 },
  row: {
    borderLeftWidth: 3,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 3,
  },
  rowTitle: { fontSize: 13, fontWeight: "700", color: DashboardColors.textPrimary },
  rowDetail: { fontSize: 12, lineHeight: 17, color: DashboardColors.textSecondary },
});
