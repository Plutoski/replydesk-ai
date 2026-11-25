// Local PII masking. Everything in this file runs on the user's machine.
// Layer 1: deterministic patterns (emails, IDs, bank details, cards, phones, order numbers, addresses, postcodes).
// Layer 2: names found by the on-device model, plus greeting, sign-off and title rules.
// Names are matched with Unicode-aware boundaries, so José, Ọlá and 王小明 are masked like Sarah.

const L = "\\p{L}\\p{M}"; // letters and combining marks
const EDGE_L = `(?<![${L}\\p{N}_])`; // start of a word, in any script
const EDGE_R = `(?![${L}\\p{N}_])`; // end of a word, in any script

// Case-insensitive keywords without the i flag (with /iu, \p{Lu} would also match lowercase letters).
const ci = (words) => `(?:${words.replace(/[a-z]/g, (c) => `[${c}${c.toUpperCase()}]`)})`;

const STREET = "street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|crescent|cres|court|ct|place|pl|trail|trl|close|terrace|parkway|pkwy|highway|hwy|circle|cir|square|sq|gardens|grove|mews|row";
const UNIT = "apt|apartment|unit|flat|suite|ste";
const ID_WORDS = [
  "passport", "driver'?s licen[cs]e", "driving licen[cs]e", "licen[cs]e", "social insurance", "social security", "national insurance",
  "ni number", "nino", "sin", "ssn", "customer id", "customer number", "customer no", "client id", "user id", "member id", "member number", "policy number", "policy no", "acc no", "acc number", "nin", "bvn", "aadhaar", "tax id", "cvv", "cvc", "security code", "pin",
  "pnr", "confirmation", "reservation", "membership", "frequent flyer", "loyalty",
  "account", "acct", "sort code", "routing", "iban", "imei", "serial",
].join("|");
const AMOUNT_AFTER = /^\s*(?:naira|ngn|dollars?|usd|cad|gbp|eur|euros?|pounds?|yen|rupees?|inr|%|percent|kg|km|miles?|points?|units?|items?|pcs)\b/i;

const PATTERNS = [
  // Order matters: more specific patterns run first, and replaced text becomes a [TAG] that later patterns skip.
  { type: "EMAIL", re: /(?<![A-Z0-9._%+\-\p{L}])[A-Z0-9._%+\-\p{L}\p{M}]+@[A-Z0-9.\-\p{L}\p{M}]+\.[A-Z]{2,}/giu },
  { type: "EMAIL", // "john dot doe at gmail dot com", "x [at] y [dot] com"
    re: /(?<![\p{L}\p{N}._%+-])[\p{L}\p{N}._%+-]+(?:\s*(?:\[dot\]|\(dot\)|\sdot\s)\s*[\p{L}\p{N}_%+-]+)*\s*(?:\[at\]|\(at\)|\sat\s)\s*[\p{L}\p{N}-]+(?:\s*(?:\[dot\]|\(dot\)|\sdot\s|\.)\s*[\p{L}\p{N}-]+)*?\s*(?:\[dot\]|\(dot\)|\sdot\s|\.)\s*(?:com|net|org|co|uk|ng|ca|io|edu|gov|info|me|us|in)\b/giu,
    valid: (m) => /\[at\]|\(at\)|\sat\s/i.test(m) && /dot|\./i.test(m.split(/\[at\]|\(at\)|\sat\s/i)[1] || "") },
  { type: "ACCOUNT", re: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g }, // IBAN
  { type: "ID", re: /\b\d{3}-\d{2}-\d{4}\b/g }, // US SSN
  { type: "ID", re: /\b[A-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b/g }, // UK National Insurance
  // Dates of birth (only after a DOB keyword, so ordinary dates stay readable).
  { type: "DOB", re: /(\b(?:dob|d\.o\.b\.?|date of birth|born(?: on)?|birthday(?: is)?)\s*[:-]?\s*)(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}|\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?,?\s+\d{4})/gi, group: 2 },
  // A card number after "card", "Visa" etc. is masked even if it fails the checksum (typos still leak data).
  { type: "CARD", re: /(\b(?:card|visa|mastercard|master card|amex|debit|credit)\b[^\d\n]{0,25}?)((?:\d[ -]?){12,18}\d)(?!\d)/gi, group: 2 },
  // Keyword + ID: keeps the keyword visible ("passport no.") and masks only the value.
  { type: "ID", re: new RegExp(`(\\b(?:${ID_WORDS})\\b\\s*(?:no\\.?|number|num|#|id|code)?\\s*(?:is\\s*|:\\s*|#\\s*|-\\s*)?)((?=[A-Z0-9-]*\\d)[A-Z0-9][A-Z0-9-]{2,}(?:[ ](?=\\d)\\d{2,}){0,4})`, "gi"), group: 2, validGroup: (v) => !/^(?:19|20)\d\d$/.test(v) },
  { type: "CARD", re: /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g, valid: (m) => luhn(m.replace(/\D/g, "")) },
  { type: "ID", re: /(?<![\d.])(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}(?![\d.])/g }, // IPv4
  { type: "PHONE",
    re: /(?<![\p{L}\d])(?:\+?\d{1,3}[\s.-]?)?(?:\(0\)\s?)?(?:\(\d{2,5}\)|\d{2,5})[\s.-]?\d{2,5}[\s.-]?\d{3,5}(?!\d)/gu,
    valid: (m, after, before) => {
      const d = m.replace(/\D/g, "");
      if (d.length < 9 || d.length > 15) return false;
      if (AMOUNT_AFTER.test(after) || /[$€£₦¥]\s*$/.test(before)) return false; // 120 000 000 naira
      if (/^(?:19|20)\d\d[\s.-](?:19|20)\d\d/.test(m)) return false; // 2019-2024
      if (/\b(?:qty|quantity|flight|flt)\s*[A-Z]{0,3}\s*$/i.test(before)) return false;
      return true;
    } },
  // Order and booking numbers: keeps the keyword visible and masks only the ID itself.
  { type: "ORDER",
    re: /(#\s?|\b(?:order|ref(?:erence)?|booking|ticket|case|invoice|tracking|shipment|parcel|claim)\s*(?:no\.?|number|#|id|code)?\s*(?:is\s*)?[:#]?\s*)((?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{4,})/gi,
    group: 2, validGroup: (v) => !/^\d{4}-\d{2}-\d{2}$/.test(v) },
  { type: "ADDRESS", re: /\b[Pp]\.?\s?[Oo]\.?\s?[Bb]ox\s+\d+\b/g },
  { type: "ADDRESS",
    re: new RegExp(`(?:\\b(?:${UNIT})\\.?\\s*#?\\s*[A-Z0-9-]+,?\\s+)?(?:\\b[Nn]o\\.?\\s*)?\\b\\d{1,5}[A-Z]?(?:-\\d{1,5})?,?\\s+(?:(?:[NSEW]|north|south|east|west)\\.?\\s+)?(?:[\\p{L}\\p{N}'.-]+\\s+){0,3}?(?:${STREET})\\b\\.?(?:\\s+(?:NW|NE|SW|SE|N|S|E|W)\\b)?(?:,?\\s*(?:${UNIT})\\.?\\s*#?\\s*[A-Z0-9-]+)?`, "giu"),
    valid: (m) => !/\b(?:the|a|an|on|in|at|to|of|for|and|or|my|your|our|minutes?|hours?|days?|weeks?|months?|years?|times?|items?|people|calls?|emails?)\b/i.test(m.replace(/^\S+\s+/, "").replace(new RegExp(`\\s+(?:${STREET})\\b.*$`, "i"), "")) },
  { type: "ADDRESS", re: new RegExp(`\\b(?:${UNIT})\\.?\\s*#?\\s*\\d+[A-Z]?\\b`, "gi") },
  { type: "POSTCODE", re: /\b[A-Za-z]{2}\s\d{5}(?:-\d{4})?\b/g, valid: (m) => STATES.has(m.slice(0, 2).toUpperCase()) }, // US state + ZIP
  { type: "POSTCODE", re: /\b[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\s?\d[ABCEGHJ-NPRSTV-Z]\d\b/gi }, // Canada
  { type: "POSTCODE", re: /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/gi, valid: (m) => !/\d\s?[KMGT]B$/i.test(m) }, // UK, not "8GB"
];
const STATES = new Set("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" "));

function luhn(digits) {
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = +digits[i];
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

// ---------- names ----------
const WORD_UP = `\\p{Lu}[${L}'’-]*[${L}]`; // Sarah, O'Brien, Nwosu-Eze, Adébáyọ̀
const NAME_UP = `${WORD_UP}(?:[ ]${WORD_UP}){0,3}`;
const WORD_ANY = `[${L}][${L}'’-]*[${L}]`;
const NAME_ANY = `${WORD_ANY}(?:[ ]${WORD_ANY}){0,4}`; // after "my name is" people also type in lowercase or capitals
const TITLES = "Mr|Mrs|Ms|Miss|Mx|Dr|Prof|Chief|Alhaji|Alhaja|Pastor|Rev|Sir|Dame|Madam|Mme|Mlle|Herr|Frau|Señor|Señora|Sr|Sra";
const SIGNOFF = ci("regards|kind regards|best regards|warm regards|best wishes|best|thanks|thank you|thanks again|many thanks|cheers|sincerely|yours sincerely|yours faithfully|yours truly|respectfully|warmly|yours|gracias|merci|danke|obrigado|saludos|cordialement");
const FAMILY = ci("son|daughter|husband|wife|partner|mum|mom|mother|dad|father|brother|sister|friend|kids|kid|children|child|baby|grandson|granddaughter|grandmother|grandfather|boyfriend|girlfriend|fiance|fiancee|fiancé|fiancée|colleague|boss|manager|neighbour|neighbor|niece|nephew|aunt|uncle|cousin");

const NAME_HINTS = [
  { re: new RegExp(`(?:${ci("my name is|my name's|me llamo|mi nombre es|je m'appelle|je suis|ich bin|ich heiße|soy|name is|name:|acc name|account name|beneficiary|first name is|first name|last name is|last name|surname is|surname|full name is|full name|under the name|account holder is|account holder|account name is|account name|cardholder")})\\s*[:-]?\\s*(${NAME_ANY})`, "gu"), any: true },
  { re: new RegExp(`(?:${ci("i'm|i’m|i am|this is|it's|it’s|im")})\\s+(${NAME_UP})`, "gu") },
  { re: new RegExp(`(?:^|[\\n.!,][ \\t]*|\\b${ci("hi|hello|hey")}[,!]?[ \\t]+)(${NAME_UP})[ \\t]+${ci("here")}\\b`, "gu") },
  { re: new RegExp(`\\b(?:${TITLES})\\.?\\s+(${NAME_UP})`, "gu"), title: true },
  { re: new RegExp(`^[ \\t]*${ci("from")}:[ \\t]*["']?(${NAME_UP})`, "gmu") },
  { re: new RegExp(`^[ \\t]*[-–—~][ \\t]*(${NAME_UP})[ \\t]*$`, "gmu") },
  { re: new RegExp(`^[ \\t]*(?:${SIGNOFF})[ \\t]*(?:[,!.][ \\t]*)?(?:\\n[ \\t]*)?(?:(?:${TITLES})\\.?[ \\t]+)?(${NAME_UP})[ \\t]*(?:[.!][ \\t]*)?$`, "gmu") },
  { re: new RegExp(`\\b${ci("my|our")}\\s+(?:${FAMILY})\\s+(${NAME_UP}(?:(?:,\\s*|\\s+${ci("and")}\\s+)${WORD_UP})*)`, "gu"), list: true },
];

// Words that look like names after "I'm", "this is" or on a last line, but are not.
export const NOT_NAMES = new Set(`hi hello hey dear thanks thank regards customer support team sir madam service
monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december
really so very not just still also now here there back fine okay ok sure done the a an your their our my this that
sorry furious angry upset annoyed disappointed frustrated happy unhappy pleased glad worried concerned confused tired desperate
urgent writing calling contacting trying waiting asking following hoping going getting having looking reaching emailing
canadian british american nigerian indian english french german chinese irish scottish welsh african european
order cancelled canceled family refund account card visa mastercard amex payment delivery parcel booking flight hotel
please help urgent asap again today tomorrow yesterday everyone all none nobody someone`.split(/\s+/));

const isName = (n) => {
  const words = n.split(" ");
  return n.length > 1 && !NOT_NAMES.has(words[0].toLowerCase()) && !words.every((w) => NOT_NAMES.has(w.toLowerCase()));
};
// Drop trailing words that are clearly not part of the name ("sarah jones and" -> "sarah jones").
const trimName = (n) => {
  const w = n.trim().split(/\s+/);
  while (w.length > 1 && NOT_NAMES.has(w[w.length - 1].toLowerCase())) w.pop();
  return w.join(" ");
};

export function heuristicNames(text) {
  const out = new Set();
  // A bare sign-off: last non-empty line is 1 to 3 capitalised words, e.g. "Priya Patel".
  const last = text.trim().split("\n").pop().trim().replace(/[.,!]$/, "");
  if (last.length > 80) return heuristicHints(text, out);
  if (new RegExp(`^(?:(?:${TITLES})\\.?\\s+)?${NAME_UP}$`, "u").test(last)) {
    const n = last.replace(new RegExp(`^(?:${TITLES})\\.?\\s+`, "u"), "");
    if (isName(n) && n.split(" ").every((w) => !NOT_NAMES.has(w.toLowerCase()))) out.add(n);
  }
  return heuristicHints(text, out);
}

function heuristicHints(text, out) {
  for (const h of NAME_HINTS) {
    for (const m of text.matchAll(h.re)) {
      const parts = h.list ? m[1].split(new RegExp(`,\\s*|\\s+${ci("and")}\\s+`, "u")) : [m[1]];
      for (let n of parts) {
        n = trimName(n);
        if (h.any && n.split(" ").some((w) => NOT_NAMES.has(w.toLowerCase()))) n = n.split(" ").filter((w) => !NOT_NAMES.has(w.toLowerCase())).join(" ");
        if (n && isName(n)) out.add(n);
      }
    }
  }
  return [...out];
}

const wordRe = (s, flags = "giu") => new RegExp(`${EDGE_L}${escape(s)}${EDGE_R}`, flags);
const TAG_RE = /\[\s*([A-Za-z]+)[\s_-]*(\d+)\s*\]/g;

/**
 * Mask a message.
 * @param {string} text raw customer message
 * @param {{names?: string[], addresses?: string[]}} extra entities found by the on-device model
 * @returns {{masked: string, vault: Record<string,{type:string,value:string}>, counts: Record<string,number>}}
 */
export function mask(text, extra = {}) {
  const vault = {};
  const counts = {};
  const seen = new Map(); // value -> token (same value, same token)
  // A customer who types "[CARD_1]" must not be able to alias a real tag.
  let masked = text.normalize("NFC").replace(TAG_RE, (m, t, n) => `(${t} ${n})`);
  const src = masked;

  const token = (type, value) => {
    const key = `${type}:${value.toLowerCase()}`;
    if (seen.has(key)) return seen.get(key);
    counts[type] = (counts[type] || 0) + 1;
    const t = `[${type}_${counts[type]}]`;
    seen.set(key, t);
    vault[t] = { type, value };
    return t;
  };

  for (const { type, re, valid, group, validGroup } of PATTERNS) {
    masked = masked.replace(re, (...args) => {
      const m = args[0];
      const hasGroups = typeof args[args.length - 1] === "object";
      const str = args[args.length - (hasGroups ? 2 : 1)];
      const offset = args[args.length - (hasGroups ? 3 : 2)];
      if (/\[[A-Z]+_\d+\]/.test(m) && !group) return m; // never re-mask inside a tag
      if (group) {
        const v = args[group];
        if (!v || /^[A-Z]+_\d+$/.test(v) || (validGroup && !validGroup(v.trim()))) return m;
        return args[1] + token(type, v.trim());
      }
      const after = str.slice(offset + m.length, offset + m.length + 12);
      const before = str.slice(Math.max(0, offset - 12), offset);
      return valid && !valid(m, after, before) ? m : token(type, m.trim());
    });
  }

  // Model-found and rule-found names: longest first so "Sarah Jones" wins over "Sarah".
  const lower = src.toLowerCase();
  const names = [...new Set([...(extra.names || []), ...heuristicNames(src)]
    .filter((s) => typeof s === "string")
    .map((s) => trimName(s.normalize("NFC").replace(new RegExp(`^(?:${TITLES})\\.?\\s+`, "u"), "")))
    .filter((s) => s.length > 1 && s.length <= 80 && !/^\[/.test(s) && isName(s) && lower.includes(s.toLowerCase())))]
    .sort((a, b) => b.length - a.length);
  const nameTokens = new Map(); // lowercased name or name part -> token
  for (const n of names) {
    const key = n.toLowerCase();
    const t = nameTokens.get(key) || token("NAME", n);
    nameTokens.set(key, t);
    // Every part of a full name ("Sarah", "Jones") maps to the same person.
    for (const part of n.split(" ")) {
      const k = part.toLowerCase();
      if (part.length > 2 && !NOT_NAMES.has(k) && !nameTokens.has(k)) nameTokens.set(k, t);
    }
  }
  // Replace longest strings first.
  for (const [k, t] of [...nameTokens].sort((a, b) => b[0].length - a[0].length)) {
    masked = masked.replace(wordRe(k), t);
  }
  for (const a of (extra.addresses || []).filter((s) => typeof s === "string").map((s) => s.normalize("NFC").trim()).filter((s) => s.length > 5)) {
    masked = masked.replace(new RegExp(escape(a), "giu"), () => token("ADDRESS", a));
  }

  // Count only tokens that actually appear in the masked text.
  for (const t of Object.keys(vault)) if (!masked.includes(t)) delete vault[t];
  const finalCounts = {};
  for (const { type } of Object.values(vault)) finalCounts[type] = (finalCounts[type] || 0) + 1;
  return { masked, vault, counts: finalCounts };
}

/**
 * Safety net before anything is sent to the cloud: returns every real value from the vault
 * (and every part of a name) that still appears in the prompt. An empty list means the prompt is clean.
 */
export function findLeaks(prompt, vault) {
  const leaks = [];
  const text = prompt.normalize("NFC");
  for (const [tag, { type, value }] of Object.entries(vault)) {
    const probes = type === "NAME" ? [value, ...value.split(" ").filter((p) => p.length > 2 && !NOT_NAMES.has(p.toLowerCase()))] : [value];
    for (const p of probes) {
      const digits = p.replace(/\D/g, "");
      const hit = digits.length >= 7 && type !== "NAME" ? text.replace(/\D/g, " ").replace(/\s+/g, " ").includes(digits) || text.replace(/[\s.-]/g, "").includes(digits) : wordRe(p, "iu").test(text);
      if (hit) { leaks.push({ tag, type }); break; }
    }
  }
  return leaks;
}

const TYPES = "NAME|EMAIL|PHONE|CARD|ORDER|ADDRESS|POSTCODE|ID|ACCOUNT";
/**
 * Put real values back, on this device. Card numbers come back only as their last four digits,
 * and so does any other long number (12+ digits) such as an account or ID.
 * firstName: greet people by first name ("Hi Sarah", not "Hi Sarah Jones").
 */
// Plain words for a detail, used in summaries where the real value isn't needed.
const DESCRIBE = { EMAIL: "‹email›", PHONE: "‹phone number›", CARD: "‹card›", ORDER: "‹order no.›", ADDRESS: "‹address›",
  POSTCODE: "‹postcode›", ID: "‹account no.›", ACCOUNT: "‹bank account›", DOB: "‹date of birth›" };

export function unmask(text, vault, { firstName = false, describe = false } = {}) {
  const restore = (type, n, poss = "") => {
    const T = type.toUpperCase();
    const entry = vault[`[${T}_${n}]`];
    if (!entry) return `[CHECK: ${T.toLowerCase()}]`; // the AI used a tag that isn't in this message
    if (describe && entry.type !== "NAME") return DESCRIBE[entry.type] || "‹detail›";
    const digits = entry.value.replace(/\D/g, "");
    if (entry.type === "CARD") return `card ending in ${digits.slice(-4)}` + poss;
    if (entry.type === "NAME") return (firstName ? entry.value.split(" ")[0] : entry.value) + poss;
    if (entry.type !== "PHONE" && digits.length >= 12) return `ending in ${digits.slice(-4)}` + poss;
    return entry.value + poss;
  };
  let out = text
    // [NAME_1], [ NAME 1 ], [Name_1], [[NAME_1]], [NAME_1's], [NAME_\n1]
    .replace(new RegExp(`\\[{1,2}\\s*(${TYPES})[\\s_-]*(\\d+)\\s*('s)?\\s*\\]{1,2}`, "gi"), (m, t, n, s) => restore(t, n, s || ""))
    // A bare NAME_1 with the brackets dropped.
    .replace(new RegExp(`\\b(${TYPES})_(\\d+)\\b`, "g"), (m, t, n) => restore(t, n));
  // Tags the AI invented, like [TIME_FRAME] or [REFUND AMOUNT], become checks for the agent.
  out = out.replace(/\[(?!CHECK:|AGENT\])([A-Za-z][A-Za-z _-]{2,})\]/g, (m, words) => `[CHECK: ${words.replace(/[_-]/g, " ").toLowerCase().trim()}]`);
  return out.replace(/\bcard\s+card ending in/gi, "card ending in").replace(/\b(?:ending in\s+)+ending in/gi, "ending in");
}

export function totalMasked(counts) {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

function escape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
