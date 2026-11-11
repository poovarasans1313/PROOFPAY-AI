
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      const supabase = createClient();

      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: `${window.location.origin}/auth/callback`,
        }
      );

      if (error) {
        setMessage(error.message);
        return;
      }

      setMessage(
        "If your account exists, a password recovery email has been sent. Check your inbox."
      );
    } catch {
      setMessage("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#080d18] px-4 text-white">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-5 rounded-2xl border border-white/10 bg-[#111a2b] p-8 shadow-2xl"
      >
        <div>
          <p className="text-sm font-semibold tracking-[0.25em] text-cyan-400">
            PROOFPAY AI
          </p>
          <h1 className="mt-4 text-3xl font-bold">
            Admin Password Recovery
          </h1>
          <p className="mt-2 text-sm text-gray-400">
            Enter your registered admin email to receive a password recovery link.
          </p>
        </div>

        <div>
          <label
            htmlFor="admin-email"
            className="mb-2 block text-sm text-gray-300"
          >
            Admin Email
          </label>
          <input
            id="admin-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your admin email"
            className="w-full rounded-lg border border-white/10 bg-[#080d18] px-4 py-3 outline-none focus:border-cyan-400"
          />
        </div>

        {message && (
          <p role="status" className="text-sm text-cyan-300">
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-cyan-400 px-4 py-3 font-bold text-black transition hover:bg-cyan-300 disabled:opacity-50"
        >
          {loading ? "Sending..." : "Send Recovery Email"}
        </button>
      </form>
    </main>
  );
}
