import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const STORAGE_KEY = "forexai.voiceSettings";

export interface VoiceSettings {
  enabled: boolean;
  /** expo-speech rate: 1.0 is normal, 0.5 is half speed, 2.0 is double. */
  rate: number;
  volume: number;
  announceSignals: boolean;
  announceTradeExecution: boolean;
  announceRiskWarnings: boolean;
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  enabled: true,
  rate: 1.0,
  volume: 1.0,
  announceSignals: true,
  announceTradeExecution: true,
  announceRiskWarnings: true,
};

interface VoiceSettingsState {
  settings: VoiceSettings;
  loaded: boolean;
  update: (patch: Partial<VoiceSettings>) => void;
}

const VoiceSettingsContext = createContext<VoiceSettingsState | null>(null);

export function VoiceSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<VoiceSettings>(DEFAULT_VOICE_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    SecureStore.getItemAsync(STORAGE_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        setSettings((prev) => ({ ...prev, ...(JSON.parse(raw) as Partial<VoiceSettings>) }));
      })
      .catch(() => {
        // Best-effort; falls back to DEFAULT_VOICE_SETTINGS already in state.
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback((patch: Partial<VoiceSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      void SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next)).catch(() => {
        // Best-effort persistence; in-memory `settings` still reflects the update for
        // this session even if the write fails, same as SettingsContext.tsx's approach.
      });
      return next;
    });
  }, []);

  const value = useMemo<VoiceSettingsState>(() => ({ settings, loaded, update }), [settings, loaded, update]);

  return <VoiceSettingsContext.Provider value={value}>{children}</VoiceSettingsContext.Provider>;
}

export function useVoiceSettings(): VoiceSettingsState {
  const ctx = useContext(VoiceSettingsContext);
  if (!ctx) throw new Error("useVoiceSettings must be used within a VoiceSettingsProvider");
  return ctx;
}
