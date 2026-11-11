# PROOFPAY AI — Likely Judge Questions and Answers

## Product and usefulness

### 1. What problem are you addressing?

We demonstrate a consistent way to evaluate a purchase request, explain why
rules flag it, and send it to a human for a decision.

### 2. Who could find this useful?

Teams that want a structured review queue and recorded decisions could find
this workflow useful. This prototype does not establish that it is suitable
for production use.

### 3. What makes this more useful than a spreadsheet?

The prototype joins request validation, consistent rule outputs, an admin
review interface, and stored review metadata in one workflow. It is a demo,
not a measured productivity improvement.

### 4. What does the name “PROOFPAY AI” mean? Is it really AI?

The current engine is not AI or machine learning. It is a deterministic
TypeScript ruleset. “AI” is part of the project name, not a claim about the
implemented model.

### 5. What can you demonstrate today?

An authenticated admin can submit a request, see the deterministic decision
and reasons, and explicitly approve or reject a pending request.

## Risk rules and purchase decisions

### 6. How is risk calculated?

For valid USD requests, the score starts at 10, adds 45 for a mismatch with the
configured demo name/domain mapping, adds 30 above $500, and adds 15 above
$1,000, capped at 100.

### 7. What does a low score mean?

It means the request matched this small demo ruleset. It does not establish
that a merchant is legitimate, and it does not approve the request.

### 8. Is a low-risk request automatically approved?

No. It is stored as `PENDING_APPROVAL`. An authorized human must make the
decision.

### 9. Why does a known merchant still need human approval?

The configured merchant mapping is only a demo check. It is not sufficiently
reliable to make a real purchase decision, and the workflow intentionally
requires a person to decide.

### 10. Does the engine identify fraud?

No. It applies a few explicit rules and reports their output. Its score is an
illustrative heuristic, not a fraud probability or a validated model.

### 11. Does it verify merchant ownership?

No. It compares a submitted name and domain against a small static mapping. It
does not contact the merchant, verify domain ownership, or prevent every
spoofed domain.

### 12. What happens to a high-value request?

An amount above $500 is sent to `PENDING_REVIEW`. Amounts above $1,000 add
another 15 points to the USD score. A human must still decide.

### 13. What currencies are supported?

The score rules are for USD. A syntactically valid different currency is
marked `REVIEW_REQUIRED`; it is not automatically rejected or converted.

### 14. What happens when inputs are invalid?

The API rejects malformed or out-of-range request data before persistence.
The engine also classifies invalid or incomplete purchase information as
blocked. The two layers provide input validation and a decision boundary.

## Human approval and audit information

### 15. Who can approve or reject?

The protected review API requires a signed-in user with the trusted
`app_metadata.role === "admin"` claim.

### 16. Can a reviewer include an explanation?

Yes. The Approval Workspace has an optional review note, limited to 1,000
characters by the API.

### 17. How are duplicate decisions prevented?

The review database operation updates only a request whose status is still
`PENDING_APPROVAL` or `PENDING_REVIEW`. A request that is no longer pending
does not return a second successful decision.

### 18. What audit history can a judge see?

Recent Transactions can show the stored review date, reviewer ID, and note
associated with a request. The migration also writes an `approval_events`
record. The dashboard is not a full approval-event log browser.

### 19. Does approval charge a card or execute a payment?

No. There is no payment processor or payment-execution path in the project.
Approval is only a recorded human decision about the request.

## Technical architecture

### 20. What is the technology stack?

Next.js, React, TypeScript, Tailwind CSS, and Supabase Auth/database. The
application uses Node's built-in test runner for automated tests.

### 21. What happens when a purchase is evaluated?

The browser sends the fields to `POST /api/evaluate`. The API authenticates and
authorizes the user, checks origin and input, calls the shared TypeScript rule
engine, then inserts the computed request into `purchase_requests`.

### 22. How does the review request reach the database?

The browser sends an action and optional note to
`POST /api/purchase-requests/[id]/review`. The API verifies the admin session,
validates the request, and invokes the existing review RPC using the
server-only service-role client.

### 23. Why use a service-role client?

The current server-side implementation uses it for dashboard reads,
evaluation inserts, and the review RPC call. It is guarded by a server-only
module and is not imported by the browser UI. The live project's effective
permissions have not been independently verified.

### 24. How do you protect the API?

The routes independently check the Supabase user and trusted admin role,
require a configured canonical origin, and validate body size and fields before
privileged operations. These are source-code and mock-test observations, not
proof of deployed configuration.

### 25. How do you test the workflow?

The recorded suite has 99 tests: engine tests and mock-backed evaluation,
review, and workflow tests. They exercise application logic but do not execute
against a live database.

## Cybersecurity and limitations

### 26. Is the database security fully verified?

No. Effective deployed Supabase grants, RLS, migration state, and live behavior
have not been independently validated in staging.

### 27. Is reviewer identity fully protected by the database?

Not yet. The API derives the reviewer ID from the authenticated admin session
and passes it to the service-role-only RPC. The current database function
accepts that ID but does not independently verify it against the caller.
Another trusted service-role caller could supply a different ID.

### 28. Why have you not fixed the database identity limitation?

There is no separate staging Supabase project available. Applying permission
or function changes directly to a project that may contain real data would be
unsafe. Database hardening remains blocked until it can be designed and tested
in staging.

### 29. Are secrets sent to the browser?

The source separates the server-only service-role helper from the browser
session client, which uses the publishable key. We have not independently
verified a deployed bundle or hosting configuration during this demo.

### 30. What happens if Supabase is unavailable?

The UI/API can report that data could not be loaded or saved. The demo should
not claim a review succeeded unless the API returns success and the updated
state is visible.

### 31. What are the biggest current risks?

The rules are simplistic and not validated against real outcomes. Merchant
matching is not real verification. Live database security is unverified, and
the current RPC does not independently bind the actor ID.

### 32. What would you improve next?

First, provision a separate staging project and harden/test reviewer identity
and database permissions there. Then add live integration tests with synthetic
data. Any external merchant verification or model would require a separately
validated source and human oversight.

### 33. Would you add machine learning?

Only if there were a justified, validated data source and measurable benefit.
If added, it should explain uncertainty and support—not replace—the policy
checks and human decision.

### 34. What would be required before production?

Staging and live security verification, least-privilege database permissions,
database-side reviewer identity enforcement, integration testing, operational
monitoring, and a separately reviewed production-readiness process. The
prototype is not production-ready based on current evidence.

## Demo-day honesty

### 35. What if the live database is unavailable?

We will disclose that the live path could not be demonstrated and use
sanitized screenshots or mock-backed test evidence. We will not retry against
an unknown or production database.

### 36. Did you test on real customer data?

The automated tests use isolated mock data. A demo should use synthetic
records in a dedicated non-production project, never real customer data.
