import SwiftUI
import FirebaseCore
import FirebaseAppCheck

@main
struct ReplyDeskApp: App {
    init() {
        // App Check is required by Firebase AI Logic. Debug builds (run from Xcode) use the debug provider, which the
        // #BuildHybridAI rules accept. On first run Xcode's console prints a debug token:
        // register it in Firebase console → Security → App Check → Apps → Manage debug tokens.
        #if DEBUG
        AppCheck.setAppCheckProviderFactory(AppCheckDebugProviderFactory())
        #else
        AppCheck.setAppCheckProviderFactory(DeviceCheckProviderFactory())
        #endif
        FirebaseApp.configure()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
