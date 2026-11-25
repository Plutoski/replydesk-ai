import Foundation

/// Local PII masking. Everything here runs on the iPhone; nothing is sent anywhere.
/// Mirrors web/src/pii.js so both platforms mask the same way (same patterns, same name rules, same leak check).
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
        var group: Int? = nil                                   // mask only this capture group, keep the prefix
        var validate: ((String, String, String) -> Bool)? = nil // (match, text after, text before)
        var validGroup: ((String) -> Bool)? = nil
    }

    private static func rx(_ p: String, _ o: NSRegularExpression.Options = []) -> NSRegularExpression {
        try! NSRegularExpression(pattern: p, options: o)
    }

    private static let street = "street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|crescent|cres|court|ct|place|pl|trail|trl|close|terrace|parkway|pkwy|highway|hwy|circle|cir|square|sq|gardens|grove|mews|row"
    private static let unit = "apt|apartment|unit|flat|suite|ste"
    private static let idWords = [
        "passport", "driver'?s licen[cs]e", "driving licen[cs]e", "licen[cs]e", "social insurance", "social security", "national insurance",
        "ni number", "nino", "sin", "ssn", "customer id", "customer number", "customer no", "client id", "user id", "member id",
        "member number", "policy number", "policy no", "acc no", "acc number", "nin", "bvn", "aadhaar", "tax id", "cvv", "cvc",
        "security code", "pin", "pnr", "confirmation", "reservation", "membership", "frequent flyer", "loyalty",
        "account", "acct", "sort code", "routing", "iban", "imei", "serial",
    ].joined(separator: "|")
    private static let states: Set<String> = Set("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(separator: " ").map(String.init))
    nonisolated(unsafe) private static let amountAfter = rx(#"^\s*(?:naira|ngn|dollars?|usd|cad|gbp|eur|euros?|pounds?|yen|rupees?|inr|%|percent|kg|km|miles?|points?|units?|items?|pcs)\b"#, .caseInsensitive)

    private static func has(_ re: NSRegularExpression, _ s: String) -> Bool {
        re.firstMatch(in: s, range: NSRange(location: 0, length: (s as NSString).length)) != nil
    }
    nonisolated(unsafe) private static let currencyBefore = rx(#"[$€£₦¥]\s*$"#)
    nonisolated(unsafe) private static let yearsStart = rx(#"^(?:19|20)\d\d[\s.-](?:19|20)\d\d"#)
    nonisolated(unsafe) private static let qtyBefore = rx(#"\b(?:qty|quantity|flight|flt)\s*[A-Z]{0,3}\s*$"#, .caseInsensitive)
    nonisolated(unsafe) private static let addressStop = rx(#"\b(?:the|a|an|on|in|at|to|of|for|and|or|my|your|our|minutes?|hours?|days?|weeks?|months?|years?|times?|items?|people|calls?|emails?)\b"#, .caseInsensitive)
    nonisolated(unsafe) private static let addressTail = rx("\\s+(?:\(street))\\b.*$", .caseInsensitive)
    nonisolated(unsafe) private static let storageSuffix = rx(#"\d\s?[KMGT]B$"#, .caseInsensitive)
    nonisolated(unsafe) private static let isoDate = rx(#"^\d{4}-\d{2}-\d{2}$"#)
    nonisolated(unsafe) private static let year = rx(#"^(?:19|20)\d\d$"#)

    // Order matters: more specific patterns run first, and replaced text becomes a [TAG] that later patterns skip.
    nonisolated(unsafe) private static let patterns: [Pattern] = [
        Pattern(type: "EMAIL", regex: rx(#"(?<![A-Z0-9._%+\-\p{L}])[A-Z0-9._%+\-\p{L}\p{M}]+@[A-Z0-9.\-\p{L}\p{M}]+\.[A-Z]{2,}"#, .caseInsensitive)),
        // "john dot doe at gmail dot com", "x [at] y [dot] com"
        Pattern(type: "EMAIL", regex: rx(#"(?<![\p{L}\p{N}._%+-])[\p{L}\p{N}._%+-]+(?:\s*(?:\[dot\]|\(dot\)|\sdot\s)\s*[\p{L}\p{N}_%+-]+)*\s*(?:\[at\]|\(at\)|\sat\s)\s*[\p{L}\p{N}-]+(?:\s*(?:\[dot\]|\(dot\)|\sdot\s|\.)\s*[\p{L}\p{N}-]+)*?\s*(?:\[dot\]|\(dot\)|\sdot\s|\.)\s*(?:com|net|org|co|uk|ng|ca|io|edu|gov|info|me|us|in)\b"#, .caseInsensitive)),
        Pattern(type: "ACCOUNT", regex: rx(#"\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b"#)), // IBAN
        Pattern(type: "ID", regex: rx(#"\b\d{3}-\d{2}-\d{4}\b"#)), // US SSN
        Pattern(type: "ID", regex: rx(#"\b[A-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b"#)), // UK National Insurance
        // Dates of birth, only after a DOB keyword.
        Pattern(type: "DOB", regex: rx(#"(\b(?:dob|d\.o\.b\.?|date of birth|born(?: on)?|birthday(?: is)?)\s*[:-]?\s*)(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}|\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?,?\s+\d{4})"#, .caseInsensitive), group: 2),
        // A card number after "card", "Visa" etc. is masked even if it fails the checksum.
        Pattern(type: "CARD", regex: rx(#"(\b(?:card|visa|mastercard|master card|amex|debit|credit)\b[^\d\n]{0,25}?)((?:\d[ -]?){12,18}\d)(?!\d)"#, .caseInsensitive), group: 2),
        // Keyword + ID: keeps the keyword visible and masks only the value.
        Pattern(type: "ID", regex: rx("(\\b(?:\(idWords))\\b\\s*(?:no\\.?|number|num|#|id|code)?\\s*(?:is\\s*|:\\s*|#\\s*|-\\s*)?)((?=[A-Z0-9-]*\\d)[A-Z0-9][A-Z0-9-]{2,}(?:[ ](?=\\d)\\d{2,}){0,4})", .caseInsensitive),
                group: 2, validGroup: { !has(year, $0) }),
        Pattern(type: "CARD", regex: rx(#"(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)"#), validate: { m, _, _ in luhn(digitsOf(m)) }),
        Pattern(type: "ID", regex: rx(#"(?<![\d.])(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}(?![\d.])"#)), // IPv4
        Pattern(type: "PHONE", regex: rx(#"(?<![\p{L}\d])(?:\+?\d{1,3}[\s.-]?)?(?:\(0\)\s?)?(?:\(\d{2,5}\)|\d{2,5})[\s.-]?\d{2,5}[\s.-]?\d{3,5}(?!\d)"#),
                validate: { m, after, before in
                    let d = digitsOf(m).count
                    if d < 9 || d > 15 { return false }
                    if has(amountAfter, after) || has(currencyBefore, before) { return false }
                    if has(yearsStart, m) || has(qtyBefore, before) { return false }
                    return true
                }),
        // Order and booking numbers: keeps the keyword visible and masks only the ID itself.
        Pattern(type: "ORDER", regex: rx(#"(#\s?|\b(?:order|ref(?:erence)?|booking|ticket|case|invoice|tracking|shipment|parcel|claim)\s*(?:no\.?|number|#|id|code)?\s*(?:is\s*)?[:#]?\s*)((?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{4,})"#, .caseInsensitive),
                group: 2, validGroup: { !has(isoDate, $0) }),
        Pattern(type: "ADDRESS", regex: rx(#"\b[Pp]\.?\s?[Oo]\.?\s?[Bb]ox\s+\d+\b"#)),
        Pattern(type: "ADDRESS", regex: rx("(?:\\b(?:\(unit))\\.?\\s*#?\\s*[A-Z0-9-]+,?\\s+)?(?:\\b[Nn]o\\.?\\s*)?\\b\\d{1,5}[A-Z]?(?:-\\d{1,5})?,?\\s+(?:(?:[NSEW]|north|south|east|west)\\.?\\s+)?(?:[\\p{L}\\p{N}'.-]+\\s+){0,3}?(?:\(street))\\b\\.?(?:\\s+(?:NW|NE|SW|SE|N|S|E|W)\\b)?(?:,?\\s*(?:\(unit))\\.?\\s*#?\\s*[A-Z0-9-]+)?", .caseInsensitive),
                validate: { m, _, _ in
                    // The words between the number and "Street" must not be ordinary words ("50 minutes on the road").
                    let afterNumber = m.split(separator: " ", maxSplits: 1).dropFirst().first.map(String.init) ?? ""
                    let middle = addressTail.stringByReplacingMatches(in: afterNumber, range: NSRange(location: 0, length: (afterNumber as NSString).length), withTemplate: "")
                    return !has(addressStop, middle)
                }),
        Pattern(type: "ADDRESS", regex: rx("\\b(?:\(unit))\\.?\\s*#?\\s*\\d+[A-Z]?\\b", .caseInsensitive)),
        Pattern(type: "POSTCODE", regex: rx(#"\b[A-Za-z]{2}\s\d{5}(?:-\d{4})?\b"#), validate: { m, _, _ in states.contains(String(m.prefix(2)).uppercased()) }), // US
        Pattern(type: "POSTCODE", regex: rx(#"\b[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\s?\d[ABCEGHJ-NPRSTV-Z]\d\b"#, .caseInsensitive)), // Canada
        Pattern(type: "POSTCODE", regex: rx(#"\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b"#, .caseInsensitive), validate: { m, _, _ in !has(storageSuffix, m) }), // UK
    ]

    // MARK: - Names

    private static let letters = "\\p{L}\\p{M}"
    private static let wordUp = "\\p{Lu}[\(letters)'’-]*[\(letters)]"           // Sarah, O'Brien, Nwosu-Eze, Adébáyọ̀
    private static let nameUp = "\(wordUp)(?:[ ]\(wordUp)){0,3}"
    private static let wordAny = "[\(letters)][\(letters)'’-]*[\(letters)]"
    private static let nameAny = "\(wordAny)(?:[ ]\(wordAny)){0,4}"
    private static let titles = "Mr|Mrs|Ms|Miss|Mx|Dr|Prof|Chief|Alhaji|Alhaja|Pastor|Rev|Sir|Dame|Madam|Mme|Mlle|Herr|Frau|Señor|Señora|Sr|Sra"
    private static let signoff = "regards|kind regards|best regards|warm regards|best wishes|best|thanks|thank you|thanks again|many thanks|cheers|sincerely|yours sincerely|yours faithfully|yours truly|respectfully|warmly|yours|gracias|merci|danke|obrigado|saludos|cordialement"
    private static let family = "son|daughter|husband|wife|partner|mum|mom|mother|dad|father|brother|sister|friend|kids|kid|children|child|baby|grandson|granddaughter|grandmother|grandfather|boyfriend|girlfriend|fiance|fiancee|fiancé|fiancée|colleague|boss|manager|neighbour|neighbor|niece|nephew|aunt|uncle|cousin"

    private struct Hint { let regex: NSRegularExpression; var loose = false; var list = false }
    // (?i:...) makes only the keywords case-insensitive; the name itself must start with a capital (except after "my name is").
    nonisolated(unsafe) private static let nameHints: [Hint] = [
        Hint(regex: rx("(?i:my name is|my name's|me llamo|mi nombre es|je m'appelle|je suis|ich bin|ich heiße|soy|name is|name:|acc name|account name|beneficiary|first name is|first name|last name is|last name|surname is|surname|full name is|full name|under the name|account holder is|account holder|account name is|cardholder)\\s*[:-]?\\s*(\(nameAny))"), loose: true),
        Hint(regex: rx("(?i:i'm|i’m|i am|this is|it's|it’s|im)\\s+(\(nameUp))")),
        Hint(regex: rx("(?:^|[\\n.!,][ \\t]*|\\b(?i:hi|hello|hey)[,!]?[ \\t]+)(\(nameUp))[ \\t]+(?i:here)\\b")),
        Hint(regex: rx("\\b(?:\(titles))\\.?\\s+(\(nameUp))")),
        Hint(regex: rx("^[ \\t]*(?i:from):[ \\t]*[\"']?(\(nameUp))", .anchorsMatchLines)),
        Hint(regex: rx("^[ \\t]*[-–—~][ \\t]*(\(nameUp))[ \\t]*$", .anchorsMatchLines)),
        Hint(regex: rx("^[ \\t]*(?i:\(signoff))[ \\t]*(?:[,!.][ \\t]*)?(?:\\n[ \\t]*)?(?:(?:\(titles))\\.?[ \\t]+)?(\(nameUp))[ \\t]*(?:[.!][ \\t]*)?$", .anchorsMatchLines)),
        Hint(regex: rx("\\b(?i:my|our)\\s+(?i:\(family))\\s+(\(nameUp)(?:(?:,\\s*|\\s+(?i:and)\\s+)\(wordUp))*)"), list: true),
    ]
    nonisolated(unsafe) private static let titlePrefix = rx("^(?:\(titles))\\.?\\s+")
    nonisolated(unsafe) private static let bareSignoff = rx("^(?:(?:\(titles))\\.?\\s+)?\(nameUp)$")
    nonisolated(unsafe) private static let listSplit = rx(",\\s*|\\s+(?i:and)\\s+")

    /// Words that look like names after "I'm", "this is" or on a last line, but are not.
    static let notNames: Set<String> = Set("""
        hi hello hey dear thanks thank regards customer support team sir madam service
        monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december
        really so very not just still also now here there back fine okay ok sure done the a an your their our my this that
        sorry furious angry upset annoyed disappointed frustrated happy unhappy pleased glad worried concerned confused tired desperate
        urgent writing calling contacting trying waiting asking following hoping going getting having looking reaching emailing
        canadian british american nigerian indian english french german chinese irish scottish welsh african european
        order cancelled canceled family refund account card visa mastercard amex payment delivery parcel booking flight hotel
        please help urgent asap again today tomorrow yesterday everyone all none nobody someone
        """.split(whereSeparator: { $0.isWhitespace }).map(String.init))

    private static func isName(_ n: String) -> Bool {
        let words = n.split(separator: " ").map { $0.lowercased() }
        guard n.count > 1, let first = words.first else { return false }
        return !notNames.contains(first) && !words.allSatisfy { notNames.contains($0) }
    }

    private static func trimName(_ n: String) -> String {
        var w = n.split(whereSeparator: { $0.isWhitespace }).map(String.init)
        while w.count > 1, notNames.contains(w.last!.lowercased()) { w.removeLast() }
        return w.joined(separator: " ")
    }

    static func digitsOf(_ s: String) -> String { String(s.filter { $0.isASCII && $0.isNumber }) }

    static func luhn(_ digits: String) -> Bool {
        guard (13...19).contains(digits.count) else { return false }
        var sum = 0
        for (i, ch) in digits.reversed().enumerated() {
            var d = ch.wholeNumberValue ?? 0
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

    private static func group(_ m: NSTextCheckingResult, _ i: Int, _ ns: NSString) -> String? {
        guard i < m.numberOfRanges, m.range(at: i).location != NSNotFound else { return nil }
        return ns.substring(with: m.range(at: i))
    }

    static func heuristicNames(_ text: String) -> [String] {
        var out: [String] = []
        func add(_ n: String) { if !n.isEmpty, isName(n), !out.contains(n) { out.append(n) } }
        // Bare sign-off: the last line is 1 to 4 capitalised words, e.g. "Priya Patel".
        if let lastLine = text.trimmingCharacters(in: .whitespacesAndNewlines).components(separatedBy: "\n").last?
            .trimmingCharacters(in: .whitespaces).trimmingCharacters(in: CharacterSet(charactersIn: ".,!")),
           lastLine.count <= 80, has(bareSignoff, lastLine) {
            let n = titlePrefix.stringByReplacingMatches(in: lastLine, range: NSRange(location: 0, length: (lastLine as NSString).length), withTemplate: "")
            if n.split(separator: " ").allSatisfy({ !notNames.contains($0.lowercased()) }) { add(n) }
        }
        let ns = text as NSString
        for h in nameHints {
            for m in h.regex.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
                guard let captured = group(m, 1, ns) else { continue }
                let parts: [String] = h.list
                    ? listSplit.stringByReplacingMatches(in: captured, range: NSRange(location: 0, length: (captured as NSString).length), withTemplate: "\u{1}").components(separatedBy: "\u{1}")
                    : [captured]
                for p in parts {
                    var n = trimName(p)
                    if h.loose { n = n.split(separator: " ").filter { !notNames.contains($0.lowercased()) }.joined(separator: " ") }
                    add(n)
                }
            }
        }
        return out
    }

    /// Unicode-aware whole-word match, so José and 王小明 are found like Sarah.
    private static func wordRegex(_ s: String) -> NSRegularExpression {
        rx("(?<![\\p{L}\\p{M}\\p{N}_])" + NSRegularExpression.escapedPattern(for: s) + "(?![\\p{L}\\p{M}\\p{N}_])", .caseInsensitive)
    }
    nonisolated(unsafe) private static let tagRegex = rx(#"\[\s*([A-Za-z]+)[\s_-]*(\d+)\s*\]"#)

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

        // A customer who types "[CARD_1]" must not be able to alias a real tag.
        let source = replace(text.precomposedStringWithCanonicalMapping, tagRegex) { m, ns in
            "(\(group(m, 1, ns) ?? "") \(group(m, 2, ns) ?? ""))"
        }
        var masked = source
        for p in patterns {
            masked = replace(masked, p.regex) { m, ns in
                let whole = ns.substring(with: m.range)
                if let g = p.group {
                    guard let v = group(m, g, ns)?.trimmingCharacters(in: .whitespaces), !v.isEmpty else { return nil }
                    if let ok = p.validGroup, !ok(v) { return nil }
                    return (group(m, 1, ns) ?? "") + token(p.type, v)
                }
                if whole.range(of: #"\[[A-Z]+_\d+\]"#, options: .regularExpression) != nil { return nil } // never re-mask a tag
                let end = m.range.location + m.range.length
                let after = ns.substring(with: NSRange(location: end, length: min(12, ns.length - end)))
                let start = max(0, m.range.location - 12)
                let before = ns.substring(with: NSRange(location: start, length: m.range.location - start))
                if let v = p.validate, !v(whole, after, before) { return nil }
                return token(p.type, whole.trimmingCharacters(in: .whitespaces))
            }
        }

        // Names: model-found + rule-found, longest first, only if actually present.
        let lower = source.lowercased()
        var allNames: [String] = []
        for raw in names + heuristicNames(source) {
            let stripped = titlePrefix.stringByReplacingMatches(in: raw, range: NSRange(location: 0, length: (raw as NSString).length), withTemplate: "")
            let n = trimName(stripped.precomposedStringWithCanonicalMapping)
            if n.count > 1, n.count <= 80, !n.hasPrefix("["), isName(n), lower.contains(n.lowercased()), !allNames.contains(n) { allNames.append(n) }
        }
        allNames.sort { $0.count > $1.count }
        var nameTokens: [String: String] = [:] // lowercased name or name part -> token
        for n in allNames {
            let key = n.lowercased()
            let t = nameTokens[key] ?? token("NAME", n)
            nameTokens[key] = t
            // Every part of a full name ("Sarah", "Jones") maps to the same person.
            for part in n.split(separator: " ").map(String.init) {
                let k = part.lowercased()
                if part.count > 2, !notNames.contains(k), nameTokens[k] == nil { nameTokens[k] = t }
            }
        }
        for (k, t) in nameTokens.sorted(by: { $0.key.count > $1.key.count }) {
            masked = replace(masked, wordRegex(k)) { _, _ in t }
        }
        for a in addresses.map({ $0.precomposedStringWithCanonicalMapping.trimmingCharacters(in: .whitespaces) }) where a.count > 5 {
            masked = replace(masked, rx(NSRegularExpression.escapedPattern(for: a), .caseInsensitive)) { _, _ in token("ADDRESS", a) }
        }

        // Keep only tokens that appear, and count them.
        vault = vault.filter { masked.contains($0.key) }
        var counts: [String: Int] = [:]
        for e in vault.values { counts[e.type, default: 0] += 1 }
        return Result(masked: masked, vault: vault, counts: counts)
    }

    /// Safety net before anything is sent to the cloud: the tags of every real value still in the prompt.
    static func findLeaks(_ prompt: String, vault: [String: Entry]) -> [String] {
        let text = prompt.precomposedStringWithCanonicalMapping
        let digitsOnly = digitsOf(text)
        var leaks: [String] = []
        for (tag, e) in vault {
            let probes = e.type == "NAME"
                ? [e.value] + e.value.split(separator: " ").map(String.init).filter { $0.count > 2 && !notNames.contains($0.lowercased()) }
                : [e.value]
            for p in probes {
                let digits = digitsOf(p)
                let hit = (digits.count >= 7 && e.type != "NAME") ? digitsOnly.contains(digits) : has(wordRegex(p), text)
                if hit { leaks.append(tag); break }
            }
        }
        return leaks
    }

    private static let types = "NAME|EMAIL|PHONE|CARD|ORDER|ADDRESS|POSTCODE|ID|ACCOUNT|DOB"
    nonisolated(unsafe) private static let looseTag = rx("\\[{1,2}\\s*(\(types))[\\s_-]*(\\d+)\\s*('s)?\\s*\\]{1,2}", .caseInsensitive)
    nonisolated(unsafe) private static let bareTag = rx("\\b(\(types))_(\\d+)\\b")
    nonisolated(unsafe) private static let invented = rx(#"\[(?!CHECK:|AGENT\])([A-Za-z][A-Za-z _-]{2,})\]"#)

    /// Put real values back on the device. Cards come back only as their last four digits,
    /// and so does any other long number (12+ digits) such as an account or ID.
    /// firstName: greet people by first name ("Hi Sarah", not "Hi Sarah Jones").
    /// Plain words for a detail, used in summaries where the real value isn't needed.
    private static let describeWords = ["EMAIL": "‹email›", "PHONE": "‹phone number›", "CARD": "‹card›", "ORDER": "‹order no.›",
        "ADDRESS": "‹address›", "POSTCODE": "‹postcode›", "ID": "‹account no.›", "ACCOUNT": "‹bank account›", "DOB": "‹date of birth›"]

    static func unmask(_ text: String, vault: [String: Entry], firstName: Bool = false, describe: Bool = false) -> String {
        func restore(_ type: String, _ n: String, _ poss: String) -> String {
            let T = type.uppercased()
            guard let e = vault["[\(T)_\(n)]"] else { return "[CHECK: \(T.lowercased())]" }
            if describe && e.type != "NAME" { return describeWords[e.type] ?? "‹detail›" }
            let digits = digitsOf(e.value)
            if e.type == "CARD" { return "card ending in \(digits.suffix(4))" + poss }
            if e.type == "NAME" { return (firstName ? String(e.value.split(separator: " ").first ?? Substring(e.value)) : e.value) + poss }
            if e.type != "PHONE" && digits.count >= 12 { return "ending in \(digits.suffix(4))" + poss }
            return e.value + poss
        }
        var out = replace(text, looseTag) { m, ns in restore(group(m, 1, ns) ?? "", group(m, 2, ns) ?? "", group(m, 3, ns) ?? "") }
        out = replace(out, bareTag) { m, ns in restore(group(m, 1, ns) ?? "", group(m, 2, ns) ?? "", "") }
        // Tags the AI invented, like [TIME_FRAME], become checks for the agent.
        out = replace(out, invented) { m, ns in
            let words = (group(m, 1, ns) ?? "").replacingOccurrences(of: "_", with: " ").replacingOccurrences(of: "-", with: " ")
                .lowercased().trimmingCharacters(in: .whitespaces)
            return "[CHECK: \(words)]"
        }
        out = out.replacingOccurrences(of: #"\bcard\s+card ending in"#, with: "card ending in", options: [.regularExpression, .caseInsensitive])
        return out.replacingOccurrences(of: #"\b(?:ending in\s+)+ending in"#, with: "ending in", options: [.regularExpression, .caseInsensitive])
    }
}
