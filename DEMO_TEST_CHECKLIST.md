# PROOFPAY AI — Demo Test Checklist

## Safety and setup

- [ ] Use a dedicated demo/staging Supabase project, not production.
- [ ] Confirm that only synthetic, disposable records are present and visible.
- [ ] Confirm an authorized demo admin account is available; do not share its
      password, session token, or credentials during the presentation.
- [ ] Confirm the environment is configured without displaying or copying
      secret values.
- [ ] Confirm the canonical application origin is configured for the demo URL.
- [ ] Confirm the database migration and existing tables required by this
      project are present in the demo project. Do not run migrations as part of
      an unapproved demo.
- [ ] Verify the app loads and the dashboard data is available before judges
      arrive.
- [ ] Ensure there are enough synthetic pending requests to demonstrate one
      approval and one rejection, or explain that only one decision will be
      shown.
- [ ] Confirm requests created during the demo are disposable. Evaluation
      writes to the configured database; arrange cleanup through the approved
      staging process.
- [ ] Prepare sanitized screenshots or test output as a fallback.
- [ ] Do not show `.env.local`, secret values, personal user data, production
      records, or browser storage/tokens.
- [ ] Be ready to disclose that database-side reviewer identity hardening and
      live Supabase security validation remain incomplete.

## Login and dashboard

- [ ] Open the application at the intended demo URL.
- [ ] Sign in using the approved demo admin account.
- [ ] Verify a non-admin account is not used for the presentation.
- [ ] Confirm the dashboard loads without a data-error message.
- [ ] Point out that summary counts come from stored purchase request data.
- [ ] Confirm the Approval Workspace is accessible from the sidebar (desktop)
      or mobile navigation.
- [ ] Confirm pending counts and request cards reflect the demo project's
      current data.
- [ ] Avoid showing the personal identity of any real account; use only the
      synthetic demo account.

## Purchase evaluation demonstration

- [ ] Navigate to the dashboard's “Test Purchase Security” form.
- [ ] Explain that the form evaluates a request and does not make or execute a
      payment.
- [ ] Enter synthetic merchant, domain, product, amount, and currency values.
- [ ] Submit once and wait for the API response.
- [ ] Verify the result shows decision, risk level, score, reasons, and next
      action.
- [ ] Confirm the dashboard refreshes and the saved request appears when data
      loading succeeds.
- [ ] Do not claim the rules verified the merchant in the real world.

## Low-risk scenario

- [ ] Use a synthetic request matching a configured demo pair, for example:
      merchant `Amazon`, domain `amazon.com`, product `Demo keyboard`,
      amount `$100`, currency `USD`.
- [ ] Expected rule output: `READY_FOR_HUMAN_APPROVAL`, `LOW`, score 10.
- [ ] Expected saved status: `PENDING_APPROVAL`.
- [ ] Explain that “ready” is not “approved”; a human decision is still
      required.
- [ ] Do not imply this confirms the submitted merchant is genuine.

## High-risk / review scenario

- [ ] Use deliberately synthetic mismatched details and a high amount, for
      example: merchant `Example Store`, domain `example.test`, product
      `Demo item`, amount `$1,200`, currency `USD`.
- [ ] Expected rule output: `REVIEW_REQUIRED`, `HIGH`, score 100 under the
      current rules (10 base + 45 mismatch + 30 over $500 + 15 over $1,000).
- [ ] Expected saved status: `PENDING_REVIEW`.
- [ ] Explain that the score means the rules require review; it is not a fraud
      probability or a verified fraud finding.
- [ ] Optionally demonstrate a valid non-USD currency. Expected engine result:
      `REVIEW_REQUIRED`, score 60, before USD merchant/amount scoring.

## Approval and rejection

- [ ] Open Approvals and select a synthetic pending request.
- [ ] Confirm merchant, product, amount, risk score/level, decision, and status
      are visible.
- [ ] Optionally enter a short non-sensitive review note.
- [ ] Approve one pending request explicitly as the signed-in admin.
- [ ] Confirm the success feedback appears and the dashboard refreshes.
- [ ] Reject a different pending request explicitly as the signed-in admin.
- [ ] Confirm the rejection success feedback appears and the dashboard
      refreshes.
- [ ] Verify that a completed request is no longer in the pending workspace.
- [ ] Do not describe approval as payment execution or authorization.
- [ ] If an action fails, do not claim success or repeat against an unknown
      environment.

## Review metadata / audit history

- [ ] Navigate to Recent Transactions on the dashboard.
- [ ] Locate one of the synthetic reviewed requests.
- [ ] Confirm the available review metadata: status, review date, reviewer ID,
      and optional note when those fields exist.
- [ ] Describe this accurately: the screen shows review metadata for recent
      requests; it is not a full approval-event log viewer.
- [ ] Do not expose real reviewer IDs or personal information on screen.

## Failure recovery

- [ ] If login fails, stop and use the pre-approved fallback; do not try
      multiple accounts or expose credentials.
- [ ] If the dashboard shows a data error, state that live data was not
      available. Do not infer success from stale counts.
- [ ] If evaluation fails, confirm no successful saved result was shown before
      retrying. Avoid repeated writes.
- [ ] If a review returns an error or conflict, do not state that the decision
      succeeded. Refresh once and verify the current status.
- [ ] If the configured target is not clearly the approved demo/staging
      project, stop before submitting or reviewing anything.
- [ ] Do not inspect environment files, browser tokens, logs containing
      credentials, or production data while recovering.
- [ ] Switch to sanitized screenshots or isolated test evidence if the live
      demo remains unavailable.
- [ ] When using test evidence, say that tests use mocks and do not validate
      live Supabase grants, RLS, RPC identity, or production configuration.

## Current security disclosures to mention

- [ ] The security engine is deterministic and rule-based, not machine
      learning.
- [ ] The merchant mapping is not real-world merchant verification.
- [ ] Low risk never automatically approves a request.
- [ ] Approval/rejection records a human decision; no payment is executed.
- [ ] The review API passes the authenticated admin ID to a service-role-only
      RPC, but the current RPC does not independently verify that ID. A trusted
      service-role caller could supply another actor ID.
- [ ] Live Supabase grants, RLS, migration state, and deployed behavior have
      not been independently validated; database hardening remains blocked
      until a separate staging project is available.
