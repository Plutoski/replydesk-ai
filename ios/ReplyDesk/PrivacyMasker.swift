import Foundation

/// Local PII masking. Everything here runs on the iPhone; nothing is sent anywhere.
/// Mirrors web/src/pii.js so both platforms mask the same way.
nonisolated enum PrivacyMasker {
    struct Entry { let type: String; let value: String }

    struct Result {
        let masked: String
        let vault: [String: Entry]
        let counts: [String: Int]
        var total: Int { counts.values.reduce(0, +) }
    }

    private struct Pattern {
        let type: String
        let regex: NSRegularExpression
        var group: Int? = nil                 // mask only this capture group, keep the prefix
        var validate: ((String) -> Bool)? = nil
    }

    private static func rx(_ p: String, _ o: NSRegularExpression.Options = []) -> NSRegularExpression {
        try! NSRegularExpression(pattern: p, options: o)
    }

    // Order matters: more specific patterns first.
    nonisolated(unsafe) private static let patterns: [Pattern] = [
        Pattern(type: "EMAIL", regex: rx(#"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}"#, .caseInsensitive)),
        Pattern(type: "CARD", regex: rx(#"\b(?:\d[ -]?){12,18}\d\b"#), validate: { luhn($0.filter(\.isNumber)) }),
        Pattern(type: "PHONE", regex: rx(#"(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)|\d{2,4})[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b"#),
                validate: { $0.filter(\.isNumber).count >= 9 }),
        Pattern(type: "ORDER", regex: rx(#"(#\s?|\b(?:order|ref(?:erence)?|account|acct|booking|ticket|case|invoice|tracking)\s*(?:no\.?|number|#|id)?\s*[:#]?\s*)([A-Z0-9-]*\d[A-Z0-9-]{3,})"#, .caseInsensitive), group: 2),
        Pattern(type: "ADDRESS", regex: rx(#"\b\d{1,5}\s+(?:[A-Z][a-z]+\s){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Crescent|Cres|Court|Ct|Place|Pl|Trail|Close|Terrace)\b\.?(?:\s(?:NW|NE|SW|SE))?"#)),
        Pattern(type: "POSTCODE", regex: rx(#"\b(?:[A-Z]\d[A-Z]\s?\d[A-Z]\d|[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})\b"#)),
    ]

    nonisolated(unsafe) private static let nameHints: [NSRegularExpression] = [
        rx(#"\bmy name is\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)"#),
        rx(#"\b(?:I'm|I am|this is)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)(?=[\s,.!]|$)"#),
        rx(#"(?:^|\n)\s*(?:regards|kind regards|best regards|best|thanks|thank you|cheers|sincerely|many thanks)[,!.]?\s*\n?\s*([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s*$"#, [.caseInsensitive, .anchorsMatchLines]),
        rx(#"\bmy (?:son|daughter|husband|wife|partner|mum|mom|dad|friend)\s+([A-Z][a-z]+)"#),
    ]

    private static let notNames: Set<String> = ["Hi", "Hello", "Thanks", "Regards", "Customer", "Support", "Team", "Sir", "Madam",
        "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "Really", "So", "Very", "Not"]

    static func luhn(_ digits: String) -> Bool {
        guard (13...19).contains(digits.count) else { return false }
        var sum = 0
        for (i, ch) in digits.reversed().enumerated() {
            var d = Int(String(ch)) ?? 0
            if i % 2 == 1 { d *= 2; if d > 9 { d -= 9 } }
            sum += d
        }
        return sum % 10 == 0
    }

    /// Replace each match with the transform's result (nil keeps the original text).
    private static func replace(_ text: String, _ regex: NSRegularExpression,
                                _ transform: (NSTextCheckingResult, NSString) -> String?) -> String {
        let ns = text as NSString
        var out = ""
        var last = 0
        for m in regex.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
            out += ns.substring(with: NSRange(location: last, length: m.range.location - last))
            out += transform(m, ns) ?? ns.substring(with: m.range)
            last = m.range.location + m.range.length
        }
        out += ns.substring(from: last)
        return out
    }

    static func heuristicNames(_ text: String) -> [String] {
        var out: [String] = []
        // Bare sign-off: the last line is 1 to 3 capitalised words, e.g. "Priya Patel".
        if let lastLine = text.trimmingCharacters(in: .whitespacesAndNewlines).components(separatedBy: "\n").last?
            .trimmingCharacters(in: .whitespaces).trimmingCharacters(in: CharacterSet(charactersIn: ".,!")),
           lastLine.range(of: #"^[A-Z][a-z]+(?:[ '-][A-Z][a-z]+){0,2}$"#, options: .regularExpression) != nil,
           let first = lastLine.split(separator: " ").first, !notNames.contains(String(first)) {
            out.append(lastLine)
        }
        let ns = text as NSString
        for re in nameHints {
            for m in re.matches(in: text, range: NSRange(location: 0, length: ns.length)) where m.numberOfRanges > 1 {
                let n = ns.substring(with: m.range(at: 1)).trimmingCharacters(in: .whitespaces)
                if let first = n.split(separator: " ").first, !notNames.contains(String(first)), !out.contains(n) { out.append(n) }
            }
        }
        return out
    }

    /// Mask a message. `names` and `addresses` come from the on-device model.
    static func mask(_ text: String, names: [String] = [], addresses: [String] = []) -> Result {
        var vault: [String: Entry] = [:]
        var counters: [String: Int] = [:]
        var seen: [String: String] = [:]

        func token(_ type: String, _ value: String) -> String {
            let key = "\(type):\(value.lowercased())"
            if let t = seen[key] { return t }
            counters[type, default: 0] += 1
            let t = "[\(type)_\(counters[type]!)]"
            seen[key] = t
            vault[t] = Entry(type: type, value: value)
            return t
        }

        var masked = text
        for p in patterns {
            masked = replace(masked, p.regex) { m, ns in
                if let g = p.group {
                    let prefix = ns.substring(with: m.range(at: 1))
                    let id = ns.substring(with: m.range(at: g)).trimmingCharacters(in: .whitespaces)
                    return prefix + token(p.type, id)
                }
                let value = ns.substring(with: m.range).trimmingCharacters(in: .whitespaces)
                if let v = p.validate, !v(value) { return nil }
                return token(p.type, value)
            }
        }

        // Names: model-found + heuristics, longest first, only if actually present.
        var allNames: [String] = []
        for n in (names + heuristicNames(text)).map({ $0.trimmingCharacters(in: .whitespaces) })
        where n.count > 1 && !n.hasPrefix("[") && !notNames.contains(n) && text.contains(n) && !allNames.contains(n) {
            allNames.append(n)
        }
        allNames.sort { $0.count > $1.count }
        var done: [String] = []
        for n in allNames {
            let parent = done.first(where: { $0.split(separator: " ").map(String.init).contains(n) })
            let t = parent.flatMap { seen["NAME:\($0.lowercased())"] } ?? token("NAME", n)
            done.append(n)
            masked = replace(masked, rx("\\b" + NSRegularExpression.escapedPattern(for: n) + "\\b")) { _, _ in t }
            let first = String(n.split(separator: " ").first ?? "")
            if first != n, first.count > 2, !notNames.contains(first) {
                masked = replace(masked, rx("\\b" + NSRegularExpression.escapedPattern(for: first) + "\\b(?!_)")) { _, _ in t }
            }
        }
        for a in addresses.map({ $0.trimmingCharacters(in: .whitespaces) }) where a.count > 5 && masked.contains(a) {
            masked = masked.replacingOccurrences(of: a, with: token("ADDRESS", a))
        }

        // Keep only tokens that appear, and count them.
        vault = vault.filter { masked.contains($0.key) }
        var counts: [String: Int] = [:]
        for e in vault.values { counts[e.type, default: 0] += 1 }
        return Result(masked: masked, vault: vault, counts: counts)
    }

    /// Put real values back on the device. Cards come back only as their last four digits.
    static func unmask(_ text: String, vault: [String: Entry]) -> String {
        let out = replace(text, rx(#"\[\s*([A-Z]+)_(\d+)\s*\]"#)) { m, ns in
            let type = ns.substring(with: m.range(at: 1))
            let key = "[\(type)_\(ns.substring(with: m.range(at: 2)))]"
            guard let e = vault[key] else { return "[CHECK: \(type.lowercased())]" }
            if e.type == "CARD" { return "card ending in \(String(e.value.filter(\.isNumber).suffix(4)))" }
            return e.value
        }
        return out.replacingOccurrences(of: "card card ending in", with: "card ending in", options: .caseInsensitive)
    }
}
