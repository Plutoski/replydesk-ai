# ReplyDesk: AI replies that keep customer data on the agent's device

## Inspiration
I'm a customer service representative. I've done the job in London and now in Calgary, and every shift I read messages full of personal details: names, card numbers, addresses and booking references. AI could cut my reply time in half, but pasting customers' details into a cloud chatbot is exactly what support teams are trained not to do. I wanted an assistant I'd actually be allowed to use at work.

## What it does
Paste a customer message and ReplyDesk:
1. **Masks personal details on the device.** Gemini Nano (Chrome) or Apple's on-device model finds names and addresses, and local rules catch emails, phone numbers, card numbers, order IDs and postcodes. "Sarah Jones" becomes `[NAME_1]`.
2. **Chooses where to run.** Short, simple tickets stay on the device. Long threads or tickets with many questions go to Gemini in the cloud, as masked text only. A **Local only** switch keeps everything on the device for sensitive queues.
3. **Triages and drafts a reply** in the agent's chosen tone.
4. **Restores the real details on the device.** Card numbers come back only as "card ending in 1111", the way agents are trained to write them.

The **"What the cloud saw"** panel shows either "✓ Nothing left this device" or the exact masked text that was sent.

## How we used Firebase AI Logic
- The **hybrid inference SDK** on **Web** (Gemini Nano in Chrome) and **iOS** (Apple Foundation Models), with Gemini as the cloud model on both.
- **Different inference modes for different jobs:** `ONLY_ON_DEVICE` for masking, because it sees raw data; `PREFER_ON_DEVICE` for simple tickets, because they're fast, free and work offline; `PREFER_IN_CLOUD` for complex tickets, where quality matters and the text is already masked.
- The **inference source** on each response powers the on-device or cloud badges and the "What the cloud saw" panel.
- **Structured JSON output** for entity extraction and triage, on device and in the cloud.
- **Failure handling:** a failed cloud step retries on the device, and if no AI path is available, the app writes a safe holding reply.
- **App Check** protects the Gemini API on both platforms.

## Value
- **Privacy and compliance:** raw customer data never reaches the cloud.
- **Cost:** most everyday tickets run on the device for free.
- **Resilience:** it works offline, and on devices without an on-device model, with masked data.
- **Agent-friendly:** placeholders like `[CHECK: refund timeframe]` flag anything the agent must verify, so the AI never invents policies.

## Challenges
- On-device models are small, so I treated hybrid as a routing problem: send each job where it fits best.
- Masking had to work even without an on-device model. Automated tests caught a real leak (a bare sign-off name), which led to an extra rule.
- Chrome and iOS expose the SDK differently. The masking, routing and prompts are identical on both, so the apps behave the same.

## What I built during the submission period
Everything in this repo was built between November 24 and November 30, 2026: the privacy router, the web app, the iOS app, the automated tests and the docs. I used an AI coding assistant (Claude) to help write and test the code, as the rules allow.

## What's next
- A Chrome side-panel extension that sits next to helpdesk tools like Zendesk
- Company tone guides and approved policy snippets added to the prompt
- Team analytics showing how much customer data stayed on device each week
