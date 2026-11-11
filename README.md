# PROOFPAY AI

PROOFPAY AI is a hackathon demo for evaluating purchase requests and sending
them to a human reviewer. Its security engine is deterministic, rule-based
software. It does **not** use machine learning, independently verify merchants,
or approve or execute payments automatically.

## What it does

- Evaluates purchase details using a small, explicit demo ruleset.
- Requires human review for unknown or mismatched merchant identities and
  purchases above the demo amount limit.
- Lets authorized admins review eligible requests through a protected API.
- Displays dashboard and approval information sourced from Supabase.

The configured merchant names and domains are a controlled demo mapping, not
proof that a merchant is genuine.

## Technology

- Next.js 16.4.5, React 19.3, TypeScript 5
- Supabase Auth and database
- Tailwind CSS 4
- Node.js 24 (recommended)

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

   Get values from your own Supabase project. Do not copy production secrets
   into examples, screenshots, source code, or chat messages.
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
node --test tests/security-engine.test.ts tests/evaluate-api.test.ts tests/purchase-review-api.test.ts tests/purchase-workflow.e2e.test.ts
npx.cmd tsc --noEmit
npm.cmd run lint
npm.cmd run build
```

The tests use the Node.js built-in test runner and isolated in-memory mocks for
protected API workflows. They do not prove that a deployed Supabase project has
the expected grants, policies, environment variables, or data.

## More information

See [PROJECT_DOCUMENTATION.md](./PROJECT_DOCUMENTATION.md) for the architecture,
rules, APIs, security boundaries, test results, deployment checklist, known
limitations, and hackathon demo guidance. See
[PROJECT_PROGRESS.md](./PROJECT_PROGRESS.md) for the phase-by-phase work log.
