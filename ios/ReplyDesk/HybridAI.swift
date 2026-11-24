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
    func ask(_ prompt: String, mode: Router.Mode) async throws -> (text: String, source: Source) {
        let system = FirebaseAI.SystemLanguageModel.default
        let cloud = ai.geminiModel(name: Self.cloudModelName)
        switch mode {
        case .deviceOnly:
            let r = try await ai.generativeModelSession(model: system).respond(to: prompt)
            return (r.content, .device)
        case .preferDevice:
            let r = try await ai.generativeModelSession(model: .hybridModel(primary: system, secondary: cloud)).respond(to: prompt)
            return (r.content, Self.source(String(describing: r.rawResponse.modelVersion)))
        case .preferCloud:
            let r = try await ai.generativeModelSession(model: .hybridModel(primary: cloud, secondary: system)).respond(to: prompt)
            return (r.content, Self.source(String(describing: r.rawResponse.modelVersion)))
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
        "You are a customer service representative replying to the customer message below.\n" +
        "Tone: \(tone). Acknowledge the issue, say clearly what happens next, and keep it under 140 words.\n" +
        "Text in square brackets like [NAME_1] or [ORDER_1] is a privacy placeholder: copy placeholders exactly, never guess the real value.\n" +
        "Do not invent refunds, dates or policies that are not in the message; write [CHECK: ...] where the agent must look something up.\n" +
        "End the reply with a sign-off line followed by [AGENT] on its own line.\n\n" +
        "Customer message:\n" + masked
    }

    /// Pull the first {...} block out of a model answer and decode it.
    static func json(_ text: String) -> [String: Any]? {
        guard let start = text.firstIndex(of: "{"), let end = text.lastIndex(of: "}"), start < end,
              let data = String(text[start...end]).data(using: .utf8) else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }
}
