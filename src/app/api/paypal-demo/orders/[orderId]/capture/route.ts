import {
  captureDemoOrder,
  PayPalSandboxError,
} from "@/lib/paypal-sandbox";
import { verifyDemoToken } from "@/lib/paypal-demo-token";
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
    console.error("PayPal Sandbox capture failed.", {
      code: error.code,
      status: error.status,
    });

    if (error.code === "configuration") {
      return Response.json(
        { error: "The Sandbox demonstration is not configured." },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (error.code === "order_state") {
      return Response.json(
        { error: "The Sandbox order has not been approved by the buyer." },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }
  } else {
    console.error("Unexpected PayPal Sandbox capture failure.");
  }

  return Response.json(
    { error: "Unable to verify the Sandbox capture." },
    { status: 502, headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ orderId: string }> }
): Promise<Response> {
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

    if (request.body !== null) {
      return Response.json(
        { error: "This endpoint does not accept a request body." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const { orderId } = await context.params;

    if (!/^[A-Za-z0-9-]{1,64}$/.test(orderId)) {
      return Response.json(
        { error: "Invalid Sandbox order ID." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const token = request.headers.get("x-paypal-demo-token");

    if (
      !token ||
      token.length > 2048 ||
      !verifyDemoToken(token, user.id, orderId)
    ) {
      return Response.json(
        { error: "Invalid or expired Sandbox capture token." },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }

    const capture = await captureDemoOrder(orderId);

    return Response.json(
      {
        success: true,
        status: "COMPLETED",
        orderId: capture.orderId,
        captureId: capture.captureId,
        alreadyCaptured: capture.alreadyCaptured,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return payPalErrorResponse(error);
  }
}
