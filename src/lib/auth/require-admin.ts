import "server-only";

import { createClient } from "@/lib/supabase/server";

export async function getAdminUser() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  // Only trusted Supabase app_metadata can grant admin access.
  if (user.app_metadata?.role !== "admin") {
    return null;
  }

  return user;
}