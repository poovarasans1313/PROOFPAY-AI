
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const userId = process.argv[2];

if (!url || !secret || !userId) {
  console.error("Missing Supabase configuration or User ID.");
  process.exit(1);
}

const supabase = createClient(url, secret, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const { data, error } = await supabase.auth.admin.getUserById(userId);

if (error || !data.user) {
  console.error("Could not find that user. Check the User ID.");
  process.exit(1);
}

console.log("User exists.");
console.log(
  `Admin role configured: ${data.user.app_metadata?.role === "admin" ? "yes" : "no"}`
);
