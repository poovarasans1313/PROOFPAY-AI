
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { SecurityResult } from "@/lib/security-engine";

export type DashboardMetrics = {
  totalRequests: number;
  pendingApprovals: number;
  pendingReviews: number;
  blockedRequests: number;
  approvedRequests: number;
  rejectedRequests: number;
  lowRiskRequests: number;
  mediumRiskRequests: number;
  highRiskRequests: number;
};

export type PurchaseRecord = {
  id: string;
  merchant: string;
  product: string;
  amount: number | string;
  currency: string;
  risk_score: number | null;
  risk_level: string | null;
  decision: string;
  status: string;
  created_at: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  review_note?: string | null;
};

type DashboardClientProps = {
  metrics: DashboardMetrics;
  purchases: PurchaseRecord[];
  pendingPurchases: PurchaseRecord[];
  dataError?: string;
};

type ReviewFeedback = {
  requestId: string;
  kind: "success" | "error";
  message: string;
};

function formatAmount(amount: number | string, currency: string): string {
  const numericAmount = typeof amount === "number" ? amount : Number(amount);

  if (!Number.isFinite(numericAmount)) {
    return `${currency} ${amount}`;
  }

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(numericAmount);
  } catch {
    return `${currency} ${numericAmount.toFixed(2)}`;
  }
}

function formatDate(value: string | null): string {
  if (!value) {
    return "Date unavailable";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getStatusStyle(status: string): string {
  switch (status) {
    case "PENDING_APPROVAL":
      return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
    case "PENDING_REVIEW":
      return "border-amber-400/30 bg-amber-400/10 text-amber-300";
    case "BLOCKED":
      return "border-red-400/30 bg-red-400/10 text-red-300";
    case "APPROVED":
      return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
    case "REJECTED":
      return "border-red-400/30 bg-red-400/10 text-red-300";
    default:
      return "border-white/10 bg-white/5 text-slate-300";
  }
}

function isSecurityResult(value: unknown): value is SecurityResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const result = value as Record<string, unknown>;

  return (
    (result.decision === "READY_FOR_HUMAN_APPROVAL" ||
      result.decision === "REVIEW_REQUIRED" ||
      result.decision === "BLOCKED") &&
    (result.riskLevel === "LOW" ||
      result.riskLevel === "MEDIUM" ||
      result.riskLevel === "HIGH") &&
    typeof result.riskScore === "number" &&
    Number.isFinite(result.riskScore) &&
    Array.isArray(result.reasons) &&
    result.reasons.every((reason) => typeof reason === "string") &&
    typeof result.nextAction === "string"
  );
}

export default function DashboardClient({
  metrics,
  purchases,
  pendingPurchases,
  dataError,
}: DashboardClientProps) {
  const router = useRouter();
  const [activeWorkspace, setActiveWorkspace] = useState<
    "dashboard" | "approvals"
  >("dashboard");

  const [merchant, setMerchant] = useState("");
  const [merchantDomain, setMerchantDomain] = useState("");
  const [product, setProduct] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");

  const [result, setResult] = useState<SecurityResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(
    null
  );
  const [reviewFeedback, setReviewFeedback] = useState<ReviewFeedback | null>(
    null
  );

  // ADMIN LOGOUT
  async function handleLogout() {
    setIsLoggingOut(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }

      router.replace("/login");
      router.refresh();
    } catch {
      setError("Unable to sign out. Please try again.");
      setIsLoggingOut(false);
    }
  }

  async function handleReview(
    requestId: string,
    action: "approve" | "reject"
  ) {
    setReviewingRequestId(requestId);
    setReviewFeedback(null);

    try {
      const response = await fetch(
        `/api/purchase-requests/${encodeURIComponent(requestId)}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            note: reviewNotes[requestId] ?? "",
          }),
        }
      );

      let payload: unknown;

      try {
        payload = await response.json();
      } catch {
        throw new Error("The server returned an unreadable response.");
      }

      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : `Request failed with status ${response.status}.`;

        throw new Error(message);
      }

      setReviewFeedback({
        requestId,
        kind: "success",
        message: `Purchase request ${action === "approve" ? "approved" : "rejected"}.`,
      });
      router.refresh();
    } catch (reviewError) {
      setReviewFeedback({
        requestId,
        kind: "error",
        message:
          reviewError instanceof Error
            ? reviewError.message
            : "Unable to save the purchase decision. Please try again.",
      });
    } finally {
      setReviewingRequestId(null);
    }
  }

  // PURCHASE EVALUATION
  async function handleEvaluate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError(null);
    setResult(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          merchant,
          merchantDomain,
          product,
          amount: Number(amount),
          currency,
        }),
      });

      let payload: unknown;

      try {
        payload = await response.json();
      } catch {
        throw new Error("The server returned an unreadable response.");
      }

      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : `Request failed with status ${response.status}.`;

        throw new Error(message);
      }

      if (!isSecurityResult(payload)) {
        throw new Error("The security API returned an invalid response.");
      }

      setResult(payload);
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error
          ? `Unable to reach the security API: ${error.message}`
          : "Unable to reach the security API. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  }

  const decisionStyles: Record<SecurityResult["decision"], string> = {
    READY_FOR_HUMAN_APPROVAL:
      "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    REVIEW_REQUIRED: "border-orange-400/30 bg-orange-400/10 text-orange-300",
    BLOCKED: "border-red-400/30 bg-red-400/10 text-red-300",
  };

  const navItems = [
    { icon: "▦", label: "Overview", href: "#overview" },
    { icon: "⇄", label: "Transactions", href: "#transactions" },
    { icon: "◈", label: "AI Agent", href: "#ai-agent" },
    { icon: "⬡", label: "Security Center", href: "#security-center" },
    { icon: "◷", label: "Approvals", href: "#approvals" },
  ];

  return (
    <main className="h-screen overflow-hidden bg-[#080b12] text-white">
      <div className="flex h-screen">
        <aside className="hidden h-screen w-64 shrink-0 border-r border-white/10 bg-[#0c101a] p-6 md:flex md:flex-col">
          <div className="mb-12">
            <h1 className="text-2xl font-bold tracking-tight">
              PROOF<span className="text-cyan-400">PAY</span>
            </h1>
            <p className="mt-1 text-xs tracking-[3px] text-slate-500">
              AI TRUST ENGINE
            </p>
          </div>

          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-500">
            Workspace
          </p>

          <nav className="space-y-2" aria-label="Dashboard navigation">
            {navItems.map(({ icon, label, href }, index) => (
              label === "Approvals" ? (
                <button
                  key={label}
                  type="button"
                  aria-current={
                    activeWorkspace === "approvals" ? "page" : undefined
                  }
                  onClick={() => setActiveWorkspace("approvals")}
                  className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm transition ${
                    activeWorkspace === "approvals"
                      ? "border border-cyan-400/20 bg-cyan-400/10 text-cyan-300 hover:bg-cyan-400/15"
                      : "text-slate-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <span aria-hidden="true">{icon}</span>
                  {label}
                </button>
              ) : (
                <a
                  key={label}
                  href={href}
                  onClick={() => setActiveWorkspace("dashboard")}
                  aria-current={
                    index === 0 && activeWorkspace === "dashboard"
                      ? "page"
                      : undefined
                  }
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition ${
                    index === 0 && activeWorkspace === "dashboard"
                      ? "border border-cyan-400/20 bg-cyan-400/10 text-cyan-300 hover:bg-cyan-400/15"
                      : "text-slate-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <span aria-hidden="true">{icon}</span>
                  {label}
                </a>
              )
            ))}

            <div
              aria-disabled="true"
              title="Settings are not available yet"
              className="flex cursor-not-allowed items-center gap-3 rounded-xl px-4 py-3 text-sm text-slate-600"
            >
              <span aria-hidden="true">⚙</span>
              Settings
              <span className="ml-auto text-[10px] uppercase tracking-wide">
                Soon
              </span>
            </div>
          </nav>

          <div className="mt-auto rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm text-cyan-300">
              <span className="h-2 w-2 rounded-full bg-cyan-400" />
              Sandbox Environment
            </div>
            <p className="text-xs leading-5 text-slate-400">
              Demo mode. No real payments are being processed.
            </p>
          </div>
        </aside>

        <section className="flex h-screen min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-white/10 bg-[#080b12] px-5 py-5 md:px-9">
            <div>
              <p className="text-sm text-slate-500">
                Workspace /{" "}
                {activeWorkspace === "approvals" ? "Approvals" : "Overview"}
              </p>
              <h2 className="mt-1 text-xl font-semibold">
                {activeWorkspace === "approvals"
                  ? "Approval Workspace"
                  : "Security Dashboard"}
              </h2>
            </div>

            <div className="flex items-center gap-3">
              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-300">
                ● System Online
              </span>

              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 transition hover:border-red-400/40 hover:bg-red-400/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoggingOut ? "Signing out..." : "Logout"}
              </button>

              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-400/10 font-semibold text-cyan-300">
                P
              </div>
            </div>
          </header>

          <nav
            aria-label="Mobile dashboard navigation"
            className="shrink-0 border-b border-white/10 px-4 py-3 md:hidden"
          >
            <div className="flex gap-2 overflow-x-auto">
              {navItems.map(({ icon, label, href }, index) =>
                label === "Approvals" ? (
                  <button
                    key={label}
                    type="button"
                    aria-current={
                      activeWorkspace === "approvals" ? "page" : undefined
                    }
                    onClick={() => setActiveWorkspace("approvals")}
                    className={`shrink-0 rounded-lg px-3 py-2 text-sm ${
                      activeWorkspace === "approvals"
                        ? "bg-cyan-400/10 text-cyan-300"
                        : "text-slate-400 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <span aria-hidden="true">{icon} </span>
                    {label}
                  </button>
                ) : (
                  <a
                    key={label}
                    href={href}
                    onClick={() => setActiveWorkspace("dashboard")}
                    aria-current={
                      index === 0 && activeWorkspace === "dashboard"
                        ? "page"
                        : undefined
                    }
                    className={`shrink-0 rounded-lg px-3 py-2 text-sm ${
                      index === 0 && activeWorkspace === "dashboard"
                        ? "bg-cyan-400/10 text-cyan-300"
                        : "text-slate-400 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <span aria-hidden="true">{icon} </span>
                    {label}
                  </a>
                )
              )}
            </div>
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {activeWorkspace === "approvals" ? (
              <section
                aria-labelledby="approval-workspace-title"
                className="space-y-8 p-5 md:p-9"
              >
                <div>
                  <p className="text-sm text-slate-400">Purchase decisions</p>
                  <h1
                    id="approval-workspace-title"
                    className="mt-2 text-3xl font-bold tracking-tight"
                  >
                    Review pending requests
                  </h1>
                  <p className="mt-2 text-sm text-slate-500">
                    Check the purchase details and risk assessment before
                    approving or rejecting a request.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {[
                    [
                      "Pending Approvals",
                      metrics.pendingApprovals,
                      "Awaiting approval",
                    ],
                    [
                      "Pending Reviews",
                      metrics.pendingReviews,
                      "Requires review",
                    ],
                  ].map(([title, value, note]) => (
                    <div
                      key={title}
                      className="rounded-2xl border border-white/10 bg-[#101622] p-5"
                    >
                      <p className="text-sm text-slate-400">{title}</p>
                      <h2 className="mt-4 text-3xl font-bold">
                        {dataError ? "—" : value}
                      </h2>
                      <p className="mt-2 text-xs text-slate-500">{note}</p>
                    </div>
                  ))}
                </div>

                {dataError && (
                  <p
                    role="alert"
                    className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-300"
                  >
                    {dataError}
                  </p>
                )}

                {reviewFeedback && (
                  <p
                    role={
                      reviewFeedback.kind === "error" ? "alert" : "status"
                    }
                    className={`rounded-xl border p-4 text-sm ${
                      reviewFeedback.kind === "error"
                        ? "border-red-400/30 bg-red-400/10 text-red-300"
                        : "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                    }`}
                  >
                    {reviewFeedback.message}
                  </p>
                )}

                <div className="space-y-4">
                  {pendingPurchases.map((purchase) => (
                      <article
                        key={purchase.id}
                        className="rounded-2xl border border-white/10 bg-[#101622] p-5 md:p-6"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <p className="text-lg font-semibold">
                              {purchase.merchant}
                            </p>
                            <p className="mt-1 text-sm text-slate-400">
                              {purchase.product}
                            </p>
                            <p className="mt-2 text-xs text-slate-500">
                              Request {purchase.id} ·{" "}
                              {formatDate(purchase.created_at)}
                            </p>
                          </div>
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs ${getStatusStyle(purchase.status)}`}
                          >
                            {purchase.status.replaceAll("_", " ")}
                          </span>
                        </div>

                        <div className="mt-5 grid gap-4 rounded-xl border border-white/5 bg-white/[0.02] p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                          <p className="text-slate-400">
                            Amount
                            <span className="mt-1 block font-semibold text-white">
                              {formatAmount(purchase.amount, purchase.currency)}
                            </span>
                          </p>
                          <p className="text-slate-400">
                            Risk score
                            <span className="mt-1 block font-semibold text-white">
                              {purchase.risk_score ?? "—"}
                            </span>
                          </p>
                          <p className="text-slate-400">
                            Risk level
                            <span className="mt-1 block font-semibold text-white">
                              {purchase.risk_level ?? "—"}
                            </span>
                          </p>
                          <p className="text-slate-400 sm:col-span-2 lg:col-span-3">
                            Decision
                            <span className="mt-1 block font-semibold text-white">
                              {purchase.decision.replaceAll("_", " ")}
                            </span>
                          </p>
                        </div>

                        <label
                          className="mt-5 flex flex-col gap-2 text-sm text-slate-400"
                          htmlFor={`review-note-${purchase.id}`}
                        >
                          Optional review note
                          <textarea
                            id={`review-note-${purchase.id}`}
                            maxLength={1000}
                            rows={2}
                            value={reviewNotes[purchase.id] ?? ""}
                            onChange={(event) =>
                              setReviewNotes((current) => ({
                                ...current,
                                [purchase.id]: event.target.value,
                              }))
                            }
                            placeholder="Add a note for the audit record"
                            className="w-full resize-y rounded-lg border border-white/10 bg-[#0c101a] px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/50"
                          />
                        </label>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={reviewingRequestId !== null}
                            onClick={() =>
                              handleReview(purchase.id, "approve")
                            }
                            className="rounded-lg bg-emerald-400/15 px-4 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-400/25 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {reviewingRequestId === purchase.id
                              ? "Saving..."
                              : "Approve"}
                          </button>
                          <button
                            type="button"
                            disabled={reviewingRequestId !== null}
                            onClick={() => handleReview(purchase.id, "reject")}
                            className="rounded-lg bg-red-400/15 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-400/25 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {reviewingRequestId === purchase.id
                              ? "Saving..."
                              : "Reject"}
                          </button>
                        </div>
                      </article>
                    ))}

                  {!dataError &&
                    pendingPurchases.length === 0 && (
                      <p className="rounded-xl border border-white/5 bg-white/[0.02] p-8 text-center text-sm text-slate-400">
                        There are no pending purchase requests to review.
                      </p>
                    )}
                </div>
              </section>
            ) : (
              <div className="space-y-8 p-5 md:p-9">
            <div id="overview" className="scroll-mt-8">
              <p className="text-sm text-slate-400">Welcome back</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight">
                Your payments.{" "}
                <span className="text-cyan-400">Protected.</span>
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                Assess purchase requests, review risk signals and record human
                decisions.
              </p>
            </div>

            {dataError && (
              <p
                role="alert"
                className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-300"
              >
                {dataError}
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["Total Requests", metrics.totalRequests, "All recorded requests", "⇄"],
                ["Pending Approvals", metrics.pendingApprovals, "Awaiting approval", "◷"],
                ["Pending Reviews", metrics.pendingReviews, "Requires review", "◈"],
                ["Blocked Requests", metrics.blockedRequests, "Blocked by security checks", "⬡"],
                ["Approved Requests", metrics.approvedRequests, "Human-approved requests", "✓"],
                ["Rejected Requests", metrics.rejectedRequests, "Human-rejected requests", "×"],
              ].map(([title, value, note, icon]) => (
                <div
                  key={title}
                  className="rounded-2xl border border-white/10 bg-[#101622] p-5"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-400">{title}</p>
                    <span className="text-xl text-cyan-400">{icon}</span>
                  </div>
                  <h3 className="mt-5 text-3xl font-bold">
                    {dataError ? "—" : value}
                  </h3>
                  <p className="mt-2 text-xs text-slate-500">{note}</p>
                </div>
              ))}
            </div>

            <section aria-labelledby="risk-distribution-title">
              <div className="mb-4">
                <h3 id="risk-distribution-title" className="font-semibold">
                  Risk Distribution
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Counts reflect stored purchase request risk levels.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  ["Low Risk", metrics.lowRiskRequests, "text-emerald-300"],
                  ["Medium Risk", metrics.mediumRiskRequests, "text-amber-300"],
                  ["High Risk", metrics.highRiskRequests, "text-red-300"],
                ].map(([title, value, color]) => (
                  <div
                    key={title}
                    className="rounded-2xl border border-white/10 bg-[#101622] p-5"
                  >
                    <p className="text-sm text-slate-400">{title}</p>
                    <p className={`mt-4 text-3xl font-bold ${color}`}>
                      {dataError ? "—" : value}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <div className="grid gap-5 xl:grid-cols-3">
              <div
                id="transactions"
                className="scroll-mt-8 rounded-2xl border border-white/10 bg-[#101622] p-6 xl:col-span-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">Recent Transactions</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Latest purchase requests
                    </p>
                  </div>
                  <span className="text-xs text-cyan-400">
                    Latest {purchases.length} of 50
                  </span>
                </div>

                <div className="mt-6 space-y-3">
                  {purchases.map((purchase) => (
                    <div
                      key={purchase.id}
                      className="rounded-xl border border-white/5 bg-white/[0.02] p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">{purchase.merchant}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {purchase.product} · {purchase.id}
                          </p>
                        </div>
                        <p className="font-semibold">
                          {formatAmount(purchase.amount, purchase.currency)}
                        </p>
                      </div>

                      <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
                        <p className="text-slate-400">
                          Risk score:{" "}
                          <span className="font-medium text-white">
                            {purchase.risk_score ?? "—"}
                          </span>
                        </p>
                        <p className="text-slate-400">
                          Risk level:{" "}
                          <span className="font-medium text-white">
                            {purchase.risk_level ?? "—"}
                          </span>
                        </p>
                        <p className="text-slate-400">
                          Decision:{" "}
                          <span className="font-medium text-white">
                            {purchase.decision.replaceAll("_", " ")}
                          </span>
                        </p>
                        <p>
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 ${getStatusStyle(purchase.status)}`}
                          >
                            {purchase.status.replaceAll("_", " ")}
                          </span>
                        </p>
                        <p className="text-slate-500 sm:col-span-2">
                          {formatDate(purchase.created_at)}
                        </p>
                      </div>

                      {(purchase.reviewed_at ||
                        purchase.reviewed_by ||
                        purchase.review_note) && (
                        <div className="mt-4 space-y-1 border-t border-white/5 pt-3 text-xs text-slate-400">
                          <p className="font-medium text-slate-300">
                            Review details
                          </p>
                          {purchase.reviewed_at && (
                            <p>Reviewed: {formatDate(purchase.reviewed_at)}</p>
                          )}
                          {purchase.reviewed_by && (
                            <p>Reviewer ID: {purchase.reviewed_by}</p>
                          )}
                          {purchase.review_note && (
                            <p>Note: {purchase.review_note}</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {!dataError && purchases.length === 0 && (
                    <p className="rounded-xl border border-white/5 bg-white/[0.02] p-6 text-center text-sm text-slate-400">
                      No purchase requests have been recorded yet.
                    </p>
                  )}

                  {dataError && purchases.length === 0 && (
                    <p className="rounded-xl border border-white/5 bg-white/[0.02] p-6 text-center text-sm text-slate-400">
                      Recent purchase requests are unavailable.
                    </p>
                  )}
                </div>
              </div>

              <div
                id="security-center"
                className="scroll-mt-8 rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-400/10 to-[#101622] p-6"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-400/15 text-2xl text-cyan-300">
                  ⬡
                </div>
                <h3 className="mt-5 text-lg font-semibold">
                  Rule-Based Security Engine
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Demo rules assess purchase requests and send non-matching or
                  higher-risk requests for human review. This is not live
                  merchant verification or machine-learning fraud detection.
                </p>
                <div className="mt-6 space-y-4">
                  {[
                    "Purchase intent validation",
                    "Configured demo merchant mapping",
                    "Amount and limit checks",
                    "Rule-based risk assessment",
                  ].map((item) => (
                    <div
                      key={item}
                      className="flex items-center gap-2 text-xs text-slate-300"
                    >
                      <span className="text-cyan-400">✓</span>
                      {item}
                    </div>
                  ))}
                </div>
                <div className="mt-7 rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-slate-400">Security engine</p>
                  <p className="mt-1 text-sm font-semibold text-amber-300">
                    Connected · POST /api/evaluate
                  </p>
                </div>
              </div>
            </div>

            <section
              id="ai-agent"
              aria-labelledby="test-purchase-security-title"
              className="scroll-mt-8 rounded-2xl border border-white/10 bg-[#101622] p-5 md:p-6"
            >
              <div>
                <h3
                  id="test-purchase-security-title"
                  className="font-semibold"
                >
                  Test Purchase Security
                </h3>
                <p className="mt-1 text-sm text-slate-400">
                  Evaluate a purchase request with the PROOFPAY security engine.
                  No payment will be processed.
                </p>
              </div>

              <form
                className="mt-6 grid gap-4 sm:grid-cols-2"
                onSubmit={handleEvaluate}
              >
                {[
                  {
                    id: "merchant",
                    label: "Merchant Name",
                    value: merchant,
                    setValue: setMerchant,
                    placeholder: "e.g. Amazon Store",
                  },
                  {
                    id: "merchantDomain",
                    label: "Merchant Domain",
                    value: merchantDomain,
                    setValue: setMerchantDomain,
                    placeholder: "e.g. amazon.com",
                  },
                  {
                    id: "product",
                    label: "Product Name",
                    value: product,
                    setValue: setProduct,
                    placeholder: "e.g. Wireless Headphones",
                  },
                ].map((field) => (
                  <label
                    key={field.id}
                    className="flex flex-col gap-2 text-sm text-slate-300"
                    htmlFor={field.id}
                  >
                    {field.label}
                    <input
                      id={field.id}
                      name={field.id}
                      type="text"
                      required
                      value={field.value}
                      onChange={(event) => field.setValue(event.target.value)}
                      placeholder={field.placeholder}
                      className="w-full rounded-xl border border-white/10 bg-[#0c101a] px-4 py-3 text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/50"
                    />
                  </label>
                ))}

                <label
                  className="flex flex-col gap-2 text-sm text-slate-300"
                  htmlFor="purchase-amount"
                >
                  Amount
                  <input
                    id="purchase-amount"
                    name="amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-xl border border-white/10 bg-[#0c101a] px-4 py-3 text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/50"
                  />
                </label>

                <label
                  className="flex flex-col gap-2 text-sm text-slate-300"
                  htmlFor="purchase-currency"
                >
                  Currency
                  <input
                    id="purchase-currency"
                    name="currency"
                    type="text"
                    required
                    value={currency}
                    onChange={(event) => setCurrency(event.target.value)}
                    placeholder="USD"
                    className="w-full rounded-xl border border-white/10 bg-[#0c101a] px-4 py-3 text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/50"
                  />
                </label>

                <div className="flex items-end sm:col-span-2">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-[#080b12] transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                  >
                    {isLoading ? "Evaluating..." : "Evaluate Purchase"}
                  </button>
                </div>
              </form>

              {error && (
                <p
                  role="alert"
                  className="mt-5 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-300"
                >
                  {error}
                </p>
              )}

              {result && (
                <div
                  aria-live="polite"
                  className={`mt-5 rounded-xl border p-5 ${decisionStyles[result.decision]}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h4 className="font-semibold">
                      {result.decision.replaceAll("_", " ")}
                    </h4>
                    <span className="rounded-full border border-current/20 px-3 py-1 text-xs">
                      Risk {result.riskLevel}
                    </span>
                  </div>
                  <p className="mt-3 text-2xl font-bold">
                    Risk score: {result.riskScore}
                  </p>
                  <div className="mt-4">
                    <p className="text-sm font-semibold">Reasons</p>
                    <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
                      {result.reasons.map((reason, index) => (
                        <li key={`${index}-${reason}`}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                  <p className="mt-4 text-sm">
                    <span className="font-semibold">Next action: </span>
                    {result.nextAction}
                  </p>
                </div>
              )}
            </section>

            <footer className="border-t border-white/10 pt-5 text-center text-xs text-slate-600">
              PROOFPAY AI · The Trust Layer for Autonomous Payments · Demo
              Environment
            </footer>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
