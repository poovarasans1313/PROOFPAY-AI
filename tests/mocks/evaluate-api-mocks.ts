export type TestUser = {
  id?: string;
  app_metadata?: {
    role?: string;
  };
};

export type InsertedPurchase = Record<string, unknown>;
export type RpcCall = {
  functionName: string;
  args: Record<string, unknown>;
};
export type ApprovalEvent = {
  purchase_request_id: string;
  action: string;
  actor_id: string;
  note: string | null;
};

export let currentUser: TestUser | null = null;
export let authError: Error | null = null;
export let insertedPurchases: InsertedPurchase[] = [];
export let queriedTables: string[] = [];
export let rpcCalls: RpcCall[] = [];
export let approvalEvents: ApprovalEvent[] = [];
export let reviewRpcResult: {
  data: boolean | null;
  error: { message: string } | null;
} = { data: true, error: null };

export const NextResponse = {
  json(body: unknown, init?: ResponseInit): Response {
    return Response.json(body, init);
  },
};

export function setCurrentUser(user: TestUser | null): void {
  currentUser = user;
}

export function setAuthError(error: Error | null): void {
  authError = error;
}

export function setReviewRpcResult(result: {
  data: boolean | null;
  error: { message: string } | null;
}): void {
  reviewRpcResult = result;
}

export function resetApiMocks(): void {
  currentUser = {
    id: "b2222222-2222-2222-2222-222222222222",
    app_metadata: { role: "admin" },
  };
  authError = null;
  insertedPurchases = [];
  queriedTables = [];
  rpcCalls = [];
  approvalEvents = [];
  reviewRpcResult = { data: true, error: null };
}

export const supabaseAdmin = {
  async rpc(functionName: string, args: Record<string, unknown>) {
    rpcCalls.push({ functionName, args });

    if (reviewRpcResult.error || reviewRpcResult.data === false) {
      return reviewRpcResult;
    }

    const purchase = insertedPurchases.find(
      (record) => record.id === args.p_purchase_request_id
    );

    if (!purchase) {
      return reviewRpcResult;
    }

    if (
      purchase.status !== "PENDING_APPROVAL" &&
      purchase.status !== "PENDING_REVIEW"
    ) {
      return { data: false, error: null };
    }

    purchase.status = args.p_action;
    purchase.reviewed_by = args.p_actor_id;
    purchase.review_note = args.p_note;
    purchase.reviewed_at = new Date().toISOString();
    approvalEvents.push({
      purchase_request_id: String(args.p_purchase_request_id),
      action: String(args.p_action),
      actor_id: String(args.p_actor_id),
      note: typeof args.p_note === "string" ? args.p_note : null,
    });

    return { data: true, error: null };
  },
  from(table: string) {
    queriedTables.push(table);

    return {
      insert(purchase: InsertedPurchase) {
        const id = `${String(insertedPurchases.length + 1).padStart(8, "0")}-1111-1111-1111-111111111111`;
        insertedPurchases.push({ ...purchase, id });

        return {
          select() {
            return {
              single: async () => ({
                data: { id },
                error: null,
              }),
            };
          },
        };
      },
    };
  },
};

export async function createClient() {
  return {
    auth: {
      getUser: async () => ({
        data: { user: currentUser },
        error: authError,
      }),
    },
  };
}
