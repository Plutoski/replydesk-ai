import Foundation
import Network
import Observation

/// Runs one ticket through: mask (device) → route → triage → draft → unmask (device).
/// Same rules as the web app: raw text only goes to the on-device model, every cloud prompt is leak-checked,
/// and rules-only masking needs the agent's approval before anything goes to the cloud.
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
    struct Note: Identifiable { let id = UUID(); let text: String }

    /// Failure drills: see each fallback without unplugging anything.
    enum Drill: String, CaseIterable, Identifiable {
        case none = "None", offline = "Offline", cloudError = "Gemini down", noDevice = "No on-device AI"
        var id: String { rawValue }
    }

    enum RunError: LocalizedError {
        case leak, drill
        var errorDescription: String? {
            switch self {
            case .leak: return "A real detail was found in a cloud prompt, so it was not sent."
            case .drill: return "Gemini is unavailable (failure drill)"
            }
        }
    }

    // Inputs
    var message = ""
    var tone = "Warm"
    var agent = ""
    var localOnly = false
    var drill: Drill = .none

    // Outputs
    var steps: [Step] = TicketViewModel.freshSteps()
    var routeWhy = ""
    var triage: Triage?
    var draft = ""
    var masked = ""
    var cloudSaw: [CloudCall] = []
    var finished = false
    var notes: [Note] = []
    var errorText: String?
    var busy = false

    // Approval before rules-only masked text goes to the cloud.
    var approvalPending = false
    var approvalText = ""
    @ObservationIgnored private var approval: CheckedContinuation<Bool, Never>?

    // Status + stats
    var online = true
    var deviceStatus = ""
    var tickets = 0
    var stepsTotal = 0
    var localSteps = 0
    var protected = 0
    var cloudChecked = 0
    var rawSent = 0 // stays 0: a prompt with a real detail is never sent

    private let ai = HybridAI()
    private let monitor = NWPathMonitor()
    static let maxCharacters = 8000

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

    private func note(_ text: String) { notes.append(Note(text: text)) }

    private func label(_ s: HybridAI.Source, _ seconds: Double) -> String {
        "\(s.rawValue) · \(String(format: "%.1f", seconds))s"
    }

    // MARK: - Approval

    func answerApproval(_ send: Bool) {
        approvalPending = false
        approval?.resume(returning: send)
        approval = nil
    }

    private func askApproval(_ text: String) async -> Bool {
        approvalText = text
        return await withCheckedContinuation { (c: CheckedContinuation<Bool, Never>) in
            approval = c
            approvalPending = true
        }
    }

    // MARK: - Calls

    private struct Context { let deviceReady: Bool; let online: Bool; let maskedOnDevice: Bool }
    @ObservationIgnored private var fellBackToDevice = false

    /// Every call that could reach the cloud: leak check first, then the drill, then the call.
    private func call(_ step: String, _ prompt: String, _ mode: Router.Mode, _ vault: [String: PrivacyMasker.Entry],
                      _ ctx: Context) async throws -> (text: String, source: HybridAI.Source, seconds: Double) {
        if mode != .deviceOnly {
            cloudChecked += 1
            let leaks = PrivacyMasker.findLeaks(prompt, vault: vault)
            if !leaks.isEmpty {
                note("Safety check stopped a cloud call: \(leaks.count) real detail(s) were still in the \(step.lowercased()) prompt.")
                guard ctx.deviceReady else { throw RunError.leak }
                return try await call(step, prompt, .deviceOnly, vault, ctx)
            }
            if drill == .cloudError && mode != .preferDevice { throw RunError.drill }
        }
        let start = Date()
        let r = try await ai.ask(prompt, mode: mode)
        if r.source == .cloud { cloudSaw.append(CloudCall(step: step, prompt: prompt)) }
        return (r.text, r.source, Date().timeIntervalSince(start))
    }

    /// If the cloud fails, retry on the iPhone. If the iPhone fails, retry in the cloud (masked text only).
    private func withFallback(_ step: String, _ prompt: String, _ mode: Router.Mode, _ vault: [String: PrivacyMasker.Entry],
                              _ ctx: Context) async throws -> (text: String, source: HybridAI.Source, seconds: Double) {
        do {
            return try await call(step, prompt, mode, vault, ctx)
        } catch {
            if (mode == .preferCloud || mode == .cloudOnly) && ctx.deviceReady {
                note("Cloud call failed (\(error.localizedDescription)), so the \(step.lowercased()) step ran on this iPhone instead.")
                fellBackToDevice = true
                return try await call(step, prompt, .deviceOnly, vault, ctx)
            }
            if mode == .preferDevice && ctx.online && !localOnly && ctx.maskedOnDevice && drill != .cloudError {
                note("On-device call failed (\(error.localizedDescription)), so Gemini in the cloud handled the \(step.lowercased()) step, using masked text.")
                return try await call(step, prompt, .cloudOnly, vault, ctx)
            }
            throw error
        }
    }

    // MARK: - Run

    func run() async {
        guard !busy else { return } // one ticket at a time
        let raw = message.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty else { errorText = "Paste a customer message first, or pick a sample."; return }
        guard raw.count <= Self.maxCharacters else { errorText = "That message is over 8,000 characters. Paste the latest part of the thread."; return }
        busy = true
        defer { busy = false }
        errorText = nil; notes = []; triage = nil; draft = ""; masked = ""; cloudSaw = []; finished = false
        steps = Self.freshSteps(); routeWhy = ""; fellBackToDevice = false
        deviceStatus = ai.deviceStatus

        var deviceReady = ai.deviceReady
        var isOnline = online
        switch drill {
        case .offline: isOnline = false; note("Failure drill: acting as if this iPhone is offline.")
        case .noDevice: deviceReady = false; note("Failure drill: acting as if this iPhone has no on-device model.")
        case .cloudError: note("Failure drill: every cloud call fails, as in a Gemini outage.")
        case .none: break
        }

        // 1. Mask on the device.
        set("mask", .running)
        var names: [String] = [], addresses: [String] = []
        var maskSource = HybridAI.Source.rules
        let t0 = Date()
        if deviceReady {
            do {
                let r = try await ai.ask(HybridAI.extractPrompt(raw), mode: .deviceOnly)
                guard r.source == .device, let j = HybridAI.json(r.text),
                      let n = j["names"] as? [String], let a = j["addresses"] as? [String] else {
                    throw RunError.leak // unexpected answer: fall back to the safe path below
                }
                names = n; addresses = a
                maskSource = .device
            } catch {
                note("On-device name detection didn't work this time, so only pattern rules masked this message.")
            }
        }
        let m = PrivacyMasker.mask(raw, names: names, addresses: addresses)
        masked = m.masked
        set("mask", .done, badge: label(maskSource, Date().timeIntervalSince(t0)))
        stepsTotal += 1; localSteps += 1 // masking always runs on this iPhone

        // 2. Route. Rules-only masking can miss a name, so the agent checks it before anything leaves the iPhone.
        var d = Router.decide(m.masked, localOnly: localOnly, deviceReady: deviceReady, online: isOnline)
        if d.target == .cloud && maskSource != .device {
            if await askApproval(m.masked) {
                note("You approved sending the masked text to Gemini.")
            } else if deviceReady {
                d = Router.Decision(target: .device, mode: .deviceOnly, why: "You chose to keep this ticket on this iPhone.")
            } else {
                d = Router.Decision(target: .blocked, mode: nil, why: "You chose not to send it, and Apple Intelligence isn't available, so nothing was sent anywhere.")
            }
        } else if d.target == .device && maskSource != .device {
            d.mode = .deviceOnly // rules-only masking never gets an automatic cloud fallback
        }
        routeWhy = d.why
        set("route", .done, badge: d.target.rawValue, cloud: d.target == .cloud)
        let ctx = Context(deviceReady: deviceReady, online: isOnline, maskedOnDevice: maskSource == .device)

        guard let mode = d.mode else {
            draft = holdingReply()
            note("No AI path was used, so a safe holding reply was written on this iPhone instead.")
            tickets += 1; protected += m.total; finished = true
            return
        }

        do {
            // 3. Triage.
            set("triage", .running)
            let tp = HybridAI.triagePrompt(m.masked)
            let t = try await withFallback("Triage", tp, mode, m.vault, ctx)
            let j = HybridAI.json(t.text) ?? [:]
            let allowed = (["billing", "delivery", "account", "technical", "travel", "complaint", "other"],
                           ["positive", "neutral", "frustrated", "angry"], ["low", "medium", "high"])
            let category = j["category"] as? String ?? "other"
            let sentiment = j["sentiment"] as? String ?? "neutral"
            let urgency = j["urgency"] as? String ?? "medium"
            triage = Triage(summary: PrivacyMasker.unmask(j["summary"] as? String ?? t.text, vault: m.vault, firstName: true, describe: true),
                            category: allowed.0.contains(category) ? category : "other",
                            sentiment: allowed.1.contains(sentiment) ? sentiment : "neutral",
                            urgency: allowed.2.contains(urgency) ? urgency : "medium")
            stepsTotal += 1; if t.source == .device { localSteps += 1 }
            set("triage", .done, badge: label(t.source, t.seconds), cloud: t.source == .cloud)

            // 4. Draft, then restore real details on the device.
            set("draft", .running)
            let dp = HybridAI.draftPrompt(m.masked, tone: Self.tones[tone] ?? "warm and empathetic")
            let r = try await withFallback("Draft reply", dp, mode, m.vault, ctx)
            draft = PrivacyMasker.unmask(r.text, vault: m.vault, firstName: true)
                .replacingOccurrences(of: "[AGENT]", with: agent.isEmpty ? "Customer Support" : agent)
            stepsTotal += 1; if r.source == .device { localSteps += 1 }
            set("draft", .done, badge: label(r.source, r.seconds), cloud: r.source == .cloud)
            if fellBackToDevice { set("route", .done, badge: "Cloud → device", cloud: false) }
        } catch {
            errorText = Self.explain(error)
            if draft.isEmpty {
                draft = holdingReply()
                note("No AI path was available, so a safe holding reply was written on this iPhone instead.")
            }
        }
        tickets += 1
        protected += m.total
        finished = true
    }

    func holdingReply() -> String {
        "Hi,\n\nThank you for getting in touch, and I'm sorry for the trouble. I've received your message and I'm looking into it now. " +
        "I'll come back to you with an update as soon as I can.\n\nKind regards,\n" + (agent.isEmpty ? "Customer Support" : agent)
    }

    static func explain(_ error: Error) -> String {
        let text = error.localizedDescription
        if "\(error)".localizedCaseInsensitiveContains("app check") || "\(error)".contains("403") || "\(error)".contains("PERMISSION_DENIED") {
            print("[ReplyDesk] App Check rejected the request. Register the debug token from Xcode's console in Firebase (App Check → Manage debug tokens).")
            return "The cloud request was rejected by App Check. A safe holding reply was written instead."
        }
        return text
    }

    var devicePercent: String { stepsTotal == 0 ? "–" : "\(localSteps * 100 / stepsTotal)%" }

    /// One-line privacy receipt for the top of the results.
    var receipt: String {
        guard finished else { return "" }
        if cloudSaw.isEmpty { return "✓ Cloud saw nothing. Every step ran on this iPhone." }
        var tags = Set<String>()
        for c in cloudSaw {
            let ns = c.prompt as NSString
            for m in Self.tagRegex.matches(in: c.prompt, range: NSRange(location: 0, length: ns.length)) { tags.insert(ns.substring(with: m.range)) }
        }
        return "☁ Cloud saw \(cloudSaw.count) masked prompt\(cloudSaw.count == 1 ? "" : "s") · \(tags.count) tags · 0 real details"
    }
    nonisolated(unsafe) private static let tagRegex = try! NSRegularExpression(pattern: #"\[[A-Z]+_\d+\]"#)
}
