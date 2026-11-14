import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/auth/require-admin";
import SettingsClient from "./SettingsClient";

type ConfigurationStatus = {
  label: string;
  state: string;
  configured: boolean;
};

function isValidAppOrigin(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  try {
    const origin = new URL(value);
    const isLocalDevelopmentOrigin =
      process.env.NODE_ENV !== "production" &&
      origin.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);

    return (
      (origin.protocol === "https:" || isLocalDevelopmentOrigin) &&
      !origin.username &&
      !origin.password &&
      origin.pathname === "/" &&
      !origin.search &&
      !origin.hash
    );
  } catch {
    return false;
  }
}

function getConfigurationStatus(): ConfigurationStatus[] {
  const paypalConfigured =
    Boolean(process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID) &&
    Boolean(process.env.PAYPAL_CLIENT_SECRET) &&
    Boolean(process.env.PAYPAL_DEMO_SIGNING_SECRET) &&
    Buffer.byteLength(process.env.PAYPAL_DEMO_SIGNING_SECRET ?? "", "utf8") >=
      32 &&
    process.env.PAYPAL_BASE_URL ===
      "https://api-m.sandbox.paypal.com";

  return [
    {
      label: "Supabase project URL",
      state: process.env.NEXT_PUBLIC_SUPABASE_URL ? "Configured" : "Missing",
      configured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    },
    {
      label: "Supabase publishable key",
      state: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
        ? "Configured"
        : "Missing",
      configured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    },
    {
      label: "Server-only Supabase key",
      state: process.env.SUPABASE_SECRET_KEY ? "Configured" : "Missing",
      configured: Boolean(process.env.SUPABASE_SECRET_KEY),
    },
    {
      label: "Canonical application origin",
      state: isValidAppOrigin(process.env.APP_ORIGIN)
        ? "Valid format"
        : "Missing or invalid",
      configured: isValidAppOrigin(process.env.APP_ORIGIN),
    },
    {
      label: "PayPal Sandbox demonstration",
      state: paypalConfigured ? "Configured" : "Optional · Not configured",
      configured: paypalConfigured,
    },
  ];
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#080b12] text-white">
          Checking administrator session...
        </main>
      }
    >
      <AdminSettingsPage />
    </Suspense>
  );
}

async function AdminSettingsPage() {
  await connection();

  const user = await getAdminUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <SettingsClient
      email={user.email ?? null}
      role={user.app_metadata.role}
      configuration={getConfigurationStatus()}
    />
  );
}
