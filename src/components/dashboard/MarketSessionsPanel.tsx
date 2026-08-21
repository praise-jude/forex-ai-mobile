import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useIsFocused } from "expo-router";
import { DashboardColors } from "@/constants/dashboardColors";
import { formatCountdown, getAllSessionStatuses, getOverlapLabel, type SessionStatus } from "@/lib/market/marketSessions";

const NIGERIA_CLOCK_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Lagos",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const UTC_CLOCK_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function SessionCard({ status }: { status: SessionStatus }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTopLine}>
        <Text style={styles.cardLabel}>{status.label}</Text>
        <View style={styles.statusGroup}>
          <View style={[styles.dot, { backgroundColor: status.isOpen ? DashboardColors.emerald : DashboardColors.textMuted }]} />
          <Text style={[styles.statusText, { color: status.isOpen ? DashboardColors.emerald : DashboardColors.textMuted }]}>
            {status.isOpen ? "OPEN" : "CLOSED"}
          </Text>
        </View>
      </View>
      <Text style={styles.cardMeta}>{status.currencies.join(" / ")}</Text>
      <Text style={styles.cardMeta}>
        Local session <Text style={styles.cardMetaStrong}>{status.localWindowLabel}</Text>
      </Text>
      <Text style={styles.cardMeta}>
        {status.nextTransition === "open" ? "Opens" : "Closes"} in{" "}
        <Text style={styles.cardMetaStrong}>{formatCountdown(status.msUntilTransition)}</Text> ({status.nigeriaTransitionLabel})
      </Text>
    </View>
  );
}

/**
 * Purely informational -- shows which forex sessions are open right now, a live
 * Nigeria/UTC clock, and the London+New York overlap. Ported from the web dashboard's
 * equivalent panel; never reads or writes engine mode, execution, or risk state.
 */
export function MarketSessionsPanel() {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // Gated on tab focus -- the Dashboard tab stays mounted under NativeTabs even while
  // another tab is active.
  const isFocused = useIsFocused();

  // Only ticks while the panel is open AND this tab is focused -- no background timer
  // for a clock nobody is looking at.
  useEffect(() => {
    if (!open || !isFocused) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open, isFocused]);

  const statuses = open ? getAllSessionStatuses(now) : [];
  const overlap = open ? getOverlapLabel(statuses) : null;

  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={styles.button}>
        <Text style={styles.buttonText}>🌍 Sessions</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🌍 Market Sessions</Text>
              <Pressable onPress={() => setOpen(false)}>
                <Text style={styles.closeText}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.clockRow}>
              <View>
                <Text style={styles.clockLabel}>Nigeria (WAT, UTC+1, no DST)</Text>
                <Text style={styles.clockValue}>{NIGERIA_CLOCK_FORMATTER.format(now)}</Text>
              </View>
              <View style={styles.clockRight}>
                <Text style={styles.clockLabel}>UTC</Text>
                <Text style={styles.clockValue}>{UTC_CLOCK_FORMATTER.format(now)}</Text>
              </View>
            </View>

            <View style={[styles.overlapBanner, overlap ? styles.overlapBannerActive : undefined]}>
              <Text style={[styles.overlapText, overlap ? styles.overlapTextActive : undefined]}>
                {overlap
                  ? `🔥 ${overlap} overlap -- highest liquidity window right now.`
                  : statuses.some((s) => s.isOpen)
                    ? `${statuses
                        .filter((s) => s.isOpen)
                        .map((s) => s.label)
                        .join(", ")} open`
                    : "No major session open right now."}
              </Text>
            </View>

            <View style={styles.cardsGrid}>
              {statuses.map((status) => (
                <SessionCard key={status.id} status={status} />
              ))}
            </View>

            <Text style={styles.disclaimer}>
              High liquidity does not guarantee a valid trade. Wait for your Forex-AI strategy confirmation.
            </Text>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: DashboardColors.border,
    backgroundColor: DashboardColors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  buttonText: { color: DashboardColors.textSecondary, fontSize: 11, fontWeight: "700" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 20 },
  modalCard: { backgroundColor: DashboardColors.surface, borderRadius: 16, padding: 18, gap: 10, maxHeight: "85%" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { fontSize: 16, fontWeight: "800", color: DashboardColors.textPrimary },
  closeText: { fontSize: 16, color: DashboardColors.textMuted },
  clockRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: DashboardColors.border,
    backgroundColor: DashboardColors.surfaceAlt,
    padding: 10,
  },
  clockRight: { alignItems: "flex-end" },
  clockLabel: { fontSize: 11, color: DashboardColors.textMuted },
  clockValue: { fontSize: 18, fontWeight: "700", color: DashboardColors.textPrimary, fontVariant: ["tabular-nums"] },
  overlapBanner: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: DashboardColors.border,
    backgroundColor: DashboardColors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  overlapBannerActive: { borderColor: "rgba(245,158,11,0.3)", backgroundColor: DashboardColors.amberBg },
  overlapText: { fontSize: 12, color: DashboardColors.textSecondary },
  overlapTextActive: { color: DashboardColors.amber, fontWeight: "700" },
  cardsGrid: { gap: 8 },
  card: { borderRadius: 12, borderWidth: 1, borderColor: DashboardColors.border, backgroundColor: DashboardColors.surfaceAlt, padding: 10 },
  cardTopLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardLabel: { fontSize: 13, fontWeight: "700", color: DashboardColors.textPrimary },
  statusGroup: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: "700" },
  cardMeta: { fontSize: 11, color: DashboardColors.textMuted, marginTop: 3 },
  cardMetaStrong: { color: DashboardColors.textSecondary },
  disclaimer: { fontSize: 10, color: DashboardColors.textMuted, textAlign: "center" },
});
