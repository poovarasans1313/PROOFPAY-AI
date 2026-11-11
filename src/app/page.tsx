import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/auth/require-admin";
import { supabaseAdmin } from "@/lib/supabase-admin";
import DashboardClient, { type PurchaseRecord } from "./DashboardClient";

const emptyMetrics = {
  totalRequests: 0,
  pendingApprovals: 0,
  pendingReviews: 0,
  blockedRequests: 0,
  approvedRequests: 0,
  rejectedRequests: 0,
  lowRiskRequests: 0,
  mediumRiskRequests: 0,
  highRiskRequests: 0,
};

export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#080b12] text-white">
          Loading dashboard...
        </main>
      }
    >
      <AdminDashboard />
    </Suspense>
  );
}

async function AdminDashboard() {
  const user = await getAdminUser();

  if (!user) {
    redirect("/login");
  }

  let metrics = emptyMetrics;
  let purchases: PurchaseRecord[] = [];
  let pendingPurchases: PurchaseRecord[] = [];
  let dataError: string | undefined;

  try {
    const [
      recentResult,
      pendingPurchasesResult,
      totalResult,
      pendingApprovalsResult,
      pendingReviewsResult,
      blockedRequestsResult,
      approvedRequestsResult,
      rejectedRequestsResult,
      lowRiskRequestsResult,
      mediumRiskRequestsResult,
      highRiskRequestsResult,
    ] = await Promise.all([
      supabaseAdmin
        .from("purchase_requests")
        .select(
          "id, merchant, product, amount, currency, risk_score, risk_level, decision, status, created_at, reviewed_at, reviewed_by, review_note"
        )
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("purchase_requests")
        .select(
          "id, merchant, product, amount, currency, risk_score, risk_level, decision, status, created_at"
        )
        .in("status", ["PENDING_APPROVAL", "PENDING_REVIEW"])
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("purchase_requests")
        .select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("purchase_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "PENDING_APPROVAL"),
      supabaseAdmin
        .from("purchase_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "PENDING_REVIEW"),
      supabaseAdmin
        .from("purchase_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "BLOCKED"),
      supabaseAdmin
        .from("purchase_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "APPROVED"),
      supabaseAdmin
        .from("purchase_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "REJECTED"),
      supabaseAdmin
        .from("purchase_requests")
        .select("id", { count: "exact", head: true })
        .eq("risk_level", "LOW"),
      supabaseAdmin
        .from("purchase_requests")
        .select("id", { count: "exact", head: true })
        .eq("risk_level", "MEDIUM"),
      supabaseAdmin
        .from("purchase_requests")
        .select("id", { count: "exact", head: true })
        .eq("risk_level", "HIGH"),
    ]);

    const queryError = [
      recentResult.error,
      pendingPurchasesResult.error,
      totalResult.error,
      pendingApprovalsResult.error,
      pendingReviewsResult.error,
      blockedRequestsResult.error,
      approvedRequestsResult.error,
      rejectedRequestsResult.error,
      lowRiskRequestsResult.error,
      mediumRiskRequestsResult.error,
      highRiskRequestsResult.error,
    ].find((error) => error !== null);

    if (queryError) {
      console.error("Dashboard database query failed:", queryError.message);
      dataError = "Dashboard data could not be loaded. Please try again later.";
    } else {
      metrics = {
        totalRequests: totalResult.count ?? 0,
        pendingApprovals: pendingApprovalsResult.count ?? 0,
        pendingReviews: pendingReviewsResult.count ?? 0,
        blockedRequests: blockedRequestsResult.count ?? 0,
        approvedRequests: approvedRequestsResult.count ?? 0,
        rejectedRequests: rejectedRequestsResult.count ?? 0,
        lowRiskRequests: lowRiskRequestsResult.count ?? 0,
        mediumRiskRequests: mediumRiskRequestsResult.count ?? 0,
        highRiskRequests: highRiskRequestsResult.count ?? 0,
      };
      purchases = recentResult.data ?? [];
      pendingPurchases = pendingPurchasesResult.data ?? [];
    }
  } catch (error) {
    console.error("Dashboard data load failed:", error);
    dataError = "Dashboard data could not be loaded. Please try again later.";
  }

  return (
    <DashboardClient
      metrics={metrics}
      purchases={purchases}
      pendingPurchases={pendingPurchases}
      dataError={dataError}
    />
  );
}