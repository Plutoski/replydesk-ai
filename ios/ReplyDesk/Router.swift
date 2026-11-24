import Foundation

/// Decides where a ticket's AI work runs. Mirrors web/src/router.js.
nonisolated enum Router {
    enum Target: String { case device = "Device first", cloud = "Cloud first", blocked = "Blocked" }
    enum Mode { case deviceOnly, preferDevice, preferCloud }

    struct Decision {
        let target: Target
        let mode: Mode?
        let why: String
    }

    static let maxWords = 180
    static let maxQuestions = 4

    static func decide(_ text: String, localOnly: Bool, deviceReady: Bool, online: Bool) -> Decision {
        let words = text.split(whereSeparator: { $0.isWhitespace }).count
        let questions = text.filter { $0 == "?" }.count
        let isThread = text.range(of: #"(^|\n)\s*(>|from:|on .+ wrote:|-----original message-----)"#,
                                  options: [.regularExpression, .caseInsensitive]) != nil
        var reasons: [String] = []
        if words > maxWords { reasons.append("\(words) words (over \(maxWords))") }
        if questions >= maxQuestions { reasons.append("\(questions) separate questions") }
        if isThread { reasons.append("an email thread with earlier replies") }

        if localOnly {
            return deviceReady
                ? Decision(target: .device, mode: .deviceOnly, why: "Local-only policy: nothing is allowed to leave this iPhone.")
                : Decision(target: .blocked, mode: nil, why: "Local-only policy is on, but Apple Intelligence isn't available on this device.")
        }
        if !online && !deviceReady {
            return Decision(target: .blocked, mode: nil, why: "Offline and Apple Intelligence isn't available.")
        }
        if !reasons.isEmpty {
            return Decision(target: .cloud, mode: .preferCloud,
                            why: "Complex ticket (\(reasons.joined(separator: ", "))), so Gemini in the cloud drafts it, using masked text only."
                                + (online ? "" : " You're offline, so the iPhone will handle it instead."))
        }
        return Decision(target: .device, mode: .preferDevice,
                        why: deviceReady ? "Short, simple ticket, so it stays on this iPhone."
                                         : "Short ticket, but Apple Intelligence isn't available, so the cloud handles it using masked text only.")
    }
}
