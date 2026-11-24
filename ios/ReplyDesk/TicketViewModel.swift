import Foundation
import Network
import Observation

/// Runs one ticket through: mask (device) → route → triage → draft → unmask (device).
@MainActor
@Observable
final class TicketViewModel {
    enum StepState { case idle, running, done }
    struct Step: Identifiable {
        let id: String
        let title: String
        let detail: String
        var state: StepState = .idle
        var badge: String = ""
        var isCloud = false
    }
    struct CloudCall: Identifiable { let id = UUID(); let step: String; let prompt: String }
    struct Triage { var summary = "", category = "", sentiment = "", urgency = "" }

    // Inputs
    var message = ""
    var tone = "Warm"
    var agent = ""
    var localOnly = false

    // Outputs
    var steps: [Step] = TicketViewModel.freshSteps()
    var routeWhy = ""
    var triage: Triage?
    var draft = ""
    var masked = ""
    var cloudSaw: [CloudCall] = []
    var finished = false
    var notes: [String] = []
    var errorText: String?
    var busy = false

    // Status + stats
    var online = true
    var deviceStatus = ""
    var tickets = 0
    var aiSteps = 0
    var deviceSteps = 0
    var protected = 0

    private let ai = HybridAI()
    private let monitor = NWPathMonitor()

    static let tones = ["Warm": "warm and empathetic", "Professional": "professional and formal", "Concise": "brief and direct"]

    init() {
        deviceStatus = ai.deviceStatus
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in self?.online = path.status == .satisfied }
        }
        monitor.start(queue: DispatchQueue(label: "net"))
    }

    static func freshSteps() -> [Step] {
        [Step(id: "mask", title: "Mask personal details", detail: "Raw text only goes to the on-device model."),
         Step(id: "route", title: "Choose where to run", detail: "Simple tickets stay on device; complex ones use the cloud, masked."),
         Step(id: "triage", title: "Triage", detail: "Summary, category, sentiment, urgency."),
         Step(id: "draft", title: "Draft reply", detail: "Real details are restored on this iPhone.")]
    }

    private func set(_ id: String, _ state: StepState, badge: String = "", cloud: Bool = false) {
        guard let i = steps.firstIndex(where: { $0.id == id }) else { return }
        steps[i].state = state
        steps[i].badge = badge
        steps[i].isCloud = cloud
    }

    private func label(_ s: HybridAI.Source, _ seconds: Double) -> String {
        "\(s.rawValue) · \(String(format: "%.1f", seconds))s"
    }

    /// Run a step; if the cloud fails, retry on the device (input is already masked, so that's safe).
    private func withFallback(_ prompt: String, mode: Router.Mode) async throws -> (text: String, source: HybridAI.Source, seconds: Double) {
        let start = Date()
        do {
            let r = try await ai.ask(prompt, mode: mode)
            return (r.text, r.source, Date().timeIntervalSince(start))
        } catch {
            guard mode != .deviceOnly, ai.deviceReady else { throw error }
            notes.append("Cloud call failed (\(error.localizedDescription)), so this step was retried on the iPhone.")
            let r = try await ai.ask(prompt, mode: .deviceOnly)
            return (r.text, r.source, Date().timeIntervalSince(start))
        }
    }

    func run() async {
        let raw = message.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty else { errorText = "Paste a customer message first."; return }
        busy = true
        defer { busy = false }
        errorText = nil; notes = []; triage = nil; draft = ""; masked = ""; cloudSaw = []; finished = false
        steps = Self.freshSteps(); routeWhy = ""
        deviceStatus = ai.deviceStatus
        let deviceReady = ai.deviceReady

        // 1. Mask on the device.
        set("mask", .running)
        var names: [String] = [], addresses: [String] = []
        var maskSource = HybridAI.Source.rules
        let t0 = Date()
        if deviceReady {
            do {
                let r = try await ai.ask(HybridAI.extractPrompt(raw), mode: .deviceOnly)
                let j = HybridAI.json(r.text)
                names = j?["names"] as? [String] ?? []
                addresses = j?["addresses"] as? [String] ?? []
                maskSource = .device
            } catch {
                notes.append("On-device name detection failed; used pattern rules only.")
            }
        } else {
            notes.append("Apple Intelligence isn't available: names were masked with pattern rules only, so check the masked text.")
        }
        let m = PrivacyMasker.mask(raw, names: names, addresses: addresses)
        masked = m.masked
        set("mask", .done, badge: maskSource == .device ? label(.device, Date().timeIntervalSince(t0)) : maskSource.rawValue)

        // 2. Route.
        let d = Router.decide(m.masked, localOnly: localOnly, deviceReady: deviceReady, online: online)
        routeWhy = d.why
        set("route", .done, badge: d.target.rawValue, cloud: d.target == .cloud)
        guard let mode = d.mode else {
            errorText = d.why
            draft = holdingReply()
            notes.append("No AI path was available, so a safe holding reply was written locally instead.")
            return
        }

        do {
            // 3. Triage.
            set("triage", .running)
            let tp = HybridAI.triagePrompt(m.masked)
            let t = try await withFallback(tp, mode: mode)
            if t.source == .cloud { cloudSaw.append(CloudCall(step: "Triage", prompt: tp)) }
            let j = HybridAI.json(t.text) ?? [:]
            triage = Triage(summary: PrivacyMasker.unmask(j["summary"] as? String ?? t.text, vault: m.vault),
                            category: j["category"] as? String ?? "other",
                            sentiment: j["sentiment"] as? String ?? "neutral",
                            urgency: j["urgency"] as? String ?? "medium")
            aiSteps += 1; if t.source == .device { deviceSteps += 1 }
            set("triage", .done, badge: label(t.source, t.seconds), cloud: t.source == .cloud)

            // 4. Draft, then restore real details on the device.
            set("draft", .running)
            let dp = HybridAI.draftPrompt(m.masked, tone: Self.tones[tone] ?? "warm and empathetic")
            let r = try await withFallback(dp, mode: mode)
            if r.source == .cloud { cloudSaw.append(CloudCall(step: "Draft reply", prompt: dp)) }
            draft = PrivacyMasker.unmask(r.text, vault: m.vault)
                .replacingOccurrences(of: "[AGENT]", with: agent.isEmpty ? "Customer Support" : agent)
            aiSteps += 1; if r.source == .device { deviceSteps += 1 }
            set("draft", .done, badge: label(r.source, r.seconds), cloud: r.source == .cloud)

            tickets += 1
            protected += m.total
            finished = true
        } catch {
            errorText = Self.explain(error)
            if draft.isEmpty {
                draft = holdingReply()
                notes.append("No AI path was available, so a safe holding reply was written locally instead.")
            }
        }
    }

    func holdingReply() -> String {
        "Hi,\n\nThank you for getting in touch, and I'm sorry for the trouble. I've received your message and I'm looking into it now. " +
        "I'll come back to you with an update as soon as I can.\n\nKind regards,\n" + (agent.isEmpty ? "Customer Support" : agent)
    }

    static func explain(_ error: Error) -> String {
        let text = "\(error)"
        if text.localizedCaseInsensitiveContains("app check") || text.contains("403") || text.contains("PERMISSION_DENIED") {
            return text + "\n→ App Check: copy the debug token from Xcode's console and register it in Firebase (App Check → Manage debug tokens)."
        }
        return text
    }

    var devicePercent: String { aiSteps == 0 ? "–" : "\(deviceSteps * 100 / aiSteps)%" }
}
