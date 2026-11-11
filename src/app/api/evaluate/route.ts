
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { evaluatePurchase } from "@/lib/security-engine";
import { supabaseAdmin } from "@/lib/supabase-admin";

const MAX_BODY_BYTES = 16 * 1024;

function getCanonicalOrigin(): string | null {
  const configuredOrigin = process.env.APP_ORIGIN;

  if (!configuredOrigin) {
    return null;
  }

  try {
    const parsedOrigin = new URL(configuredOrigin);

    if (
      (parsedOrigin.protocol !== "https:" &&
        !(process.env.NODE_ENV !== "production" &&
          parsedOrigin.protocol === "http:" &&
          (parsedOrigin.hostname === "localhost" ||
            parsedOrigin.hostname === "127.0.0.1" ||
            parsedOrigin.hostname === "[::1]"))) ||
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

async function readJsonBody(
  request: Request
): Promise<
  | { ok: true; body: unknown }
  | { ok: false; status: 400 | 413; message: string }
> {
  const contentLengthHeader = request.headers.get("content-length");

  if (contentLengthHeader !== null) {
    if (!/^\d+$/.test(contentLengthHeader)) {
      return {
        ok: false,
        status: 400,
        message: "Invalid Content-Length header.",
      };
    }

    const contentLength = Number(contentLengthHeader);

    if (!Number.isSafeInteger(contentLength)) {
      return {
        ok: false,
        status: 400,
        message: "Invalid Content-Length header.",
      };
    }

    if (contentLength > MAX_BODY_BYTES) {
      return {
        ok: false,
        status: 413,
        message: "Request body is too large.",
      };
    }
  }

  if (!request.body) {
    return {
      ok: false,
      status: 400,
      message: "Invalid JSON request body.",
    };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    totalBytes += value.byteLength;

    if (totalBytes > MAX_BODY_BYTES) {
      void reader.cancel().catch(() => {
        console.error("Unable to cancel oversized request body stream.");
      });

      return {
        ok: false,
        status: 413,
        message: "Request body is too large.",
      };
    }

    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);

    return { ok: true, body: JSON.parse(text) as unknown };
  } catch {
    return {
      ok: false,
      status: 400,
      message: "Invalid JSON request body.",
    };
  }
}

export async function POST(request: Request) {
  try {
    // 1. Verify the signed-in user
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      );
    }

    // 2. Verify trusted admin role
    if (user.app_metadata?.role !== "admin") {
      return NextResponse.json(
        { error: "Admin access required." },
        { status: 403 }
      );
    }

    // 3. Require the configured public origin; do not trust forwarded headers.
    const canonicalOrigin = getCanonicalOrigin();

    if (!canonicalOrigin) {
      return NextResponse.json(
        { error: "Server origin is not configured correctly." },
        { status: 500 }
      );
    }

    const origin = request.headers.get("origin");

    if (!origin || origin !== canonicalOrigin) {
      return NextResponse.json(
        { error: "Invalid request origin." },
        { status: 403 }
      );
    }

    // 4. Read and validate request with a streaming size limit.
    const bodyResult = await readJsonBody(request);

    if (!bodyResult.ok) {
      return NextResponse.json(
        { error: bodyResult.message },
        { status: bodyResult.status }
      );
    }

    const body = bodyResult.body;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Invalid purchase request." },
        { status: 400 }
      );
    }

    const input = body as Record<string, unknown>;

    if (
      typeof input.merchant !== "string" ||
      typeof input.merchantDomain !== "string" ||
      typeof input.product !== "string" ||
      typeof input.amount !== "number" ||
      !Number.isFinite(input.amount) ||
      typeof input.currency !== "string"
    ) {
      return NextResponse.json(
        { error: "Invalid purchase request." },
        { status: 400 }
      );
    }

    const purchase = {
      merchant: input.merchant.trim(),
      merchantDomain: input.merchantDomain.trim(),
      product: input.product.trim(),
      amount: input.amount,
      currency: input.currency.trim().toUpperCase(),
    };

    if (
      !purchase.merchant ||
      purchase.merchant.length > 120 ||
      !purchase.merchantDomain ||
      purchase.merchantDomain.length > 253 ||
      !purchase.product ||
      purchase.product.length > 200 ||
      purchase.amount <= 0 ||
      purchase.amount > 1_000_000_000 ||
      !/^[A-Z]{3}$/.test(purchase.currency)
    ) {
      return NextResponse.json(
        { error: "Purchase details are outside the allowed limits." },
        { status: 400 }
      );
    }

    // 5. Evaluate purchase
    const result = evaluatePurchase(purchase);

    let status:
      | "PENDING_APPROVAL"
      | "PENDING_REVIEW"
      | "BLOCKED";

    if (result.decision === "READY_FOR_HUMAN_APPROVAL") {
      status = "PENDING_APPROVAL";
    } else if (result.decision === "REVIEW_REQUIRED") {
      status = "PENDING_REVIEW";
    } else {
      status = "BLOCKED";
    }

    // 6. Save using the server-only admin client
    const { data, error } = await supabaseAdmin
      .from("purchase_requests")
      .insert({
        merchant: purchase.merchant,
        merchant_domain: purchase.merchantDomain,
        product: purchase.product,
        amount: purchase.amount,
        currency: purchase.currency,
        risk_score: result.riskScore,
        risk_level: result.riskLevel,
        decision: result.decision,
        status,
        reasons: result.reasons,
        next_action: result.nextAction,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Purchase database save failed:", error.message);

      return NextResponse.json(
        { error: "Purchase evaluated, but database save failed." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ...result,
      requestId: data.id,
      status,
      saved: true,
    });
  } catch (error) {
    console.error("Purchase evaluation error:", error);

    return NextResponse.json(
      { error: "Unable to evaluate purchase request." },
      { status: 500 }
    );
  }
}
