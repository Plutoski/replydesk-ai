import { initFirebase, isConfigured, deviceAvailability, prepareDevice, runTicket, holdingReply, MAX_CHARS } from "./ai.js";

const $ = (id) => document.getElementById(id);

// Fictional sample tickets.
const SAMPLES = {
  billing:
    "Hi, my name is Sarah Jones. I've been charged twice for my monthly plan, two payments of $29.99 on the same day, on my Visa 4111 1111 1111 1111. Order #A7731920. Please refund the extra charge, money is tight right now. You can reach me on +1 (403) 555-0198.\n\nThanks,\nSarah",
  delivery:
    "Hello, I ordered a birthday present for my son Leo on the 12th and paid for express shipping. Tracking number TRK88231045 hasn't updated in four days and his party is on Saturday. Delivery address is 1420 Elbow Drive SW, Calgary T2S 2N4. Can someone tell me what's going on?\n\nRegards,\nMarcus Bell",
  travel:
    "I'm Tunde Bakare. Booking reference ABX49213, my flight to London was cancelled this morning and nobody at the airport can help. I need to know if I can be rebooked tomorrow or get a refund. Email me at tunde.b@example.com or call 07700 900123.",
  thread:
    "Hi again, this is the third time I'm writing about this.\n\n" +
    "Account ACCT-558120. I moved house last month to 88 Riverside Crescent NW, Calgary T3A 0B2 and updated my address online, but my new bank card still went to my old address. Then I got an email saying my account was locked because of 'unusual activity', which was me logging in from the new place. When I called, I waited 50 minutes and the call dropped.\n\n" +
    "So my questions: Has my address actually been updated? Why was my account locked and is it unlocked now? Where is my new card, and has the old one been cancelled? Will I be charged the late fee on my bill, since I couldn't log in to pay? And can someone please call me back instead of me waiting on hold again?\n\n" +
    "My number is (587) 555-0142 and my email is priya.patel@example.com.\n\n" +
    "> On Nov 18, Support wrote:\n> Thanks for contacting us. Your request has been received and a member of the team will respond within 48 hours.\n\n" +
    "It has been more than 48 hours.\n\nPriya Patel",
};

const state = { deviceReady: false, busy: false, tickets: 0, localSteps: 0, steps: 0, pii: 0, checked: 0, rawSent: 0 };
const ready = initFirebase();
if (!isConfigured) $("setup-warning").hidden = false;

// ---------- status ----------
function updateNet() {
  const on = navigator.onLine;
  $("pill-net").textContent = on ? "Online" : "Offline";
  $("pill-net").className = "pill " + (on ? "ok" : "warn");
}
addEventListener("online", updateNet);
addEventListener("offline", updateNet);
updateNet();

async function updateDevice() {
  const a = await deviceAvailability();
  state.deviceReady = a === "available";
  const pill = $("pill-device");
  const text = {
    available: ["On-device AI ready", "ok"],
    downloadable: ["On-device AI: not downloaded", "warn"],
    downloading: ["On-device AI: downloading…", "warn"],
    unavailable: ["No on-device AI here: cloud only", "muted"],
    unsupported: ["No on-device AI in this browser: cloud only", "muted"],
  }[a] || [`On-device AI: ${a}`, "muted"];
  pill.textContent = text[0];
  pill.className = "pill " + text[1];

  const banner = $("device-banner");
  if (a === "downloadable" || a === "downloading") {
    banner.hidden = false;
    $("btn-init").hidden = false;
    $("device-banner-text").textContent = "Download Gemini Nano (about 4 GB, once) so customer messages can be processed on this computer.";
  } else if (a === "unavailable" || a === "unsupported") {
    banner.hidden = false;
    $("btn-init").hidden = true;
    $("device-banner-text").textContent =
      "This browser can't run the on-device model. ReplyDesk will mask details with pattern rules and ask you before any masked text goes to Gemini in the cloud. For full on-device privacy, use desktop Chrome with Gemini Nano.";
  } else {
    banner.hidden = true;
  }
}
updateDevice();

$("btn-init").addEventListener("click", async () => {
  const b = $("btn-init");
  if (b.disabled) return;
  b.disabled = true;
  $("progress").hidden = false;
  try {
    await prepareDevice((p) => ($("progress-bar").style.width = Math.round(p * 100) + "%"));
  } catch (e) {
    showError(e);
  }
  $("progress").hidden = true;
  b.disabled = false;
  updateDevice();
});

// ---------- helpers ----------
function showError(err) {
  const el = $("error");
  if (!err) return (el.hidden = true);
  let msg = err?.message || String(err);
  if (/app.?check|attestation|PERMISSION_DENIED|403/i.test(msg)) {
    console.warn("[ReplyDesk] App Check rejected the request. On localhost, register the debug token printed in this console (Firebase console → App Check → Manage debug tokens).");
    msg = "The cloud request was rejected by App Check. A safe holding reply was written instead.";
  }
  el.textContent = msg;
  el.hidden = false;
}

const BADGE = { device: ["On device", "device"], cloud: ["Cloud · Gemini", "cloud"], "local rules": ["On device · rules", "device"], unknown: ["Unknown", "muted"] };

function setStep(step, { state: s, source, ms, label }) {
  const li = document.querySelector(`[data-step="${step}"]`);
  li.className = s || "";
  const b = li.querySelector(".badge");
  if (s === "running") { b.textContent = "…"; b.className = "badge muted"; return; }
  if (label) { b.textContent = label; b.className = "badge " + (source || "muted"); return; }
  if (source) {
    const [t, c] = BADGE[source] || BADGE.unknown;
    b.textContent = ms ? `${t} · ${(ms / 1000).toFixed(1)}s` : t;
    b.className = "badge " + c;
  }
}

function resetSteps() {
  document.querySelectorAll("#steps li").forEach((li) => { li.className = ""; li.querySelector(".badge").textContent = ""; li.querySelector(".badge").className = "badge"; });
  $("route-why").textContent = "Simple tickets stay on device; complex ones use the cloud, masked.";
  $("triage").hidden = true;
  $("notes").innerHTML = "";
  $("check-hint").hidden = true;
  setReceipt("Working…", "");
}

function setReceipt(html, cls) {
  const el = $("receipt");
  el.className = "receipt " + cls;
  el.innerHTML = html;
}

function highlightTokens(text) {
  const esc = text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  return esc.replace(/\[[A-Z]+_\d+\]/g, (t) => `<mark>${t}</mark>`);
}

function renderTriage({ summary, category, sentiment, urgency }) {
  const el = $("triage");
  el.hidden = false;
  el.replaceChildren();
  const p = document.createElement("p");
  p.textContent = summary;
  const tags = document.createElement("div");
  tags.className = "tags";
  for (const [text, cls] of [[category, ""], [sentiment, `s-${sentiment}`], [`${urgency} urgency`, `u-${urgency}`]]) {
    const t = document.createElement("span");
    t.className = "tag";
    if (cls) t.classList.add(cls);
    t.textContent = text;
    tags.append(t);
  }
  el.append(p, tags);
}

function renderCloudSaw(list, policyLocal) {
  const el = $("cloud-saw");
  el.classList.remove("empty");
  if (!list.length) {
    el.innerHTML = `<div class="nothing">✓ Nothing left this device${policyLocal ? " (local-only policy)" : ""}.</div>`;
    return;
  }
  el.innerHTML = list
    .map((c, i) => `<details${i === 0 ? " open" : ""}><summary>${c.step}: masked prompt sent to Gemini</summary><pre>${highlightTokens(c.prompt)}</pre></details>`)
    .join("");
}

function renderReceipt(r) {
  if (!r.prompts) {
    setReceipt(`✓ Cloud saw nothing. Every step ran on this device. <a href="#cloud-saw">Details</a>`, "local");
  } else {
    setReceipt(
      `☁ Cloud saw ${r.prompts} masked prompt${r.prompts > 1 ? "s" : ""} · ${r.tags} tag${r.tags === 1 ? "" : "s"} · ` +
      `${r.rawSent} real details (${r.checked} prompt${r.checked > 1 ? "s" : ""} checked before sending). <a href="#cloud-saw">See exactly what</a>`,
      "cloud"
    );
  }
}

function updateStats(counts, receipt) {
  state.tickets++;
  state.pii += Object.values(counts).reduce((a, b) => a + b, 0);
  if (receipt) { state.checked += receipt.checked; state.rawSent += receipt.rawSent; }
  $("stat-tickets").textContent = state.tickets;
  $("stat-pii").textContent = state.pii;
  $("stat-device").textContent = state.steps ? Math.round((state.localSteps / state.steps) * 100) + "%" : "–";
  $("stat-cloud").textContent = state.rawSent;
  $("stat-cloud-label").textContent = `raw details sent to the cloud (${state.checked} cloud prompt${state.checked === 1 ? "" : "s"} checked)`;
}

// The agent sees the masked text and decides. Resolves true (send) or false (keep on device).
function confirmCloud(masked, why) {
  return new Promise((resolve) => {
    $("confirm-why").textContent = why;
    $("confirm-text").innerHTML = highlightTokens(masked);
    $("confirm").hidden = false;
    $("confirm").scrollIntoView({ behavior: "smooth", block: "center" });
    $("btn-send").focus();
    const done = (v) => { $("confirm").hidden = true; $("btn-send").onclick = $("btn-keep").onclick = null; resolve(v); };
    $("btn-send").onclick = () => done(true);
    $("btn-keep").onclick = () => done(false);
  });
}

// ---------- samples and input ----------
document.querySelectorAll("[data-sample]").forEach((b) =>
  b.addEventListener("click", () => {
    $("message").value = SAMPLES[b.dataset.sample];
    document.querySelectorAll("[data-sample]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    updateCount();
  })
);
function updateCount() { $("char-count").textContent = $("message").value.length.toLocaleString(); }
$("message").addEventListener("input", updateCount);
$("message").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); run(); } });

// ---------- run ----------
$("btn-run").addEventListener("click", run);

async function run() {
  if (state.busy) return; // one ticket at a time
  const btn = $("btn-run");
  if (!ready) return showError(new Error("Configure Firebase first (see the banner)."));
  const raw = $("message").value.trim();
  if (!raw) return showError(new Error("Paste a customer message first, or pick a sample above."));
  if (raw.length > MAX_CHARS) return showError(new Error(`That message is over ${MAX_CHARS.toLocaleString()} characters. Paste the latest part of the thread.`));

  state.busy = true;
  btn.disabled = true;
  btn.textContent = "Working…";
  showError(null);
  resetSteps();
  $("draft").value = "";
  $("draft").readOnly = true;
  $("draft-status").textContent = "";
  if (innerWidth < 900) $("steps").scrollIntoView({ behavior: "smooth", block: "start" });
  await updateDevice();

  let counts = {};
  let receipt = null;
  const sent = []; // cloud prompts, recorded as they happen
  const policyLocal = $("policy").checked;

  try {
    const out = await runTicket(
      raw,
      {
        policy: policyLocal ? "local-only" : "auto",
        tone: $("tone").value,
        agent: $("agent").value.trim(),
        online: navigator.onLine,
        deviceReady: state.deviceReady,
        drill: $("drill").value,
        confirmCloud,
      },
      (e) => {
        if (e.type === "step") {
          setStep(e.step, e);
          if (e.state === "done") {
            state.steps++;
            if (e.source === "device" || e.source === "local rules") state.localSteps++;
          }
          if (e.step === "mask" && e.state === "done") {
            counts = e.counts;
            $("masked").classList.remove("empty");
            $("masked").innerHTML = highlightTokens(e.masked);
          }
          if (e.step === "triage" && e.state === "done") renderTriage(e.data);
          if (e.step === "draft" && e.state === "done") {
            $("draft").value = e.reply;
            $("check-hint").hidden = !/\[CHECK:/i.test(e.reply);
          }
        } else if (e.type === "route") {
          const r = e.route;
          $("route-why").textContent = r.why;
          setStep("route", { state: "done", label: r.target === "device" ? "Device" : r.target === "cloud" ? "Cloud" : "Blocked", source: r.target === "cloud" ? "cloud" : r.target === "device" ? "device" : "muted" });
        } else if (e.type === "draft") {
          $("draft").value = e.text;
        } else if (e.type === "fallback") {
          setStep("route", { state: "done", label: e.to === "device" ? "Cloud → device" : "Device → cloud", source: e.to === "device" ? "device" : "cloud" });
        } else if (e.type === "cloud") {
          sent.push({ step: e.step, prompt: e.prompt });
        } else if (e.type === "note") {
          const li = document.createElement("li");
          li.textContent = e.text;
          $("notes").append(li);
        } else if (e.type === "done") {
          renderCloudSaw(e.cloudSaw, policyLocal);
          renderReceipt(e.receipt);
        }
      }
    );
    receipt = out.receipt;
    $("draft-status").textContent = "Draft ready.";
  } catch (err) {
    if (!err?.kept) showError(err);
    if (!$("draft").value) {
      $("draft").value = holdingReply($("agent").value.trim());
      const li = document.createElement("li");
      li.textContent = "No AI path was used, so a safe holding reply was written on this device instead.";
      $("notes").append(li);
    }
    renderCloudSaw(sent, policyLocal);
    if (sent.length) setReceipt(`☁ Cloud saw ${sent.length} masked prompt${sent.length > 1 ? "s" : ""} before the error, and no real details. A holding reply was written on this device. <a href="#cloud-saw">See exactly what</a>`, "held");
    else setReceipt("✓ Cloud saw nothing. A holding reply was written on this device.", "held");
    $("draft-status").textContent = "Holding reply ready.";
  } finally {
    updateStats(counts, receipt);
    $("draft").readOnly = false;
    btn.disabled = false;
    btn.textContent = "Mask, triage & draft reply";
    state.busy = false;
  }
}

$("btn-copy").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("draft").value); $("btn-copy").textContent = "Copied ✓"; }
  catch { $("draft").select(); $("btn-copy").textContent = "Press ⌘C"; }
  setTimeout(() => ($("btn-copy").textContent = "Copy"), 1500);
});
