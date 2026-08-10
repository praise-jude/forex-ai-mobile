import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import { useCallback, useState } from "react";
import { useSettings } from "@/lib/api/SettingsContext";
import { useVoiceSettings } from "@/lib/voice/VoiceSettingsContext";
import { speak, stopSpeaking } from "@/lib/voice/speech";
import { transcribeAudio, TranscribeError } from "@/lib/voice/transcribe";

export type ChatVoiceStatus = "idle" | "recording" | "transcribing" | "speaking";

export interface ChatVoiceState {
  status: ChatVoiceStatus;
  voiceOn: boolean;
  toggleVoice: () => void;
  speakIfEnabled: (text: string) => Promise<void>;
  stopSpeakingNow: () => void;
  toggleRecording: (onTranscript: (transcript: string) => void) => void;
  micError: string | null;
}

/**
 * Reuses the exact same recorder -> transcribeAudio -> speech.ts pieces the dashboard's
 * own useVoiceAssistant.ts already uses for trade voice commands -- no new voice plumbing
 * for chat, just a simpler push-to-talk/speak-reply wrapper around them. `voiceOn` is a
 * local toggle independent of the dashboard's global VoiceSettings.enabled -- chat replies
 * are opt-in per session, matching the web ChatPanel's identical design.
 */
export function useChatVoice(): ChatVoiceState {
  const { serverUrl, authHeader } = useSettings();
  const { settings: globalVoiceSettings } = useVoiceSettings();
  const [voiceOn, setVoiceOn] = useState(false);
  const [status, setStatus] = useState<ChatVoiceStatus>("idle");
  const [micError, setMicError] = useState<string | null>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  async function speakIfEnabled(text: string): Promise<void> {
    if (!voiceOn) return;
    setStatus("speaking");
    await speak(text, globalVoiceSettings).finally(() => setStatus("idle"));
  }

  function stopSpeakingNow(): void {
    stopSpeaking();
    setStatus("idle");
  }

  function toggleVoice(): void {
    setVoiceOn((prev) => {
      if (prev) stopSpeaking();
      return !prev;
    });
  }

  const startRecording = useCallback(async () => {
    setMicError(null);
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setMicError("Microphone permission was denied. Enable it in your device Settings to use voice input.");
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setStatus("recording");
  }, [recorder]);

  const stopRecordingAndProcess = useCallback(
    async (onTranscript: (transcript: string) => void) => {
      await recorder.stop();
      const uri = recorder.uri;
      setStatus("transcribing");

      if (!uri) {
        setStatus("idle");
        setMicError("Recording failed -- no audio was captured.");
        return;
      }

      try {
        const transcript = await transcribeAudio(uri, serverUrl, authHeader);
        setStatus("idle");
        if (!transcript) {
          setMicError("I didn't hear anything.");
          return;
        }
        onTranscript(transcript);
      } catch (err) {
        setStatus("idle");
        setMicError(err instanceof TranscribeError ? err.message : "Something went wrong transcribing that.");
      }
    },
    [recorder, serverUrl, authHeader]
  );

  const toggleRecording = useCallback(
    (onTranscript: (transcript: string) => void) => {
      if (status === "recording") {
        void stopRecordingAndProcess(onTranscript);
      } else if (status === "idle") {
        void startRecording();
      }
    },
    [status, startRecording, stopRecordingAndProcess]
  );

  return { status, voiceOn, toggleVoice, speakIfEnabled, stopSpeakingNow, toggleRecording, micError };
}
