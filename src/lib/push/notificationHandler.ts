import * as Notifications from "expo-notifications";

// Module-scope, run once on import (from _layout.tsx) -- controls how a push is
// presented while the app is in the foreground. Without this, expo-notifications
// defaults to not showing anything while the app is open, which would make a
// foreground "new signal" push silently invisible.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
