# PROOFPAY AI — Hackathon Demo Script

**Target length:** about 6 minutes  
**Audience:** hackathon judges and technical reviewers

## Before presenting

- Use only a dedicated demo or staging Supabase project with synthetic records.
  The evaluation and review actions persist data to the configured project.
- Confirm that the demo account is an authorized admin and that the dashboard
  has enough synthetic pending requests to demonstrate both approval and
  rejection.
- Never display credentials, secret values, real user information, or
  production data.
- If no safe demo/staging project is available, present the workflow using
  screenshots or the recorded test results rather than writing to production.
- Each evaluation is written to the configured database. Arrange a clean
  synthetic demo dataset and any cleanup through the approved staging process.

## 0:00–0:40 — Opening

> Hi, we’re presenting PROOFPAY AI, a prototype for evaluating purchase
> requests and routing them to a human reviewer. Despite the project name, the
> current risk engine is deterministic software—not machine learning. It uses
> explicit demo rules, and it does not verify real merchant ownership or
> process payments.

**Show:** title and the authenticated dashboard, using synthetic data.

## 0:40–1:20 — Problem

> Purchase requests can arrive with different details and levels of
> uncertainty. A reviewer needs to see what was submitted, why the rules
> flagged it, and whether a human has made a decision. A score alone should not
> silently authorize a purchase.
>
> Our prototype demonstrates one simple, inspectable workflow: evaluate the
> request, show the reasons and risk level, and keep the final decision with an
> authorized human.

**Show:** dashboard request/risk summaries and the Approval Workspace.

## 1:20–2:10 — Solution and boundaries

> The rule engine checks that the purchase fields are valid, checks whether the
> merchant name and domain match a small configured demo mapping, and applies
> amount thresholds. It supports USD; other valid three-letter currency codes
> are sent to review rather than scored using the USD rules.
>
> A matching demo identity at or below $500 is labeled
> “Ready for human approval,” but its stored status is still
> `PENDING_APPROVAL`. A mismatch or an amount above $500 requires review.
> Nothing is automatically approved, and an approval is only a recorded human
> decision—it does not initiate a payment.

**Show:** Test Purchase Security form and explain that the result includes a
decision, score, level, reasons, and next action.

## 2:10–3:10 — Live evaluation: low-risk example

> First, I’ll submit a synthetic example using the configured demo mapping:
> merchant “Amazon,” domain `amazon.com`, product “Demo keyboard,” amount
> `$100`, and currency `USD`.
>
> The rules should report `READY_FOR_HUMAN_APPROVAL`, a low risk score of 10,
> and a next action to wait for a human. The API saves the result as
> `PENDING_APPROVAL`; it does not approve or pay for it.

**Show:** submit the request, then point to the result and explain its reasons.
Confirm the stored item appears in the dashboard if the refresh completes.

## 3:10–4:00 — Live evaluation: high-risk example

> Now I’ll use a deliberately mismatched synthetic identity and a high amount:
> “Example Store,” domain `example.test`, amount `$1,200`, currency `USD`.
> These inputs trigger the mismatch and amount rules, producing a high score
> and `REVIEW_REQUIRED`.
>
> This is a rule outcome, not a claim that the merchant is fraudulent. The
> request is saved as `PENDING_REVIEW` for a person to inspect.

**Show:** submit and point to the score, risk level, reasons, and pending
status.

## 4:00–5:00 — Human decision and review record

> In Approvals, the workspace shows pending counts and purchase details from
> the project data. An authorized admin can add an optional note and explicitly
> approve or reject a pending request. I’ll reject the mismatched example and
> approve the low-risk example as two separate human decisions.
>
> The review API checks the signed-in user, admin role, request origin, and
> inputs. The database operation only changes a request that is still pending
> and records the action. The dashboard’s Recent Transactions section can show
> stored review date, reviewer ID, and note. This is review metadata on recent
> requests; the UI is not a full approval-event log viewer.

**Show:** demonstrate one reject and one approve if the preloaded dataset and
time allow. Otherwise, demonstrate one and describe the second action without
claiming it was performed. Show the resulting status and review details after
the dashboard refreshes.

## 5:00–5:40 — Security and honest limitations

> The dashboard and APIs require an authenticated admin. The server-side
> application uses the service-role client for dashboard reads and evaluation
> inserts; the client bundle uses the public Supabase key. API tests exercise
> authorization and workflow behavior with mocks.
>
> There is an important remaining database limitation: the review API passes
> the authenticated admin’s ID to a service-role-only RPC, but the current
> database function does not independently bind that supplied ID to the
> database caller. The route protects browser requests, but any trusted
> service-role caller could supply a different actor ID. Database-side
> hardening and live Supabase security validation are incomplete because a
> separate staging project is not available.

**Show:** optionally show the test command/results from the repository. Do not
show environment files or secrets.

## 5:40–6:00 — Closing

> PROOFPAY AI demonstrates a transparent, bounded review workflow: rules
> explain why a request is flagged, and a human makes the decision. It is not a
> live fraud detector or payment system. Our next responsible step is to
> validate and harden the database workflow in a separate staging project
> before considering production use. Thank you.

## If the live demo fails

- Do not retry repeatedly against an unknown or production database.
- Do not display raw environment values, access tokens, or personal data while
  diagnosing.
- Explain the expected behavior and use a previously captured, sanitized
  screenshot or the isolated test suite.
- State clearly that the live Supabase path was not demonstrated.
