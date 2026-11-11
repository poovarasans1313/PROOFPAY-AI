import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase/server";

const MAX_BODY_BYTES = 4 * 1024;
const MAX_NOTE_LENGTH = 1000;

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
        console.error("Unable to cancel oversized review request body.");
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

function getCanonicalOrigin(): string | null {
  const configuredOrigin = process.env.APP_ORIGIN;

  if (!configuredOrigin) {
    return null;
  }

  try {
    const parsedOrigin = new URL(configuredOrigin);
    const isLocalDevelopmentOrigin =
      process.env.NODE_ENV !== "production" &&
      parsedOrigin.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(parsedOrigin.hostname);

    if (
      (parsedOrigin.protocol !== "https:" && !isLocalDevelopmentOrigin) ||
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

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
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

    if (user.app_metadata?.role !== "admin") {
      return NextResponse.json(
        { error: "Admin access required." },
        { status: 403 }
      );
    }

    const canonicalOrigin = getCanonicalOrigin();

    if (!canonicalOrigin) {
      return NextResponse.json(
        { error: "Server origin is not configured correctly." },
        { status: 500 }
      );
    }

    if (request.headers.get("origin") !== canonicalOrigin) {
      return NextResponse.json(
        { error: "Invalid request origin." },
        { status: 403 }
      );
    }

    const { id } = await context.params;

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id
      )
    ) {
      return NextResponse.json(
        { error: "Invalid purchase request ID." },
        { status: 400 }
      );
    }

    const bodyResult = await readJsonBody(request);

    if (!bodyResult.ok) {
      return NextResponse.json(
        { error: bodyResult.message },
        { status: bodyResult.status }
      );
    }

    if (
      typeof bodyResult.body !== "object" ||
      bodyResult.body === null ||
      Array.isArray(bodyResult.body)
    ) {
      return NextResponse.json(
        { error: "Invalid review request." },
        { status: 400 }
      );
    }

    const body = bodyResult.body as Record<string, unknown>;

    if (
      (body.action !== "approve" && body.action !== "reject") ||
      (body.note !== undefined && typeof body.note !== "string")
    ) {
      return NextResponse.json(
        { error: "Invalid review request." },
        { status: 400 }
      );
    }

    const note =
      typeof body.note === "string" ? body.note.trim() || null : null;

    if (note && note.length > MAX_NOTE_LENGTH) {
      return NextResponse.json(
        { error: "Review note must be 1000 characters or fewer." },
        { status: 400 }
      );
    }

    const action = body.action === "approve" ? "APPROVED" : "REJECTED";
    const { data, error } = await supabaseAdmin.rpc(
      "review_purchase_request",
      {
        p_purchase_request_id: id,
        p_action: action,
        p_actor_id: user.id,
        p_note: note,
      }
    );

    if (error) {
      console.error("Purchase review database operation failed.");

      return NextResponse.json(
        { error: "Unable to save the purchase decision." },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Request was not found or is no longer pending." },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      status: action,
    });
  } catch {
    console.error("Purchase review request failed.");

    return NextResponse.json(
      { error: "Unable to process the purchase decision." },
      { status: 500 }
    );
  }
}
