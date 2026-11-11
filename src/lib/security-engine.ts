
export type PurchaseRequest = {
  merchant: string;
  merchantDomain: string;
  product: string;
  amount: number;
  currency: string;
};

export type SecurityDecision =
  | "READY_FOR_HUMAN_APPROVAL"
  | "REVIEW_REQUIRED"
  | "BLOCKED";

export type SecurityResult = {
  decision: SecurityDecision;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  riskScore: number;
  reasons: string[];
  nextAction: string;
};

// Controlled demo identity mapping, not live merchant verification.
const demoMerchantDomains: Record<string, string> = {
  amazon: "amazon.com",
  walmart: "walmart.com",
  "best buy": "bestbuy.com",
};

export function evaluatePurchase(
  request: PurchaseRequest
): SecurityResult {
  const reasons: string[] = [];

  // Rule 1: Validate purchase information
  if (
    !request.merchant?.trim() ||
    !request.merchantDomain?.trim() ||
    !request.product?.trim() ||
    !Number.isFinite(request.amount) ||
    request.amount <= 0
  ) {
    return {
      decision: "BLOCKED",
      riskLevel: "HIGH",
      riskScore: 100,
      reasons: ["Invalid or incomplete purchase information."],
      nextAction: "Reject the invalid request.",
    };
  }

  // Rule 2: Check supported currency
  if (request.currency !== "USD") {
    return {
      decision: "REVIEW_REQUIRED",
      riskLevel: "MEDIUM",
      riskScore: 60,
      reasons: ["Currency is not supported by the demo policy."],
      nextAction: "Request human review.",
    };
  }

  // Rule 3: Match the normalized merchant name and domain to the demo mapping.
  const merchantName = request.merchant
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  const domain = request.merchantDomain
    .toLowerCase()
    .trim()
    .replace(/^www\./, "")
    .replace(/\.$/, "");

  const isTrusted = demoMerchantDomains[merchantName] === domain;

  if (!isTrusted) {
    reasons.push("Merchant identity does not match the configured demo mapping.");
  }

  // Rule 4: Check transaction amount
  if (request.amount > 500) {
    reasons.push("Purchase exceeds the $500 demo approval limit.");
  }

  // Rule 5: Calculate risk score
  let riskScore = 10;

  if (!isTrusted) riskScore += 45;
  if (request.amount > 500) riskScore += 30;
  if (request.amount > 1000) riskScore += 15;

  riskScore = Math.min(riskScore, 100);

  // Rule 6: Make security decision
  if (!isTrusted || request.amount > 500) {
    return {
      decision: "REVIEW_REQUIRED",
      riskLevel: riskScore >= 70 ? "HIGH" : "MEDIUM",
      riskScore,
      reasons,
      nextAction: "Send purchase request for human review.",
    };
  }

  return {
    decision: "READY_FOR_HUMAN_APPROVAL",
    riskLevel: "LOW",
    riskScore,
    reasons: ["Merchant matches the configured demo allowlist.",
      "Purchase is within the configured amount limit."],
    nextAction: "Wait for explicit human approval before payment.",
  };
}
