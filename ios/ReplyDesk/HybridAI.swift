import Foundation
import FirebaseAILogic

/// Firebase AI Logic hybrid inference: Apple Foundation Models on the iPhone, Gemini in the cloud.
/// Rule of the app: raw customer text only ever goes to the on-device model (for masking).
struct HybridAI {
    /// Same cloud model as the web app.
    static let cloudModelName = "gemini-3.5-flash-lite"

    enum Source: String { case device = "On device", cloud = "Cloud · Gemini", rules = "Local rules" }

    private let ai = FirebaseAI.firebaseAI(backend: .googleAI())

    var deviceReady: Bool { FirebaseAI.SystemLanguageModel.default.isAvailable }

    var deviceStatus: String {
        switch FirebaseAI.SystemLanguageModel.default.availability {
        case .available: return "Apple Intelligence ready"
        case .unavailable(.deviceNotEligible): return "This device can't run Apple Intelligence: cloud only"
        case .unavailable(.appleIntelligenceNotEnabled): return "Turn on Apple Intelligence in Settings"
        case .unavailable(.modelNotReady): return "Apple Intelligence is still downloading"
        case .unavailable: return "On-device model unavailable: cloud only"
        }
    }

    /// One single-turn request. A new session each time, because sessions keep history.
    /// Uses the Firebase AI Logic hybrid API (firebase-ios-sdk 12.13 to 12.x, iOS 26+).
    func ask(_ prompt: String, mode: Router.Mode) async throws -> (text: String, source: Source) {
        let system = FirebaseAI.SystemLanguageModel.default
        switch mode {
        case .deviceOnly:
            let r = try await ai.generativeModelSession(model: system).respond(to: prompt)
            return (r.content, .device)
        case .preferDevice:
            let session = ai.generativeModelSession(
                model: .hybridModel(primary: system, secondary: .geminiModel(name: Self.cloudModelName)))
            let r = try await session.respond(to: prompt)
            return (r.content, Self.source(r.rawResponse.modelVersion))
        case .preferCloud:
            let session = ai.generativeModelSession(
                model: .hybridModel(primary: .geminiModel(name: Self.cloudModelName), secondary: system))
            let r = try await session.respond(to: prompt)
            return (r.content, Self.source(r.rawResponse.modelVersion))
        }
    }

    /// The SDK reports "apple-foundation-models-system-language-model" for on-device answers.
    static func source(_ modelVersion: String) -> Source {
        modelVersion.contains("apple-foundation-models") ? .device : .cloud
    }

    // MARK: - Prompts (same wording as the web app)

    static func extractPrompt(_ raw: String) -> String {
        "List every person's name and every street address in this customer message. " +
        "Return only JSON like {\"names\": [], \"addresses\": []}. Copy them exactly as written. " +
        "Do not include company names, product names or the support team.\n\nMessage:\n" + raw
    }

    static func triagePrompt(_ masked: String) -> String {
        "You are a customer-service triage assistant. Text in square brackets like [NAME_1] is a privacy placeholder.\n" +
        "Return only JSON with keys: summary (one sentence, max 25 words, keep placeholders as they are), " +
        "category (billing, delivery, account, technical, travel, complaint or other), " +
        "sentiment (positive, neutral, frustrated or angry), urgency (low, medium or high).\n\n" +
        "Customer message:\n" + masked
    }

    static func draftPrompt(_ masked: String, tone: String) -> String {
        "You are a customer service agent. Write a short reply to the customer message below.\n" +
        "Rules:\n" +
        "- Tone: \(tone).\n" +
        "- At most 3 short paragraphs and under 100 words. Do not ramble.\n" +
        "- Start with \"Hi [NAME_1],\" if the message has [NAME_1]; otherwise \"Hi,\".\n" +
        "- Acknowledge the problem in one sentence, then say clearly what happens next.\n" +
        "- Never repeat the customer's phone number, email, card or address back to them.\n" +
        "- Square-bracket tags like [ORDER_1] are privacy placeholders: copy them exactly, never guess real values.\n" +
        "- Never invent refunds, timeframes, dates or policies. Where the agent must look something up, write [CHECK: what to check].\n" +
        "- End with \"Kind regards,\" and then [AGENT] on its own line.\n\n" +
        "Customer message:\n" + masked
    }

    /// Pull the first {...} block out of a model answer and decode it.
    static func json(_ text: String) -> [String: Any]? {
        guard let start = text.firstIndex(of: "{"), let end = text.lastIndex(of: "}"), start < end,
              let data = String(text[start...end]).data(using: .utf8) else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }
}
