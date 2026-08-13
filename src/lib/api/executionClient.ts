import type { ExecuteResponse } from "./types";

// Deliberately bypasses useApi()'s generic request() (client.ts), which throws on any
// non-2xx response -- the execute route's 400 ("confirmation_required") and 410
// ("expired") responses carry meaningful JSON bodies the UI needs to read, not a
// generic error to swallow. Mirrors forex-ai/lib/market/executionClient.ts exactly.
export async function executeSignalRequest(
  serverUrl: string,
  authHeader: string | null,
  signalId: string,
  confirmationPhrase: string,
  riskPctOverride?: number
): Promise<ExecuteResponse> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (authHeader) headers.Authorization = authHeader;
    const res = await fetch(`${serverUrl}/api/signals/${signalId}/execute`, {
      method: "POST",
      headers,
      body: JSON.stringify({ confirmationPhrase, riskPctOverride }),
    });
    return (await res.json()) as ExecuteResponse;
  } catch {
    return { status: "network_error" };
  }
}

/** An explicit "no" -- logged server-side as a real decision (the signal funnel), never
 * throws: a missed log entry here only affects funnel stats, never execution/risk, so
 * the caller can treat this as fire-and-forget. */
export async function rejectSignalRequest(serverUrl: string, authHeader: string | null, signalId: string): Promise<void> {
  try {
    const headers: Record<string, string> = {};
    if (authHeader) headers.Authorization = authHeader;
    await fetch(`${serverUrl}/api/signals/${signalId}/reject`, { method: "POST", headers });
  } catch {
    // Best-effort, see doc comment above.
  }
}
