# ReplyDesk

**AI replies for customer-service agents, where the customer's personal details never leave the agent's device.**

Built for **#BuildHybridAI 2026** with **Firebase AI Logic hybrid inference** on two platforms:

| Platform | On-device model | Cloud model | Code |
|---|---|---|---|
| **Web** (Chrome desktop) | Gemini Nano (Chrome Prompt API) | Gemini (`gemini-3.5-flash-lite`) | [`web/`](web) |
| **iOS** (iPhone with Apple Intelligence) | Apple Foundation Models | Gemini (`gemini-3.5-flash-lite`) | [`ios/`](ios) |

**Live demo:** _add your Firebase Hosting URL here_ · **Video:** _add your YouTube link here_

## The problem

Support agents paste customer messages into AI tools every day, and those messages are full of names, card numbers, addresses and order IDs. Sending them to a cloud model is a privacy and compliance problem. Keeping everything on the device means weaker answers on long, messy tickets, and nothing at all on devices without an on-device model.

## How ReplyDesk solves it: a privacy router

```
customer message
   │
   ▼
1. MASK (on device only, ONLY_ON_DEVICE)
   Gemini Nano / Apple model finds names and addresses; local rules catch emails,
   phones, cards (Luhn-checked), order numbers, postcodes  →  "[NAME_1] … [CARD_1]"
   │
   ▼
2. ROUTE (local logic)
   short & simple ─────────────► PREFER_ON_DEVICE
   long, many questions, thread ► PREFER_IN_CLOUD   (masked text only)
   "Local only" switch ────────► ONLY_ON_DEVICE
   │
   ▼
3. TRIAGE + 4. DRAFT  (masked text; the SDK picks device or cloud)
   │
   ▼
5. UNMASK (on device): real details go back in; cards only as "card ending in 1111"
```

**The key idea:** raw customer text is only ever sent to an `ONLY_ON_DEVICE` model. Everything after masking is safe to route anywhere, so the hybrid SDK can freely use the device when it can and Gemini in the cloud when it should, without the cloud ever seeing a real customer detail.

The app proves it: the **"What the cloud saw"** panel shows either *"✓ Nothing left this device"* or the exact masked prompt that was sent.

## Firebase AI Logic features used

- **Hybrid inference** on Web (`getGenerativeModel` with `InferenceMode`) and iOS (`.hybridModel(primary:secondary:)`), with all four routing behaviours: `ONLY_ON_DEVICE`, `PREFER_ON_DEVICE`, `PREFER_IN_CLOUD`, and cloud-only via the cloud fallback.
- **Inference source** on every response (`inferenceSource` on web, `rawResponse.modelVersion` on iOS) drives the badges and the "What the cloud saw" panel.
- **Structured output:** JSON schemas for entity extraction and triage, on device (`responseConstraint`) and in the cloud (`responseSchema`).
- **Streaming** reply drafts (web).
- **On-device model lifecycle:** availability checks and user-started download (`initializeDeviceModel`), with clear states when the model isn't available.
- **Failure planning:** a failed cloud step retries on the device; if no AI path exists, a safe holding reply is written locally.
- **App Check** on both platforms (reCAPTCHA Enterprise on web, debug provider for development).

## Run it

### Web
```bash
cd web
cp .env.example .env       # Firebase web config + reCAPTCHA Enterprise site key
npm install
npm run dev                # http://localhost:5173
npm test                   # masking and routing tests
```
Requires Chrome desktop with Gemini Nano available (`await LanguageModel.availability()` in the DevTools console should say `"available"` or `"downloadable"`). Other browsers still work, using the cloud with rule-based masking.

On localhost, App Check prints a **debug token** in the console: register it in Firebase → Security → App Check → Manage debug tokens.

Deploy: `npm install -g firebase-tools && firebase login && firebase use <project-id> && npm run deploy`

### iOS
See [`ios/README.md`](ios/README.md): create the Xcode project, add the Firebase package, and run on an iPhone with Apple Intelligence.

## Cost

Everything runs on the **free Spark plan** and the Gemini Developer API free tier. On-device inference is free. Don't link a billing account.

## Limits

- On-device models handle shorter text; long tickets are routed to the cloud (masked) by design.
- Rule-based masking (used when no on-device model exists) can miss unusual names; the masked text is always shown so the agent can check it.
- Sample tickets are fictional. ReplyDesk drafts replies; an agent reviews and sends them.

## License

Apache 2.0, see [LICENSE](LICENSE).
