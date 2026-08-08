import { Pressable, StyleSheet, Text, View } from "react-native";
import type { VoiceAssistantState } from "@/lib/voice/useVoiceAssistant";
import { useVoiceSettings } from "@/lib/voice/VoiceSettingsContext";
import { DashboardColors } from "@/constants/dashboardColors";

const STATUS_LABEL: Record<VoiceAssistantState["recorderStatus"], string> = {
  idle: "Tap to talk to JUDE",
  recording: "Listening… tap to stop",
  transcribing: "Thinking…",
  speaking: "Speaking…",
};

export function VoiceAssistantPanel(voice: VoiceAssistantState) {
  const { settings } = useVoiceSettings();
  if (!settings.enabled) return null;

  const { recorderStatus, lastTranscript, lastMessage, pendingSignal, micError, toggleRecording } = voice;
  const isRecording = recorderStatus === "recording";
  const busy = recorderStatus === "transcribing" || recorderStatus === "speaking";

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Pressable
          onPress={toggleRecording}
          disabled={busy}
          style={[styles.micButton, isRecording && styles.micButtonActive, busy && styles.micButtonBusy]}
        >
          <Text style={styles.micIcon}>{isRecording ? "■" : "🎙️"}</Text>
        </Pressable>
        <View style={styles.textColumn}>
          <Text style={styles.statusLabel}>{STATUS_LABEL[recorderStatus]}</Text>
          {pendingSignal && <Text style={styles.pendingLabel}>Awaiting confirmation for {pendingSignal.pair}</Text>}
        </View>
      </View>

      {micError && <Text style={styles.errorText}>{micError}</Text>}
      {!micError && lastTranscript !== "" && <Text style={styles.transcriptText}>“{lastTranscript}”</Text>}
      {!micError && lastMessage !== "" && <Text style={styles.responseText}>{lastMessage}</Text>}
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
    gap: 8,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  micButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: DashboardColors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  micButtonActive: { backgroundColor: DashboardColors.roseStrong },
  micButtonBusy: { opacity: 0.6 },
  micIcon: { fontSize: 18, color: DashboardColors.textPrimary },
  textColumn: { flex: 1 },
  statusLabel: { fontSize: 13, fontWeight: "700", color: DashboardColors.textPrimary },
  pendingLabel: { fontSize: 11, color: DashboardColors.amber, marginTop: 2 },
  errorText: { fontSize: 12, color: DashboardColors.rose },
  transcriptText: { fontSize: 12, color: DashboardColors.textSecondary, fontStyle: "italic" },
  responseText: { fontSize: 12, color: DashboardColors.sky },
});
