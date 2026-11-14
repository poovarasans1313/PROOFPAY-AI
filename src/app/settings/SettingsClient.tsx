"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ConfigurationStatus = {
  label: string;
  state: string;
  configured: boolean;
};

type SettingsClientProps = {
  email: string | null;
  role: string;
  configuration: ConfigurationStatus[];
};

export default function SettingsClient({
  email,
  role,
  configuration,
}: SettingsClientProps) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutMessage, setSignOutMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  async function handleSignOut() {
    setIsSigningOut(true);
    setSignOutMessage(null);

    try {
      const { error } = await createClient().auth.signOut();

      if (error) {
        throw error;
      }

      setSignOutMessage({
        kind: "success",
        text: "Signed out successfully. Redirecting to login...",
      });
      window.setTimeout(() => {
        router.replace("/login");
        router.refresh();
      }, 700);
    } catch {
      setSignOutMessage({
        kind: "error",
        text: "Unable to sign out. Please try again.",
      });
      setIsSigningOut(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#080b12] px-5 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/"
          className="text-sm text-cyan-300 transition hover:text-cyan-200"
        >
          ← Back to dashboard
        </Link>

        <header className="mt-8">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-cyan-300">
            Administrator workspace
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Settings
          </h1>
          <p className="mt-3 max-w-2xl leading-7 text-slate-400">
            Review your account, application safeguards, and configuration
            readiness. Secret values are never displayed here.
          </p>
        </header>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <section
            aria-labelledby="account-settings-title"
            className="rounded-2xl border border-white/10 bg-[#101622] p-6"
          >
            <h2 id="account-settings-title" className="text-lg font-semibold">
              Admin account
            </h2>
            <dl className="mt-5 space-y-4 text-sm">
              <div>
                <dt className="text-slate-500">Signed-in email</dt>
                <dd className="mt-1 break-all text-slate-200">
                  {email ?? "Not available"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Role</dt>
                <dd className="mt-1 font-medium text-cyan-300">{role}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Authentication status</dt>
                <dd className="mt-1 text-emerald-300">
                  Session verified by Supabase on the server
                </dd>
              </div>
            </dl>

            <div className="mt-6 border-t border-white/10 pt-5">
              {signOutMessage && (
                <p
                  role={signOutMessage.kind === "error" ? "alert" : "status"}
                  className={`mb-4 text-sm ${
                    signOutMessage.kind === "error"
                      ? "text-red-300"
                      : "text-emerald-300"
                  }`}
                >
                  {signOutMessage.text}
                </p>
              )}
              <button
                type="button"
                onClick={handleSignOut}
                disabled={isSigningOut || signOutMessage?.kind === "success"}
                className="rounded-xl border border-red-400/30 px-4 py-2.5 text-sm font-medium text-red-300 transition hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSigningOut
                  ? "Signing out..."
                  : signOutMessage?.kind === "success"
                    ? "Signed out"
                    : "Sign out"}
              </button>
            </div>
          </section>

          <section
            aria-labelledby="application-settings-title"
            className="rounded-2xl border border-white/10 bg-[#101622] p-6"
          >
            <h2
              id="application-settings-title"
              className="text-lg font-semibold"
            >
              Application
            </h2>
            <dl className="mt-5 space-y-4 text-sm">
              <div>
                <dt className="text-slate-500">Project</dt>
                <dd className="mt-1 text-slate-200">PROOFPAY AI</dd>
              </div>
              <div>
                <dt className="text-slate-500">Security assessment</dt>
                <dd className="mt-1 text-slate-200">
                  Deterministic, rule-based demo engine
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Payment handling</dt>
                <dd className="mt-1 text-slate-200">
                  Assessment never approves or executes a payment
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">PayPal</dt>
                <dd className="mt-1 text-slate-200">
                  Separate Sandbox demonstration only
                </dd>
              </div>
            </dl>
          </section>

          <section
            aria-labelledby="configuration-settings-title"
            className="rounded-2xl border border-white/10 bg-[#101622] p-6 md:col-span-2"
          >
            <h2
              id="configuration-settings-title"
              className="text-lg font-semibold"
            >
              Environment configuration
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Only presence and safe format checks are shown. Secret values are
              not sent to the browser or exposed.
            </p>
            <ul className="mt-5 divide-y divide-white/5">
              {configuration.map((item) => (
                <li
                  key={item.label}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                >
                  <span className="text-slate-300">{item.label}</span>
                  <span
                    className={
                      item.configured
                        ? "text-emerald-300"
                        : "text-amber-300"
                    }
                  >
                    {item.state}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs leading-5 text-slate-500">
              The application origin must exactly match the browser&apos;s
              origin for protected API requests. PayPal Sandbox configuration
              is optional and is not connected to purchase approvals.
            </p>
          </section>

          <section
            aria-labelledby="privacy-settings-title"
            className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.04] p-6 md:col-span-2"
          >
            <h2 id="privacy-settings-title" className="text-lg font-semibold">
              Security and privacy
            </h2>
            <ul className="mt-4 list-inside list-disc space-y-2 text-sm leading-6 text-slate-400">
              <li>
                Protected pages and APIs verify the Supabase session and admin
                role on the server.
              </li>
              <li>
                Purchase risk results are recommendations; only an authorized
                human reviewer can approve or reject a pending request.
              </li>
              <li>
                The PayPal Sandbox demonstration is separate from purchase
                requests and does not process real payments.
              </li>
              <li>
                Do not enter production customer data or secrets into the demo.
              </li>
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}
