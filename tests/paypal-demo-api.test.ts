import assert from "node:assert/strict";
import * as NodeModule from "node:module";
import test, { after, beforeEach } from "node:test";
import {
  approvalEvents,
  insertedPurchases,
  queriedTables,
  resetApiMocks,
  rpcCalls,
  setCurrentUser,
} from "./mocks/evaluate-api-mocks.ts";

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
const authMockUrl = new URL(
  "./mocks/evaluate-api-mocks.ts",
  import.meta.url
).href;
const tokenModuleUrl = new URL(
  "../src/lib/paypal-demo-token.ts",
  import.meta.url
).href;
const paypalModuleUrl = new URL(
  "../src/lib/paypal-sandbox.ts",
  import.meta.url
).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/supabase/server") {
      return { url: authMockUrl, shortCircuit: true };
    }

    if (specifier === "@/lib/paypal-demo-token") {
      return { url: tokenModuleUrl, shortCircuit: true };
    }

    if (specifier === "@/lib/paypal-sandbox") {
      return { url: paypalModuleUrl, shortCircuit: true };
    }

    return nextResolve(specifier, context);
  },
});

const { POST: createOrder } = await import(
  "../src/app/api/paypal-demo/orders/route.ts"
);
const { POST: captureOrder } = await import(
  "../src/app/api/paypal-demo/orders/[orderId]/capture/route.ts"
);

const canonicalOrigin = "https://proofpay.test";
const adminId = "b2222222-2222-2222-2222-222222222222";
const nonce = "9c975d6f-6afe-4cdc-b886-dda51f6f7a10";
const orderId = "TEST-ORDER-123456";
const originalFetch = globalThis.fetch;
let capturedRequests: Array<{ url: string; init: RequestInit }> = [];
let currentOrderStatus = "APPROVED";
let responseAmount = "1.00";
let responseCurrency = "USD";
let captureResponseAmount = "1.00";
let captureResponseCurrency = "USD";
let captureResponseStatus = "COMPLETED";

function apiResponse(
  body: unknown,
  status = 200
): Response {
  return Response.json(body, { status });
}

function sandboxOrder(
  status = currentOrderStatus,
  amount = responseAmount,
  currency = responseCurrency
): Record<string, unknown> {
  return {
    id: orderId,
    status,
    intent: "CAPTURE",
    purchase_units: [
      {
        amount: {
          currency_code: currency,
          value: amount,
        },
        ...(status === "COMPLETED"
          ? {
              payments: {
                captures: [
                  {
                    id: "TEST-CAPTURE-123",
                    status: "COMPLETED",
                    amount: {
                      currency_code: currency,
                      value: amount,
                    },
                  },
                ],
              },
            }
          : {}),
      },
    ],
  };
}

function installFetchMock(): void {
  globalThis.fetch = async (
    input: RequestInfo | URL,
    init: RequestInit = {}
  ): Promise<Response> => {
    const url = String(input);
    capturedRequests.push({ url, init });

    if (url.endsWith("/v1/oauth2/token")) {
      return apiResponse({
        access_token: "mock-sandbox-access-token",
        token_type: "Bearer",
        expires_in: 3600,
      });
    }

    if (url.endsWith("/v2/checkout/orders")) {
      const body = JSON.parse(String(init.body)) as {
        purchase_units: Array<{
          amount: { currency_code: string; value: string };
        }>;
      };

      assert.equal(body.purchase_units[0].amount.value, "1.00");
      assert.equal(body.purchase_units[0].amount.currency_code, "USD");

      return apiResponse({
        ...sandboxOrder("CREATED"),
        status: "CREATED",
      });
    }

    if (url.endsWith(`/v2/checkout/orders/${orderId}`)) {
      return apiResponse(sandboxOrder());
    }

    if (url.endsWith(`/v2/checkout/orders/${orderId}/capture`)) {
      currentOrderStatus = "COMPLETED";
      return apiResponse(
        sandboxOrder(
          captureResponseStatus,
          captureResponseAmount,
          captureResponseCurrency
        )
      );
    }

    throw new Error("Unexpected mocked PayPal URL.");
  };
}

function request(
  path: string,
  headers: Record<string, string> = {}
): Request {
  return new Request(`${canonicalOrigin}${path}`, {
    method: "POST",
    headers: {
      origin: canonicalOrigin,
      ...headers,
    },
  });
}

async function createSandboxOrder(
  origin = canonicalOrigin
): Promise<{ orderId: string; token: string }> {
  const response = await createOrder(
    request("/api/paypal-demo/orders", {
      "x-paypal-demo-nonce": nonce,
      origin,
    })
  );

  assert.equal(response.status, 200);
  return (await response.json()) as { orderId: string; token: string };
}

async function captureSandboxOrder(
  token: string,
  id = orderId,
  origin = canonicalOrigin
): Promise<Response> {
  return captureOrder(
    request(`/api/paypal-demo/orders/${id}/capture`, {
      "x-paypal-demo-token": token,
      origin,
    }),
    { params: Promise.resolve({ orderId: id }) }
  );
}

beforeEach(() => {
  resetApiMocks();
  process.env.APP_ORIGIN = canonicalOrigin;
  process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID = "mock-sandbox-client-id";
  process.env.PAYPAL_CLIENT_SECRET = "mock-sandbox-client-secret";
  process.env.PAYPAL_DEMO_SIGNING_SECRET =
    "test-only-signing-secret-that-is-at-least-32-bytes-long";
  process.env.PAYPAL_BASE_URL = "https://api-m.sandbox.paypal.com";
  capturedRequests = [];
  currentOrderStatus = "APPROVED";
  responseAmount = "1.00";
  responseCurrency = "USD";
  captureResponseAmount = "1.00";
  captureResponseCurrency = "USD";
  captureResponseStatus = "COMPLETED";
  installFetchMock();
});

after(() => {
  globalThis.fetch = originalFetch;
});

test("Order creation requires an authenticated admin", async () => {
  setCurrentUser(null);
  const unauthenticated = await createOrder(
    request("/api/paypal-demo/orders", { "x-paypal-demo-nonce": nonce })
  );

  assert.equal(unauthenticated.status, 401);
  assert.equal(capturedRequests.length, 0);

  setCurrentUser({
    id: adminId,
    app_metadata: { role: "user" },
  });
  const nonAdmin = await createOrder(
    request("/api/paypal-demo/orders", { "x-paypal-demo-nonce": nonce })
  );

  assert.equal(nonAdmin.status, 403);
  assert.equal(capturedRequests.length, 0);
});

test("Order creation rejects a wrong origin and invalid nonce", async () => {
  const wrongOrigin = await createOrder(
    request("/api/paypal-demo/orders", {
      "x-paypal-demo-nonce": nonce,
      origin: "https://untrusted.test",
    })
  );
  const invalidNonce = await createOrder(
    request("/api/paypal-demo/orders", {
      "x-paypal-demo-nonce": "not-a-uuid",
    })
  );

  assert.equal(wrongOrigin.status, 403);
  assert.equal(invalidNonce.status, 400);
  assert.equal(capturedRequests.length, 0);
});

test("Order creation ignores browser bodies and rejects production PayPal URLs", async () => {
  const bodyRequest = new Request(`${canonicalOrigin}/api/paypal-demo/orders`, {
    method: "POST",
    headers: {
      origin: canonicalOrigin,
      "x-paypal-demo-nonce": nonce,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ amount: "0.01", currency: "USD" }),
  });
  const bodyResponse = await createOrder(bodyRequest);
  assert.equal(bodyResponse.status, 200);
  assert.equal(capturedRequests.length, 2);

  capturedRequests = [];
  process.env.PAYPAL_BASE_URL = "https://api-m.paypal.com";
  const productionUrlResponse = await createOrder(
    request("/api/paypal-demo/orders", {
      "x-paypal-demo-nonce": nonce,
    })
  );

  assert.equal(productionUrlResponse.status, 503);
  assert.equal(capturedRequests.length, 0);
});

test("Order creation sends the fixed USD amount and reuses an idempotency key", async () => {
  const first = await createSandboxOrder();
  const firstCreateCall = capturedRequests.find((call) =>
    call.url.endsWith("/v2/checkout/orders")
  );
  const firstRequestId = new Headers(firstCreateCall?.init.headers).get(
    "PayPal-Request-Id"
  );

  capturedRequests = [];
  const second = await createSandboxOrder();
  const secondCreateCall = capturedRequests.find((call) =>
    call.url.endsWith("/v2/checkout/orders")
  );
  const secondRequestId = new Headers(secondCreateCall?.init.headers).get(
    "PayPal-Request-Id"
  );

  assert.equal(first.orderId, orderId);
  assert.equal(typeof first.token, "string");
  assert.equal(secondRequestId, firstRequestId);
  assert.equal(second.orderId, orderId);
});

test("Capture requires a valid user-bound token and matching origin", async () => {
  const created = await createSandboxOrder();
  capturedRequests = [];

  const invalidToken = await captureSandboxOrder(`${created.token}altered`);
  assert.equal(invalidToken.status, 403);
  assert.equal(capturedRequests.length, 0);

  const wrongOrigin = await captureSandboxOrder(
    created.token,
    orderId,
    "https://untrusted.test"
  );
  assert.equal(wrongOrigin.status, 403);
  assert.equal(capturedRequests.length, 0);

  setCurrentUser({
    id: "c3333333-3333-3333-3333-333333333333",
    app_metadata: { role: "admin" },
  });
  const wrongUser = await captureSandboxOrder(created.token);

  assert.equal(wrongUser.status, 403);
  assert.equal(capturedRequests.length, 0);
});

test("Capture verifies the order and returns only a completed PayPal capture", async () => {
  const created = await createSandboxOrder();
  capturedRequests = [];

  const response = await captureSandboxOrder(created.token);
  const payload = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.equal(payload.status, "COMPLETED");
  assert.equal(payload.captureId, "TEST-CAPTURE-123");
  assert.deepEqual(
    capturedRequests.map((call) => new URL(call.url).pathname),
    [
      "/v1/oauth2/token",
      `/v2/checkout/orders/${orderId}`,
      `/v2/checkout/orders/${orderId}/capture`,
    ]
  );
  assert.equal(
    new Headers(capturedRequests[2].init.headers).get("PayPal-Request-Id")
      ?.length,
    32
  );
});

test("Capture rejects an unapproved order and a mismatched amount", async () => {
  const created = await createSandboxOrder();
  capturedRequests = [];
  currentOrderStatus = "CREATED";

  const unapproved = await captureSandboxOrder(created.token);
  assert.equal(unapproved.status, 409);
  assert.equal(
    capturedRequests.some((call) => call.url.endsWith("/capture")),
    false
  );

  currentOrderStatus = "APPROVED";
  responseAmount = "2.00";
  capturedRequests = [];
  const mismatchedAmount = await captureSandboxOrder(created.token);

  assert.equal(mismatchedAmount.status, 502);
  assert.equal(
    capturedRequests.some((call) => call.url.endsWith("/capture")),
    false
  );
});

test("Capture rejects an incomplete or mismatched PayPal capture response", async () => {
  const created = await createSandboxOrder();
  captureResponseStatus = "PENDING";

  const incompleteCapture = await captureSandboxOrder(created.token);
  assert.equal(incompleteCapture.status, 502);

  currentOrderStatus = "APPROVED";
  captureResponseStatus = "COMPLETED";
  captureResponseAmount = "0.50";
  const mismatchedCapture = await captureSandboxOrder(created.token);

  assert.equal(mismatchedCapture.status, 502);
});

test("A repeated capture request verifies the existing completed capture", async () => {
  const created = await createSandboxOrder();
  capturedRequests = [];
  currentOrderStatus = "COMPLETED";

  const response = await captureSandboxOrder(created.token);
  const payload = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(payload.alreadyCaptured, true);
  assert.equal(
    capturedRequests.some((call) => call.url.endsWith("/capture")),
    false
  );
});

test("The PayPal demonstration does not read or write purchase database rows", async () => {
  const created = await createSandboxOrder();
  await captureSandboxOrder(created.token);

  assert.deepEqual(queriedTables, []);
  assert.deepEqual(insertedPurchases, []);
  assert.deepEqual(rpcCalls, []);
  assert.deepEqual(approvalEvents, []);
});
