# Forex AI Mobile

A native React Native (Expo Router) client for the [forex-ai](../forex-ai) dashboard — the SMC signal engine, MetaApi connection, and trade execution all live on that backend; this app is a client of its REST API, plus push notifications and a JUDE voice assistant that the web dashboard doesn't have.

- **Dashboard** — connection status, engine mode (Analysis/Demo/Live), the live kill switch, risk guardian banner, watchlist, a candlestick chart, active signals with Buy/Sell execute buttons, and open positions. Polls the backend's existing REST endpoints (no server-sent events — RN can't attach the Authorization header to `EventSource`, so this polls every few seconds instead, same data, near-real-time).
- **Settings** — backend server URL + HTTP Basic Auth password (stored on-device via `expo-secure-store`), push notification preferences per category, and JUDE voice preferences.
- **Push notifications** — registers this device with the backend (`POST /api/devices`) and receives a push (via Expo's push service, routed to FCM/APNs) for new signals, trade opened/rejected, TP/SL/position closed, risk alerts, and connection lost/restored — even when the app is fully closed. See the backend's own README (`forex-ai/README.md`, "Push notifications & JUDE voice (mobile)") for the server side of this.
- **JUDE voice** — tap the mic to ask things like "analyze gold" or "buy EURUSD"; JUDE replies with text-to-speech (on-device, via `expo-speech`) and requires an exact spoken "CONFIRM BUY EURUSD"-style phrase before placing any real trade. Speech-to-text is done server-side (`POST /api/voice/transcribe`, OpenAI Whisper) so no speech API key ever lives on the phone.

## Why this needs an EAS development build, not Expo Go

Two things this app does aren't available in Expo Go: reliable background/closed-app push delivery, and the native audio recording the voice assistant uses. Both need a custom native build. The steps below get you from a fresh clone to a working dev build on your own device.

### 1. Install dependencies and the EAS CLI

```bash
npm install
npm install -g eas-cli
eas login
```

### 2. Link this app to an EAS project

```bash
eas init
```

This writes a real `projectId` into `app.json` under `expo.extra.eas.projectId` (currently blank) — push notifications won't register until this is set. Commit the change.

### 3. Set the bundle identifiers

`app.json` currently ships with placeholder identifiers (`com.forexai.mobile` for both `ios.bundleIdentifier` and `android.package`). Change these to something under your own control before building for real devices/app stores — they don't need to change for a first local dev-build test, but do need to be unique if you ever submit to the App Store / Play Store.

### 4. Set up push notification credentials

Push delivery goes through Expo's push service (`expo-server-sdk` on the backend), which itself routes through FCM (Android) and APNs (iOS) — you don't need to touch Firebase Admin credentials directly on the backend, but EAS does need Android/iOS push credentials to actually deliver:

**Android (Firebase Cloud Messaging)**:
1. Create a project at [console.firebase.google.com](https://console.firebase.google.com) (free tier is fine).
2. Project settings → Cloud Messaging → generate/download a **Service Account** JSON key (Firebase Console → Project settings → Service accounts → "Generate new private key").
3. Run `eas credentials`, select Android → Push Notifications → upload that JSON key. EAS stores and uses it; it never needs to live in this repo or on the Next.js backend.

**iOS (APNs)**: run `eas credentials`, select iOS → Push Notifications, and let EAS generate/manage the APNs key for you (needs an active Apple Developer Program membership).

### 5. Set up JUDE's speech-to-text

Voice commands are transcribed server-side. On the **backend** (`forex-ai`, not this repo), set `OPENAI_API_KEY` in `.env.local` — see that repo's README for details. Nothing to configure here on the mobile side.

### 6. Build and run the dev client

```bash
eas build --profile development --platform android   # or ios
```

Install the resulting build on your device, then:

```bash
npx expo start --dev-client
```

Open the app, go to **Settings**, enter your backend's URL and dashboard password (the same `DASHBOARD_ACCESS_PASSWORD` the web dashboard uses), and tap **Test connection**.

## Everyday development

```bash
npm install
npx expo start --dev-client   # requires the dev build from step 6 above, not Expo Go
```

Type-check and lint:

```bash
npx tsc --noEmit
npx expo lint
```

## What's simplified vs. the web dashboard

- **No SSE** — the web dashboard uses `EventSource` for live price ticks and instant signal push; this app polls the same REST endpoints every few seconds instead (see `src/lib/api/usePolling.ts`), since RN's fetch (unlike the browser, which caches Basic Auth credentials per-origin) has no way to attach a custom header to `EventSource`.
- **No "Hey JUDE" wake word / always-listening mode** — voice is tap-to-talk only. Continuous background microphone listening isn't something iOS/Android allow for a backgrounded app, and would be a bad idea on a phone anyway (JUDE announcing trade proposals out loud while the phone is in your pocket). Proactive "a new signal just arrived" alerts are push notifications instead; TTS narration only happens while the app is open.
- **Demo account kill switch isn't exposed in the UI yet** — only the live account's kill switch has a control, matching what the web dashboard's header currently exposes.
