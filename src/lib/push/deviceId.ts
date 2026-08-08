import * as Application from "expo-application";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const FALLBACK_ID_KEY = "forexai.deviceId";

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * A stable per-install identifier used as the primary key for device push-token
 * registration (see /api/devices on the backend). Prefers the platform's own
 * per-install identifier (Android ID / iOS identifierForVendor) since those already
 * exist and need no storage; falls back to a locally generated id persisted in
 * SecureStore for web (no such platform identifier there) or if the native call fails.
 */
export async function getDeviceId(): Promise<string> {
  try {
    if (Platform.OS === "android") {
      const id = Application.getAndroidId();
      if (id) return `android-${id}`;
    } else if (Platform.OS === "ios") {
      const id = await Application.getIosIdForVendorAsync();
      if (id) return `ios-${id}`;
    }
  } catch {
    // Fall through to the generated+persisted id below.
  }

  const existing = await SecureStore.getItemAsync(FALLBACK_ID_KEY);
  if (existing) return existing;

  const generated = `device-${randomId()}`;
  await SecureStore.setItemAsync(FALLBACK_ID_KEY, generated);
  return generated;
}
