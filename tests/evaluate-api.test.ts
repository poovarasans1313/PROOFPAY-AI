import assert from "node:assert/strict";
import * as NodeModule from "node:module";
import test, { beforeEach } from "node:test";
import {
  insertedPurchases,
  queriedTables,
  resetApiMocks,
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

const { POST } = await import("../src/app/api/evaluate/route.ts");

const validPurchase = {
  merchant: "Amazon",
  merchantDomain: "amazon.com",
  product: "Keyboard",
  amount: 100,
  currency: "USD",
};

function request(
  body: BodyInit | null,
  options: { origin?: string | null } = { origin: canonicalOrigin }
): Request {
  const headers = new Headers({ "Content-Type": "application/json" });

  if (options.origin !== null) {
    headers.set("origin", options.origin ?? canonicalOrigin);
  }

  return new Request(`${canonicalOrigin}/api/evaluate`, {
    method: "POST",
    headers,
    body,
  });
}

function purchaseRequest(
  body: unknown = validPurchase,
  options: { origin?: string | null } = { origin: canonicalOrigin }
): Request {
  return request(JSON.stringify(body), options);
}

async function responseBody(response: Response): Promise<
  Record<string, unknown>
> {
  return (await response.json()) as Record<string, unknown>;
}

beforeEach(() => {
  resetApiMocks();
});

test("Unauthenticated request is rejected without inserting a purchase", async () => {
  setCurrentUser(null);

  const response = await POST(purchaseRequest());

  assert.equal(response.status, 401);
  assert.equal(insertedPurchases.length, 0);
});

test("Authenticated non-admin request is rejected without inserting a purchase", async () => {
  setCurrentUser({ app_metadata: { role: "user" } });

  const response = await POST(purchaseRequest());

  assert.equal(response.status, 403);
  assert.equal(insertedPurchases.length, 0);
});

test("Missing origin is rejected without inserting a purchase", async () => {
  const response = await POST(purchaseRequest(validPurchase, { origin: null }));

  assert.equal(response.status, 403);
  assert.equal(insertedPurchases.length, 0);
});

test("Incorrect origin is rejected without inserting a purchase", async () => {
  const response = await POST(
    purchaseRequest(validPurchase, { origin: "https://untrusted.test" })
  );

  assert.equal(response.status, 403);
  assert.equal(insertedPurchases.length, 0);
});

test("Malformed JSON is rejected without inserting a purchase", async () => {
  const response = await POST(request("{"));

  assert.equal(response.status, 400);
  assert.equal(insertedPurchases.length, 0);
});

test("Empty request body is rejected without inserting a purchase", async () => {
  const response = await POST(request(null));

  assert.equal(response.status, 400);
  assert.equal(insertedPurchases.length, 0);
});

test("Malformed UTF-8 JSON is rejected without inserting a purchase", async () => {
  const response = await POST(request(new Uint8Array([0xff])));

  assert.equal(response.status, 400);
  assert.equal(insertedPurchases.length, 0);
});

for (const body of ["NaN", "Infinity", "-Infinity"]) {
  test(`Non-JSON numeric token ${body} is rejected`, async () => {
    const response = await POST(request(body));

    assert.equal(response.status, 400);
    assert.equal(insertedPurchases.length, 0);
  });
}

test("JSON number that parses to Infinity is rejected", async () => {
  const response = await POST(
    request(
      '{"merchant":"Amazon","merchantDomain":"amazon.com","product":"Keyboard","amount":1e400,"currency":"USD"}'
    )
  );

  assert.equal(response.status, 400);
  assert.equal(insertedPurchases.length, 0);
});

for (const body of [null, [], "purchase", 42, true]) {
  test(`Unexpected top-level JSON value ${JSON.stringify(body)} is rejected`, async () => {
    const response = await POST(purchaseRequest(body));

    assert.equal(response.status, 400);
    assert.equal(insertedPurchases.length, 0);
  });
}

for (const field of [
  "merchant",
  "merchantDomain",
  "product",
  "amount",
  "currency",
] as const) {
  test(`Missing ${field} is rejected without inserting a purchase`, async () => {
    const body: Record<string, unknown> = { ...validPurchase };
    delete body[field];

    const response = await POST(purchaseRequest(body));

    assert.equal(response.status, 400);
    assert.equal(insertedPurchases.length, 0);
  });
}

const invalidFieldValues: Array<[string, unknown]> = [
  ["merchant", 12],
  ["merchantDomain", null],
  ["product", false],
  ["amount", "100"],
  ["currency", []],
];

for (const [field, value] of invalidFieldValues) {
  test(`Incorrect ${field} type is rejected`, async () => {
    const response = await POST(
      purchaseRequest({ ...validPurchase, [field]: value })
    );

    assert.equal(response.status, 400);
    assert.equal(insertedPurchases.length, 0);
  });
}

for (const field of ["merchant", "merchantDomain", "product", "currency"]) {
  for (const value of ["", "   "]) {
    test(`Blank ${field} value ${JSON.stringify(value)} is rejected`, async () => {
      const response = await POST(
        purchaseRequest({ ...validPurchase, [field]: value })
      );

      assert.equal(response.status, 400);
      assert.equal(insertedPurchases.length, 0);
    });
  }
}

test("Missing required purchase field is rejected", async () => {
  const missingDomain = {
    merchant: validPurchase.merchant,
    product: validPurchase.product,
    amount: validPurchase.amount,
    currency: validPurchase.currency,
  };
  const response = await POST(purchaseRequest(missingDomain));

  assert.equal(response.status, 400);
  assert.equal(insertedPurchases.length, 0);
});

test("Incorrect purchase field type is rejected", async () => {
  const response = await POST(
    purchaseRequest({ ...validPurchase, amount: "100" })
  );

  assert.equal(response.status, 400);
  assert.equal(insertedPurchases.length, 0);
});

test("Zero amount is rejected", async () => {
  const response = await POST(purchaseRequest({ ...validPurchase, amount: 0 }));

  assert.equal(response.status, 400);
  assert.equal(insertedPurchases.length, 0);
});

test("Negative amount is rejected", async () => {
  const response = await POST(
    purchaseRequest({ ...validPurchase, amount: -1 })
  );

  assert.equal(response.status, 400);
  assert.equal(insertedPurchases.length, 0);
});

test("Excessive amount is rejected", async () => {
  const response = await POST(
    purchaseRequest({ ...validPurchase, amount: 1_000_000_001 })
  );

  assert.equal(response.status, 400);
  assert.equal(insertedPurchases.length, 0);
});

test("Amount above the API limit is rejected", async () => {
  const response = await POST(
    purchaseRequest({ ...validPurchase, amount: 1_000_000_000.01 })
  );

  assert.equal(response.status, 400);
  assert.equal(insertedPurchases.length, 0);
});

test("Malformed three-letter currency code is rejected", async () => {
  const response = await POST(
    purchaseRequest({ ...validPurchase, currency: "US$" })
  );

  assert.equal(response.status, 400);
  assert.equal(insertedPurchases.length, 0);
});

test("Oversized declared content length is rejected", async () => {
  const oversizedDeclaredBody = new Request(
    "https://proofpay.test/api/evaluate",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "16385",
        origin: canonicalOrigin,
      },
      body: "{}",
    }
  );

  const response = await POST(oversizedDeclaredBody);

  assert.equal(response.status, 413);
  assert.equal(insertedPurchases.length, 0);
});

test("Oversized streamed body is rejected when Content-Length is absent", async () => {
  const response = await POST(
    request(JSON.stringify({ ...validPurchase, extra: "x".repeat(17_000) }))
  );

  assert.equal(response.status, 413);
  assert.equal(insertedPurchases.length, 0);
});

test("Unexpected properties cannot override computed purchase status", async () => {
  const response = await POST(
    purchaseRequest({
      ...validPurchase,
      status: "APPROVED",
      decision: "READY_FOR_HUMAN_APPROVAL",
      paymentExecuted: true,
    })
  );
  const body = await responseBody(response);

  assert.equal(response.status, 200);
  assert.equal(body.status, "PENDING_APPROVAL");
  assert.equal(insertedPurchases.length, 1);
  assert.equal(insertedPurchases[0].status, "PENDING_APPROVAL");
  assert.equal("paymentExecuted" in insertedPurchases[0], false);
});

test("Matching merchant name and domain creates a pending approval request", async () => {
  const response = await POST(purchaseRequest());
  const body = await responseBody(response);

  assert.equal(response.status, 200);
  assert.equal(body.decision, "READY_FOR_HUMAN_APPROVAL");
  assert.equal(body.status, "PENDING_APPROVAL");
  assert.equal(body.saved, true);
  assert.equal(insertedPurchases.length, 1);
  assert.equal(insertedPurchases[0].merchant, "Amazon");
  assert.equal(insertedPurchases[0].status, "PENDING_APPROVAL");
});

test("Mismatched merchant name and domain require review", async () => {
  const response = await POST(
    purchaseRequest({ ...validPurchase, merchant: "Fake Store" })
  );
  const body = await responseBody(response);

  assert.equal(response.status, 200);
  assert.equal(body.decision, "REVIEW_REQUIRED");
  assert.equal(body.status, "PENDING_REVIEW");
  assert.equal(insertedPurchases[0].status, "PENDING_REVIEW");
});

test("Unsupported currency requires review", async () => {
  const response = await POST(
    purchaseRequest({ ...validPurchase, currency: "INR" })
  );
  const body = await responseBody(response);

  assert.equal(response.status, 200);
  assert.equal(body.decision, "REVIEW_REQUIRED");
  assert.equal(body.status, "PENDING_REVIEW");
  assert.equal(insertedPurchases[0].status, "PENDING_REVIEW");
});

test("Evaluation persists only pending requests and does not execute payments", async () => {
  const response = await POST(purchaseRequest());
  const body = await responseBody(response);

  assert.equal(response.status, 200);
  assert.equal(body.status, "PENDING_APPROVAL");
  assert.equal(insertedPurchases.length, 1);
  assert.notEqual(insertedPurchases[0].status, "APPROVED");
  assert.deepEqual(queriedTables, ["purchase_requests"]);
});
