// TEST ONLY: stands in for Firebase so the UI can be checked without a network. Never used by the app build.
export const initializeApp = () => ({});
export const initializeAppCheck = () => ({});
export class ReCaptchaEnterpriseProvider {}
export class GoogleAIBackend {}
export const getAI = () => ({});
export const InferenceMode = { PREFER_ON_DEVICE: "prefer_on_device", ONLY_ON_DEVICE: "only_on_device", PREFER_IN_CLOUD: "prefer_in_cloud", ONLY_IN_CLOUD: "only_in_cloud" };
export const InferenceSource = { ON_DEVICE: "on_device", IN_CLOUD: "in_cloud" };
const src = (mode) => (mode === "prefer_in_cloud" ? "in_cloud" : "on_device");
export function getGenerativeModel(_, p) {
  const resp = (text) => ({ text: () => text, inferenceSource: src(p.mode) });
  return {
    initializeDeviceModel: async () => {},
    generateContent: async (prompt) => {
      await new Promise((r) => setTimeout(r, 300));
      if (prompt.startsWith("List every")) return { response: resp(JSON.stringify({ names: ["Marcus Bell", "Leo"], addresses: [] })) };
      return { response: resp(JSON.stringify({ summary: "[NAME_1] was charged twice and wants the duplicate refunded.", category: "billing", sentiment: "frustrated", urgency: "high" })) };
    },
    generateContentStream: async () => {
      const text = "Hi [NAME_1],\n\nI'm sorry you were charged twice. I can see why that's stressful. I've flagged the duplicate payment on your card [CARD_1] for order [ORDER_1], and the refund will be processed within [CHECK: refund timeframe].\n\nKind regards,\n[AGENT]";
      const parts = text.match(/.{1,25}/gs);
      async function* stream() { for (const t of parts) { await new Promise((r) => setTimeout(r, 30)); yield resp(t); } }
      return { stream: stream(), response: Promise.resolve(resp(text)) };
    },
  };
}
