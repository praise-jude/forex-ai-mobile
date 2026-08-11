import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { DevicePlatform } from "@/lib/api/types";

export type PushTokenResult = { token: string; platform: DevicePlatform } | { error: string };

function currentPlatform(): DevicePlatform {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  return "web";
}

/**
 * Requests notification permission (if not already granted) and returns an Expo push
 * token. Never throws -- every failure mode (simulator/emulator, permission denied, no
 * EAS project configured yet) comes back as `{ error }` so the caller can degrade
 * gracefully instead of crashing app start over an optional feature.
 */
export async function registerForPushNotificationsAsync(): Promise<PushTokenResult> {
  if (Platform.OS !== "web" && !Device.isDevice) {
    return { error: "Push notifications require a physical device (not a simulator/emulator)." };
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "JUDE AI",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#208AEF",
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") {
    return { error: "Notification permission was denied." };
  }

  // Set via `eas init` (already configured in app.json's extra.eas.projectId) -- the
  // guard below stays as a fail-closed safety net with a clear reason, not a crash, in
  // case a future rebuild ever loses that config rather than because it's unset today.
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId || typeof projectId !== "string") {
    return { error: "EAS project not configured yet (run `eas init` and rebuild)." };
  }

  try {
    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    return { token: tokenResponse.data, platform: currentPlatform() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to get a push token." };
  }
}
