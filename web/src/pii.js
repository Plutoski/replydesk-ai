// Local PII masking. Everything in this file runs on the user's machine.
// Layer 1: deterministic patterns (emails, phones, cards, order numbers, postcodes, addresses).
// Layer 2: names found by the on-device model + simple greeting/sign-off heuristics.

const PATTERNS = [
  // Order matters: more specific patterns first.
  { type: "EMAIL", re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
  { type: "CARD", re: /\b(?:\d[ -]?){12,18}\d\b/g, valid: (s) => luhn(s.replace(/\D/g, "")) },
  { type: "PHONE", re: /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)|\d{2,4})[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b/g, valid: (s) => s.replace(/\D/g, "").length >= 9 },
  // Keeps the keyword ("order", "booking reference") visible and masks only the ID itself.
  { type: "ORDER", re: /(#\s?|\b(?:order|ref(?:erence)?|account|acct|booking|ticket|case|invoice|tracking)\s*(?:no\.?|number|#|id)?\s*[:#]?\s*)([A-Z0-9-]*\d[A-Z0-9-]{3,})/gi, group: 2 },
  { type: "ADDRESS", re: /\b\d{1,5}\s+(?:[A-Z][a-z]+\s){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Crescent|Cres|Court|Ct|Place|Pl|Trail|Close|Terrace)\b\.?(?:\s(?:NW|NE|SW|SE))?/g },
  { type: "POSTCODE", re: /\b(?:[A-Z]\d[A-Z]\s?\d[A-Z]\d|[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})\b/g }, // Canada, UK
];

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

// "My name is Sarah Jones", "Regards, Tom", "Thanks,\nPriya Patel", "I'm Ade"
const NAME_HINTS = [
  /\bmy name is\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/g,
  /\b(?:I'm|I am|this is)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)(?=[\s,.!]|$)/g,
  /(?:^|\n)\s*(?:regards|kind regards|best regards|best|thanks|thank you|cheers|sincerely|many thanks)[,!.]?\s*\n?\s*([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s*$/gim,
  /\b(?:my (?:son|daughter|husband|wife|partner|mum|mom|dad|friend))\s+([A-Z][a-z]+)/g,
];
const NOT_NAMES = new Set(["Hi", "Hello", "Thanks", "Regards", "Customer", "Support", "Team", "Sir", "Madam", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "Really", "So", "Very", "Not"]);

export function heuristicNames(text) {
  const out = new Set();
  // A bare sign-off: last non-empty line is 1 to 3 capitalised words, e.g. "Priya Patel".
  const last = text.trim().split("\n").pop().trim().replace(/[.,!]$/, "");
  if (/^[A-Z][a-z]+(?:[ '-][A-Z][a-z]+){0,2}$/.test(last) && !NOT_NAMES.has(last.split(" ")[0])) out.add(last);
  for (const re of NAME_HINTS) {
    for (const m of text.matchAll(re)) {
      const n = m[1].trim();
      if (!NOT_NAMES.has(n.split(" ")[0])) out.add(n);
    }
  }
  return [...out];
}

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
  let masked = text;

  const token = (type, value) => {
    const key = `${type}:${value.toLowerCase()}`;
    if (seen.has(key)) return seen.get(key);
    counts[type] = (counts[type] || 0) + 1;
    const t = `[${type}_${counts[type]}]`;
    seen.set(key, t);
    vault[t] = { type, value };
    return t;
  };

  for (const { type, re, valid, group } of PATTERNS) {
    masked = masked.replace(re, (m, ...g) => {
      if (group) return g[0] + token(type, g[group - 1].trim()); // keep the prefix, mask the ID
      return valid && !valid(m) ? m : token(type, m.trim());
    });
  }

  // Model-found and heuristic entities: longest first so "Sarah Jones" wins over "Sarah".
  const names = [...new Set([...(extra.names || []), ...heuristicNames(text)])]
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && !/^\[/.test(s) && !NOT_NAMES.has(s) && text.includes(s))
    .sort((a, b) => b.length - a.length);
  const done = [];
  for (const n of names) {
    // "Sarah" after "Sarah Jones" reuses the same token instead of creating a new one.
    const parent = done.find((d) => d.split(" ").includes(n));
    const t = parent ? seen.get(`NAME:${parent.toLowerCase()}`) : token("NAME", n);
    done.push(n);
    masked = masked.replace(new RegExp(`\\b${escape(n)}\\b`, "g"), t);
    // Also mask the first name on its own once the full name is known.
    const first = n.split(" ")[0];
    if (first !== n && first.length > 2 && !NOT_NAMES.has(first)) {
      masked = masked.replace(new RegExp(`\\b${escape(first)}\\b(?!_)`, "g"), t);
    }
  }
  for (const a of (extra.addresses || []).map((s) => s.trim()).filter((s) => s.length > 5 && masked.includes(s))) {
    masked = masked.replace(new RegExp(escape(a), "g"), () => token("ADDRESS", a));
  }

  // Count only tokens that actually appear in the masked text.
  for (const t of Object.keys(vault)) if (!masked.includes(t)) delete vault[t];
  const finalCounts = {};
  for (const { type } of Object.values(vault)) finalCounts[type] = (finalCounts[type] || 0) + 1;
  return { masked, vault, counts: finalCounts };
}

/**
 * Put real values back, on this device. Card numbers come back only as their last four digits.
 * firstName: greet people by first name ("Hi Sarah", not "Hi Sarah Jones").
 */
export function unmask(text, vault, { firstName = false } = {}) {
  let out = text.replace(/\[\s*([A-Z]+)_(\d+)\s*\]/g, (m, type, n) => {
    const entry = vault[`[${type}_${n}]`];
    if (!entry) return `[CHECK: ${type.toLowerCase()}]`; // the AI used a tag that isn't in this message
    if (entry.type === "CARD") return `card ending in ${entry.value.replace(/\D/g, "").slice(-4)}`;
    if (entry.type === "NAME" && firstName) return entry.value.split(" ")[0];
    return entry.value;
  });
  // Tags the AI invented, like [TIME_FRAME] or [REFUND AMOUNT], become checks for the agent.
  out = out.replace(/\[(?!CHECK:|AGENT\])([A-Z][A-Z _]{2,})\]/g, (m, words) => `[CHECK: ${words.replace(/_/g, " ").toLowerCase().trim()}]`);
  return out.replace(/\bcard\s+card ending in/gi, "card ending in");
}

export function totalMasked(counts) {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

function escape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
