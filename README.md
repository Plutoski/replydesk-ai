# ReplyDesk

**Customer-service replies drafted by AI that runs on your device first and switches to the cloud only when it has to.**

ReplyDesk takes a customer's email or chat message and:

1. **Triages it:** a one-line summary plus category, sentiment and urgency.
2. **Drafts a reply** in the tone you choose (Warm, Professional, Concise), signed with your name.
3. **Shows where the AI ran** for every step (*On this device* or *Cloud · Gemini*), with timing and a running "kept on device" percentage.

It runs on **two platforms** from one design, both using **Firebase AI Logic hybrid inference**:

| Platform | On-device model | Cloud fallback | Code |
|---|---|---|---|
| Web (Chrome desktop 139+) | Gemini Nano via Chrome's Prompt API | Gemini (`gemini-3.5-flash-lite`) | [`web/`](web) |
| Android (API 26+, AICore-supported phones) | Gemini Nano via ML Kit Prompt API / AICore | Gemini (`gemini-3.5-flash-lite`) | [`android/`](android) |

Both apps share the same prompts, triage schema, inference modes and UI, so they behave the same on a laptop and on a phone.

## Why hybrid matters here

Customer messages are full of personal data: names, addresses, order details, payment problems. When the on-device model is available, **the message never leaves the agent's machine**. Inference costs nothing and still works with no connection. When the device can't run the model (another browser, an older phone, a request that is too long), the SDK falls back to Gemini in the cloud, so **every agent gets a reply, on every device**.

## How the hybrid SDK is used

```js
// web/src/ai.js
const model = getGenerativeModel(ai, {
  mode: InferenceMode.PREFER_ON_DEVICE,
  onDeviceParams: { promptOptions: { responseConstraint: analysisSchema } },
  inCloudParams:  { generationConfig: { responseMimeType: "application/json", responseSchema: analysisSchema } },
});
await model.initializeDeviceModel(p => showProgress(p)); // on a button click
const result = await model.generateContent(prompt);
result.response.inferenceSource; // "on_device" | "in_cloud"
```

```kotlin
// android/.../HybridAi.kt
Firebase.ai(backend = GenerativeBackend.googleAI()).generativeModel(
    modelName = CLOUD_MODEL,
    onDeviceConfig = OnDeviceConfig(mode = InferenceMode.PREFER_ON_DEVICE, maxOutputTokens = 256),
)
model.onDeviceExtension?.download()   // the SDK never downloads on its own
response.inferenceSource               // ON_DEVICE | IN_CLOUD
```

Features used: all four inference modes (switchable in the UI), on-device model status and download with progress, warm-up (Android), streaming replies, structured JSON output, and the `inferenceSource` on each response.

## Setup

### 1. Firebase project (shared by both apps)
1. Create a project at <https://console.firebase.google.com>.
2. Go to **AI Services → AI Logic → Get started** and choose the **Gemini Developer API**. This turns on App Check enforcement, which AI Logic requires.
3. Add a **Web app** and an **Android app** (package `com.replydesk.app`).

### 2. Web
```bash
cd web
cp .env.example .env      # paste your Firebase web config + reCAPTCHA Enterprise site key
npm install
npm run dev               # http://localhost:5173
```
- **App Check on localhost:** on first run the console prints a debug token. Register it under **App Check → Apps → Manage debug tokens**.
- **Turn on on-device AI in Chrome:** use Chrome desktop 139+, set `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` to *Enabled*, restart Chrome, then click **Enable on-device AI** in the app.
- **Deploy:** `npm install -g firebase-tools && firebase login && firebase use <project-id> && npm run deploy`. Add your Hosting domain to the reCAPTCHA Enterprise key's allowed domains.

### 3. Android
1. Download `google-services.json` from the Firebase console into `android/app/`.
2. Open `android/` in Android Studio and let it sync. Accept any plugin or Gradle wrapper updates it suggests.
3. Run on a phone that supports Gemini Nano through AICore (see the [ML Kit device list](https://developers.google.com/ml-kit/genai#prompt-device)). On other phones and emulators the app still works, using the cloud.
4. **App Check:** copy the debug token from Logcat (tag `DebugAppCheckProvider`) and register it in the console.
5. Tap **Enable on-device AI** if the model shows as downloadable.

## Demo it

1. Pick a sample message and run it. The badges show **On this device**.
2. Switch the mode to **Only cloud** and run it again. The badges show **Cloud · Gemini**.
3. Switch back to **Prefer on-device**, **turn off Wi-Fi**, and run it again. It still works offline.
4. Open the same message in a browser without Gemini Nano (or on an unsupported phone) and run it. It falls back to the cloud automatically.

## Limits

- On-device output is short by design: under 140 words, about 256 tokens on Android.
- The Android hybrid SDK is experimental and on-device runs only in the foreground. English is the validated language.
- Firebase console AI monitoring only shows cloud requests.

## Project layout
```
web/       Vite + Firebase JS SDK (v13)
android/   Kotlin + Jetpack Compose + firebase-ai / firebase-ai-ondevice
docs/      Write-up and demo video script
```
