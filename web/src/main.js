import {
  initFirebase,
  isConfigured,
  MODES,
  initDeviceModel,
  deviceAvailability,
  analyzeTicket,
  draftReply,
} from "./ai.js";

const $ = (id) => document.getElementById(id);

const SAMPLES = {
  delivery:
    "Hi, I ordered a birthday present for my son on the 12th and paid for express shipping. It still hasn't arrived and his party is on Saturday. The tracking page hasn't updated in four days. This is really stressful. Can someone tell me what's going on?",
  billing:
    "I've been charged twice for my monthly plan this month, two payments of $29.99 on the same day. I only have one account. Please refund the extra charge as soon as possible, money is tight right now.",
  account:
    "I can't log in to my account. I reset my password twice and it still says invalid credentials, and now it says my account is locked for 24 hours. I need to download my invoices today for my accountant!!",
};

const stats = { device: 0, cloud: 0 };
const ready = initFirebase();
if (!isConfigured) $("setup-warning").hidden = false;

// ---------- status pills ----------
function updateNet() {
  const on = navigator.onLine;
  $("pill-net").textContent = on ? "Online" : "Offline";
  $("pill-net").className = "pill " + (on ? "ok" : "warn");
}
window.addEventListener("online", updateNet);
window.addEventListener("offline", updateNet);
updateNet();

async function updateDevice() {
  const a = await deviceAvailability();
  const map = {
    available: ["On-device model ready", "ok"],
    downloadable: ["On-device model: not downloaded", "warn"],
    downloading: ["On-device model downloading…", "warn"],
    unavailable: ["On-device model unavailable: using cloud", "muted"],
    unsupported: ["This browser has no on-device model: using cloud", "muted"],
  };
  const [text, cls] = map[a] || [`On-device: ${a}`, "muted"];
  $("pill-device").textContent = text;
  $("pill-device").className = "pill " + cls;
  $("btn-init").hidden = a === "available" || a === "unsupported" || a === "unavailable";
}
updateDevice();

// ---------- helpers ----------
const mode = () => MODES[$("mode").value];

function showError(err) {
  const e = $("error");
  if (!err) return (e.hidden = true);
  let msg = err?.message || String(err);
  if (/app.?check|attestation|403|PERMISSION_DENIED/i.test(msg))
    msg += " → Check App Check: register your debug token (localhost) or reCAPTCHA key (deployed).";
  if (/only_on_device|on-device model is not available/i.test(msg))
    msg += " → The on-device model isn't ready. Click “Enable on-device AI” or switch mode.";
  e.textContent = msg;
  e.hidden = false;
}

function badge(el, source, ms) {
  el.hidden = false;
  el.className = "badge " + source;
  el.textContent = (source === "device" ? "On this device" : source === "cloud" ? "Cloud · Gemini" : "Unknown") + ` · ${ms} ms`;
}

function record(step, source, ms) {
  if (source === "device") stats.device++;
  else if (source === "cloud") stats.cloud++;
  $("stat-device").textContent = stats.device;
  $("stat-cloud").textContent = stats.cloud;
  const total = stats.device + stats.cloud;
  $("stat-private").textContent = total ? Math.round((stats.device / total) * 100) + "%" : "–";
  const li = document.createElement("li");
  const time = new Date().toLocaleTimeString();
  li.innerHTML = `<span class="dot ${source}"></span><b>${step}</b> ran ${
    source === "device" ? "on this device" : source === "cloud" ? "in the cloud" : "(source unknown)"
  } in ${ms} ms <time>${time}</time> <em>mode: ${$("mode").value.toLowerCase()} · ${navigator.onLine ? "online" : "offline"}</em>`;
  $("log").prepend(li);
}

function renderAnalysis({ summary, category, sentiment, urgency }) {
  const el = $("analysis");
  el.classList.remove("empty");
  el.innerHTML = `
    <p class="summary"></p>
    <div class="tags">
      <span class="tag cat"></span>
      <span class="tag sent-${sentiment}"></span>
      <span class="tag urg-${urgency}"></span>
    </div>`;
  el.querySelector(".summary").textContent = summary;
  const [c, s, u] = el.querySelectorAll(".tag");
  c.textContent = "Category: " + category;
  s.textContent = "Sentiment: " + sentiment;
  u.textContent = "Urgency: " + urgency;
}

// ---------- actions ----------
document.querySelectorAll("[data-sample]").forEach((b) =>
  b.addEventListener("click", () => ($("message").value = SAMPLES[b.dataset.sample]))
);

$("btn-init").addEventListener("click", async () => {
  if (!ready) return showError(new Error("Configure Firebase first (see the banner)."));
  showError(null);
  const p = $("progress");
  p.hidden = false;
  $("progress-text").textContent = "Preparing on-device model…";
  try {
    await initDeviceModel(mode(), (v) => {
      $("progress-bar").style.width = Math.round(v * 100) + "%";
      $("progress-text").textContent = `Downloading Gemini Nano: ${Math.round(v * 100)}%`;
    });
    $("progress-bar").style.width = "100%";
    $("progress-text").textContent = "On-device model ready";
  } catch (err) {
    showError(err);
  } finally {
    setTimeout(() => (p.hidden = true), 1500);
    updateDevice();
  }
});

$("btn-run").addEventListener("click", async () => {
  if (!ready) return showError(new Error("Configure Firebase first (see the banner)."));
  const message = $("message").value.trim();
  if (!message) return showError(new Error("Paste a customer message first."));
  showError(null);

  const btn = $("btn-run");
  btn.disabled = true;
  btn.textContent = "Working…";
  $("draft").value = "";
  $("badge-analysis").hidden = $("badge-draft").hidden = true;

  try {
    const a = await analyzeTicket(mode(), message);
    renderAnalysis(a.data);
    badge($("badge-analysis"), a.source, a.ms);
    record("Triage", a.source, a.ms);

    const d = await draftReply(mode(), message, $("tone").value, $("agent").value.trim(), (t) => ($("draft").value = t));
    badge($("badge-draft"), d.source, d.ms);
    record("Draft reply", d.source, d.ms);
  } catch (err) {
    showError(err);
  } finally {
    btn.disabled = false;
    btn.textContent = "Analyze & draft reply";
  }
});

$("btn-copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("draft").value);
    $("btn-copy").textContent = "Copied ✓";
  } catch {
    $("draft").select();
    $("btn-copy").textContent = "Press Ctrl+C";
  }
  setTimeout(() => ($("btn-copy").textContent = "Copy reply"), 1500);
});
