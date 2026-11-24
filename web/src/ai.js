// Firebase AI Logic hybrid inference.
// Rule of the app: raw customer text is only ever sent to an ONLY_ON_DEVICE model (for masking).
// Every later call uses masked text, so the SDK may route it to the device or the cloud safely.
import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode, InferenceSource } from "firebase/ai";
import { mask, unmask } from "./pii.js";
import { route } from "./router.js";

const env = import.meta.env;
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};
export const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.appId);
const CLOUD_MODEL = env.VITE_CLOUD_MODEL || "gemini-3.5-flash-lite"; // SDK v13 needs a name whenever inCloudParams is set

let ai = null;
export function initFirebase() {
  if (!isConfigured) return false;
  const app = initializeApp(firebaseConfig);
  // App Check is required by Firebase AI Logic. On localhost a debug token is used:
  // Chrome's console prints it on first run; register it in Firebase console > App Check.
  if (env.DEV) self.FIREBASE_APPCHECK_DEBUG_TOKEN = env.VITE_APPCHECK_DEBUG_TOKEN || true;
  if (env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY) {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  } else {
    console.warn("[ReplyDesk] VITE_RECAPTCHA_ENTERPRISE_SITE_KEY is not set: App Check is off and cloud calls will be rejected.");
  }
  ai = getAI(app, { backend: new GoogleAIBackend() });
  return true;
}

// Tell Chrome we work in English (removes the "no output language" warning and improves quality).
const EN = { expectedInputs: [{ type: "text", languages: ["en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }] };

const entitySchema = {
  type: "object",
  properties: {
    names: { type: "array", items: { type: "string" } },
    addresses: { type: "array", items: { type: "string" } },
  },
  required: ["names", "addresses"],
};
const triageSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    category: { type: "string", enum: ["billing", "delivery", "account", "technical", "travel", "complaint", "other"] },
    sentiment: { type: "string", enum: ["positive", "neutral", "frustrated", "angry"] },
    urgency: { type: "string", enum: ["low", "medium", "high"] },
  },
  required: ["summary", "category", "sentiment", "urgency"],
};

const cache = new Map();
function model(kind, mode) {
  const key = `${kind}:${mode}`;
  if (cache.has(key)) return cache.get(key);
  const schema = kind === "extract" ? entitySchema : kind === "triage" ? triageSchema : null;
  const m = getGenerativeModel(ai, {
    mode: InferenceMode[mode],
    onDeviceParams: { createOptions: EN, ...(schema ? { promptOptions: { responseConstraint: schema } } : {}) },
    inCloudParams: {
      ...(CLOUD_MODEL ? { model: CLOUD_MODEL } : {}),
      ...(schema ? { generationConfig: { responseMimeType: "application/json", responseSchema: schema } } : {}),
    },
  });
  cache.set(key, m);
  return m;
}

const label = (src) => (src === InferenceSource.ON_DEVICE ? "device" : src === InferenceSource.IN_CLOUD ? "cloud" : "unknown");

/** Chrome's own report on the on-device model: available | downloadable | downloading | unavailable | unsupported */
export async function deviceAvailability() {
  if (!("LanguageModel" in self)) return "unsupported";
  try { return await self.LanguageModel.availability(EN); } catch { return "unsupported"; }
}

/** Must run from a click: starts or finishes the Gemini Nano download. */
export async function prepareDevice(onProgress) {
  await model("extract", "ONLY_ON_DEVICE").initializeDeviceModel(onProgress);
}

function parseJSON(text, fallback) {
  try { return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim()); } catch { return fallback; }
}

async function timed(fn) {
  const t0 = performance.now();
  const out = await fn();
  return { ...out, ms: Math.round(performance.now() - t0) };
}

// ---------- the three steps ----------

async function extractEntities(raw) {
  const prompt =
    "List every person's name and every street address in this customer message. " +
    "Return JSON with arrays 'names' and 'addresses'. Copy them exactly as written. " +
    "Do not include company names, product names or the support team.\n\nMessage:\n" + raw;
  return timed(async () => {
    const r = await model("extract", "ONLY_ON_DEVICE").generateContent(prompt);
    return { data: parseJSON(r.response.text(), { names: [], addresses: [] }), source: label(r.response.inferenceSource), prompt: null };
  });
}

async function triage(masked, mode) {
  const prompt =
    "You are a customer-service triage assistant. Text in square brackets like [NAME_1] is a privacy placeholder.\n" +
    "Return JSON: summary (one sentence, max 25 words, keep placeholders as they are), category, sentiment, urgency.\n\n" +
    "Customer message:\n" + masked;
  return timed(async () => {
    const r = await model("triage", mode).generateContent(prompt);
    const data = parseJSON(r.response.text(), { summary: r.response.text().trim(), category: "other", sentiment: "neutral", urgency: "medium" });
    return { data, source: label(r.response.inferenceSource), prompt };
  });
}

async function draft(masked, mode, tone, onText) {
  const prompt =
    "You are a customer service representative replying to the customer message below.\n" +
    `Tone: ${tone}. Acknowledge the issue, say clearly what happens next, and keep it under 140 words.\n` +
    "Text in square brackets like [NAME_1] or [ORDER_1] is a privacy placeholder: copy placeholders exactly, never guess the real value.\n" +
    "Do not invent refunds, dates or policies that are not in the message; write [CHECK: ...] where the agent must look something up.\n" +
    "End the reply with a sign-off line followed by [AGENT] on its own line.\n\n" +
    "Customer message:\n" + masked;
  return timed(async () => {
    const r = await model("draft", mode).generateContentStream(prompt);
    let text = "";
    let src;
    for await (const chunk of r.stream) {
      src ??= chunk.inferenceSource;
      text += chunk.text();
      onText(text);
    }
    const final = await r.response;
    return { text, source: label(final.inferenceSource ?? src), prompt };
  });
}

// Retry a step on the device if the cloud fails (quota, network), as long as the input is masked.
async function withFallback(step, mode, ctx, log) {
  try {
    return await step(mode);
  } catch (err) {
    if (mode !== "ONLY_ON_DEVICE" && ctx.deviceReady) {
      log(`Cloud call failed (${short(err)}), so this step was retried on this device.`);
      return await step("ONLY_ON_DEVICE");
    }
    throw err;
  }
}
const short = (e) => (e?.message || String(e)).split("\n")[0].slice(0, 120);

/**
 * Run the whole ticket.
 * @param {string} raw
 * @param {{policy:"auto"|"local-only", tone:string, agent:string, online:boolean, deviceReady:boolean}} ctx
 * @param {(event: object) => void} on  progress events for the UI
 */
export async function runTicket(raw, ctx, on) {
  const notes = [];
  const log = (n) => { notes.push(n); on({ type: "note", text: n }); };

  // 1. Mask on device. Raw text never goes to the cloud.
  on({ type: "step", step: "mask", state: "running" });
  let entities = { names: [], addresses: [] };
  let maskSource = "local rules";
  let maskMs = 0;
  if (ctx.deviceReady) {
    try {
      const e = await extractEntities(raw);
      entities = e.data;
      maskSource = "device";
      maskMs = e.ms;
    } catch (err) {
      log(`On-device name detection failed (${short(err)}); used pattern rules only.`);
    }
  } else {
    log("No on-device model: names were masked with pattern rules only, so check the masked text before sending.");
  }
  const m = mask(raw, entities);
  on({ type: "step", step: "mask", state: "done", source: maskSource, ms: maskMs, masked: m.masked, counts: m.counts });

  // 2. Decide where the rest runs.
  const r = route(m.masked, ctx);
  on({ type: "route", route: r });
  if (r.target === "blocked") throw new Error(r.why);

  const cloudSaw = [];
  // 3. Triage.
  on({ type: "step", step: "triage", state: "running" });
  const t = await withFallback((mode) => triage(m.masked, mode), r.mode, ctx, log);
  if (t.source === "cloud") cloudSaw.push({ step: "Triage", prompt: t.prompt });
  const triageOut = { ...t.data, summary: unmask(t.data.summary || "", m.vault) };
  on({ type: "step", step: "triage", state: "done", source: t.source, ms: t.ms, data: triageOut });

  // 4. Draft (streamed), unmasked live on this device.
  on({ type: "step", step: "draft", state: "running" });
  const finish = (txt) => unmask(txt, m.vault).replace(/\[AGENT\]/g, ctx.agent || "Customer Support");
  const d = await withFallback((mode) => draft(m.masked, mode, ctx.tone, (txt) => on({ type: "draft", text: finish(txt) })), r.mode, ctx, log);
  if (d.source === "cloud") cloudSaw.push({ step: "Draft reply", prompt: d.prompt });
  on({ type: "step", step: "draft", state: "done", source: d.source, ms: d.ms, reply: finish(d.text) });

  on({ type: "done", cloudSaw, notes });
  return { cloudSaw };
}

/** Used when no AI path is available at all: a safe holding reply, written locally. */
export function holdingReply(agent) {
  return (
    "Hi,\n\nThank you for getting in touch, and I'm sorry for the trouble. I've received your message and I'm " +
    "looking into it now. I'll come back to you with an update as soon as I can.\n\nKind regards,\n" +
    (agent || "Customer Support")
  );
}
