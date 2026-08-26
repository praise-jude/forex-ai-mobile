import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";

import { useSettings } from "@/lib/api/SettingsContext";
import { ApiError, useApi } from "@/lib/api/client";
import type { ConnectionStatusResponse, NotificationPrefs } from "@/lib/api/types";
import { usePush } from "@/lib/push/PushContext";
import { useVoiceSettings, type VoiceSettings } from "@/lib/voice/VoiceSettingsContext";
import { DashboardColors } from "@/constants/dashboardColors";
import { EngineModeControl } from "@/components/dashboard/EngineModeControl";
import { AutopilotLockControl } from "@/components/dashboard/AutopilotLockControl";
import { KillSwitchControl } from "@/components/dashboard/KillSwitchControl";
import { EmergencyStopControl } from "@/components/dashboard/EmergencyStopControl";
import { ExecutionPolicyControl } from "@/components/dashboard/ExecutionPolicyControl";
import { ConfirmationModeControl } from "@/components/dashboard/ConfirmationModeControl";
import { SystemHealthCard } from "@/components/dashboard/SystemHealthCard";
import { ConfidenceCalibrationCard } from "@/components/dashboard/ConfidenceCalibrationCard";
import { ExecutionConfigCard } from "@/components/dashboard/ExecutionConfigCard";
import { CorrelationCard } from "@/components/dashboard/CorrelationCard";
import { SignalDiagnosticsCard } from "@/components/dashboard/SignalDiagnosticsCard";

type TestState = { state: "idle" } | { state: "testing" } | { state: "ok" } | { state: "error"; message: string };

function ToggleRow({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
  return (
    <View style={styles.toggleRow}>
      <Text style={[styles.toggleLabel, disabled && styles.dimmed]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: DashboardColors.surfaceAlt, true: DashboardColors.sky }}
        thumbColor="#fff"
      />
    </View>
  );
}

function StepperRow({
  label,
  value,
  displayValue,
  onDecrement,
  onIncrement,
  disabled,
}: {
  label: string;
  value: number;
  displayValue: string;
  onDecrement: () => void;
  onIncrement: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={[styles.toggleLabel, disabled && styles.dimmed]}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable
          onPress={onDecrement}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          accessibilityState={{ disabled }}
          style={styles.stepperButton}
        >
          <Text style={styles.stepperButtonText}>−</Text>
        </Pressable>
        <Text style={styles.stepperValue}>{displayValue}</Text>
        <Pressable
          onPress={onIncrement}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          accessibilityState={{ disabled }}
          style={styles.stepperButton}
        >
          <Text style={styles.stepperButtonText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function NotificationSettingsSection() {
  const push = usePush();

  function setPref<K extends keyof NotificationPrefs>(key: K, value: NotificationPrefs[K]) {
    void push.updatePrefs({ [key]: value } as Partial<NotificationPrefs>);
  }

  const prefs = push.device?.notificationPrefs;
  const disabled = !prefs;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Push notifications</Text>

      {push.status === "registering" && (
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color={DashboardColors.sky} />
          <Text style={styles.statusText}>Registering this device…</Text>
        </View>
      )}
      {push.status === "error" && (
        <View style={styles.statusRow}>
          <Text style={styles.testError}>✗ {push.error}</Text>
          <Pressable onPress={push.retry}>
            <Text style={styles.retryLink}>Retry</Text>
          </Pressable>
        </View>
      )}
      {push.status === "registered" && <Text style={styles.testOk}>✓ This device is registered for push notifications.</Text>}

      <ToggleRow label="BUY signals" value={prefs?.buySignals ?? true} onChange={(v) => setPref("buySignals", v)} disabled={disabled} />
      <ToggleRow label="SELL signals" value={prefs?.sellSignals ?? true} onChange={(v) => setPref("sellSignals", v)} disabled={disabled} />
      <ToggleRow
        label="Trade execution (opened/rejected)"
        value={prefs?.tradeExecution ?? true}
        onChange={(v) => setPref("tradeExecution", v)}
        disabled={disabled}
      />
      <ToggleRow label="TP/SL reached" value={prefs?.tpSl ?? true} onChange={(v) => setPref("tpSl", v)} disabled={disabled} />
      <ToggleRow label="Risk alerts" value={prefs?.riskAlerts ?? true} onChange={(v) => setPref("riskAlerts", v)} disabled={disabled} />
      <ToggleRow
        label="Connection alerts"
        value={prefs?.connectionAlerts ?? true}
        onChange={(v) => setPref("connectionAlerts", v)}
        disabled={disabled}
      />
      <ToggleRow
        label="Weekly performance digest"
        value={prefs?.weeklyDigest ?? true}
        onChange={(v) => setPref("weeklyDigest", v)}
        disabled={disabled}
      />
      <ToggleRow
        label="Daily performance digest"
        value={prefs?.dailyDigest ?? false}
        onChange={(v) => setPref("dailyDigest", v)}
        disabled={disabled}
      />
      <ToggleRow
        label="Engine Mode reset alerts"
        value={prefs?.engineModeAlerts ?? true}
        onChange={(v) => setPref("engineModeAlerts", v)}
        disabled={disabled}
      />
      <ToggleRow
        label="Autopilot signal held back"
        value={prefs?.autopilotBlocked ?? true}
        onChange={(v) => setPref("autopilotBlocked", v)}
        disabled={disabled}
      />
      <ToggleRow
        label="Killzone opened/closed"
        value={prefs?.sessionAlerts ?? true}
        onChange={(v) => setPref("sessionAlerts", v)}
        disabled={disabled}
      />
      <ToggleRow
        label="Calibration progress"
        value={prefs?.calibrationUpdates ?? true}
        onChange={(v) => setPref("calibrationUpdates", v)}
        disabled={disabled}
      />
      <StepperRow
        label="Minimum signal confidence"
        value={prefs?.minConfidence ?? 80}
        displayValue={`${prefs?.minConfidence ?? 80}%`}
        onDecrement={() => setPref("minConfidence", Math.max(0, (prefs?.minConfidence ?? 80) - 5))}
        onIncrement={() => setPref("minConfidence", Math.min(100, (prefs?.minConfidence ?? 80) + 5))}
        disabled={disabled}
      />
    </View>
  );
}

/** Mirrors the web dashboard's /settings page order (system health, then live controls)
 * -- moved here from the Dashboard tab so Dashboard stays focused on live trading while
 * these operational controls live alongside the rest of the account/risk configuration. */
function TradingControlsSection() {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Live controls</Text>
      <EngineModeControl />
      <View style={styles.controlsDivider} />
      <AutopilotLockControl />
      <View style={styles.controlsDivider} />
      <KillSwitchControl account="live" />
      <View style={styles.controlsDivider} />
      <EmergencyStopControl account="live" />
      <View style={styles.controlsDivider} />
      <ExecutionPolicyControl />
      <View style={styles.controlsDivider} />
      <ConfirmationModeControl />
    </View>
  );
}

function VoiceSettingsSection() {
  const { settings, update } = useVoiceSettings();

  function set<K extends keyof VoiceSettings>(key: K, value: VoiceSettings[K]) {
    update({ [key]: value });
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>JUDE voice</Text>
      <ToggleRow label="Enable JUDE voice" value={settings.enabled} onChange={(v) => set("enabled", v)} />
      <StepperRow
        label="Speech speed"
        value={settings.rate}
        displayValue={`${settings.rate.toFixed(1)}x`}
        onDecrement={() => set("rate", Math.max(0.5, Math.round((settings.rate - 0.1) * 10) / 10))}
        onIncrement={() => set("rate", Math.min(2.0, Math.round((settings.rate + 0.1) * 10) / 10))}
        disabled={!settings.enabled}
      />
      <StepperRow
        label="Volume"
        value={settings.volume}
        displayValue={`${Math.round(settings.volume * 100)}%`}
        onDecrement={() => set("volume", Math.max(0, Math.round((settings.volume - 0.1) * 10) / 10))}
        onIncrement={() => set("volume", Math.min(1, Math.round((settings.volume + 0.1) * 10) / 10))}
        disabled={!settings.enabled}
      />
      <ToggleRow
        label="Announce new signals"
        value={settings.announceSignals}
        onChange={(v) => set("announceSignals", v)}
        disabled={!settings.enabled}
      />
      <ToggleRow
        label="Announce trade execution"
        value={settings.announceTradeExecution}
        onChange={(v) => set("announceTradeExecution", v)}
        disabled={!settings.enabled}
      />
      <ToggleRow
        label="Announce risk warnings"
        value={settings.announceRiskWarnings}
        onChange={(v) => set("announceRiskWarnings", v)}
        disabled={!settings.enabled}
      />
    </View>
  );
}

export default function SettingsScreen() {
  const { serverUrl, password, loaded, isConfigured, setServerUrl, setPassword } = useSettings();
  const api = useApi();

  const [urlInput, setUrlInput] = useState(serverUrl);
  const [passwordInput, setPasswordInput] = useState(password);
  const [saved, setSaved] = useState(false);
  const [test, setTest] = useState<TestState>({ state: "idle" });
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  // urlInput/passwordInput are seeded from context once, at first render -- but the
  // real saved values only arrive later, from SettingsContext's own async SecureStore
  // read (see its useEffect). Without this, the inputs are stuck showing whatever
  // serverUrl/password happened to be at the very first render (the hardcoded default
  // and an empty string) even after the real saved values load a moment later -- this
  // is exactly what made the server URL look "stuck" on the wrong value and the
  // password look blank instead of the one already saved. Keyed on `loaded` alone (not
  // serverUrl/password directly) so it fires exactly once, when the async load
  // resolves, and never again -- it must not re-fire on every keystroke and fight the
  // user's own in-progress edits.
  /* eslint-disable react-hooks/set-state-in-effect -- seeding local form state from an
     async-loaded external source (SecureStore, via context) once, not state derivable
     from render. */
  useEffect(() => {
    if (!loaded) return;
    setUrlInput(serverUrl);
    setPasswordInput(password);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately only `loaded`, see comment above
  }, [loaded]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function save() {
    await Promise.all([setServerUrl(urlInput), setPassword(passwordInput)]);
    setSaved(true);
    setTest({ state: "idle" });
    setTimeout(() => setSaved(false), 2000);
  }

  async function testConnection() {
    // Save first so the test (and the api client, which reads from settings context)
    // actually exercises whatever the user just typed, not the previously-saved values.
    await Promise.all([setServerUrl(urlInput), setPassword(passwordInput)]);
    setTest({ state: "testing" });
    try {
      await api.get<ConnectionStatusResponse>("/api/connection-status");
      setTest({ state: "ok" });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not reach the server";
      setTest({ state: "error", message });
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>
          Connect to your Forex AI dashboard server. It is the same URL and HTTP Basic Auth password used to open the
          dashboard in a browser.
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>Server URL</Text>
          <TextInput
            value={urlInput}
            onChangeText={setUrlInput}
            placeholder="https://your-dashboard.example.com"
            placeholderTextColor={DashboardColors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={styles.input}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Dashboard password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              value={passwordInput}
              onChangeText={setPasswordInput}
              placeholder="DASHBOARD_ACCESS_PASSWORD"
              placeholderTextColor={DashboardColors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={!passwordVisible}
              style={[styles.input, styles.passwordInput]}
            />
            <Pressable
              onPress={() => setPasswordVisible((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={passwordVisible ? "Hide password" : "Show password"}
              style={styles.iconButton}
            >
              <Text style={styles.iconButtonText}>{passwordVisible ? "Hide" : "Show"}</Text>
            </Pressable>
            <Pressable
              onPress={async () => {
                if (!passwordInput) return;
                await Clipboard.setStringAsync(passwordInput);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              accessibilityRole="button"
              accessibilityLabel="Copy password"
              style={styles.iconButton}
            >
              <Text style={styles.iconButtonText}>{copied ? "Copied ✓" : "Copy"}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable onPress={save} style={styles.saveButton}>
            <Text style={styles.saveButtonText}>{saved ? "Saved ✓" : "Save"}</Text>
          </Pressable>
          <Pressable onPress={testConnection} style={styles.testButton} disabled={test.state === "testing"}>
            {test.state === "testing" ? (
              <ActivityIndicator size="small" color={DashboardColors.sky} />
            ) : (
              <Text style={styles.testButtonText}>Test connection</Text>
            )}
          </Pressable>
        </View>

        {test.state === "ok" && <Text style={styles.testOk}>✓ Connected — the dashboard responded.</Text>}
        {test.state === "error" && <Text style={styles.testError}>✗ {test.message}</Text>}

        <View style={styles.noteBox}>
          <Text style={styles.noteText}>
            The username portion of Basic Auth is ignored by the server — only the password matters. Credentials are stored
            on-device only.
          </Text>
        </View>

        {isConfigured && <SystemHealthCard />}
        {isConfigured && <TradingControlsSection />}
        {isConfigured && <ExecutionConfigCard />}
        {isConfigured && <CorrelationCard />}
        {isConfigured && <ConfidenceCalibrationCard />}
        {isConfigured && <NotificationSettingsSection />}
        <VoiceSettingsSection />
        {isConfigured && <SignalDiagnosticsCard />}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: DashboardColors.background },
  content: { padding: 20, gap: 16, paddingBottom: 60 },
  title: { fontSize: 22, fontWeight: "800", color: DashboardColors.textPrimary },
  subtitle: { fontSize: 13, color: DashboardColors.textSecondary, lineHeight: 18 },
  field: { gap: 6 },
  label: { fontSize: 12, fontWeight: "700", color: DashboardColors.textMuted, textTransform: "uppercase", letterSpacing: 0.4 },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: DashboardColors.border,
    backgroundColor: DashboardColors.surface,
    color: DashboardColors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  passwordRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  passwordInput: { flex: 1 },
  iconButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: DashboardColors.border,
    backgroundColor: DashboardColors.surfaceAlt,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  iconButtonText: { color: DashboardColors.textPrimary, fontWeight: "700", fontSize: 12 },
  actions: { flexDirection: "row", gap: 10 },
  saveButton: { flex: 1, borderRadius: 10, backgroundColor: DashboardColors.sky, paddingVertical: 12, alignItems: "center" },
  saveButtonText: { color: "#04202f", fontWeight: "800", fontSize: 14 },
  testButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: DashboardColors.border,
    backgroundColor: DashboardColors.surfaceAlt,
    paddingVertical: 12,
    alignItems: "center",
  },
  testButtonText: { color: DashboardColors.textPrimary, fontWeight: "700", fontSize: 14 },
  testOk: { color: DashboardColors.emerald, fontSize: 13, fontWeight: "600" },
  testError: { color: DashboardColors.rose, fontSize: 13, fontWeight: "600" },
  noteBox: { borderRadius: 10, backgroundColor: DashboardColors.surface, padding: 12, marginTop: 8 },
  noteText: { fontSize: 12, color: DashboardColors.textMuted, lineHeight: 17 },
  section: {
    gap: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: DashboardColors.border,
    backgroundColor: DashboardColors.surface,
    padding: 14,
    marginTop: 8,
  },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: DashboardColors.textPrimary, marginBottom: 6 },
  controlsDivider: { height: 1, backgroundColor: DashboardColors.border, marginVertical: 12 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  statusText: { fontSize: 12, color: DashboardColors.textSecondary },
  retryLink: { fontSize: 12, fontWeight: "700", color: DashboardColors.sky },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: DashboardColors.border,
  },
  toggleLabel: { fontSize: 13, color: DashboardColors.textPrimary, flex: 1, marginRight: 12 },
  dimmed: { color: DashboardColors.textMuted },
  stepper: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepperButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: DashboardColors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperButtonText: { color: DashboardColors.textPrimary, fontSize: 16, fontWeight: "700" },
  stepperValue: { color: DashboardColors.textPrimary, fontSize: 13, fontWeight: "700", minWidth: 42, textAlign: "center" },
});
