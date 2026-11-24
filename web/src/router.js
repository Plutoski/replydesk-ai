// Decides where each ticket's work should run. Pure function, so it's easy to test and explain.
//
//   policy "local-only"  -> everything on this device; the cloud is never called
//   short, simple ticket -> on-device first (the SDK may still fall back to the cloud; input is masked)
//   long or complex      -> cloud first for quality (offline: falls back to the device)

export const LIMITS = { words: 180, questions: 4 };

export function assess(text) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const questions = (text.match(/\?/g) || []).length;
  const isThread = /(^|\n)\s*(>|from:|on .+ wrote:|-----original message-----)/i.test(text);
  const reasons = [];
  if (words > LIMITS.words) reasons.push(`${words} words (over ${LIMITS.words})`);
  if (questions >= LIMITS.questions) reasons.push(`${questions} separate questions`);
  if (isThread) reasons.push("an email thread with earlier replies");
  return { words, questions, isThread, complex: reasons.length > 0, reasons };
}

/**
 * @param {string} text masked or raw text (length is the same either way)
 * @param {{policy: "auto"|"local-only", deviceReady: boolean, online: boolean}} ctx
 */
export function route(text, ctx) {
  const a = assess(text);
  if (ctx.policy === "local-only") {
    if (!ctx.deviceReady) {
      return { ...a, target: "blocked", mode: null, why: "Local-only policy is on, but this device has no on-device model." };
    }
    return { ...a, target: "device", mode: "ONLY_ON_DEVICE", why: "Local-only policy: nothing is allowed to leave this device." };
  }
  if (!ctx.online && !ctx.deviceReady) {
    return { ...a, target: "blocked", mode: null, why: "Offline and no on-device model is available." };
  }
  if (a.complex) {
    return {
      ...a, target: "cloud", mode: "PREFER_IN_CLOUD",
      why: `Complex ticket (${a.reasons.join(", ")}), so Gemini in the cloud drafts it, using masked text only.` +
        (ctx.online ? "" : " You're offline, so the device will handle it instead."),
    };
  }
  return {
    ...a, target: "device", mode: "PREFER_ON_DEVICE",
    why: ctx.deviceReady
      ? "Short, simple ticket, so it stays on this device."
      : "Short ticket, but this device can't run the on-device model, so the cloud handles it using masked text only.",
  };
}
