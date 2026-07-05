# Onboarding Accelerator

Next.js onboarding guidance workspace with server-side chat, guide generation, logging, and RAG services.

## Workspaces

- `apps/web`: Next.js App Router application that owns the UI and API route handlers.
- `packages/shared`: Shared request and response contracts.
- `docs/harness`: Lightweight generated docs that map the current code structure.
- `specs/archive`: Numbered historical and future-planning specs.

## Local Commands

```powershell
npm install
npm run dev
npm run lint
npm test
npm run build
npm run format:check
npm run docs:harness:update
```

`npm run dev` starts the Next.js app at `http://localhost:3000`. The first screen asks for an
account ID and access token. In local development, `AUTH_DISABLED=true` lets you continue without a
token and uses `local-dev-user` unless you enter an account ID. When auth is enabled with
`API_AUTH_TOKEN`, enter that token to validate the session. The browser stores the validated
credential in `sessionStorage` and sends it to protected API routes.

By default sessions persist to `SESSION_STORE_PATH`. Set `SESSION_STORE=postgres` with
`DATABASE_URL` to use Postgres-backed sessions. To enable pgvector retrieval, apply
`db/migrations/001_postgres_pgvector.sql`, populate `knowledge_chunks` with 1536-dimension
embeddings, and set `RAG_VECTOR_ENABLED=true`.

Admin operations are available at `/admin`. The admin console uses the same browser account session
as the workspace and requires the authenticated user role to be `admin`; all `/api/admin/*` routes
enforce that role server-side. In local `AUTH_DISABLED=true` development, the admin login form can
set the role header for smoke testing. Admin audit events, AI rate cards, and AI fee adjustments
persist to `ADMIN_AUDIT_STORE_PATH`, `AI_RATE_CARDS_STORE_PATH`, and
`AI_FEE_ADJUSTMENTS_STORE_PATH`.

The pre-commit hook updates harness docs, stages the generated docs, then runs lint and Prettier checks.
