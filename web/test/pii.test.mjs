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
});

test("routing: simple → device, complex → cloud, local-only → device only", () => {
  const ctx = { policy: "auto", deviceReady: true, online: true };
  assert.equal(route("Where is my parcel?", ctx).mode, "PREFER_ON_DEVICE");
  assert.equal(route("A? B? C? D? E?", ctx).mode, "PREFER_IN_CLOUD");
  assert.equal(route("A? B? C? D? E?", { ...ctx, policy: "local-only" }).mode, "ONLY_ON_DEVICE");
  assert.equal(route("hi", { policy: "local-only", deviceReady: false, online: true }).target, "blocked");
  assert.equal(route("hi", { policy: "auto", deviceReady: false, online: false }).target, "blocked");
});
