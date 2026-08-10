import * as Speech from "expo-speech";
import type { VoiceSettings } from "./VoiceSettingsContext";

/** Speaks `text` unless voice is disabled in settings; resolves once speech finishes (or
 * immediately if disabled) so callers can chain a follow-up action, e.g. starting a
 * confirmation listen window right after the announcement finishes. */
export function speak(text: string, settings: VoiceSettings): Promise<void> {
  if (!settings.enabled) return Promise.resolve();
  return new Promise((resolve) => {
    Speech.speak(text, {
      rate: settings.rate,
      volume: settings.volume,
      onDone: () => resolve(),
      onStopped: () => resolve(),
      onError: (error) => {
        console.error("[voice] speech synthesis failed:", error);
        resolve();
      },
    });
  });
}

export function stopSpeaking(): void {
  void Speech.stop();
}
