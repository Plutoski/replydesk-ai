import SwiftUI
import FirebaseCore
import FirebaseAppCheck

@main
struct ReplyDeskApp: App {
    init() {
        // App Check is required by Firebase AI Logic. This uses the debug provider, which the
        // #BuildHybridAI rules accept. On first run Xcode's console prints a debug token:
        // register it in Firebase console → Security → App Check → Apps → Manage debug tokens.
        AppCheck.setAppCheckProviderFactory(AppCheckDebugProviderFactory())
        FirebaseApp.configure()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
