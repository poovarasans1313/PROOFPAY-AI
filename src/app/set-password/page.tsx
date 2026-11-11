
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    async function checkSession() {
      const supabase = createClient();
      const { data, error } = await supabase.auth.getUser();

      setHasSession(!error && !!data.user);
      setChecking(false);
    }

    checkSession();
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");

    if (password.length < 8) {
      setMessage("Password must contain at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setMessage(error.message);
        return;
      }

      setMessage("Password updated successfully! You can now use your new password.");
      setPassword("");
      setConfirmPassword("");
    } catch {
      setMessage("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#080d18] text-white">
        Checking your recovery session...
      </main>
    );
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
          <h1 className="mt-4 text-3xl font-bold">Set Admin Password</h1>
          <p className="mt-2 text-sm text-gray-400">
            Create a new password for your admin account.
          </p>
        </div>

        {!hasSession ? (
          <p className="text-sm text-red-400">
            No active recovery session found. Please request a new recovery link.
          </p>
        ) : (
          <>
            <label
              htmlFor="new-password"
              className="flex flex-col gap-2 text-sm text-gray-300"
            >
              New password
              <input
                id="new-password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter new password"
                className="w-full rounded-lg border border-white/10 bg-[#080d18] px-4 py-3 outline-none focus:border-cyan-400"
              />
            </label>

            <label
              htmlFor="confirm-password"
              className="flex flex-col gap-2 text-sm text-gray-300"
            >
              Confirm new password
              <input
                id="confirm-password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="w-full rounded-lg border border-white/10 bg-[#080d18] px-4 py-3 outline-none focus:border-cyan-400"
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-cyan-400 px-4 py-3 font-bold text-black transition hover:bg-cyan-300 disabled:opacity-50"
            >
              {loading ? "Updating..." : "Update Password"}
            </button>
          </>
        )}

        {message && (
          <p role="status" className="text-sm text-cyan-300">
            {message}
          </p>
        )}
      </form>
    </main>
  );
}
