# ReplyDesk

**AI replies for customer-service agents, where the customer's personal details never leave the agent's device.**

Built for **#BuildHybridAI 2026** with **Firebase AI Logic hybrid inference** on two platforms:

| Platform | On-device model | Cloud model | Code |
|---|---|---|---|
| **Web** (Chrome desktop) | Gemini Nano (Chrome Prompt API) | Gemini (`gemini-3.5-flash-lite`) | [`web/`](web) |
| **iOS** (iPhone with Apple Intelligence) | Apple Foundation Models | Gemini (`gemini-3.5-flash-lite`) | [`ios/`](ios) |

**Live demo:** https://replydesk-a6c0a.web.app · **Video (2:37):** https://youtu.be/g058mrykwok

## Try it in 60 seconds (for judges)

1. Open https://replydesk-a6c0a.web.app in **Chrome on desktop** (version 139 or newer).
2. For on-device AI, set `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` to **Enabled**, restart Chrome, and click **Enable on-device AI** if the banner asks (a one-time download of Gemini Nano).
3. Click **Double charge**, then **Mask, triage & draft reply**. The privacy receipt says *"Cloud saw nothing."*
4. Click **Long thread** and run it. It goes to Gemini in the cloud, and **What the cloud saw** shows the exact masked prompt.
5. Pick a **Failure drill** (offline, Gemini down, or no on-device model) and run again to see each fallback.

**No Gemini Nano?** Any browser works. ReplyDesk masks with its pattern rules, then **asks you to approve the masked text** before anything goes to the cloud. The iOS app is shown in the video and can be built from [`ios/`](ios).

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

The app proves it: a **privacy receipt** at the top of each result (*"Cloud saw 2 masked prompts · 7 tags · 0 real details"*), and a **"What the cloud saw"** panel with the exact prompt that was sent. Before every cloud call, a leak check scans the prompt for each real value from the ticket and stops the call if one is found.

## Planning for failure

| What breaks | What ReplyDesk does |
|---|---|
| No internet | Every step runs on the device (`ONLY_ON_DEVICE`). |
| Gemini fails or hits a quota | The step is retried on the device. |
| The on-device model fails | The step goes to Gemini with masked text only. |
| No on-device model (Safari, Firefox, older laptops) | Pattern rules mask the text, and the agent approves it before it goes to the cloud. |
| The agent says no, or Local only is on with no model | Nothing is sent. A safe holding reply is written locally. |
| The model invents a detail like `[TIME_FRAME]` | It becomes a `[CHECK: time frame]` note for the agent. |

Every row can be tried on the live site with the **Failure drill** menu, and each one is covered by an automated test (`web/test/flow.test.mjs`).

## Privacy evaluation

`npm run eval` runs the masking rules on their own (the worst case, with no on-device model) against 77 fictional, deliberately tricky messages with 120 planted personal details: international phone numbers, IBANs, national ID numbers, Nigerian, Spanish, Arabic and Chinese names, addresses in four countries.

| | Before the stress test | Now |
|---|---|---|
| Personal details masked | 41% | **92%** |
| High-risk details masked (cards, IDs, full names, phones, emails) | 46% | **93%** |
| Messages fully masked | 35% | **90%** |
| Ordinary text left alone (prices, dates, product codes) | 17 of 18 | **18 of 18** |

With Gemini Nano or Apple's on-device model, the model finds names and addresses on top of these rules. Without it, the agent checks the masked text before anything leaves the device.

## Firebase AI Logic features used

- **Hybrid inference** on Web (`getGenerativeModel` with `InferenceMode`) and iOS (`.hybridModel(primary:secondary:)`), using all four modes: `ONLY_ON_DEVICE` (masking, offline, Local only), `PREFER_ON_DEVICE` (short tickets), `PREFER_IN_CLOUD` (complex tickets) and `ONLY_IN_CLOUD` (no on-device model, or a failed on-device step).
- **Inference source** on every response (`inferenceSource` on web, `rawResponse.modelVersion` on iOS) drives the badges and the "What the cloud saw" panel.
- **Structured output:** JSON schemas for entity extraction and triage, on device (`responseConstraint`) and in the cloud (`responseSchema`).
- **Streaming** reply drafts (web).
- **On-device model lifecycle:** availability checks and user-started download (`initializeDeviceModel`), with clear states when the model isn't available.
- **Failure planning:** see the table above.
- **App Check** on both platforms (reCAPTCHA Enterprise on web, with limited-use tokens so a token can't be replayed; debug provider for development).
- **Hardened hosting:** security headers block other sites from embedding the app (clickjacking), stop content-type guessing, force HTTPS and limit referrer and device-permission access.

## Run it

### Web
```bash
cd web
cp .env.example .env       # Firebase web config + reCAPTCHA Enterprise site key
npm install
npm run dev                # http://localhost:5173
npm test                   # masking, routing and full ticket-flow tests (no network needed)
npm run eval               # privacy evaluation on 77 tricky messages
```
On-device AI needs Chrome desktop 139+ with `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` enabled (`await LanguageModel.availability()` in the DevTools console should say `"available"` or `"downloadable"`). Other browsers still work: pattern-rule masking, then the agent approves the masked text before it goes to the cloud.

On localhost, App Check prints a **debug token** in the console: register it in Firebase → Security → App Check → Manage debug tokens.

Deploy: `npm install -g firebase-tools && firebase login && firebase use <project-id> && npm run deploy`

### iOS
See [`ios/README.md`](ios/README.md): open `ios/ReplyDesk.xcodeproj` (Xcode 27.2 or newer), add your own `GoogleService-Info.plist`, and run on an iPhone with Apple Intelligence (iPhone 15 Pro or newer, iOS 26+).

## Cost

Everything runs on the **free Spark plan** and the Gemini Developer API free tier. On-device inference is free. Don't link a billing account.

## Limits

- On-device models handle shorter text; long tickets are routed to the cloud (masked) by design.
- Rule-based masking (used when no on-device model exists) still misses some cases, such as names in a plain list ("Bisi, Tolu and Femi") or phone numbers spelled out in words. That's why the agent approves the masked text before it goes to the cloud in that mode.
- Sample tickets are fictional. ReplyDesk drafts replies; an agent reviews and sends them.

## License

Apache 2.0, see [LICENSE](LICENSE).
