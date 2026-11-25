// Measures how well the pattern rules mask personal details on their own (the worst case: no on-device model).
// Run with: npm run eval
import { mask } from "../src/pii.js";
import { CORPUS, FP } from "./privacy-corpus.mjs";

const GROUPS = { ph: "Phone numbers", em: "Emails", cd: "Card numbers", bk: "Bank details", id: "ID numbers", rf: "References and IPs", ad: "Addresses", nm: "Names" };

export function evaluate() {
  const rows = {};
  let total = 0, caught = 0, msgs = 0, cleanMsgs = 0, high = 0, highCaught = 0;
  for (const c of CORPUS) {
    const { masked } = mask(c.text);
    const g = GROUPS[c.id.split("-")[0]] || "Other";
    rows[g] ??= { details: 0, masked: 0 };
    let clean = true;
    for (const [secret, sev] of c.secrets) {
      const ok = !masked.includes(secret);
      rows[g].details++; total++;
      if (ok) { rows[g].masked++; caught++; } else clean = false;
      if (sev === "H") { high++; if (ok) highCaught++; }
    }
    msgs++; if (clean) cleanMsgs++;
  }
  const fpKept = FP.filter((t) => mask(t).masked === t).length;
  return { rows, total, caught, msgs, cleanMsgs, high, highCaught, fp: FP.length, fpKept };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = evaluate();
  const pct = (a, b) => `${Math.round((a / b) * 100)}%`;
  console.log("\nReplyDesk privacy evaluation: pattern rules only (no on-device model)\n");
  console.log("Type                 Details  Masked");
  for (const [g, v] of Object.entries(r.rows)) console.log(`${g.padEnd(20)} ${String(v.details).padStart(7)}  ${pct(v.masked, v.details).padStart(6)}`);
  console.log(`\nAll details          ${String(r.total).padStart(7)}  ${pct(r.caught, r.total).padStart(6)}`);
  console.log(`High-risk details    ${String(r.high).padStart(7)}  ${pct(r.highCaught, r.high).padStart(6)}`);
  console.log(`Messages fully masked: ${r.cleanMsgs} of ${r.msgs} (${pct(r.cleanMsgs, r.msgs)})`);
  console.log(`Ordinary text left alone (prices, dates, product codes): ${r.fpKept} of ${r.fp}\n`);
  console.log("With Gemini Nano or Apple's on-device model, names and addresses are also found by the model.");
  console.log("Without it, ReplyDesk asks the agent to check the masked text before anything goes to the cloud.\n");
}
