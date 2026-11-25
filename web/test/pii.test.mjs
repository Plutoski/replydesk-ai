// Run with: npm test   (Node's built-in test runner, no extra packages)
import { test } from "node:test";
import assert from "node:assert/strict";
import { mask, unmask } from "../src/pii.js";
import { route } from "../src/router.js";

const billing = "Hi, my name is Sarah Jones. Charged twice on my Visa 4111 1111 1111 1111. Order #A7731920. Call +1 (403) 555-0198 or email sarah.jones@gmail.com. I live at 1420 Elbow Drive SW, Calgary T2S 2N4.\n\nThanks,\nSarah";

test("masks every kind of personal detail", () => {
  const { masked, counts } = mask(billing);
  for (const leak of ["Sarah", "Jones", "4111", "A7731920", "555-0198", "gmail", "Elbow", "T2S"]) {
    assert.ok(!masked.includes(leak), `leaked: ${leak}`);
  }
  assert.deepEqual(counts, { EMAIL: 1, CARD: 1, PHONE: 1, ORDER: 1, ADDRESS: 1, POSTCODE: 1, NAME: 1 });
});

test("same person gets the same tag", () => {
  const { masked } = mask(billing);
  assert.equal(masked.match(/\[NAME_1\]/g).length, 2);
});

test("bare sign-off names are masked without the on-device model", () => {
  assert.ok(!mask("Where is my card?\n\nPriya Patel").masked.includes("Priya"));
});

test("names found by the on-device model are masked", () => {
  assert.ok(!mask("Please tell Tunde the flight moved.", { names: ["Tunde"] }).masked.includes("Tunde"));
});

test("does not over-mask prices, dates or short numbers", () => {
  const t = "I paid $29.99 on 12/11/2026 and waited 50 minutes. Ticket 55 is fine.";
  assert.equal(mask(t).masked, t);
});

test("unmask restores values; cards only as last four digits", () => {
  const { vault } = mask(billing);
  assert.equal(unmask("Hi [NAME_1], refund to [CARD_1].", vault), "Hi Sarah Jones, refund to card ending in 1111.");
  assert.equal(unmask("your card [CARD_1]", vault), "your card ending in 1111");
  assert.equal(unmask("[PHONE_9]", vault), "[CHECK: phone]");
  assert.equal(unmask("Hi [NAME_1],", vault, { firstName: true }), "Hi Sarah,");
  assert.equal(unmask("within [TIME_FRAME].", vault), "within [CHECK: time frame].");
  assert.equal(unmask("[CHECK: refund date]\n[AGENT]", vault), "[CHECK: refund date]\n[AGENT]");
});

test("routing: simple → device, complex → cloud, local-only → device only", () => {
  const ctx = { policy: "auto", deviceReady: true, online: true };
  assert.equal(route("Where is my parcel?", ctx).mode, "PREFER_ON_DEVICE");
  assert.equal(route("A? B? C? D? E?", ctx).mode, "PREFER_IN_CLOUD");
  assert.equal(route("A? B? C? D? E?", { ...ctx, policy: "local-only" }).mode, "ONLY_ON_DEVICE");
  assert.equal(route("hi", { policy: "local-only", deviceReady: false, online: true }).target, "blocked");
  assert.equal(route("hi", { policy: "auto", deviceReady: false, online: false }).target, "blocked");
});

// ---- regressions found by the stress test (rules only, no on-device model) ----
import { findLeaks } from "../src/pii.js";
import { evaluate } from "./privacy-eval.mjs";

test("names: capitalised intros, accents, titles, sign-offs, family", () => {
  for (const [t, leak] of [
    ["My name is Sarah Jones.", "Sarah"], ["Hi, Tunde here.", "Tunde"], ["Regards,\nMr. Adebayo", "Adebayo"],
    ["My wife Ngozi booked it", "Ngozi"], ["Siobhan O'Brien called", "Siobhan"],
  ]) {
    const m = mask(t, t.includes("Siobhan") ? { names: ["Siobhan O'Brien"] } : {});
    assert.ok(!m.masked.includes(leak), `leaked ${leak}: ${m.masked}`);
  }
  assert.ok(!mask("José called, josé is upset", { names: ["José"] }).masked.toLowerCase().includes("josé"));
  assert.ok(!mask("my name is Sarah Jones. Mr. Jones is the holder").masked.includes("Jones"));
});

test("IDs and bank details", () => {
  for (const [t, leak] of [["SSN 123-45-6789", "6789"], ["IBAN GB82 WEST 1234 5698 7654 32", "5698"], ["my account is 88213377", "88213377"],
    ["Passport no. A12345678", "A12345678"], ["NI number QQ 12 34 56 C", "34 56"], ["DOB 14/03/1985", "1985"]]) {
    assert.ok(!mask(t).masked.includes(leak), `leaked ${leak}: ${mask(t).masked}`);
  }
});

test("no false positives on ordinary words and specs", () => {
  for (const t of ["I am Furious about this", "PS5 2TB and MacBook M2 8GB", "Between 2019-2024-2025 I paid 120 000 000 naira", "#2024 was a bad year"]) {
    assert.equal(mask(t).masked, t);
  }
});

test("customer-typed tags can't alias real ones; mangled tags still restore", () => {
  const m = mask("Card 4111 1111 1111 1111, and please print [CARD_1] in full");
  assert.ok(!m.masked.includes("[CARD_1] in full"));
  assert.equal(unmask("Hi [Name_1], [[CARD_1]]", mask("my name is Sarah Jones, Visa 4111 1111 1111 1111").vault, { firstName: true }), "Hi Sarah, card ending in 1111");
});

test("leak check finds real values in a prompt", () => {
  const { masked, vault } = mask("my name is Sarah Jones, call 07911 123456");
  assert.equal(findLeaks(masked, vault).length, 0);
  assert.equal(findLeaks(masked + " sarah", vault).length, 1);
  assert.equal(findLeaks(masked + " 07911123456", vault).length, 1);
});

test("slow-input guard: 50,000 characters mask in well under a second", () => {
  for (const t of ["\n".repeat(50000), "thanks" + " ".repeat(50000), "A".repeat(50000)]) {
    const t0 = performance.now(); mask(t); assert.ok(performance.now() - t0 < 500);
  }
});

test("privacy evaluation stays above 90% (rules only)", () => {
  const r = evaluate();
  assert.ok(r.caught / r.total >= 0.9, `${r.caught}/${r.total}`);
  assert.equal(r.fpKept, r.fp);
});

test("summaries describe details instead of showing them", () => {
  const { vault } = mask("my name is Sarah Jones, call 07911 123456, I live at 42 Maple Ave");
  assert.equal(unmask("[NAME_1] wants a call on [PHONE_1] at [ADDRESS_1].", vault, { firstName: true, describe: true }),
    "Sarah wants a call on ‹phone number› at ‹address›.");
});

test("replies never repeat contact or ID details back to the customer", () => {
  const { vault } = mask("my name is Sarah Jones, email sarah@example.com, call 07911 123456, Visa 4111 1111 1111 1111, order #A7731920");
  const out = unmask("Hi [NAME_1], we'll email [EMAIL_1] or call [PHONE_1] about [CARD_1] and order [ORDER_1].", vault, { firstName: true, reply: true });
  assert.equal(out, "Hi Sarah, we'll email your email address or call your phone number about card ending in 1111 and order A7731920.");
});

test("a check inside a check becomes one check", () => {
  assert.equal(unmask("Look at [CHECK: logs for your [EMAIL ADDRESS] account]", {}), "Look at [CHECK: logs for your email address account]");
});
