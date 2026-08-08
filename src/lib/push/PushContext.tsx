import * as Application from "expo-application";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useApi } from "@/lib/api/client";
import { useSettings } from "@/lib/api/SettingsContext";
import type { NotificationPrefs, PushDevice } from "@/lib/api/types";
import { getDeviceId } from "./deviceId";
import { registerForPushNotificationsAsync } from "./pushRegistration";

type PushStatus = "idle" | "registering" | "registered" | "error";

interface PushState {
  status: PushStatus;
  device: PushDevice | null;
  error: string | null;
  retry: () => void;
  updatePrefs: (prefs: Partial<NotificationPrefs>) => Promise<void>;
}

const PushContext = createContext<PushState | null>(null);

export function PushProvider({ children }: { children: ReactNode }) {
  const { isConfigured } = useSettings();
  const api = useApi();

  const [status, setStatus] = useState<PushStatus>("idle");
  const [device, setDevice] = useState<PushDevice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isConfigured) return;
    let cancelled = false;

    (async () => {
      setStatus("registering");
      setError(null);

      const tokenResult = await registerForPushNotificationsAsync();
      if (cancelled) return;
      if ("error" in tokenResult) {
        setStatus("error");
        setError(tokenResult.error);
        return;
      }

      const deviceId = await getDeviceId();
      if (cancelled) return;

      try {
        const registered = await api.post<PushDevice>("/api/devices", {
          deviceId,
          pushToken: tokenResult.token,
          platform: tokenResult.platform,
          appVersion: Application.nativeApplicationVersion ?? undefined,
        });
        if (cancelled) return;
        setDevice(registered);
        setStatus("registered");
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "Failed to register this device with the server.");
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isConfigured captures serverUrl/password too (see useSettings); `attempt` is a manual retry trigger, not itself read in the effect.
  }, [isConfigured, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const updatePrefs = useCallback(
    async (prefs: Partial<NotificationPrefs>) => {
      if (!device) return;
      const updated = await api.patch<PushDevice>(`/api/devices/${device.deviceId}`, { notificationPrefs: prefs });
      setDevice(updated);
    },
    [api, device]
  );

  const value = useMemo<PushState>(
    () => ({ status, device, error, retry, updatePrefs }),
    [status, device, error, retry, updatePrefs]
  );

  return <PushContext.Provider value={value}>{children}</PushContext.Provider>;
}

export function usePush(): PushState {
  const ctx = useContext(PushContext);
  if (!ctx) throw new Error("usePush must be used within a PushProvider");
  return ctx;
}
