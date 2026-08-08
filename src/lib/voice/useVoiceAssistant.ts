import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApi } from "@/lib/api/client";
import type { CardStatus, PositionsResponse, Signal } from "@/lib/api/types";
import { buildAnalysisAnnouncement, buildConfirmPhrase, buildResultAnnouncement, buildSignalAnnouncement, parseVoiceCommand } from "./grammar";
import { speak } from "./speech";
import { transcribeAudio, TranscribeError } from "./transcribe";
import { useSettings } from "@/lib/api/SettingsContext";
import { useVoiceSettings } from "./VoiceSettingsContext";

export type RecorderStatus = "idle" | "recording" | "transcribing" | "speaking";

export interface UseVoiceAssistantOptions {
  signals: Signal[];
  /** Same map Dashboard passes to SignalsList -- watched here to narrate the real outcome
   * once `executeSignal` resolves, whichever control (voice or the plain Buy/Sell button)
   * triggered it (see the web app's identical pattern in useVoiceAssistant.ts). */
  statuses: Record<string, CardStatus>;
  /** The exact same function passed to SignalsList -- voice execution is never a separate
   * code path from the manual button, so it can never bypass the backend's risk checks. */
  executeSignal: (signal: Signal) => void;
}

export interface VoiceAssistantState {
  recorderStatus: RecorderStatus;
  lastTranscript: string;
  lastMessage: string;
  pendingSignal: Signal | null;
  micError: string | null;
  toggleRecording: () => void;
  /** Called from the Dashboard's new-signal effect (the same moment a toast pops) --
   * announces it via TTS and arms it for a spoken "CONFIRM ..." if the user's voice
   * settings allow. Never fires for a signal arriving while the app is backgrounded;
   * that's what push notifications are for (TTS can't run once JS is suspended anyway). */
  onSignal: (signal: Signal) => void;
}

export function useVoiceAssistant({ signals, statuses, executeSignal }: UseVoiceAssistantOptions): VoiceAssistantState {
  const api = useApi();
  const { settings } = useVoiceSettings();
  const { authHeader, serverUrl } = useSettings();

  const [recorderStatus, setRecorderStatus] = useState<RecorderStatus>("idle");
  const [lastTranscript, setLastTranscript] = useState("");
  const [lastMessage, setLastMessage] = useState("");
  const [pendingSignal, setPendingSignal] = useState<Signal | null>(null);
  const [micError, setMicError] = useState<string | null>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const pendingRef = useRef<Signal | null>(null);
  const settingsRef = useRef(settings);
  const signalsRef = useRef(signals);

  // Keeps both refs pointed at the latest value without forcing every callback below to
  // be redeclared on every settings/signals change -- assigned in an effect (not during
  // render) so it runs post-commit, matching the same pattern usePolling.ts uses for its
  // fetchRef.
  useEffect(() => {
    settingsRef.current = settings;
    signalsRef.current = signals;
  });

  function say(text: string): Promise<void> {
    setLastMessage(text);
    setRecorderStatus("speaking");
    return speak(text, settingsRef.current).finally(() => setRecorderStatus("idle"));
  }

  function resolvePending() {
    pendingRef.current = null;
    setPendingSignal(null);
  }

  async function handlePauseTrading() {
    try {
      await api.post("/api/kill-switch", { action: "pause", account: "live" });
      await say("Trading has been disabled. No new trades will be placed.");
    } catch {
      await say("I tried to disable trading but couldn't reach the server. Please use the Stop button instead.");
    }
  }

  async function handleQueryProfit() {
    try {
      const data = await api.get<PositionsResponse>("/api/positions");
      if (data.positions.length === 0) {
        await say("You have no open positions.");
        return;
      }
      const total = data.positions.reduce((sum, p) => sum + p.profit, 0);
      await say(`Your current open profit is ${total.toFixed(2)}.`);
    } catch {
      await say("I couldn't reach the server to check your profit.");
    }
  }

  async function handleQueryPositions() {
    try {
      const data = await api.get<PositionsResponse>("/api/positions");
      if (data.positions.length === 0) {
        await say("You have no open trades.");
        return;
      }
      const list = data.positions.map((p) => `${p.pair.replace("/", "")} ${p.direction}`).join(", ");
      await say(`You have ${data.positions.length} open ${data.positions.length === 1 ? "trade" : "trades"}: ${list}.`);
    } catch {
      await say("I couldn't reach the server to check your open trades.");
    }
  }

  async function handleTranscript(transcript: string) {
    const pending = pendingRef.current;
    const expected = pending ? buildConfirmPhrase(pending) : null;
    const command = parseVoiceCommand(transcript, expected);

    switch (command.kind) {
      case "hard_confirm":
        if (!pending) return;
        // Resolution (speaking the fill/reject/blocked result) happens in the `statuses`
        // watcher effect below, not here -- that effect fires however the execution
        // resolves, not just for this specific call.
        executeSignal(pending);
        return;
      case "decline":
        if (pending) {
          resolvePending();
          await say("Okay, I won't place that trade.");
        }
        return;
      case "soft_confirm":
        if (pending) await say(`I need a clear confirmation. Say "${buildConfirmPhrase(pending)}" to place this trade.`);
        return;
      case "emergency_stop":
        await handlePauseTrading();
        return;
      case "query_profit":
        await handleQueryProfit();
        return;
      case "query_positions":
        await handleQueryPositions();
        return;
      case "mute":
        await say("Muting JUDE. Tap the mic and say \"unmute\" to hear me again.");
        return;
      case "unmute":
        await say("JUDE is listening again.");
        return;
      case "analyze": {
        const latest = signalsRef.current.find((s) => s.pair === command.pair) ?? null;
        await say(buildAnalysisAnnouncement(command.pair, latest));
        return;
      }
      case "trade_request": {
        const match = signalsRef.current.find((s) => s.pair === command.pair && s.direction === command.direction && s.tier !== "watch");
        if (!match) {
          const directionWord = command.direction === "long" ? "BUY" : "SELL";
          await say(`There's no active ${directionWord} signal for that pair right now.`);
          return;
        }
        pendingRef.current = match;
        setPendingSignal(match);
        await say(buildSignalAnnouncement(match));
        return;
      }
      case "unrecognized":
        await say(pending ? `I need a clear confirmation. Say "${buildConfirmPhrase(pending)}" or "cancel".` : "Sorry, I didn't catch that.");
        return;
    }
  }

  const startRecording = useCallback(async () => {
    setMicError(null);
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setMicError("Microphone permission was denied. Enable it in your device Settings to use voice commands.");
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setRecorderStatus("recording");
  }, [recorder]);

  const stopRecordingAndProcess = useCallback(async () => {
    await recorder.stop();
    const uri = recorder.uri;
    setRecorderStatus("transcribing");

    if (!uri) {
      setRecorderStatus("idle");
      setMicError("Recording failed -- no audio was captured.");
      return;
    }

    try {
      const transcript = await transcribeAudio(uri, serverUrl, authHeader);
      setLastTranscript(transcript);
      setRecorderStatus("idle");
      if (!transcript) {
        await say("I didn't hear anything.");
        return;
      }
      await handleTranscript(transcript);
    } catch (err) {
      setRecorderStatus("idle");
      setMicError(err instanceof TranscribeError ? err.message : "Something went wrong transcribing that.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleTranscript closes over refs (pendingRef/signalsRef/settingsRef), not stale state.
  }, [recorder, serverUrl, authHeader]);

  const toggleRecording = useCallback(() => {
    if (recorderStatus === "recording") {
      void stopRecordingAndProcess();
    } else if (recorderStatus === "idle") {
      void startRecording();
    }
  }, [recorderStatus, startRecording, stopRecordingAndProcess]);

  const onSignal = useCallback((signal: Signal) => {
    if (!settingsRef.current.enabled || !settingsRef.current.announceSignals) return;
    if (signal.tier === "watch") return;
    if (pendingRef.current) return; // already announcing/awaiting one -- don't talk over it
    pendingRef.current = signal;
    setPendingSignal(signal);
    void say(buildSignalAnnouncement(signal));
  }, []);

  // Narrates the real result once the pending signal's execution resolves, however it
  // was triggered (voice hard-confirm or the plain SignalsList Buy/Sell button) -- one
  // place speaks the outcome for both, matching the web app's identical design.
  useEffect(() => {
    const signal = pendingSignal;
    if (!signal) return;
    const status = statuses[signal.id];
    if (status?.state === "done") {
      pendingRef.current = null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- narrating an execution result that resolved on an external system (the backend), not state derivable from render.
      setPendingSignal(null);
      void say(buildResultAnnouncement(signal, status.result));
    }
  }, [statuses, pendingSignal]);

  return { recorderStatus, lastTranscript, lastMessage, pendingSignal, micError, toggleRecording, onSignal };
}
