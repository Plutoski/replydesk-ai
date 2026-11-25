# ReplyDesk for iOS

SwiftUI app using **Firebase AI Logic hybrid inference** with **Apple Foundation Models** on the iPhone and **Gemini** in the cloud.

Requirements: a Mac with **Xcode 27.2 or newer** (the project file uses the newer format), an iPhone with **Apple Intelligence** turned on (iPhone 15 Pro or newer, including iPhone Air), and a free Apple ID. No paid Apple Developer account is needed.

## 1. Open the project

1. Open `ios/ReplyDesk.xcodeproj` in Xcode. Firebase (`firebase-ios-sdk`, pinned to **Exact Version 12.19.3**) downloads by itself the first time.
   Firebase 13 replaced this hybrid API with one that needs iOS 27, so the project stays on 12.19.3 to run on iOS 26.
2. Select the project (blue icon) → target **ReplyDesk** → **Signing & Capabilities**:
   - **Team:** your Apple ID (Add Account… if it's empty)
   - **Bundle Identifier:** change `com.plutoski.ReplyDesk` to something of your own, e.g. `com.yourname.ReplyDesk`

## 2. Add your Firebase config

1. In the Firebase console, add an **iOS app** with the same Bundle Identifier and turn on **AI Logic** (Gemini Developer API).
2. Download **GoogleService-Info.plist** and drag it into the `ReplyDesk` folder in Xcode's sidebar (tick the ReplyDesk target).
   The plist is in `.gitignore`: don't commit it.

<details><summary>Starting from an empty Xcode project instead</summary>

New Project → iOS → App (SwiftUI, Swift) named `ReplyDesk` → replace its two Swift files with the six in `ios/ReplyDesk/` → Minimum Deployments **iOS 26.0** → File → Add Package Dependencies → `https://github.com/firebase/firebase-ios-sdk`, **Exact Version 12.19.3**, products **FirebaseAILogic** and **FirebaseAppCheck**.
</details>

## 3. Run on your iPhone

1. Plug the iPhone into the Mac (or use the same Wi-Fi), unlock it, and tap **Trust**.
2. On the iPhone: **Settings → Privacy & Security → Developer Mode → On** (it restarts).
3. In Xcode, pick your iPhone at the top, then press **▶ Run** (⌘R).
4. First time only, on the iPhone: **Settings → General → VPN & Device Management** → your Apple ID → **Trust**.

## 4. Register the App Check debug token

On first launch, Xcode's console (bottom panel) prints a line like:

```
[AppCheckCore] App Check debug token: 'XXXXXXXX-XXXX-...'
```

Copy that token → Firebase console → **Security → App Check → Apps** → your iOS app → ⋮ → **Manage debug tokens** → **Add**. Run the app again.

## How it works

| File | What it does |
|---|---|
| `PrivacyMasker.swift` | Masks names, emails, phones, cards, order numbers, addresses, postcodes on the device |
| `Router.swift` | Short tickets → device first; long or multi-question → cloud first (masked); "Local only" → device only |
| `HybridAI.swift` | Firebase AI Logic: `SystemLanguageModel` (Apple) + `geminiModel`, combined with `.hybridModel(primary:secondary:)` |
| `TicketViewModel.swift` | Runs mask → route → triage → draft → unmask, with cloud-failure fallback to the device |
| `ContentView.swift` | The SwiftUI screen, including "What the cloud saw" |
| `ReplyDeskApp.swift` | Firebase + App Check (debug provider) setup |

Free Apple ID builds expire after 7 days on the phone; just press Run again.
