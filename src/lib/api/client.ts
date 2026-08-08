import { useCallback, useMemo } from "react";
import { useSettings } from "./SettingsContext";

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

export interface ApiClient {
  isConfigured: boolean;
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  patch<T>(path: string, body?: unknown): Promise<T>;
  del<T>(path: string): Promise<T>;
}

export function useApi(): ApiClient {
  const { serverUrl, authHeader, isConfigured } = useSettings();

  const request = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      if (!serverUrl) throw new ApiError("Server URL is not configured");
      const headers: Record<string, string> = {};
      if (authHeader) headers.Authorization = authHeader;
      if (init?.body !== undefined) headers["Content-Type"] = "application/json";

      let res: Response;
      try {
        res = await fetch(`${serverUrl}${path}`, { ...init, headers });
      } catch {
        throw new ApiError("Network error — check the server URL and your connection");
      }

      if (res.status === 401) throw new ApiError("Unauthorized — check the dashboard password in Settings", 401);
      if (!res.ok) throw new ApiError(`Request failed (${res.status})`, res.status);
      return (await res.json()) as T;
    },
    [serverUrl, authHeader]
  );

  return useMemo(
    () => ({
      isConfigured,
      get: <T,>(path: string) => request<T>(path),
      post: <T,>(path: string, body?: unknown) =>
        request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : "" }),
      patch: <T,>(path: string, body?: unknown) =>
        request<T>(path, { method: "PATCH", body: body !== undefined ? JSON.stringify(body) : "" }),
      del: <T,>(path: string) => request<T>(path, { method: "DELETE" }),
    }),
    [isConfigured, request]
  );
}
