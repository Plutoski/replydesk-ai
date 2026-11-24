# ReplyDesk for iOS

SwiftUI app using **Firebase AI Logic hybrid inference** with **Apple Foundation Models** on the iPhone and **Gemini** in the cloud.

Requirements: a Mac with **Xcode 26**, an iPhone with **Apple Intelligence** turned on (iPhone 15 Pro or newer, including iPhone Air), and a free Apple ID. No paid Apple Developer account is needed.

## 1. Create the Xcode project (once)

1. Open Xcode → **File → New → Project…** → **iOS → App** → Next.
2. Fill in:
   - Product Name: `ReplyDesk`
   - Team: your Apple ID (Add Account… if it's empty)
   - Organization Identifier: e.g. `com.yourname` → the Bundle Identifier becomes `com.yourname.ReplyDesk`
   - Interface: **SwiftUI**, Language: **Swift**, Storage: **None**
3. Save it inside this `ios/` folder.
4. In Xcode's left sidebar, **delete** the two files Xcode made (`ContentView.swift` and `ReplyDeskApp.swift`) → *Move to Trash*.
5. Drag all six `.swift` files from `ios/ReplyDesk/` into the sidebar's `ReplyDesk` group. Tick **Copy items if needed** and the **ReplyDesk** target.
6. Select the project (blue icon) → target **ReplyDesk** → **General** → **Minimum Deployments: iOS 26.0**.

## 2. Add Firebase

1. **File → Add Package Dependencies…** → paste `https://github.com/firebase/firebase-ios-sdk` → **Add Package**.
2. Tick **FirebaseAILogic** and **FirebaseAppCheck** → **Add Package**.
3. In the Firebase console, add an **iOS app** with the same Bundle Identifier, download **GoogleService-Info.plist**, and drag it into the Xcode sidebar (tick the ReplyDesk target).
   The plist is in `.gitignore`: don't commit it.

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
