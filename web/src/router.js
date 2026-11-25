// Decides where each ticket's work should run. Pure function, so it's easy to test and explain.
//
//   policy "local-only"        -> everything on this device; the cloud is never called
//   offline + on-device model  -> everything on this device
//   short, simple ticket       -> on-device first (PREFER_ON_DEVICE)
//   no on-device model         -> cloud, masked text only, after the agent approves it
//   long or complex ticket     -> cloud first for quality (PREFER_IN_CLOUD), masked text only

export const LIMITS = { words: 180, questions: 4 };

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;

export function assess(text) {
  // Chinese, Japanese and Korean have no spaces, so each character counts as a word.
  const cjk = (text.match(CJK) || []).length;
  const words = text.replace(CJK, " ").trim().split(/\s+/).filter(Boolean).length + cjk;
  // Question marks inside links don't count; full-width ones do.
  const questions = (text.replace(/\bhttps?:\/\/\S+/gi, "").match(/[?？]/g) || []).length;
  const isThread = /^[ \t]*(?:>|from:[ \t]|on [^\n]{1,200} wrote:|-{2,}[ \t]*original message)/im.test(text);
  const reasons = [];
  if (words > LIMITS.words) reasons.push(`${words} words (over ${LIMITS.words})`);
  if (questions >= LIMITS.questions) reasons.push(`${questions} separate questions`);
  if (isThread) reasons.push("an email thread with earlier replies");
  return { words, questions, isThread, complex: reasons.length > 0, reasons };
}

/**
 * Returns where the work will really run, so the UI never contradicts itself.
 * @param {string} text masked or raw text
 * @param {{policy: "auto"|"local-only", deviceReady: boolean, online: boolean}} ctx
 * @returns {{target: "device"|"cloud"|"blocked", mode: string|null, why: string}}
 */
export function route(text, ctx) {
  const a = assess(text);
  if (ctx.policy === "local-only") {
    if (!ctx.deviceReady) {
      return { ...a, target: "blocked", mode: null, why: "Local-only policy is on, but this device has no on-device model, so nothing was sent anywhere." };
    }
    return { ...a, target: "device", mode: "ONLY_ON_DEVICE", why: "Local-only policy: nothing is allowed to leave this device." };
  }
  if (!ctx.online) {
    if (!ctx.deviceReady) return { ...a, target: "blocked", mode: null, why: "Offline, and this device has no on-device model." };
    return {
      ...a, target: "device", mode: "ONLY_ON_DEVICE",
      why: a.complex
        ? `Complex ticket (${a.reasons.join(", ")}), but you're offline, so this device handles every step.`
        : "You're offline, so this device handles every step.",
    };
  }
  if (!ctx.deviceReady) {
    return {
      ...a, target: "cloud", mode: "ONLY_IN_CLOUD",
      why: "This device can't run the on-device model, so Gemini in the cloud handles it, using masked text only.",
    };
  }
  if (a.complex) {
    return {
      ...a, target: "cloud", mode: "PREFER_IN_CLOUD",
      why: `Complex ticket (${a.reasons.join(", ")}), so Gemini in the cloud drafts it, using masked text only.`,
    };
  }
  return { ...a, target: "device", mode: "PREFER_ON_DEVICE", why: "Short, simple ticket, so it stays on this device." };
}
