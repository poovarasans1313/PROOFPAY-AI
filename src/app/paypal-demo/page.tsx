import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getAdminUser } from "@/lib/auth/require-admin";
import PayPalSandboxDemo from "./PayPalSandboxDemo";

export default function PayPalDemoPage() {
  return (
    <main className="min-h-screen bg-[#080b12] px-5 py-10 text-white sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/"
          className="text-sm text-cyan-300 transition hover:text-cyan-200"
        >
          ← Back to dashboard
        </Link>

        <header className="mt-8">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-cyan-300">
            Standalone payment demo
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            PayPal Sandbox
          </h1>
          <p className="mt-3 max-w-2xl leading-7 text-slate-400">
            This isolated demonstration uses a fixed USD 1.00 Sandbox order.
            It is not connected to purchase requests, approvals, or real
            payments. No payment record is saved by PROOFPAY.
          </p>
        </header>

        <section className="mt-8 rounded-3xl border border-white/10 bg-[#101622] p-6 shadow-2xl sm:p-8">
          <Suspense
            fallback={
              <p className="text-sm text-slate-400">
                Checking your administrator session...
              </p>
            }
          >
            <AdminPayPalDemo />
          </Suspense>
        </section>
      </div>
    </main>
  );
}

async function AdminPayPalDemo() {
  await connection();

  const user = await getAdminUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <PayPalSandboxDemo
      clientId={process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? ""}
    />
  );
}
