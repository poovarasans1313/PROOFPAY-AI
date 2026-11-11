
import test from "node:test";
import assert from "node:assert/strict";

import { evaluatePurchase } from "../src/lib/security-engine.ts";

test("Trusted merchant with low amount should be ready for human approval", () => {
  const result = evaluatePurchase({
    merchant: "Amazon",
    merchantDomain: "amazon.com",
    product: "Keyboard",
    amount: 100,
    currency: "USD",
  });

  assert.equal(result.decision, "READY_FOR_HUMAN_APPROVAL");
  assert.equal(result.riskLevel, "LOW");
  assert.equal(result.riskScore, 10);
});

test("Unknown merchant should require human review", () => {
  const result = evaluatePurchase({
    merchant: "Unknown Store",
    merchantDomain: "unknown-store.com",
    product: "Mouse",
    amount: 100,
    currency: "USD",
  });

  assert.equal(result.decision, "REVIEW_REQUIRED");
  assert.equal(result.riskScore, 55);
});

test("Walmart with walmart.com should match the demo identity mapping", () => {
  const result = evaluatePurchase({
    merchant: "Walmart",
    merchantDomain: "walmart.com",
    product: "Mouse",
    amount: 100,
    currency: "USD",
  });

  assert.equal(result.decision, "READY_FOR_HUMAN_APPROVAL");
  assert.equal(result.riskLevel, "LOW");
  assert.equal(result.riskScore, 10);
});

test("Best Buy with bestbuy.com should match the demo identity mapping", () => {
  const result = evaluatePurchase({
    merchant: "Best Buy",
    merchantDomain: "bestbuy.com",
    product: "Headphones",
    amount: 100,
    currency: "USD",
  });

  assert.equal(result.decision, "READY_FOR_HUMAN_APPROVAL");
  assert.equal(result.riskLevel, "LOW");
  assert.equal(result.riskScore, 10);
});

test("Mismatched merchant name and allowlisted domain should require review", () => {
  const result = evaluatePurchase({
    merchant: "Fake Store",
    merchantDomain: "amazon.com",
    product: "Keyboard",
    amount: 100,
    currency: "USD",
  });

  assert.equal(result.decision, "REVIEW_REQUIRED");
  assert.equal(result.riskLevel, "MEDIUM");
  assert.equal(result.riskScore, 55);
});

test("Amazon with Walmart domain should require review", () => {
  const result = evaluatePurchase({
    merchant: "Amazon",
    merchantDomain: "walmart.com",
    product: "Keyboard",
    amount: 100,
    currency: "USD",
  });

  assert.equal(result.decision, "REVIEW_REQUIRED");
  assert.equal(result.riskLevel, "MEDIUM");
  assert.equal(result.riskScore, 55);
});

test("Merchant names should match case-insensitively", () => {
  const result = evaluatePurchase({
    merchant: "aMaZoN",
    merchantDomain: "amazon.com",
    product: "Keyboard",
    amount: 100,
    currency: "USD",
  });

  assert.equal(result.decision, "READY_FOR_HUMAN_APPROVAL");
  assert.equal(result.riskScore, 10);
});

test("Merchant names should ignore surrounding and repeated whitespace", () => {
  const result = evaluatePurchase({
    merchant: "  Best   Buy  ",
    merchantDomain: "bestbuy.com",
    product: "Headphones",
    amount: 100,
    currency: "USD",
  });

  assert.equal(result.decision, "READY_FOR_HUMAN_APPROVAL");
  assert.equal(result.riskScore, 10);
});

test("Purchase above $500 should require human review", () => {
  const result = evaluatePurchase({
    merchant: "Amazon",
    merchantDomain: "amazon.com",
    product: "Monitor",
    amount: 600,
    currency: "USD",
  });

  assert.equal(result.decision, "REVIEW_REQUIRED");
  assert.equal(result.riskScore, 40);
});

test("Purchase above $1000 should have higher risk score", () => {
  const result = evaluatePurchase({
    merchant: "Amazon",
    merchantDomain: "amazon.com",
    product: "Laptop",
    amount: 1200,
    currency: "USD",
  });

  assert.equal(result.decision, "REVIEW_REQUIRED");
  assert.equal(result.riskScore, 55);
});

test("Invalid purchase information should be blocked", () => {
  const result = evaluatePurchase({
    merchant: "",
    merchantDomain: "amazon.com",
    product: "Keyboard",
    amount: 100,
    currency: "USD",
  });

  assert.equal(result.decision, "BLOCKED");
  assert.equal(result.riskScore, 100);
});

test("Unsupported currency should require human review", () => {
  const result = evaluatePurchase({
    merchant: "Amazon",
    merchantDomain: "amazon.com",
    product: "Keyboard",
    amount: 100,
    currency: "INR",
  });

  assert.equal(result.decision, "REVIEW_REQUIRED");
  assert.equal(result.riskScore, 60);
});

test("Uppercase trusted merchant domain should be normalized", () => {
  const result = evaluatePurchase({
    merchant: "Amazon",
    merchantDomain: "AMAZON.COM",
    product: "Keyboard",
    amount: 100,
    currency: "USD",
  });

  assert.equal(result.decision, "READY_FOR_HUMAN_APPROVAL");
  assert.equal(result.riskScore, 10);
});

test("Trusted merchant domain with www prefix should be normalized", () => {
  const result = evaluatePurchase({
    merchant: "Amazon",
    merchantDomain: "www.amazon.com",
    product: "Keyboard",
    amount: 100,
    currency: "USD",
  });

  assert.equal(result.decision, "READY_FOR_HUMAN_APPROVAL");
  assert.equal(result.riskScore, 10);
});

test("Trusted merchant domain with trailing dot should be normalized", () => {
  const result = evaluatePurchase({
    merchant: "Amazon",
    merchantDomain: "amazon.com.",
    product: "Keyboard",
    amount: 100,
    currency: "USD",
  });

  assert.equal(result.decision, "READY_FOR_HUMAN_APPROVAL");
  assert.equal(result.riskScore, 10);
});

test("Amount exactly $500 should remain within the approval limit", () => {
  const result = evaluatePurchase({
    merchant: "Amazon",
    merchantDomain: "amazon.com",
    product: "Monitor",
    amount: 500,
    currency: "USD",
  });

  assert.equal(result.decision, "READY_FOR_HUMAN_APPROVAL");
  assert.equal(result.riskScore, 10);
});

test("Amount exactly $1,000 should not receive the above-$1,000 risk increase", () => {
  const result = evaluatePurchase({
    merchant: "Amazon",
    merchantDomain: "amazon.com",
    product: "Laptop",
    amount: 1000,
    currency: "USD",
  });

  assert.equal(result.decision, "REVIEW_REQUIRED");
  assert.equal(result.riskScore, 40);
});

test("Zero amount should be blocked", () => {
  const result = evaluatePurchase({
    merchant: "Amazon",
    merchantDomain: "amazon.com",
    product: "Keyboard",
    amount: 0,
    currency: "USD",
  });

  assert.equal(result.decision, "BLOCKED");
  assert.equal(result.riskScore, 100);
});

test("Negative amount should be blocked", () => {
  const result = evaluatePurchase({
    merchant: "Amazon",
    merchantDomain: "amazon.com",
    product: "Keyboard",
    amount: -1,
    currency: "USD",
  });

  assert.equal(result.decision, "BLOCKED");
  assert.equal(result.riskScore, 100);
});

test("Missing merchant domain should be blocked", () => {
  const result = evaluatePurchase({
    merchant: "Amazon",
    merchantDomain: "",
    product: "Keyboard",
    amount: 100,
    currency: "USD",
  });

  assert.equal(result.decision, "BLOCKED");
  assert.equal(result.riskScore, 100);
});

test("Missing product name should be blocked", () => {
  const result = evaluatePurchase({
    merchant: "Amazon",
    merchantDomain: "amazon.com",
    product: "",
    amount: 100,
    currency: "USD",
  });

  assert.equal(result.decision, "BLOCKED");
  assert.equal(result.riskScore, 100);
});

test("Unknown merchant above $1,000 should receive combined risk", () => {
  const result = evaluatePurchase({
    merchant: "Unknown Store",
    merchantDomain: "unknown-store.com",
    product: "Laptop",
    amount: 1200,
    currency: "USD",
  });

  assert.equal(result.decision, "REVIEW_REQUIRED");
  assert.equal(result.riskLevel, "HIGH");
  assert.equal(result.riskScore, 100);
});

const riskBoundaryCases = [
  {
    name: "Trusted purchase just above $500",
    merchant: "Amazon",
    merchantDomain: "amazon.com",
    amount: 500.01,
    riskScore: 40,
    riskLevel: "MEDIUM",
    decision: "REVIEW_REQUIRED",
    reason: "Purchase exceeds the $500 demo approval limit.",
  },
  {
    name: "Trusted purchase just above $1,000",
    merchant: "Amazon",
    merchantDomain: "amazon.com",
    amount: 1000.01,
    riskScore: 55,
    riskLevel: "MEDIUM",
    decision: "REVIEW_REQUIRED",
    reason: "Purchase exceeds the $500 demo approval limit.",
  },
  {
    name: "Unknown merchant at $500",
    merchant: "Unknown Store",
    merchantDomain: "unknown-store.com",
    amount: 500,
    riskScore: 55,
    riskLevel: "MEDIUM",
    decision: "REVIEW_REQUIRED",
    reason: "Merchant identity does not match the configured demo mapping.",
  },
  {
    name: "Unknown merchant just above $500",
    merchant: "Unknown Store",
    merchantDomain: "unknown-store.com",
    amount: 500.01,
    riskScore: 85,
    riskLevel: "HIGH",
    decision: "REVIEW_REQUIRED",
    reason: "Purchase exceeds the $500 demo approval limit.",
  },
  {
    name: "Unknown merchant at $1,000",
    merchant: "Unknown Store",
    merchantDomain: "unknown-store.com",
    amount: 1000,
    riskScore: 85,
    riskLevel: "HIGH",
    decision: "REVIEW_REQUIRED",
    reason: "Merchant identity does not match the configured demo mapping.",
  },
  {
    name: "Unknown merchant just above $1,000",
    merchant: "Unknown Store",
    merchantDomain: "unknown-store.com",
    amount: 1000.01,
    riskScore: 100,
    riskLevel: "HIGH",
    decision: "REVIEW_REQUIRED",
    reason: "Purchase exceeds the $500 demo approval limit.",
  },
] as const;

for (const riskCase of riskBoundaryCases) {
  test(`${riskCase.name} has the expected risk and decision`, () => {
    const result = evaluatePurchase({
      merchant: riskCase.merchant,
      merchantDomain: riskCase.merchantDomain,
      product: "Demo product",
      amount: riskCase.amount,
      currency: "USD",
    });

    assert.equal(result.riskScore, riskCase.riskScore);
    assert.equal(result.riskLevel, riskCase.riskLevel);
    assert.equal(result.decision, riskCase.decision);
    assert.ok(result.reasons.includes(riskCase.reason));
    assert.equal(
      result.nextAction,
      "Send purchase request for human review."
    );
  });
}

test("Unsupported currency uses its review score before merchant and amount rules", () => {
  const result = evaluatePurchase({
    merchant: "Unknown Store",
    merchantDomain: "unknown-store.com",
    product: "Demo product",
    amount: 1200,
    currency: "INR",
  });

  assert.equal(result.decision, "REVIEW_REQUIRED");
  assert.equal(result.riskLevel, "MEDIUM");
  assert.equal(result.riskScore, 60);
  assert.deepEqual(result.reasons, [
    "Currency is not supported by the demo policy.",
  ]);
  assert.equal(result.nextAction, "Request human review.");
});
