"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();

    try {
      const { data, error: loginError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (loginError || !data.user) {
        setError("Invalid email or password. Please try again.");
        return;
      }

      if (data.user.app_metadata?.role !== "admin") {
        await supabase.auth.signOut();
        setError("This account does not have admin access.");
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#080b12] px-5 py-10 text-white">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">
            PROOF<span className="text-cyan-400">PAY</span>
          </h1>
          <p className="mt-2 text-xs tracking-[4px] text-slate-500">
            AI TRUST ENGINE
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-[#101622] p-7 shadow-2xl sm:p-9">
          <div className="mb-8">
            <p className="text-sm font-medium text-cyan-400">
              ADMIN PORTAL
            </p>
            <h2 className="mt-2 text-2xl font-bold">
              Welcome back
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Sign in to access your PROOFPAY dashboard.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm text-slate-300"
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Enter your admin email"
                className="w-full rounded-xl border border-white/10 bg-[#080b12] px-4 py-3 text-white outline-none placeholder:text-slate-600 focus:border-cyan-400"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-sm text-slate-300"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                className="w-full rounded-xl border border-white/10 bg-[#080b12] px-4 py-3 text-white outline-none placeholder:text-slate-600 focus:border-cyan-400"
              />
            </div>

            <div className="text-right">
              <Link
                href="/reset-password"
                className="text-sm text-cyan-400 hover:text-cyan-300"
              >
                Forgot password?
              </Link>
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-300"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-cyan-400 px-5 py-3.5 font-semibold text-[#080b12] transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Sign In to Dashboard"}
            </button>
          </form>

          <div className="mt-7 border-t border-white/10 pt-5 text-center">
            <p className="text-xs text-slate-500">
              <span className="text-cyan-400">●</span> Secure Admin Access
            </p>
            <p className="mt-2 text-xs text-slate-600">
              PROOFPAY AI · Demo Environment
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}