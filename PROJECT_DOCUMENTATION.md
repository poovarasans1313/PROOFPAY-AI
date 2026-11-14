# PROOFPAY AI — Project and Hackathon Documentation

## 1. Abstract

PROOFPAY AI is a hackathon prototype for evaluating purchase requests and
presenting them to a human reviewer. It combines a deterministic rule engine,
authenticated API routes, a Supabase-backed dashboard, and a pending-only
approval workflow. The prototype demonstrates how purchase data can be
structured, flagged, and reviewed; it is not a production payment-security
service. A separate, fixed-amount PayPal Sandbox demonstration is isolated from
that purchase workflow.

## 2. Problem Statement

Organizations need a consistent way to collect purchase details, identify
requests that need attention, and record a human decision. An unstructured
process can make it harder to understand why a request was flagged or who
reviewed it. This project demonstrates a simple, auditable workflow for that
problem.

## 3. Existing Approaches and Their Limits

Common approaches include manual review, static policy rules, and specialized
third-party fraud services. Manual review can be time-consuming; static rules
can miss context or produce false positives; and a third-party service needs a
real provider, integration, and validated data before it can make meaningful
claims.

PROOFPAY AI currently uses only static demo rules. It does not integrate with a
merchant verification provider or machine-learning fraud service. PayPal is
used only by a standalone Sandbox demonstration; it is not connected to
purchase requests or approval decisions.

## 4. Proposed Solution

Collect a purchase request, validate its fields, calculate a demo risk result,
and require an authorized human to decide eligible requests. Keep the computed
result and review information available to the dashboard. Evaluation is
separate from approval, and approval is separate from payment execution. The
standalone PayPal Sandbox demonstration has a separate fixed amount and does
not update or pay for a purchase request.

## 5. Objectives

- Provide a clear purchase-evaluation and human-review demonstration.
- Apply the same explicit rules to each valid request.
- Send uncertain, mismatched, or higher-value requests to review.
- Require authenticated admin access for protected evaluation and review
  actions.
- Record the reviewer decision through the existing Supabase review workflow.
- Clearly disclose that merchant identity rules are demo-only.

## 6. Project Scope

**Included:** login/session integration, dashboard reporting, purchase
evaluation, demo merchant-name/domain matching, approval workspace, approval
and rejection actions, review metadata, an isolated fixed USD 1.00 PayPal
Sandbox demonstration, and isolated automated tests.

**Not included:** real merchant verification, machine-learning inference,
connecting payment to a purchase request, setting a purchase to paid, real-money
payments, durable payment history, production fraud guarantees, live third-party
risk feeds, or verified production Supabase configuration.

## 7. Technology and System Requirements

| Area | Technology |
|---|---|
| Web application | Next.js 16.4.5, React 19.3 |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 4 |
| Authentication and data | Supabase |
| Standalone payment demo | PayPal Orders API and hosted JavaScript SDK (Sandbox only) |
| Automated tests | Node.js built-in `node:test` runner |
| Recommended runtime | Node.js 24 |

Install dependencies with `npm ci`. Configure the environment variables listed
in [the README](./README.md) using values from a development Supabase project.

## 8. Architecture

```mermaid
flowchart LR
    Browser[User browser]
    UI[Next.js dashboard and approval workspace]
    Eval[POST /api/evaluate]
    Review[POST /api/purchase-requests/id/review]
    Auth[Supabase Auth session]
    Engine[Rule-based security engine]
    DB[(Supabase database)]
    RPC[Pending-only review operation]
    DemoUI[Separate PayPal Sandbox demo]
    CreateOrder[POST /api/paypal-demo/orders]
    CaptureOrder[POST /api/paypal-demo/orders/orderId/capture]
    PayPal[PayPal Sandbox APIs]
    PayPalSDK[PayPal hosted checkout SDK]

    Browser --> UI
    UI -->|Submit purchase| Eval
    UI -->|Approve or reject| Review
    Browser --> DemoUI
    DemoUI -->|Create fixed USD 1.00 order| CreateOrder
    DemoUI -->|Buyer approves in Sandbox| PayPalSDK
    PayPalSDK -->|Approved order ID| DemoUI
    DemoUI -->|Order ID plus short-lived signed token| CaptureOrder
    CreateOrder --> PayPal
    CaptureOrder -->|Fetch, validate, capture, verify| PayPal
    Eval -->|Authenticate, authorize, validate| Auth
    Eval --> Engine
    Engine -->|Decision and risk details| Eval
    Eval -->|Persist evaluation result| DB
    Review -->|Authenticate, authorize, validate| Auth
    Review --> RPC
    RPC -->|Update eligible request and record review| DB
    UI -->|Load dashboard data| DB
```

The diagram describes the application flow. The tests use isolated mocks and do
not verify deployed Supabase grants, row-level security, or production
configuration. The PayPal Sandbox path is separate from this purchase and
approval workflow. It uses the existing Supabase session only for admin
authentication, makes no purchase-table queries or writes, and stores no order
or capture record.

## 9. Application Modules

- **Dashboard:** summarizes purchase request and risk information from
  Supabase.
- **Settings:** displays the signed-in admin account and secret-safe
  environment configuration status without offering unsupported controls.
- **Approval Workspace:** presents requests awaiting human decisions and
  provides optional review notes.
- **Evaluation API:** authenticates and validates a request, calls the shared
  security engine, and persists the computed evaluation state.
- **Security engine:** deterministic merchant identity, currency, amount, and
  input checks.
- **Review API and database operation:** authorizes a human decision and
  prevents a previously decided or otherwise ineligible request from being
  reviewed again.
- **Supabase integration:** supplies user sessions and application data.
- **PayPal Sandbox demonstration:** creates and captures a fixed USD 1.00
  Sandbox order through server-side OAuth. It verifies the order and capture,
  does not reference purchase requests, and does not persist payment data.

## 10. Main Workflows

### Evaluate a purchase

1. An authenticated admin submits merchant, domain, product, amount, and
   currency.
2. The API checks the request origin, authentication, role, content, and field
   constraints.
3. The API calls `evaluatePurchase()` from the security engine.
4. The computed result is saved as a request for human review; invalid requests
   are rejected or blocked according to the existing route and engine
   validations.
5. The dashboard refreshes to show the persisted result.

### Review a purchase

1. An authenticated admin chooses Approve or Reject and may add a note.
2. The review API checks origin, identity, authorization, and input.
3. The protected database operation accepts only an eligible pending request
   and records the reviewer decision.
4. The dashboard refreshes and displays the updated information.

The word “Approve” is a human review decision for the request. It does **not**
initiate or execute a payment.

### Standalone PayPal Sandbox demonstration

1. An authenticated admin opens the separate PayPal Demo page.
2. The browser requests an order without sending an amount or currency. The
   server creates only a USD 1.00 order using the Sandbox API.
3. The buyer approves the order in PayPal's Sandbox checkout.
4. The browser sends the order ID and short-lived signed token to the capture
   API. The server verifies the token's signature, purpose, audience, expiry,
   authenticated user, and order binding.
5. The server retrieves the order from PayPal, verifies approval and the fixed
   amount/currency, captures it server-side, and checks for a completed capture
   with the expected amount/currency before reporting success.

This demonstration is not part of purchase evaluation or approval. It does not
read or change purchase requests and saves no order or capture record. The
token exists only in page memory; PayPal request IDs and remote order status
help make retries safe, but the application cannot provide durable replay
history or complete reconciliation without persistent storage.

## 11. Security Model

- Protected API routes require an authenticated user and the expected admin
  role in trusted user metadata.
- Routes validate the configured application origin and reject missing or
  mismatched origins.
- Request fields and body size are validated before evaluation or review.
- The review API ignores a client-supplied actor ID and passes the ID from the
  authenticated admin session. The current service-role-only database function
  accepts that ID as an argument and does not independently bind it to the
  caller, so this protection currently depends on the trusted server route.
- The database review operation is pending-only and records review activity.
- Environment secrets must remain server-side; never expose
  `SUPABASE_SECRET_KEY` using a `NEXT_PUBLIC_` variable.
- The evaluation route does not accept a client-provided approval decision as
  an instruction to approve or execute payment.
- The standalone PayPal routes require the authenticated admin and canonical
  origin, use a fixed server-side amount/currency, and accept only the exact
  Sandbox API base URL.
- PayPal OAuth credentials remain server-side. The PayPal client ID is public
  by design and is used only to load the checkout SDK. The capture API verifies
  the order with PayPal before returning a completed result.
- The PayPal demo has no app-side payment storage, purchase linkage, paid
  status, or durable one-time token-use tracking. Its signed token expires
  after a short period and is held only in page memory.

These are source-code and isolated-test observations. Deployed Supabase access
grants, RLS policies, production secret configuration, and live authorization
behavior have not been independently verified. Database-side reviewer identity
hardening and live verification remain blocked until a separate staging project
is available.

## 12. Demo Rules and Decision Behavior

### Controlled demo identities

| Normalized name | Configured demo domain |
|---|---|
| `amazon` | `amazon.com` |
| `walmart` | `walmart.com` |
| `best buy` | `bestbuy.com` |

Merchant names are trimmed, lowercased, and internal whitespace is collapsed.
Domains are lowercased and trimmed; a leading `www.` and one trailing dot are
removed. A request is trusted by this demo rule only when both normalized
values match a configured pair. This mapping does not establish real-world
merchant identity and does not detect every lookalike or Unicode domain.

### Risk and decision rules

For supported-currency, valid requests, the score is:

```text
min(100, 10
  + 45 when the configured merchant name/domain pair does not match
  + 30 when amount > $500
  + 15 when amount > $1,000)
```

- Invalid or incomplete purchase information: `BLOCKED`, score 100.
- Currency other than `USD`: `REVIEW_REQUIRED`, score 60.
- Name/domain mismatch or amount above $500: `REVIEW_REQUIRED`.
- Matching configured identity and amount at or below $500:
  `READY_FOR_HUMAN_APPROVAL`, score 10.
- For review decisions, scores at or above 70 are `HIGH`; lower review scores
  are `MEDIUM`. A matching identity within the amount limit is `LOW`.
- A high risk score never creates automatic approval.
- Even `READY_FOR_HUMAN_APPROVAL` means “wait for a human,” not “approved.”

The $500 and $1,000 comparisons are strict `>` checks. The score formula is a
demo heuristic and is not calibrated against real fraud outcomes.

## 13. Data Model and Audit Information

The application uses existing Supabase purchase-request data for request
details and evaluation results. The review migration updates only eligible
pending requests and records the review action in the existing approval-event
audit table, including reviewer/action information and the optional note.

No schema change was made during the security test work described here. This
document intentionally does not reproduce a full database schema. Confirm the
actual migration state, table grants, and RLS policies in the target Supabase
project before deployment.

## 14. API Surface

| Endpoint | Purpose | Important boundary |
|---|---|---|
| `POST /api/evaluate` | Validate and evaluate a purchase request | Authenticated/admin and origin checks; computes using the shared engine; does not execute payment |
| `POST /api/purchase-requests/[id]/review` | Approve or reject an eligible request | Authenticated/admin and origin checks; pending-only review operation |
| `POST /api/paypal-demo/orders` | Create the standalone Sandbox order | Admin/origin checked; fixed USD 1.00; rejects request bodies and client-supplied amounts |
| `POST /api/paypal-demo/orders/[orderId]/capture` | Verify and capture the Sandbox order | Admin/origin checked; signed user/order-bound token; PayPal-side amount and capture verification |

The exact response fields and status codes are defined by the route handlers;
clients should use those implementations as the source of truth.

## 15. Local Configuration and Safe Data Handling

Required environment variable names:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` (server-only)
- `APP_ORIGIN`
- `NEXT_PUBLIC_PAYPAL_CLIENT_ID` (public Sandbox application ID)
- `PAYPAL_CLIENT_SECRET` (server-only Sandbox secret)
- `PAYPAL_DEMO_SIGNING_SECRET` (server-only random key, at least 32 bytes)
- `PAYPAL_BASE_URL` (must equal `https://api-m.sandbox.paypal.com`)

Use your own development Supabase project. Keep `.env.local` out of source
control, do not paste secret values into tickets or screenshots, and do not use
real customer data for test fixtures. The repository ignores `.env*`, but
confirm repository tracking status in a Git-enabled environment before
publishing. Configure PayPal values from a PayPal Developer Sandbox
application; do not use live credentials. The app does not edit `.env.local`.

## 16. Testing and Verification

Automated tests run with Node's built-in test runner:

```bash
node --conditions=react-server --test tests/*.test.ts
```

The full current suite passed **125 tests, 0 failed**: 110 purchase engine/API/
workflow tests, 10 mocked PayPal API tests, and 5 token tests. The PayPal tests
do not contact PayPal or Supabase and do not prove a real Sandbox checkout.

The PayPal tests cover authentication and origin checks, fixed amount and
Sandbox URL enforcement, token binding/expiry/tampering, order approval,
amount verification, completed capture validation, and idempotent retry
behavior.

Additional recorded checks:

- `npx.cmd tsc --noEmit`: passed.
- `npm.cmd run lint`: passed.
- Production build: passed in an isolated source copy with dummy environment
  placeholders and no `.env.local` file. No PayPal or Supabase service was
  contacted.
- `npm.cmd audit --omit=dev --audit-level=moderate`: no production dependency
  vulnerabilities reported.

The full dependency audit reported **7 moderate findings in development
dependencies**, in the `minimatch` dependency chain used by
`@typescript-eslint/typescript-estree`. No dependency update was applied; review
the current lockfile and advisory before deciding on an update. The tests are
isolated and mock-backed; they do not prove live database behavior.

## 17. Deployment Checklist

Before any deployment:

- Use a supported Node.js version and install from `package-lock.json`.
- Configure the Supabase URL and publishable key, server-only secret, and
  exact production `APP_ORIGIN` in the hosting provider's secret manager.
- Confirm production auth redirect URLs, admin-role assignment, database
  migrations, grants, and RLS policies in the target Supabase project.
- Ensure all externally reachable routes use HTTPS and production secrets are
  not exposed in client bundles or logs.
- If enabling the PayPal demonstration, configure only a PayPal Sandbox
  application and verify that `PAYPAL_BASE_URL` is exactly the Sandbox host.
  Keep the client secret and signing secret server-only. Do not configure live
  PayPal credentials or present the demonstration as linked to a purchase.
- Run the test, type-check, lint, build, and dependency-audit commands against
  the release candidate.
- Test authorized and unauthorized flows using a dedicated non-production
  account and synthetic data.
- Confirm the PayPal Sandbox demo remains isolated from purchase requests and
  that no live PayPal credentials or production payment path are enabled.
- Monitor deployment logs and define an incident-response and rollback plan.

No deployment was performed as part of this project work. Production Supabase
configuration and live customer behavior remain unverified.

## 18. Known Limitations and Risks

- Rule-based demo only; no AI/ML fraud model is implemented.
- Merchant mapping is not live verification and does not prevent every
  spoofed, lookalike, Unicode, or compromised-domain scenario.
- `USD` is the only supported currency in the demo rules.
- Risk scores and amount thresholds are illustrative, not statistically
  validated.
- API tests and lifecycle tests use isolated mocks; no live Supabase integration
  test was run.
- The review RPC does not independently verify the supplied actor UUID. The
  authenticated API supplies the correct ID for browser requests, but any
  trusted service-role caller can pass a different ID; hardening is pending.
- Authenticated dashboard screens were not visually tested in a browser.
- Effective deployed database grants, RLS, auth settings, and environment
  configuration were not verified.
- The full npm audit reports 7 moderate development-dependency findings; the
  production-only audit reports zero.
- The standalone PayPal Sandbox demonstration is not a production payment
  integration and is not connected to purchase requests. It uses a fixed
  USD 1.00 amount and creates no application payment records.
- No durable payment history or application-side replay/reconciliation record
  exists. A reload loses the short-lived token; a flow may need to be restarted.
- No Gemini assistant or other AI service is implemented.
- Real-payment processing, settlement, refunds, and chargebacks are outside
  project scope.

## 19. Future Work and Responsible AI Readiness

Recommended next steps, subject to separate review:

1. Resolve or formally accept the moderate development-dependency advisories.
2. In a dedicated staging project, verify Supabase RLS, grants, migration
   state, secret rotation, and origin/redirect configuration; implement and
   verify database-side reviewer identity hardening there before considering
   production database changes.
3. Add staging integration tests that use synthetic data and disposable
   accounts.
4. Replace the demo merchant mapping only when a real, documented verification
   source is selected and its failure modes are understood.
5. If adding AI, use it only to summarize evidence or suggest review questions.
   Keep deterministic policy checks, show evidence and uncertainty, log model
   outputs, protect personal data, and require a human decision.
6. Never allow an AI model or this demo engine to automatically approve or
   execute payments.

These are recommendations, not implemented features.

## 20. Hackathon Demonstration Outline

Suggested six-to-seven-minute walkthrough:

1. **Problem and boundaries (30 seconds):** explain that this is a review
   assistant prototype, not a live payment-security product.
2. **Dashboard (45 seconds):** show the request and risk summaries using a
   dedicated demo account and synthetic records.
3. **Evaluation (90 seconds):** demonstrate a matching demo identity at or below
   $500 and a mismatched or higher-value request.
4. **Approval Workspace (90 seconds):** inspect the pending item, add an
   optional note, and explicitly approve or reject it as the authenticated
   reviewer.
5. **Security and tests (45 seconds):** show the isolated tests, protected
   review path, and the difference between evaluation and payment execution.
6. **Optional PayPal Sandbox (40 seconds):** if Sandbox credentials and buyer
   account are configured and the flow has been manually verified, show the
   separate fixed USD 1.00 checkout and server-confirmed Sandbox capture.
   Clearly state that it is not tied to a purchase, stores no payment record,
   and is not a real payment. Otherwise, describe the flow without claiming a
   live test.
7. **Limitations and roadmap (30 seconds):** disclose no AI model, no live
   merchant verification, no purchase-linked or real payment processing, the
   unresolved reviewer-identity limitation, and incomplete live Supabase
   validation.

Do not show real customer data, secret values, or production credentials during
the presentation.

## 21. Judge Questions and Glossary

### Likely questions

**Is this really AI-powered today?**  
No. The current decision engine is a deterministic TypeScript ruleset. “AI” is
the project name; no machine-learning model is used.

**Does the allowlist verify Amazon, Walmart, or Best Buy?**  
No. It is a controlled demo mapping of names to domains and is not connected to
any merchant verification service.

**Does `READY_FOR_HUMAN_APPROVAL` approve the purchase?**  
No. It means the request can proceed to explicit human review. The purchase
remains unapproved until an authorized reviewer acts.

**Does approving a request execute payment?**  
No. Approval only records the human decision. A separate PayPal Sandbox demo
can create and capture a fixed USD 1.00 Sandbox order, but it is not linked to
any purchase request and does not change purchase status.

**Are the tests against a live Supabase database?**  
No. Protected API and workflow tests use isolated in-memory mocks. Deployed
Supabase policies and grants must be checked separately.

### Glossary

- **Admin:** authenticated user with the required trusted admin role.
- **Demo mapping:** fixed name/domain pairs used only by the local ruleset.
- **Human approval:** explicit approve/reject decision by an authorized person.
- **Risk score:** heuristic numeric indicator from the demo rules, not a
  probability of fraud.
- **RLS:** Supabase row-level security policies that control database row
  access.
- **Synthetic data:** invented test records that do not identify real people
  or customers.
