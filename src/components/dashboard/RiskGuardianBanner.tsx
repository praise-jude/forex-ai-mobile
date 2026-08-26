import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useIsFocused } from "expo-router";
import { useApi } from "@/lib/api/client";
import { formatRemaining } from "@/lib/api/format";
import { usePolling } from "@/lib/api/usePolling";
import type { RiskStatusResponse } from "@/lib/api/types";
import { DashboardColors } from "@/constants/dashboardColors";

const POLL_INTERVAL_MS = 7000;

/** Renders nothing once loaded if nothing is active -- this is a guardian-tripped
 * alert, not a status-quo indicator (ConnectionStatusBadge/EngineModeControl already
 * cover normal state). Shows a neutral loading placeholder only until the first poll
 * resolves, see below. Gated on tab focus -- the Dashboard tab stays mounted under
 * NativeTabs even while another tab is active, so this would otherwise keep polling
 * in the background regardless of which screen is actually visible. */
export function RiskGuardianBanner() {
  const api = useApi();
  const isFocused = useIsFocused();
  const { data, setData } = usePolling(() => api.get<RiskStatusResponse>("/api/risk-status"), POLL_INTERVAL_MS, isFocused);
  const [now, setNow] = useState(() => Date.now());
  const [acknowledging, setAcknowledging] = useState(false);
  const [forceResuming, setForceResuming] = useState(false);

  async function acknowledge() {
    setAcknowledging(true);
    try {
      await api.post("/api/risk-status/acknowledge");
      if (data) setData({ ...data, requiresAcknowledgement: false });
    } catch {
      // Best-effort -- the banner just stays up if this fails, next poll cycle re-tries nothing automatically but the button remains tappable.
    } finally {
      setAcknowledging(false);
    }
  }

  // A deliberate override of an ACTIVE daily-loss halt, not the routine "condition
  // already cleared" acknowledge() above -- confirmed separately since this re-arms
  // trading on the exact account/day that just tripped the limit.
  async function forceResume() {
    setForceResuming(true);
    try {
      await api.post("/api/risk-status/force-resume");
      if (data) setData({ ...data, haltedForToday: false, requiresAcknowledgement: false });
    } catch {
      // Best-effort, same posture as acknowledge() above.
    } finally {
      setForceResuming(false);
    }
  }

  function confirmForceResume() {
    Alert.alert(
      "Force-resume trading today?",
      "The daily loss limit already tripped -- this re-arms new trades on the same day, same account, before it would normally clear.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Force resume", style: "destructive", onPress: () => void forceResume() },
      ]
    );
  }

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Before the first poll resolves, show a brief neutral placeholder rather than
  // silently nothing -- distinct from the later `return null` (loaded, nothing active),
  // which is correctly identical to this in appearance except for the label, since
  // "no alert to show" is a real state, not a loading gap, once data has arrived.
  if (!data) {
    return (
      <View style={[styles.banner, styles.loadingBanner]}>
        <Text style={styles.loadingText}>Checking risk status…</Text>
      </View>
    );
  }

  const cooldownActive = data.cooldownUntil !== null && data.cooldownUntil > now;

  if (data.haltedForToday) {
    // This "AUTOPILOT LOCKED" headline is this component's own automatic daily-loss
    // guardian, independent of AutopilotLockControl.tsx's manual switch (deliberately
    // labeled "AUTO-EXECUTION LOCKED" instead to avoid being confused with this one).
    return (
      <View style={[styles.banner, styles.haltedBanner]}>
        <View style={styles.ackTextBlock}>
          <Text style={[styles.title, { color: DashboardColors.rose }]}>AUTOPILOT LOCKED</Text>
          <Text style={styles.body}>
            Daily loss limit ({data.maxDailyLossPct}%) reached on {data.account}. No new trades until the next trading day.
          </Text>
        </View>
        <Pressable disabled={forceResuming} onPress={confirmForceResume} style={[styles.forceResumeButton, forceResuming && styles.disabled]}>
          <Text style={styles.forceResumeText}>{forceResuming ? "Resuming…" : "Force resume today"}</Text>
        </Pressable>
      </View>
    );
  }

  if (cooldownActive && data.cooldownUntil) {
    return (
      <View style={[styles.banner, { borderColor: "#b45309", backgroundColor: "rgba(180,83,9,0.25)" }]}>
        <Text style={[styles.title, { color: DashboardColors.amber }]}>COOLDOWN ACTIVE</Text>
        <Text style={styles.body}>
          {data.maxConsecutiveLosses} consecutive losses on {data.account} — resumes in {formatRemaining(data.cooldownUntil, now)}.
        </Text>
      </View>
    );
  }

  // The halt/cooldown condition itself has cleared (day rolled over, timer expired), but
  // DEMO/LIVE auto-execution stays paused until a human deliberately reviews and resumes
  // it. Manual confirm-mode execution is never affected (a human already reviews every
  // trade there).
  if (data.requiresAcknowledgement) {
    return (
      <View style={[styles.banner, styles.ackBanner]}>
        <View style={styles.ackTextBlock}>
          <Text style={[styles.title, { color: DashboardColors.amber }]}>PAUSED, AWAITING REVIEW</Text>
          <Text style={styles.body}>
            The daily loss limit or consecutive-loss cooldown on {data.account} has cleared, but auto-execution stays paused until
            you resume it.
          </Text>
        </View>
        <Pressable disabled={acknowledging} onPress={() => void acknowledge()} style={[styles.resumeButton, acknowledging && styles.disabled]}>
          <Text style={styles.resumeText}>{acknowledging ? "Resuming…" : "Resume trading"}</Text>
        </Pressable>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  banner: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, gap: 2 },
  title: { fontSize: 13, fontWeight: "800" },
  body: { fontSize: 13, color: DashboardColors.textPrimary },
  loadingBanner: { borderColor: DashboardColors.border, backgroundColor: DashboardColors.surface },
  loadingText: { fontSize: 12, color: DashboardColors.textMuted },
  haltedBanner: {
    borderColor: "#9f1239",
    backgroundColor: "rgba(159,18,57,0.25)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  forceResumeButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#9f1239",
    backgroundColor: "rgba(136,19,55,0.6)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  forceResumeText: { fontSize: 11, fontWeight: "700", color: DashboardColors.rose },
  ackBanner: {
    borderColor: "#b45309",
    backgroundColor: "rgba(180,83,9,0.25)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  ackTextBlock: { flex: 1, gap: 2 },
  resumeButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#b45309",
    backgroundColor: "rgba(146,64,14,0.6)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  disabled: { opacity: 0.6 },
  resumeText: { fontSize: 11, fontWeight: "700", color: DashboardColors.amber },
});
