
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);

  // Get the authorization code from Supabase.
  const code = requestUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(
      new URL("/set-password?error=missing_code", requestUrl.origin)
    );
  }

  // Exchange the PKCE authorization code for a session.
  const supabase = await createClient();

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("Authentication callback failed:", error.message);

    return NextResponse.redirect(
      new URL("/set-password?error=auth_callback_failed", requestUrl.origin)
    );
  }

  // Successful authentication: continue to password setup.
  return NextResponse.redirect(
    new URL("/set-password", requestUrl.origin)
  );
}
