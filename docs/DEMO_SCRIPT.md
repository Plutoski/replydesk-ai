# Demo video script (≤ 3 minutes; only the first 3 minutes are judged)

**Setup before recording:** Chrome on the Mac with the deployed app open (pill says "On-device AI ready"). iPhone Air with ReplyDesk installed and Apple Intelligence on. Record the Mac with QuickTime (File → New Screen Recording) and the iPhone with Control Centre → Screen Recording. Join the clips in iMovie or CapCut. Add English subtitles (YouTube can auto-generate them; check them).

| Time | On screen | Say |
|---|---|---|
| 0:00–0:20 | You on camera, or a title card, then the web app | "I'm AJ, a customer service rep in Calgary. Every message I answer has names, card numbers and addresses in it, and I'm not allowed to paste that into a cloud chatbot. So I built ReplyDesk: AI replies where customer data never leaves my device." |
| 0:20–0:55 | Web: **Double charge** sample → Run. Point at the steps and badges. | "Step one runs only on Gemini Nano, here in Chrome. It finds the personal details and replaces them with tags. This ticket is short, so triage and the reply stay on device too." Scroll down: "**What the cloud saw: nothing.** And the reply has the real name back in, with the card shown only as 'ending in 1111'." |
| 0:55–1:30 | **Long thread** sample → Run. Show "Cloud first", then open **What the cloud saw**. | "This one's a long thread with five questions, too much for a small on-device model. So ReplyDesk sends it to Gemini in the cloud, but look at exactly what the cloud saw: every name, phone, email and address is a tag. Real details are restored only on my machine." |
| 1:30–1:50 | Tick **Local only** → run Long thread again | "For sensitive queues, Local only means the cloud is never called, even for long tickets." |
| 1:50–2:05 | Turn off Wi-Fi (Offline pill) → run **Late delivery** | "Offline? Still works, all on device." |
| 2:05–2:40 | iPhone Air screen recording: sample → Run → badges → What the cloud saw | "Same app on iPhone, built with the same Firebase SDK, using Apple's on-device model with Gemini as the fallback. Same masking, same routing, same privacy proof." |
| 2:40–2:55 | GitHub repo / README diagram | "Built with Firebase AI Logic hybrid inference on web and iOS, with automated privacy tests and a free-tier setup. Thanks for watching." |

**Tips**
- Zoom in when the badges change and on "What the cloud saw". Those are the money shots.
- Use the sample tickets (fictional data), never real customer messages.
- Practise once; aim for 2:45 so nothing gets cut at 3:00.
