import assert from "node:assert/strict";
import * as NodeModule from "node:module";
import test, { beforeEach } from "node:test";
import {
  resetApiMocks,
  rpcCalls,
  setAuthError,
  setCurrentUser,
  setReviewRpcResult,
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

const { POST } = await import(
  "../src/app/api/purchase-requests/[id]/review/route.ts"
);

const purchaseId = "a1111111-1111-1111-1111-111111111111";
const adminId = "b2222222-2222-2222-2222-222222222222";

function reviewRequest(
  body: string,
  origin: string | null = canonicalOrigin
): Request {
  const headers = new Headers({ "Content-Type": "application/json" });

  if (origin !== null) {
    headers.set("origin", origin);
  }

  return new Request(
    `${canonicalOrigin}/api/purchase-requests/${purchaseId}/review`,
    {
      method: "POST",
      headers,
      body,
    }
  );
}

function postReview(
  body: unknown,
  id = purchaseId,
  origin: string | null = canonicalOrigin
): Promise<Response> {
  return POST(reviewRequest(JSON.stringify(body), origin), {
    params: Promise.resolve({ id }),
  });
}

async function responseBody(response: Response): Promise<
  Record<string, unknown>
> {
  return (await response.json()) as Record<string, unknown>;
}

beforeEach(() => {
  resetApiMocks();
  process.env.APP_ORIGIN = canonicalOrigin;
});

test("Unauthenticated review request is rejected without calling the RPC", async () => {
  setCurrentUser(null);

  const response = await postReview({ action: "approve" });

  assert.equal(response.status, 401);
  assert.equal(rpcCalls.length, 0);
});

test("Authentication provider error is rejected without calling the RPC", async () => {
  setAuthError(new Error("Authentication lookup failed"));

  const response = await postReview({ action: "approve" });

  assert.equal(response.status, 401);
  assert.equal(rpcCalls.length, 0);
});

test("Authenticated non-admin review request is rejected", async () => {
  setCurrentUser({
    id: adminId,
    app_metadata: { role: "user" },
  });

  const response = await postReview({ action: "approve" });

  assert.equal(response.status, 403);
  assert.equal(rpcCalls.length, 0);
});

test("Missing origin is rejected without calling the RPC", async () => {
  const response = await postReview({ action: "approve" }, purchaseId, null);

  assert.equal(response.status, 403);
  assert.equal(rpcCalls.length, 0);
});

test("Incorrect origin is rejected without calling the RPC", async () => {
  const response = await postReview(
    { action: "approve" },
    purchaseId,
    "https://untrusted.test"
  );

  assert.equal(response.status, 403);
  assert.equal(rpcCalls.length, 0);
});

test("Missing APP_ORIGIN configuration fails closed", async () => {
  delete process.env.APP_ORIGIN;

  const response = await postReview({ action: "approve" });
  const body = await responseBody(response);

  assert.equal(response.status, 500);
  assert.equal(body.error, "Server origin is not configured correctly.");
  assert.equal(rpcCalls.length, 0);
});

test("Invalid purchase ID is rejected without calling the RPC", async () => {
  const response = await postReview({ action: "approve" }, "not-a-uuid");

  assert.equal(response.status, 400);
  assert.equal(rpcCalls.length, 0);
});

test("Malformed review JSON is rejected without calling the RPC", async () => {
  const response = await POST(reviewRequest("{"), {
    params: Promise.resolve({ id: purchaseId }),
  });

  assert.equal(response.status, 400);
  assert.equal(rpcCalls.length, 0);
});

test("Invalid review action is rejected without calling the RPC", async () => {
  const response = await postReview({ action: "delete" });

  assert.equal(response.status, 400);
  assert.equal(rpcCalls.length, 0);
});

test("Overlong review note is rejected without calling the RPC", async () => {
  const response = await postReview({
    action: "approve",
    note: "x".repeat(1001),
  });

  assert.equal(response.status, 400);
  assert.equal(rpcCalls.length, 0);
});

test("Approval uses the authenticated actor and trims the optional note", async () => {
  const response = await postReview({
    action: "approve",
    note: "  reviewed  ",
    actorId: "client-supplied-id",
  });
  const body = await responseBody(response);

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.status, "APPROVED");
  assert.deepEqual(rpcCalls, [
    {
      functionName: "review_purchase_request",
      args: {
        p_purchase_request_id: purchaseId,
        p_action: "APPROVED",
        p_actor_id: adminId,
        p_note: "reviewed",
      },
    },
  ]);
});

test("Rejection calls the review RPC with REJECTED action", async () => {
  const response = await postReview({ action: "reject" });
  const body = await responseBody(response);

  assert.equal(response.status, 200);
  assert.equal(body.status, "REJECTED");
  assert.equal(rpcCalls[0].args.p_action, "REJECTED");
  assert.equal(rpcCalls[0].args.p_actor_id, adminId);
  assert.equal(rpcCalls[0].args.p_note, null);
});

test("Review RPC false result reports request is no longer pending", async () => {
  setReviewRpcResult({ data: false, error: null });

  const response = await postReview({ action: "approve" });
  const body = await responseBody(response);

  assert.equal(response.status, 409);
  assert.equal(body.error, "Request was not found or is no longer pending.");
  assert.equal(rpcCalls.length, 1);
});

test("Repeated review attempt cannot be reported as a second success", async () => {
  const firstResponse = await postReview({ action: "approve" });
  assert.equal(firstResponse.status, 200);

  setReviewRpcResult({ data: false, error: null });
  const secondResponse = await postReview({ action: "reject" });

  assert.equal(secondResponse.status, 409);
  assert.equal(rpcCalls.length, 2);
});

test("Review RPC database error is returned as failure", async () => {
  setReviewRpcResult({
    data: null,
    error: { message: "mock database error" },
  });

  const response = await postReview({ action: "approve" });
  const body = await responseBody(response);

  assert.equal(response.status, 500);
  assert.equal(body.error, "Unable to save the purchase decision.");
  assert.equal(rpcCalls.length, 1);
});
