import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  createDemoToken,
  createPayPalRequestId,
  verifyDemoToken,
} from "../src/lib/paypal-demo-token.ts";

const signingSecret =
  "test-only-signing-secret-that-is-at-least-32-bytes-long";
process.env.PAYPAL_DEMO_SIGNING_SECRET = signingSecret;

test("Sandbox token is valid only for its user and order", () => {
  const token = createDemoToken("user-123", "ORDER-123", 1_000);
  const claims = JSON.parse(
    Buffer.from(token.split(".")[0], "base64url").toString("utf8")
  ) as { subject: string };

  assert.notEqual(claims.subject, "user-123");
  assert.equal(token.includes("user-123"), false);
  assert.equal(verifyDemoToken(token, "user-123", "ORDER-123", 1_001), true);
  assert.equal(verifyDemoToken(token, "other-user", "ORDER-123", 1_001), false);
  assert.equal(verifyDemoToken(token, "user-123", "OTHER-ORDER", 1_001), false);
});

test("Sandbox token expires after its short lifetime", () => {
  const token = createDemoToken("user-123", "ORDER-123", 1_000);

  assert.equal(verifyDemoToken(token, "user-123", "ORDER-123", 1_599), true);
  assert.equal(verifyDemoToken(token, "user-123", "ORDER-123", 1_600), false);
});

test("Sandbox token rejects tampering and malformed values", () => {
  const token = createDemoToken("user-123", "ORDER-123", 1_000);
  const [claims, signature] = token.split(".");
  const changedSignature = `${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;

  assert.equal(
    verifyDemoToken(`${claims}.${changedSignature}`, "user-123", "ORDER-123", 1_001),
    false
  );
  assert.equal(verifyDemoToken("not-a-token", "user-123", "ORDER-123"), false);
});

test("Sandbox token rejects excessive lifetime and future issue times", () => {
  const token = createDemoToken("user-123", "ORDER-123", 1_000);
  const [encodedClaims] = token.split(".");
  const claims = JSON.parse(
    Buffer.from(encodedClaims, "base64url").toString("utf8")
  ) as { issuedAt: number; expiresAt: number };
  claims.expiresAt += 1;
  const extendedClaims = Buffer.from(JSON.stringify(claims)).toString(
    "base64url"
  );
  const extendedSignature = createHmac("sha256", signingSecret)
    .update(extendedClaims)
    .digest("base64url");
  assert.equal(
    verifyDemoToken(
      `${extendedClaims}.${extendedSignature}`,
      "user-123",
      "ORDER-123",
      1_001
    ),
    false
  );

  const futureToken = createDemoToken("user-123", "ORDER-123", 2_000);
  assert.equal(verifyDemoToken(futureToken, "user-123", "ORDER-123", 1_000), false);
});

test("PayPal request IDs are stable and scoped by operation and subject", () => {
  const first = createPayPalRequestId("capture", "ORDER-123");

  assert.match(first, /^[0-9a-f]{32}$/);
  assert.equal(first, createPayPalRequestId("capture", "ORDER-123"));
  assert.notEqual(first, createPayPalRequestId("order", "ORDER-123"));
  assert.notEqual(first, createPayPalRequestId("capture", "ORDER-456"));
});
