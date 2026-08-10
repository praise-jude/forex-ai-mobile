import { useEffect, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useApi } from "@/lib/api/client";
import { DashboardColors } from "@/constants/dashboardColors";
import { useChatVoice } from "./useChatVoice";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  time: number;
}

const QUICK_ACTIONS = ["Analyze the current market.", "Check my open trades.", "What's my risk status?", "Is autopilot active?"];

/**
 * Mirrors forex-ai's web ChatPanel.tsx. Every reply comes from POST /api/chat -- this
 * component just renders history and forwards whatever the user typed or said,
 * unmodified, as the message body. The backend's confirm-phrase safety gate
 * (lib/chat/tools.ts on the server) checks the RAW message text, so this component must
 * never paraphrase, trim meaning from, or auto-complete what the user actually said.
 */
export function ChatPanel() {
  const api = useApi();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const voice = useChatVoice();
  const listRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    api
      .get<{ messages: ChatMessage[] }>("/api/chat")
      .then((data) => setMessages(data.messages))
      .catch(() => {
        // Best-effort initial load -- an empty history just means the chat starts fresh.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- api's identity changes with every settings poll; only run this once on mount.
  }, []);

  useEffect(() => {
    if (messages.length > 0) listRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setInput("");
    setError(null);
    setSending(true);
    setMessages((prev) => [...prev, { role: "user", content: trimmed, time: Date.now() }]);

    try {
      const data = await api.post<{ reply: string }>("/api/chat", { message: trimmed });
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply, time: Date.now() }]);
      void voice.speakIfEnabled(data.reply);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chat request failed.");
    } finally {
      setSending(false);
    }
  }

  const micDisabled = sending || voice.status === "transcribing" || voice.status === "speaking";

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View
            style={[
              styles.statusDot,
              voice.status === "speaking" && styles.statusDotSpeaking,
              voice.status === "recording" && styles.statusDotRecording,
            ]}
          />
          <Text style={styles.headerTitle}>JUDE Chat</Text>
        </View>
        <View style={styles.headerRight}>
          {voice.status === "speaking" && (
            <Pressable onPress={voice.stopSpeakingNow} style={styles.iconButton}>
              <Text style={styles.iconButtonText}>⏹</Text>
            </Pressable>
          )}
          <Pressable onPress={voice.toggleVoice} style={[styles.iconButton, voice.voiceOn && styles.iconButtonActive]}>
            <Text style={styles.iconButtonText}>{voice.voiceOn ? "🔊" : "🔇"}</Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item, i) => `${item.role}-${item.time}-${i}`}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            Ask JUDE about the market, your positions, risk status, or Autopilot -- e.g. &ldquo;What&apos;s the setup on gold right
            now?&rdquo;
          </Text>
        }
        renderItem={({ item }) => (
          <View style={[styles.bubbleRow, item.role === "user" ? styles.bubbleRowUser : styles.bubbleRowAssistant]}>
            <View style={[styles.bubble, item.role === "user" ? styles.bubbleUser : styles.bubbleAssistant]}>
              <Text style={item.role === "user" ? styles.bubbleTextUser : styles.bubbleTextAssistant}>{item.content}</Text>
            </View>
          </View>
        )}
        ListFooterComponent={
          sending ? (
            <View style={[styles.bubbleRow, styles.bubbleRowAssistant]}>
              <View style={[styles.bubble, styles.bubbleAssistant]}>
                <Text style={styles.bubbleTextMuted}>JUDE is thinking…</Text>
              </View>
            </View>
          ) : null
        }
      />

      {error && <Text style={styles.errorText}>{error}</Text>}
      {voice.micError && <Text style={styles.errorText}>{voice.micError}</Text>}

      <View style={styles.quickActions}>
        {QUICK_ACTIONS.map((action) => (
          <Pressable
            key={action}
            onPress={() => void sendMessage(action)}
            disabled={sending}
            style={[styles.quickActionChip, sending && styles.disabled]}
          >
            <Text style={styles.quickActionText}>{action}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.inputRow}>
        <Pressable
          onPress={() => voice.toggleRecording((transcript) => void sendMessage(transcript))}
          disabled={micDisabled}
          style={[styles.iconButton, voice.status === "recording" && styles.iconButtonActive, micDisabled && styles.disabled]}
        >
          <Text style={styles.iconButtonText}>{voice.status === "recording" ? "⏺" : "🎙"}</Text>
        </Pressable>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Message JUDE…"
          placeholderTextColor={DashboardColors.textMuted}
          editable={!sending}
          style={styles.input}
          onSubmitEditing={() => void sendMessage(input)}
          returnKeyType="send"
        />
        <Pressable
          onPress={() => void sendMessage(input)}
          disabled={sending || !input.trim()}
          style={[styles.sendButton, (sending || !input.trim()) && styles.disabled]}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DashboardColors.surface, borderRadius: 14, overflow: "hidden" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: DashboardColors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: DashboardColors.textMuted },
  statusDotSpeaking: { backgroundColor: DashboardColors.sky },
  statusDotRecording: { backgroundColor: DashboardColors.emerald },
  headerTitle: { fontSize: 14, fontWeight: "700", color: DashboardColors.textPrimary },
  iconButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: DashboardColors.border,
    backgroundColor: DashboardColors.surfaceAlt,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  iconButtonActive: { backgroundColor: DashboardColors.sky },
  iconButtonText: { fontSize: 13 },
  listContent: { padding: 14, gap: 8, flexGrow: 1 },
  emptyText: { fontSize: 12, color: DashboardColors.textMuted },
  bubbleRow: { flexDirection: "row", marginBottom: 8 },
  bubbleRowUser: { justifyContent: "flex-end" },
  bubbleRowAssistant: { justifyContent: "flex-start" },
  bubble: { maxWidth: "85%", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleUser: { backgroundColor: DashboardColors.sky },
  bubbleAssistant: { backgroundColor: DashboardColors.surfaceAlt },
  bubbleTextUser: { fontSize: 13, color: "#04121c" },
  bubbleTextAssistant: { fontSize: 13, color: DashboardColors.textPrimary },
  bubbleTextMuted: { fontSize: 13, color: DashboardColors.textMuted },
  errorText: {
    marginHorizontal: 14,
    marginBottom: 8,
    borderRadius: 8,
    backgroundColor: DashboardColors.roseBg,
    color: DashboardColors.rose,
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  quickActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: DashboardColors.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  quickActionChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: DashboardColors.border,
    backgroundColor: DashboardColors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  quickActionText: { fontSize: 11, color: DashboardColors.textSecondary },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: DashboardColors.border,
    padding: 10,
  },
  input: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: DashboardColors.border,
    backgroundColor: DashboardColors.surfaceAlt,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: DashboardColors.textPrimary,
  },
  sendButton: { borderRadius: 8, backgroundColor: DashboardColors.sky, paddingHorizontal: 14, paddingVertical: 9 },
  sendButtonText: { fontSize: 13, fontWeight: "700", color: "#04121c" },
  disabled: { opacity: 0.4 },
});
