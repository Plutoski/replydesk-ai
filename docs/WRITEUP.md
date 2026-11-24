# ReplyDesk: hybrid AI for the customer-service front line

## The problem
I work as a customer service representative. Each day I read messages from upset customers and write replies that must be quick, calm and accurate. AI drafting helps, but customer messages carry personal data, and sending every one to a cloud model raises privacy and cost concerns. Agents also don't work on identical machines. Some have new laptops, some use older PCs, and many work from their phones.

## What ReplyDesk does
Paste in a customer message and ReplyDesk:
- **triages it**: a one-sentence summary plus category, sentiment and urgency, so you can see at a glance which tickets are urgent
- **drafts a reply** in a chosen tone, signed with your name, using [placeholders] where it shouldn't invent facts such as order numbers or refunds
- **shows where the AI ran** for each step (*On this device* or *Cloud · Gemini*), with timing and a running "kept on device" percentage

## How it uses Firebase AI Logic hybrid inference
ReplyDesk runs on **two platforms**, the **web (Chrome desktop)** and **Android**, both built on the Firebase AI Logic hybrid SDK:
- **`PREFER_ON_DEVICE`** by default. Gemini Nano runs locally (Chrome Prompt API on the web, ML Kit / AICore on Android). If the device can't run it, the SDK switches to Gemini in the cloud with no extra code.
- All **four inference modes** can be switched in the app, so judges can watch the routing change live.
- **On-device model lifecycle:** status check, download started by the user with a progress bar, and warm-up on Android.
- **Structured JSON output** for triage, with the same schema on device and in the cloud, so the UI doesn't care which path answered.
- **Streaming** for reply drafts.
- **`inferenceSource`** on every response drives the badges and the "kept on device" stat.
- **App Check** protects the cloud path (debug provider for development, reCAPTCHA Enterprise / Play Integrity for release).

## Why hybrid is the right fit
- **Privacy:** when Nano is available, the customer's message never leaves the agent's machine.
- **Cost:** routine triage and short replies cost nothing on device, and the cloud handles only what the device can't.
- **Resilience:** it keeps working offline, for example on a flaky connection or when the office network goes down.
- **Reach:** every agent gets the feature, whatever browser or phone they use.

## Challenges
- The two platforms expose the hybrid SDK differently. The web starts the model through `initializeDeviceModel()` on a user gesture, while Android uses `onDeviceExtension.download()`. I wrapped both behind the same "Enable on-device AI" action.
- On-device models have tighter limits (shorter outputs, single-turn only). I kept prompts single-turn, capped replies at about 140 words, and told the model to use placeholders rather than invent details.

## What's next
- An iOS version using Apple Foundation Models through the same SDK
- A "never send to cloud" policy switch for sensitive queues (`ONLY_ON_DEVICE`)
- Company tone guides and canned policies added to the prompt
- Ticketing-system integrations (Zendesk, Freshdesk) as a browser extension

**Built with:** Firebase AI Logic (hybrid inference), Gemini Nano, Gemini 3.5 Flash-Lite, Firebase App Check, Firebase Hosting, Vite, Kotlin and Jetpack Compose.
