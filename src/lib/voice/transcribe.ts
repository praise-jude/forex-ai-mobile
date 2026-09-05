import * as FileSystem from "expo-file-system/legacy";

export class TranscribeError extends Error {}

/**
 * Uploads a recorded voice command to the backend's /api/voice/transcribe proxy (which
 * forwards it to OpenAI Whisper using a server-side API key -- see that route). Uses
 * expo-file-system's native multipart upload rather than fetch()+FormData with a
 * { uri, name, type } part -- that shape throws "Unsupported FormDataPart implementation"
 * on this React Native version, since it isn't a real Blob/File instance.
 */
export async function transcribeAudio(fileUri: string, serverUrl: string, authHeader: string | null): Promise<string> {
  const headers: Record<string, string> = {};
  if (authHeader) headers.Authorization = authHeader;

  let result: FileSystem.FileSystemUploadResult;
  try {
    result = await FileSystem.uploadAsync(`${serverUrl}/api/voice/transcribe`, fileUri, {
      httpMethod: "POST",
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: "audio",
      mimeType: "audio/m4a",
      headers,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[voice] transcribe upload failed:", err);
    throw new TranscribeError(`Could not reach the server to transcribe your command. (${detail})`);
  }

  if (result.status < 200 || result.status >= 300) {
    const body = (() => {
      try {
        return JSON.parse(result.body) as { message?: string };
      } catch {
        return null;
      }
    })();
    throw new TranscribeError(body?.message ?? `Transcription failed (${result.status}).`);
  }

  let json: { text?: string };
  try {
    json = JSON.parse(result.body) as { text?: string };
  } catch (err) {
    console.error("[voice] transcribe returned a malformed response body:", err, result.body);
    throw new TranscribeError("The server returned an unreadable response while transcribing your command.");
  }
  return json.text?.trim() ?? "";
}
