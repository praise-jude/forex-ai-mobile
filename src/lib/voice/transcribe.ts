export class TranscribeError extends Error {}

/**
 * Uploads a recorded voice command to the backend's /api/voice/transcribe proxy (which
 * forwards it to OpenAI Whisper using a server-side API key -- see that route). Uses a
 * raw multipart fetch rather than the JSON-only useApi() client, since this is a file
 * upload, not a JSON body.
 */
export async function transcribeAudio(fileUri: string, serverUrl: string, authHeader: string | null): Promise<string> {
  const formData = new FormData();
  // React Native's fetch/FormData accepts this { uri, name, type } shape for a local file
  // -- there is no Blob/File object for an on-disk recording the way there would be in a
  // browser, so this is the platform-idiomatic way to attach it.
  formData.append("audio", { uri: fileUri, name: "command.m4a", type: "audio/m4a" } as unknown as Blob);

  const headers: Record<string, string> = {};
  if (authHeader) headers.Authorization = authHeader;

  let res: Response;
  try {
    res = await fetch(`${serverUrl}/api/voice/transcribe`, { method: "POST", body: formData, headers });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[voice] transcribe fetch failed:", err);
    throw new TranscribeError(`Could not reach the server to transcribe your command. (${detail})`);
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new TranscribeError(body?.message ?? `Transcription failed (${res.status}).`);
  }

  const json = (await res.json()) as { text?: string };
  return json.text?.trim() ?? "";
}
