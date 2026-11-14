import { createDemoToken } from "@/lib/paypal-demo-token";
import {
  createDemoOrder,
  PayPalSandboxError,
} from "@/lib/paypal-sandbox";
import { createClient } from "@/lib/supabase/server";

function getCanonicalOrigin(): string | null {
  const configuredOrigin = process.env.APP_ORIGIN;

  if (!configuredOrigin) {
    return null;
  }

  try {
    const parsedOrigin = new URL(configuredOrigin);
    const localDevelopmentOrigin =
      process.env.NODE_ENV !== "production" &&
      parsedOrigin.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(parsedOrigin.hostname);

    if (
      (parsedOrigin.protocol !== "https:" && !localDevelopmentOrigin) ||
      parsedOrigin.username ||
      parsedOrigin.password ||
      parsedOrigin.pathname !== "/" ||
      parsedOrigin.search ||
      parsedOrigin.hash
    ) {
      return null;
    }

    return parsedOrigin.origin;
  } catch {
    return null;
  }
}

function payPalErrorResponse(error: unknown): Response {
  if (error instanceof PayPalSandboxError) {
    console.error("PayPal Sandbox order creation failed.", {
      code: error.code,
      status: error.status,
    });

    if (error.code === "configuration") {
      return Response.json(
        { error: "The Sandbox demonstration is not configured." },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }
  } else {
    console.error("Unexpected PayPal Sandbox order creation failure.");
  }

  return Response.json(
    { error: "Unable to create a Sandbox demonstration order." },
    { status: 502, headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request): Promise<Response> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return Response.json(
        { error: "Authentication required." },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (user.app_metadata?.role !== "admin") {
      return Response.json(
        { error: "Admin access required." },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }

    const canonicalOrigin = getCanonicalOrigin();

    if (!canonicalOrigin) {
      return Response.json(
        { error: "Server origin is not configured correctly." },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (request.headers.get("origin") !== canonicalOrigin) {
      return Response.json(
        { error: "Invalid request origin." },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }

    const nonce = request.headers.get("x-paypal-demo-nonce");

    if (
      !nonce ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        nonce
      )
    ) {
      return Response.json(
        { error: "Invalid Sandbox order request." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const orderId = await createDemoOrder(user.id, nonce);
    const token = createDemoToken(user.id, orderId);

    return Response.json(
      { orderId, token },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return payPalErrorResponse(error);
  }
}
