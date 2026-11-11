import assert from "node:assert/strict";
import * as NodeModule from "node:module";
import test, { beforeEach } from "node:test";
import {
  approvalEvents,
  insertedPurchases,
  queriedTables,
  resetApiMocks,
  rpcCalls,
  setCurrentUser,
} from "./mocks/evaluate-api-mocks.ts";

const canonicalOrigin = "https://proofpay.test";
process.env.APP_ORIGIN = canonicalOrigin;

const mockModuleUrl = new URL(
  "./mocks/evaluate-api-mocks.ts",
  import.meta.url
).href;
const securityEngineModuleUrl = new URL(
  "../src/lib/security-engine.ts",
  import.meta.url
).href;

type ResolveContext = {
  conditions: string[];
  parentURL?: string;
  importAttributes?: Record<string, string>;
};

type ResolveResult = {
  url: string;
  shortCircuit?: boolean;
};

type RegisterHooks = (hooks: {
  resolve(
    specifier: string,
    context: ResolveContext,
    nextResolve: (
      specifier: string,
      context: ResolveContext
    ) => ResolveResult
  ): ResolveResult;
}) => unknown;

const registerHooks = (
  NodeModule as typeof NodeModule & { registerHooks: RegisterHooks }
).registerHooks;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier === "@/lib/supabase/server" ||
      specifier === "@/lib/supabase-admin" ||
      specifier === "next/server"
    ) {
      return { url: mockModuleUrl, shortCircuit: true };
    }

    if (specifier === "@/lib/security-engine") {
      return { url: securityEngineModuleUrl, shortCircuit: true };
    }

    return nextResolve(specifier, context);
  },
});

const { POST: evaluatePost } = await import(
  "../src/app/api/evaluate/route.ts"
);
const { POST: reviewPost } = await import(
  "../src/app/api/purchase-requests/[id]/review/route.ts"
);

const reviewerId = "b2222222-2222-2222-2222-222222222222";
const trustedPurchase = {
  merchant: "Amazon",
  merchantDomain: "amazon.com",
  product: "Keyboard",
  amount: 100,
  currency: "USD",
};

function apiRequest(path: string, body: unknown): Request {
  return new Request(`${canonicalOrigin}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin: canonicalOrigin,
    },
    body: JSON.stringify(body),
  });
}

async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

async function submitPurchase(purchase: unknown = trustedPurchase) {
  return evaluatePost(apiRequest("/api/evaluate", purchase));
}

async function reviewPurchase(id: string, action: "approve" | "reject") {
  return reviewPost(apiRequest(`/api/purchase-requests/${id}/review`, {
    action,
    note: "Reviewed in isolated test",
  }), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  resetApiMocks();
  process.env.APP_ORIGIN = canonicalOrigin;
});

test("Trusted purchase proceeds from evaluation to explicit human approval", async () => {
  const evaluationResponse = await submitPurchase();
  const evaluation = await bodyOf(evaluationResponse);
  const requestId = evaluation.requestId as string;

  assert.equal(evaluationResponse.status, 200);
  assert.equal(evaluation.decision, "READY_FOR_HUMAN_APPROVAL");
  assert.equal(evaluation.status, "PENDING_APPROVAL");
  assert.equal(evaluation.nextAction, "Wait for explicit human approval before payment.");
  assert.equal(insertedPurchases[0].status, "PENDING_APPROVAL");

  const reviewResponse = await reviewPurchase(requestId, "approve");
  const review = await bodyOf(reviewResponse);

  assert.equal(reviewResponse.status, 200);
  assert.equal(review.status, "APPROVED");
  assert.equal(insertedPurchases[0].status, "APPROVED");
  assert.equal(insertedPurchases[0].reviewed_by, reviewerId);
  assert.equal(insertedPurchases[0].review_note, "Reviewed in isolated test");
  assert.equal(approvalEvents.length, 1);
  assert.equal(approvalEvents[0].action, "APPROVED");
  assert.equal(approvalEvents[0].actor_id, reviewerId);
  assert.notEqual(insertedPurchases[0].status, "PAID");
  assert.deepEqual(queriedTables, ["purchase_requests"]);
});

test("Mismatched identity proceeds to review and explicit rejection", async () => {
  const evaluationResponse = await submitPurchase({
    ...trustedPurchase,
    merchant: "Fake Store",
  });
  const evaluation = await bodyOf(evaluationResponse);
  const requestId = evaluation.requestId as string;

  assert.equal(evaluation.decision, "REVIEW_REQUIRED");
  assert.equal(evaluation.status, "PENDING_REVIEW");

  const reviewResponse = await reviewPurchase(requestId, "reject");
  const review = await bodyOf(reviewResponse);

  assert.equal(reviewResponse.status, 200);
  assert.equal(review.status, "REJECTED");
  assert.equal(insertedPurchases[0].status, "REJECTED");
  assert.equal(approvalEvents.length, 1);
  assert.equal(approvalEvents[0].action, "REJECTED");
});

test("Unknown merchant remains pending review after evaluation", async () => {
  const response = await submitPurchase({
    ...trustedPurchase,
    merchant: "Unknown Store",
    merchantDomain: "unknown-store.test",
  });
  const evaluation = await bodyOf(response);

  assert.equal(response.status, 200);
  assert.equal(evaluation.decision, "REVIEW_REQUIRED");
  assert.equal(evaluation.status, "PENDING_REVIEW");
  assert.equal(insertedPurchases[0].status, "PENDING_REVIEW");
  assert.equal(approvalEvents.length, 0);
});

test("High-value trusted purchase remains pending review", async () => {
  const response = await submitPurchase({
    ...trustedPurchase,
    amount: 1200,
  });
  const evaluation = await bodyOf(response);

  assert.equal(response.status, 200);
  assert.equal(evaluation.decision, "REVIEW_REQUIRED");
  assert.equal(evaluation.status, "PENDING_REVIEW");
  assert.equal(insertedPurchases[0].status, "PENDING_REVIEW");
});

test("Invalid purchase is rejected without persistence", async () => {
  const response = await submitPurchase({
    ...trustedPurchase,
    amount: 0,
  });

  assert.equal(response.status, 400);
  assert.equal(insertedPurchases.length, 0);
  assert.equal(approvalEvents.length, 0);
});

test("Unauthorized reviewer cannot change a pending purchase", async () => {
  const evaluationResponse = await submitPurchase();
  const evaluation = await bodyOf(evaluationResponse);
  const requestId = evaluation.requestId as string;
  const pendingStatus = insertedPurchases[0].status;

  setCurrentUser({
    id: "c3333333-3333-3333-3333-333333333333",
    app_metadata: { role: "user" },
  });
  const reviewResponse = await reviewPurchase(requestId, "reject");

  assert.equal(reviewResponse.status, 403);
  assert.equal(insertedPurchases[0].status, pendingStatus);
  assert.equal(rpcCalls.length, 0);
  assert.equal(approvalEvents.length, 0);
});

test("A completed review cannot be applied a second time", async () => {
  const evaluationResponse = await submitPurchase();
  const evaluation = await bodyOf(evaluationResponse);
  const requestId = evaluation.requestId as string;

  const firstReview = await reviewPurchase(requestId, "approve");
  assert.equal(firstReview.status, 200);

  const secondReview = await reviewPurchase(requestId, "reject");
  assert.equal(secondReview.status, 409);
  assert.equal(insertedPurchases[0].status, "APPROVED");
  assert.equal(rpcCalls.length, 2);
  assert.equal(approvalEvents.length, 1);
});
