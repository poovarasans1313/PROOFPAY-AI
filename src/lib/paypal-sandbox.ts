import "server-only";

import { Buffer } from "node:buffer";
import { createPayPalRequestId } from "@/lib/paypal-demo-token";

export const PAYPAL_DEMO_AMOUNT = "1.00";
export const PAYPAL_DEMO_CURRENCY = "USD";
export const PAYPAL_SANDBOX_BASE_URL = "https://api-m.sandbox.paypal.com";

export class PayPalSandboxError extends Error {
  readonly code:
    | "configuration"
    | "network"
    | "upstream"
    | "invalid_response"
    | "order_state"
    | "verification";
  readonly status?: number;

  constructor(
    code:
      | "configuration"
      | "network"
      | "upstream"
      | "invalid_response"
      | "order_state"
      | "verification",
    status?: number
  ) {
    super(code);
    this.name = "PayPalSandboxError";
    this.code = code;
    this.status = status;
  }
}

type PayPalConfig = {
  clientId: string;
  clientSecret: string;
};

type PayPalOrder = {
  id: string;
  status: string;
  intent: string;
  purchase_units: Array<{
    amount: {
      currency_code: string;
      value: string;
    };
    payments?: {
      captures?: Array<{
        id: string;
        status: string;
        amount: {
          currency_code: string;
          value: string;
        };
      }>;
    };
  }>;
};

export type VerifiedDemoCapture = {
  orderId: string;
  captureId: string;
  alreadyCaptured: boolean;
};

function getConfig(): PayPalConfig {
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (
    !clientId ||
    !clientSecret ||
    process.env.PAYPAL_BASE_URL !== PAYPAL_SANDBOX_BASE_URL
  ) {
    throw new PayPalSandboxError("configuration");
  }

  return { clientId, clientSecret };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function fetchJson(
  url: string,
  init: RequestInit
): Promise<unknown> {
  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new PayPalSandboxError("network");
  }

  if (!response.ok) {
    throw new PayPalSandboxError("upstream", response.status);
  }

  try {
    return await response.json();
  } catch {
    throw new PayPalSandboxError("invalid_response", response.status);
  }
}

async function getAccessToken(config: PayPalConfig): Promise<string> {
  const credentials = Buffer.from(
    `${config.clientId}:${config.clientSecret}`,
    "utf8"
  ).toString("base64");
  const response = await fetchJson(
    `${PAYPAL_SANDBOX_BASE_URL}/v1/oauth2/token`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: "grant_type=client_credentials",
    }
  );

  if (
    !isRecord(response) ||
    typeof response.access_token !== "string" ||
    response.access_token.length < 20 ||
    response.access_token.length > 8192 ||
    response.token_type !== "Bearer" ||
    typeof response.expires_in !== "number" ||
    !Number.isFinite(response.expires_in) ||
    response.expires_in <= 0
  ) {
    throw new PayPalSandboxError("invalid_response");
  }

  return response.access_token;
}

async function callPayPal(
  path: string,
  accessToken: string,
  init: RequestInit
): Promise<unknown> {
  return fetchJson(`${PAYPAL_SANDBOX_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

function parseOrder(value: unknown, expectedId?: string): PayPalOrder {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !/^[A-Za-z0-9-]{1,64}$/.test(value.id) ||
    (expectedId !== undefined && value.id !== expectedId) ||
    typeof value.status !== "string" ||
    value.intent !== "CAPTURE" ||
    !Array.isArray(value.purchase_units) ||
    value.purchase_units.length !== 1
  ) {
    throw new PayPalSandboxError("invalid_response");
  }

  const unit = value.purchase_units[0];

  if (
    !isRecord(unit) ||
    !isRecord(unit.amount) ||
    unit.amount.currency_code !== PAYPAL_DEMO_CURRENCY ||
    unit.amount.value !== PAYPAL_DEMO_AMOUNT
  ) {
    throw new PayPalSandboxError("verification");
  }

  const parsedUnit: PayPalOrder["purchase_units"][number] = {
    amount: {
      currency_code: PAYPAL_DEMO_CURRENCY,
      value: PAYPAL_DEMO_AMOUNT,
    },
  };

  if (unit.payments !== undefined) {
    if (
      !isRecord(unit.payments) ||
      !Array.isArray(unit.payments.captures)
    ) {
      throw new PayPalSandboxError("invalid_response");
    }

    parsedUnit.payments = {
      captures: unit.payments.captures.map((capture) => {
        if (
          !isRecord(capture) ||
          typeof capture.id !== "string" ||
          typeof capture.status !== "string" ||
          !isRecord(capture.amount) ||
          typeof capture.amount.currency_code !== "string" ||
          typeof capture.amount.value !== "string"
        ) {
          throw new PayPalSandboxError("invalid_response");
        }

        return {
          id: capture.id,
          status: capture.status,
          amount: {
            currency_code: capture.amount.currency_code,
            value: capture.amount.value,
          },
        };
      }),
    };
  }

  return {
    id: value.id,
    status: value.status,
    intent: "CAPTURE",
    purchase_units: [parsedUnit],
  };
}

function getCompletedCapture(order: PayPalOrder): string {
  const captures = order.purchase_units[0]?.payments?.captures;

  if (
    !captures ||
    captures.length !== 1 ||
    captures[0].status !== "COMPLETED" ||
    captures[0].amount.currency_code !== PAYPAL_DEMO_CURRENCY ||
    captures[0].amount.value !== PAYPAL_DEMO_AMOUNT ||
    !/^[A-Za-z0-9-]{1,64}$/.test(captures[0].id)
  ) {
    throw new PayPalSandboxError("verification");
  }

  return captures[0].id;
}

export async function createDemoOrder(
  userId: string,
  nonce: string
): Promise<string> {
  const config = getConfig();
  const requestId = createPayPalRequestId("order", `${userId}:${nonce}`);
  const accessToken = await getAccessToken(config);
  const response = await callPayPal(
    "/v2/checkout/orders",
    accessToken,
    {
      method: "POST",
      headers: {
        "PayPal-Request-Id": requestId,
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            description: "PROOFPAY standalone Sandbox demonstration",
            amount: {
              currency_code: PAYPAL_DEMO_CURRENCY,
              value: PAYPAL_DEMO_AMOUNT,
            },
          },
        ],
      }),
    }
  );
  const order = parseOrder(response);

  if (order.status !== "CREATED") {
    throw new PayPalSandboxError("invalid_response");
  }

  return order.id;
}

export async function captureDemoOrder(
  orderId: string
): Promise<VerifiedDemoCapture> {
  const config = getConfig();
  const accessToken = await getAccessToken(config);
  const orderPath = `/v2/checkout/orders/${encodeURIComponent(orderId)}`;
  const currentOrder = parseOrder(
    await callPayPal(orderPath, accessToken, { method: "GET" }),
    orderId
  );

  if (currentOrder.status === "COMPLETED") {
    return {
      orderId,
      captureId: getCompletedCapture(currentOrder),
      alreadyCaptured: true,
    };
  }

  if (currentOrder.status !== "APPROVED") {
    throw new PayPalSandboxError("order_state");
  }

  const response = parseOrder(
    await callPayPal(`${orderPath}/capture`, accessToken, {
      method: "POST",
      headers: {
        "PayPal-Request-Id": createPayPalRequestId("capture", orderId),
        Prefer: "return=representation",
      },
      body: "{}",
    }),
    orderId
  );

  if (response.status !== "COMPLETED") {
    throw new PayPalSandboxError("verification");
  }

  return {
    orderId,
    captureId: getCompletedCapture(response),
    alreadyCaptured: false,
  };
}
