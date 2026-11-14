# PROOFPAY AI

PROOFPAY AI is a hackathon demo for evaluating purchase requests and sending
them to a human reviewer. Its security engine is deterministic, rule-based
software. It does **not** use machine learning, independently verify merchants,
or automatically approve or pay for purchase requests.

## What it does

- Evaluates purchase details using a small, explicit demo ruleset.
- Requires human review for unknown or mismatched merchant identities and
  purchases above the demo amount limit.
- Lets authorized admins review eligible requests through a protected API.
- Displays dashboard and approval information sourced from Supabase.
- Provides an admin-only Settings page with account and secret-safe
  configuration status.
- Includes a separate PayPal Sandbox demonstration for a fixed USD 1.00 order.
  It is not connected to purchase requests or approvals, and PROOFPAY does not
  store order or capture records.

The configured merchant names and domains are a controlled demo mapping, not
proof that a merchant is genuine.

## Technology

- Next.js 16.4.5, React 19.3, TypeScript 5
- Supabase Auth and database
- Tailwind CSS 4
- PayPal Orders API and JavaScript SDK (Sandbox demonstration only)
- Node.js 24 (recommended)

The PayPal demonstration uses server-side OAuth, buyer approval, server-side
capture, and server verification of the Sandbox order and capture. It does not
process real payments, change purchase status, or mark a request as paid.
There is no Gemini integration in the current project.

## Run locally

1. Install Node.js 24 and clone/open this project.
2. Install the locked dependencies:

   ```bash
   npm ci
   ```

3. Create a local `.env.local` file (never commit it) and configure:

   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY` (server-only; never expose with a `NEXT_PUBLIC_` name)
   - `APP_ORIGIN` (for local development, usually `http://localhost:3000`)
   - `NEXT_PUBLIC_PAYPAL_CLIENT_ID` (public PayPal Sandbox application ID)
   - `PAYPAL_CLIENT_SECRET` (server-only Sandbox secret)
   - `PAYPAL_DEMO_SIGNING_SECRET` (server-only random key of at least 32 bytes)
   - `PAYPAL_BASE_URL` (must be exactly
     `https://api-m.sandbox.paypal.com`)

   Get values from your own Supabase project. Do not copy production secrets
   into examples, screenshots, source code, or chat messages.
   Configure PayPal values from your own PayPal Developer Sandbox application.
   Do not use live PayPal credentials. Set environment values yourself through
   an approved secure method; this repository does not edit `.env.local`.
4. Apply the project's required Supabase migrations to a development project
   using your normal Supabase workflow. The review endpoint depends on the
   pending-only purchase review migration.
5. Start the development server:

   ```bash
   npm run dev
   ```

   On Windows, `npm.cmd run dev` is also available.
6. Open [http://localhost:3000](http://localhost:3000).

Do not use production customer data for local testing.

## Checks

```bash
node --conditions=react-server --test tests/*.test.ts
npx.cmd tsc --noEmit
npm.cmd run lint
npm.cmd run build
```

The tests use the Node.js built-in test runner and isolated in-memory mocks for
protected API workflows and mock PayPal Sandbox responses. They do not contact
PayPal or prove a real Sandbox checkout, and they do not prove that a deployed
Supabase project has the expected grants, policies, environment variables, or
data.

The Sandbox flow keeps its short-lived verification token only in page memory.
It uses PayPal idempotency and server-side order checks for retries, but without
persistent storage PROOFPAY cannot keep payment history, guarantee durable
one-time-use tracking, or reconcile every interrupted flow. Reloading the page
loses the token and may require restarting the demonstration.

## More information

See [PROJECT_DOCUMENTATION.md](./PROJECT_DOCUMENTATION.md) for the architecture,
rules, APIs, security boundaries, test results, deployment checklist, known
limitations, and hackathon demo guidance. See
[PROJECT_PROGRESS.md](./PROJECT_PROGRESS.md) for the phase-by-phase work log.
