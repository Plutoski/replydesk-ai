## Inspiration
I work as a customer service representative, first in London and now in Calgary. Every shift, I read messages full of names, card numbers, home addresses and booking references. AI could cut my reply time in half. But my training says never to paste customer details into an outside tool, and a cloud chatbot is an outside tool. I wanted an AI assistant I would be allowed to use at work.

## What it does
An agent pastes a customer message into ReplyDesk. The app then works in four steps.

1. It masks personal details on the device. Gemini Nano in Chrome, or Apple's on-device model on iPhone, finds names and addresses. Local rules find emails, phone numbers, card numbers, bank details, ID numbers, order IDs and postcodes. "Priya Patel" becomes `[NAME_1]`.
2. It decides where the rest of the work runs. Short tickets stay on the device. Long threads, and tickets with four or more questions, go to Gemini in the cloud as masked text. A Local only switch keeps every step on the device.
3. It sorts the ticket by intent, urgency and sentiment, then drafts a short reply.
4. It puts the real details back on the device. The reply greets the customer by first name, and a card number appears as "card ending in 1111", which is how agents are trained to write it.

Every result starts with a privacy receipt, such as "Cloud saw 2 masked prompts · 7 tags · 0 real details". A panel called "What the cloud saw" shows the exact text that left the device. Before any cloud call, a leak check scans the prompt for every real detail from the ticket and stops the call if it finds one. A counter shows how many prompts were checked and how many real details reached the cloud: always 0.

## How I built it
ReplyDesk uses Firebase AI Logic hybrid inference on two platforms. The web app runs in Chrome with Gemini Nano. The iOS app is written in SwiftUI and runs on Apple Foundation Models. Both use `gemini-3.5-flash-lite` as the cloud model.

Each step uses the inference mode that fits its risk.
- Masking uses `ONLY_ON_DEVICE`, because it is the only step that reads raw customer data.
- Short tickets use `PREFER_ON_DEVICE`. They finish quickly, cost nothing and work offline.
- Long tickets use `PREFER_IN_CLOUD`. By this point the text is masked, and the larger model writes better replies.
- `ONLY_IN_CLOUD` is used when the device has no on-device model, or when an on-device step fails, and only with masked text.

Every response reports where it ran. The web SDK returns `inferenceSource`, and the iOS SDK returns a model version. The app uses that value for every label on screen, so the labels show where each step actually ran.

Entity extraction and triage return structured JSON, both on the device and in the cloud. App Check protects the Gemini API and is enforced, with reCAPTCHA Enterprise and one-time tokens on the web. The whole project runs on the free Spark plan.

## Planning for failure
I built the app around the question "what if this part breaks?"
- No internet: every step runs on the device.
- Gemini is down or out of quota: the step is retried on the device, and the screen shows "Cloud → device".
- The on-device model fails: the step goes to Gemini with masked text only.
- No on-device model, such as in Safari: pattern rules mask the text, and the agent sees it and approves it before anything goes to the cloud.
- The agent says no: nothing is sent, and a safe holding reply is written on the device.
- The model invents a detail like `[TIME_FRAME]`: it becomes a `[CHECK: time frame]` note for the agent.

A Failure drill menu lets anyone trigger each case on the live site, and an automated test covers each one.

## Challenges
On-device models are small. Instead of asking one model to do everything, I gave each step to the model that suits it.

Masking has to be safe even on a device with no AI model. I stress-tested the pattern rules with 77 deliberately tricky messages holding 120 personal details: international phone numbers, IBANs, national ID numbers, and Nigerian, Spanish, Arabic and Chinese names. At first the rules caught only 41% of the details. After fixing what the test found, they catch 92%, and 18 of 18 ordinary phrases such as prices, dates and "PS5 2TB" are left alone. For the cases rules still miss, the agent approves the masked text before it leaves the device.

The SDK works differently in Chrome and on iOS. The newest Firebase iOS release moved the hybrid API to iOS 27. Current iPhones run iOS 26, so I pinned firebase-ios-sdk to version 12.19.3. I kept the masking rules the same in JavaScript and Swift.

The first drafts were too long, repeated the customer's phone number and made up refund timelines. I tightened the prompts, switched greetings to first names, added the `[CHECK]` notes, and made summaries show "‹phone number›" instead of the number.

## Accomplishments that I'm proud of
ReplyDesk runs on real hardware, in Chrome on a MacBook Air M2 and on an iPhone Air with Apple Intelligence. In the demo, five tickets with 26 personal details ran in a row, and 0 real details reached the cloud. Every failure case works on the live site. There are 23 automated tests. I am not a professional developer. I built this to solve a problem from my own job, and it works on two platforms after one week.

## What I learned
The hard part of hybrid AI was not choosing the better model. It was deciding what each model is allowed to see, and what happens when one of them isn't there. I also learned that on-device AI does more than save money. It makes AI possible in jobs with strict data rules, like mine.

## What's next for ReplyDesk
- A Chrome side panel that opens next to helpdesk tools such as Zendesk
- Company tone guides and approved policy text in the prompt, so drafts match each team's rules
- A weekly team report on how much customer data stayed on the device

## Built during the submission period
I built everything in the repo between November 24 and November 30, 2026. That includes the privacy router, the web app, the iOS app, the tests, the privacy evaluation and the docs. I used an AI coding assistant, Claude, to help write, review and test the code, as the rules allow.
