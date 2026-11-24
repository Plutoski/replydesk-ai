// Firebase AI Logic hybrid inference: on-device (Chrome Prompt API / Gemini Nano)
// with automatic fallback to Gemini in the cloud.
import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  InferenceSource,
} from "firebase/ai";

const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

export const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.appId);

let ai = null;

export function initFirebase() {
  if (!isConfigured) return false;
  const app = initializeApp(firebaseConfig);

  // App Check is required for Firebase AI Logic (enforced since Nov 2, 2026).
  // On localhost, use a debug token: it is printed in the console on first run
  // and must be registered in Firebase console > App Check > Manage debug tokens.
  if (import.meta.env.DEV) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = env.VITE_APPCHECK_DEBUG_TOKEN || true;
  }
  if (env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY) {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  } else {
    console.warn("[ReplyDesk] No reCAPTCHA Enterprise site key set; App Check is not initialized.");
  }

  ai = getAI(app, { backend: new GoogleAIBackend() });
  return true;
}

export const MODES = {
  PREFER_ON_DEVICE: InferenceMode.PREFER_ON_DEVICE,
  ONLY_ON_DEVICE: InferenceMode.ONLY_ON_DEVICE,
  PREFER_IN_CLOUD: InferenceMode.PREFER_IN_CLOUD,
  ONLY_IN_CLOUD: InferenceMode.ONLY_IN_CLOUD,
};

const cloudModel = env.VITE_CLOUD_MODEL || undefined; // undefined = SDK default

// JSON schema for the ticket analysis. Used as a constraint on-device and as
// a response schema in the cloud, so both paths return the same shape.
const analysisSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    category: { type: "string", enum: ["billing", "delivery", "account", "technical", "complaint", "other"] },
    sentiment: { type: "string", enum: ["positive", "neutral", "frustrated", "angry"] },
    urgency: { type: "string", enum: ["low", "medium", "high"] },
  },
  required: ["summary", "category", "sentiment", "urgency"],
};

const cache = new Map();

function model(mode, kind) {
  const key = `${mode}:${kind}`;
  if (cache.has(key)) return cache.get(key);

  const hybrid = { mode };
  if (kind === "analysis") {
    hybrid.onDeviceParams = { promptOptions: { responseConstraint: analysisSchema } };
    hybrid.inCloudParams = {
      ...(cloudModel ? { model: cloudModel } : {}),
      generationConfig: { responseMimeType: "application/json", responseSchema: analysisSchema },
    };
  } else if (cloudModel) {
    hybrid.inCloudParams = { model: cloudModel };
  }
  const m = getGenerativeModel(ai, hybrid);
  cache.set(key, m);
  return m;
}

export function sourceLabel(src) {
  if (src === InferenceSource.ON_DEVICE) return "device";
  if (src === InferenceSource.IN_CLOUD) return "cloud";
  return "unknown";
}

/** Must be called from a user gesture (button click). */
export async function initDeviceModel(mode, onProgress) {
  await model(mode, "analysis").initializeDeviceModel(onProgress);
  await model(mode, "draft").initializeDeviceModel(onProgress);
}

/** Chrome's own view of the on-device model, independent of Firebase. */
export async function deviceAvailability() {
  if (!("LanguageModel" in self)) return "unsupported";
  try {
    return await self.LanguageModel.availability();
  } catch {
    return "unsupported";
  }
}

export async function analyzeTicket(mode, message) {
  const prompt =
    `You are a customer-service triage assistant. Read the customer message and return JSON with:\n` +
    `summary (one sentence, max 25 words), category, sentiment, urgency.\n\nCustomer message:\n"""${message}"""`;
  const t0 = performance.now();
  const result = await model(mode, "analysis").generateContent(prompt);
  const ms = Math.round(performance.now() - t0);
  const text = result.response.text();
  let data;
  try {
    data = JSON.parse(text.replace(/^```(json)?|```$/g, "").trim());
  } catch {
    data = { summary: text.trim(), category: "other", sentiment: "neutral", urgency: "medium" };
  }
  return { data, ms, source: sourceLabel(result.response.inferenceSource) };
}

export async function draftReply(mode, message, tone, agentName, onChunk) {
  const prompt =
    `You are ${agentName || "a customer service representative"}. Write a reply to the customer message below.\n` +
    `Tone: ${tone}. Acknowledge the issue, say clearly what happens next, and keep it under 140 words.\n` +
    `Do not invent order numbers, refunds, or policies that are not in the message. ` +
    `Use [placeholders] for anything you would need to look up.\n` +
    `Sign off as ${agentName || "Customer Support"}.\n\nCustomer message:\n"""${message}"""`;
  const t0 = performance.now();
  const result = await model(mode, "draft").generateContentStream(prompt);
  let source;
  let text = "";
  for await (const chunk of result.stream) {
    source ??= chunk.inferenceSource;
    text += chunk.text();
    onChunk(text);
  }
  const final = await result.response;
  source = final.inferenceSource ?? source;
  return { text, ms: Math.round(performance.now() - t0), source: sourceLabel(source) };
}
