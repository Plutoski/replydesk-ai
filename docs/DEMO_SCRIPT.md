# Demo video script (about 2.5 minutes)

**Before recording:** on the laptop, Chrome with the Prompt API flag on and Gemini Nano downloaded ("On-device model ready" pill shows green). On the Android phone, a Gemini Nano-supported device with the model downloaded. Both apps open. Use a screen recorder (OBS, Loom, or the phone's own recorder) and record at 1080p.

| Time | On screen | Say |
|---|---|---|
| 0:00–0:15 | Title card, then the web app | "I'm AJ, a customer service rep. Every message I answer has a customer's personal details in it. ReplyDesk drafts replies with AI that runs on my own device first, and uses the cloud only when it has to." |
| 0:15–0:45 | Web: click **Double charge** sample → **Analyze & draft reply** | "I paste a customer message. ReplyDesk triages it: summary, category, sentiment, urgency. Then it streams a reply in the tone I chose." Point at the green **On this device** badges: "Both steps ran on Gemini Nano, right here in Chrome. Nothing left my laptop." |
| 0:45–1:05 | Turn off Wi-Fi (show the **Offline** pill) → run **Late delivery** | "Now I'm offline. Same app, it still works, still on device." |
| 1:05–1:25 | Turn Wi-Fi back on. Open the app in a browser without Nano (e.g. Edge/Firefox, or a Chrome profile with the flag off) → run | "Here's a browser that can't run Gemini Nano. Same code, and Firebase AI Logic falls back to Gemini in the cloud automatically. The badge now says **Cloud · Gemini**." |
| 1:25–1:40 | Switch mode dropdown to **Only cloud** and back | "I can switch between all four inference modes live: prefer device, only device, prefer cloud, only cloud." |
| 1:40–2:10 | Android phone (screen mirror or recording) → sample → run | "And it's the same app on Android. Gemini Nano through AICore on the phone, the same prompts and the same fallback." Show the **On this phone** badge, then airplane mode and run again. |
| 2:10–2:25 | **Where did the AI run?** panel | "Every response reports where it ran, so I can see what share of customer data stayed on device." |
| 2:25–2:35 | README / GitHub repo | "Built with Firebase AI Logic hybrid inference on web and Android. The code is on GitHub. Thanks for watching." |

**Tips**
- Record each platform separately, then join the clips in any editor (CapCut, Clipchamp).
- Zoom into the badges when they change. That moment is the whole story.
- Keep it under 3 minutes.
