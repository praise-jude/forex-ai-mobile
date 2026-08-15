import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { base64Encode } from "./base64";

const SERVER_URL_KEY = "forexai.serverUrl";
const PASSWORD_KEY = "forexai.password";

// Ships pointed at the deployed dashboard by default -- the password is left blank
// since it's a secret the operator sets per-deployment, never something to hardcode here.
const DEFAULT_SERVER_URL = "https://forex-ai.up.railway.app";

interface SettingsState {
  serverUrl: string;
  password: string;
  loaded: boolean;
  isConfigured: boolean;
  authHeader: string | null;
  setServerUrl: (url: string) => Promise<void>;
  setPassword: (password: string) => Promise<void>;
}

const SettingsContext = createContext<SettingsState | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [serverUrl, setServerUrlState] = useState(DEFAULT_SERVER_URL);
  const [password, setPasswordState] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [storedUrl, storedPassword] = await Promise.all([
        SecureStore.getItemAsync(SERVER_URL_KEY),
        SecureStore.getItemAsync(PASSWORD_KEY),
      ]);
      if (cancelled) return;
      if (storedUrl) setServerUrlState(storedUrl);
      if (storedPassword) setPasswordState(storedPassword);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setServerUrl = useCallback(async (url: string) => {
    const trimmed = url.trim().replace(/\/+$/, "");
    setServerUrlState(trimmed);
    await SecureStore.setItemAsync(SERVER_URL_KEY, trimmed);
  }, []);

  const setPassword = useCallback(async (next: string) => {
    setPasswordState(next);
    await SecureStore.setItemAsync(PASSWORD_KEY, next);
  }, []);

  const value = useMemo<SettingsState>(() => {
    // Matches the web app's isAuthorized(): the username portion is ignored server-side,
    // so any non-empty username works -- "mobile" is just a readable placeholder.
    const authHeader = password ? `Basic ${base64Encode(`mobile:${password}`)}` : null;
    return {
      serverUrl,
      password,
      loaded,
      isConfigured: Boolean(serverUrl && password),
      authHeader,
      setServerUrl,
      setPassword,
    };
  }, [serverUrl, password, loaded, setServerUrl, setPassword]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsState {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within a SettingsProvider");
  return ctx;
}
