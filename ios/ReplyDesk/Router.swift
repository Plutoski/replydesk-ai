import Foundation

/// Decides where a ticket's AI work really runs, so the screen never contradicts itself. Mirrors web/src/router.js.
nonisolated enum Router {
    enum Target: String { case device = "Device", cloud = "Cloud", blocked = "Blocked" }
    enum Mode { case deviceOnly, preferDevice, preferCloud, cloudOnly }

    struct Decision {
        var target: Target
        var mode: Mode?
        var why: String
    }

    static let maxWords = 180
    static let maxQuestions = 4

    private static func isCJK(_ u: Unicode.Scalar) -> Bool {
        let v = u.value
        return (0x3040...0x30FF).contains(v) || (0x3400...0x9FFF).contains(v) || (0xAC00...0xD7AF).contains(v)
    }

    static func assess(_ text: String) -> (words: Int, questions: Int, isThread: Bool, reasons: [String]) {
        // Chinese, Japanese and Korean have no spaces, so each character counts as a word.
        let cjk = text.unicodeScalars.filter(isCJK).count
        let latinWords = text.split(whereSeparator: { $0.isWhitespace }).filter { word in !word.unicodeScalars.allSatisfy(isCJK) }.count
        let words = latinWords + cjk
        // Question marks inside links don't count; full-width ones do.
        let noLinks = text.replacingOccurrences(of: #"https?://\S+"#, with: "", options: [.regularExpression, .caseInsensitive])
        let questions = noLinks.filter { $0 == "?" || $0 == "？" }.count
        let isThread = text.range(of: #"(?m)^[ \t]*(?:>|from:[ \t]|on [^\n]{1,200} wrote:|-{2,}[ \t]*original message)"#,
                                  options: [.regularExpression, .caseInsensitive]) != nil
        var reasons: [String] = []
        if words > maxWords { reasons.append("\(words) words (over \(maxWords))") }
        if questions >= maxQuestions { reasons.append("\(questions) separate questions") }
        if isThread { reasons.append("an email thread with earlier replies") }
        return (words, questions, isThread, reasons)
    }

    static func decide(_ text: String, localOnly: Bool, deviceReady: Bool, online: Bool) -> Decision {
        let reasons = assess(text).reasons
        if localOnly {
            return deviceReady
                ? Decision(target: .device, mode: .deviceOnly, why: "Local-only policy: nothing is allowed to leave this iPhone.")
                : Decision(target: .blocked, mode: nil, why: "Local-only policy is on, but Apple Intelligence isn't available, so nothing was sent anywhere.")
        }
        if !online {
            guard deviceReady else { return Decision(target: .blocked, mode: nil, why: "Offline, and Apple Intelligence isn't available.") }
            return Decision(target: .device, mode: .deviceOnly,
                            why: reasons.isEmpty ? "You're offline, so this iPhone handles every step."
                                                 : "Complex ticket (\(reasons.joined(separator: ", "))), but you're offline, so this iPhone handles every step.")
        }
        if !deviceReady {
            return Decision(target: .cloud, mode: .cloudOnly,
                            why: "Apple Intelligence isn't available, so Gemini in the cloud handles it, using masked text only.")
        }
        if !reasons.isEmpty {
            return Decision(target: .cloud, mode: .preferCloud,
                            why: "Complex ticket (\(reasons.joined(separator: ", "))), so Gemini in the cloud drafts it, using masked text only.")
        }
        return Decision(target: .device, mode: .preferDevice, why: "Short, simple ticket, so it stays on this iPhone.")
    }
}
