// TEST ONLY: stands in for Firebase so the UI and the ticket flow can be checked without a network.
// Never used by the app build. It follows the routing rules of the real SDK for each inference mode.
export const initializeApp = () => ({});
export const initializeAppCheck = () => ({});
export class ReCaptchaEnterpriseProvider {}
export class GoogleAIBackend {}
export const getAI = () => ({});
export const InferenceMode = { PREFER_ON_DEVICE: "prefer_on_device", ONLY_ON_DEVICE: "only_on_device", PREFER_IN_CLOUD: "prefer_in_cloud", ONLY_IN_CLOUD: "only_in_cloud" };
export const InferenceSource = { ON_DEVICE: "on_device", IN_CLOUD: "in_cloud" };

// Tests can inspect every prompt and flip failures on and off.
export const calls = [];
export const sim = { deviceFails: false, cloudFails: false, delay: 0 };
if (typeof self !== "undefined" && !("LanguageModel" in self)) self.LanguageModel = { availability: async () => "available" };

const where = (mode) => {
  if (mode === "only_on_device") return "on_device";
  if (mode === "only_in_cloud") return "in_cloud";
  if (mode === "prefer_on_device") return sim.deviceFails ? "in_cloud" : "on_device";
  return sim.cloudFails ? "on_device" : "in_cloud";
};
const wait = () => new Promise((r) => setTimeout(r, sim.delay));

export function getGenerativeModel(_, p) {
  const resp = (text, src) => ({ text: () => text, inferenceSource: src });
  const go = (prompt) => {
    const src = where(p.mode);
    if (src === "on_device" && sim.deviceFails) throw new Error("device model crashed (simulated)");
    if (src === "in_cloud" && sim.cloudFails) throw new Error("503 Service Unavailable (simulated)");
    calls.push({ mode: p.mode, src, prompt });
    return src;
  };
  return {
    initializeDeviceModel: async () => {},
    generateContent: async (prompt) => {
      await wait();
      const src = go(prompt);
      if (prompt.startsWith("Find personal names")) {
        const msg = prompt.split("<<<\n")[1] || "";
        const names = ["Marcus Bell", "Leo", "Priya Patel", "Tunde Bakare", "Sarah Jones"].filter((n) => msg.includes(n));
        return { response: resp(JSON.stringify({ names, addresses: [] }), src) };
      }
      return { response: resp(JSON.stringify({ summary: "[NAME_1] was charged twice and wants the duplicate refunded.", category: "billing", sentiment: "frustrated", urgency: "high" }), src) };
    },
    generateContentStream: async (prompt) => {
      await wait();
      const src = go(prompt);
      const text = "Hi [NAME_1],\n\nI'm sorry you were charged twice. I've flagged the duplicate payment on your card [CARD_1] for order [ORDER_1], and the refund will be processed within [CHECK: refund timeframe].\n\nKind regards,\n[AGENT]";
      const parts = text.match(/.{1,25}/gs);
      async function* stream() { for (const t of parts) yield resp(t, src); }
      return { stream: stream(), response: Promise.resolve(resp(text, src)) };
    },
  };
}
