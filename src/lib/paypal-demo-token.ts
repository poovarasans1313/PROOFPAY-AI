import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_ISSUER = "proofpay-ai";
const TOKEN_AUDIENCE = "paypal-sandbox-demo";
const TOKEN_PURPOSE = "capture";
const TOKEN_LIFETIME_SECONDS = 10 * 60;
const MAX_TOKEN_LENGTH = 2048;

type DemoTokenClaims = {
  version: 1;
  issuer: typeof TOKEN_ISSUER;
  audience: typeof TOKEN_AUDIENCE;
  purpose: typeof TOKEN_PURPOSE;
  subject: string;
  orderId: string;
  issuedAt: number;
  expiresAt: number;
};

function getSigningSecret(): string {
  const secret = process.env.PAYPAL_DEMO_SIGNING_SECRET;

  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error(
      "PAYPAL_DEMO_SIGNING_SECRET must contain at least 32 bytes."
    );
  }

  return secret;
}

function isValidOrderId(value: string): boolean {
  return /^[A-Za-z0-9-]{1,64}$/.test(value);
}

function sign(payload: string): Buffer {
  return createHmac("sha256", getSigningSecret())
    .update(payload)
    .digest();
}

function bindUser(userId: string): string {
  return createHmac("sha256", getSigningSecret())
    .update(`paypal-demo-user:${userId}`)
    .digest("base64url");
}

export function createDemoToken(
  userId: string,
  orderId: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): string {
  if (!userId || userId.length > 200 || !isValidOrderId(orderId)) {
    throw new Error("Invalid PayPal demo token subject.");
  }

  const claims: DemoTokenClaims = {
    version: 1,
    issuer: TOKEN_ISSUER,
    audience: TOKEN_AUDIENCE,
    purpose: TOKEN_PURPOSE,
    subject: bindUser(userId),
    orderId,
    issuedAt: nowSeconds,
    expiresAt: nowSeconds + TOKEN_LIFETIME_SECONDS,
  };
  const encodedClaims = Buffer.from(JSON.stringify(claims)).toString(
    "base64url"
  );
  const signature = sign(encodedClaims).toString("base64url");

  return `${encodedClaims}.${signature}`;
}

export function verifyDemoToken(
  token: string,
  userId: string,
  orderId: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): boolean {
  if (
    !token ||
    token.length > MAX_TOKEN_LENGTH ||
    !userId ||
    !isValidOrderId(orderId)
  ) {
    return false;
  }

  const parts = token.split(".");

  if (
    parts.length !== 2 ||
    !/^[A-Za-z0-9_-]+$/.test(parts[0]) ||
    !/^[A-Za-z0-9_-]+$/.test(parts[1])
  ) {
    return false;
  }

  let actualSignature: Buffer;

  try {
    actualSignature = Buffer.from(parts[1], "base64url");
  } catch {
    return false;
  }

  const expectedSignature = sign(parts[0]);

  if (
    actualSignature.length !== expectedSignature.length ||
    !timingSafeEqual(actualSignature, expectedSignature)
  ) {
    return false;
  }

  let parsedClaims: unknown;

  try {
    parsedClaims = JSON.parse(
      Buffer.from(parts[0], "base64url").toString("utf8")
    );
  } catch {
    return false;
  }

  if (
    typeof parsedClaims !== "object" ||
    parsedClaims === null ||
    Array.isArray(parsedClaims)
  ) {
    return false;
  }

  const claims = parsedClaims as Partial<DemoTokenClaims>;

  return (
    claims.version === 1 &&
    claims.issuer === TOKEN_ISSUER &&
    claims.audience === TOKEN_AUDIENCE &&
    claims.purpose === TOKEN_PURPOSE &&
    claims.subject === bindUser(userId) &&
    claims.orderId === orderId &&
    Number.isSafeInteger(claims.issuedAt) &&
    Number.isSafeInteger(claims.expiresAt) &&
    typeof claims.issuedAt === "number" &&
    typeof claims.expiresAt === "number" &&
    claims.issuedAt <= nowSeconds + 30 &&
    claims.expiresAt > nowSeconds &&
    claims.expiresAt > claims.issuedAt &&
    claims.expiresAt - claims.issuedAt <= TOKEN_LIFETIME_SECONDS
  );
}

export function createPayPalRequestId(
  purpose: "order" | "capture",
  subject: string
): string {
  return createHmac("sha256", getSigningSecret())
    .update(`proofpay-paypal-demo:${purpose}:${subject}`)
    .digest("hex")
    .slice(0, 32);
}
