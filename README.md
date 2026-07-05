# Onboarding Accelerator

Next.js onboarding guidance workspace with server-side chat, guide generation, logging, and RAG services.

## Workspaces

- `apps/web`: Next.js App Router application that owns the UI and API route handlers.
- `packages/shared`: Shared request and response contracts.
- `docs/harness`: Lightweight generated docs that map the current code structure.

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

`npm run dev` starts the Next.js app at `http://localhost:3000`. In local development,
`AUTH_DISABLED=true` uses `local-dev-user` unless `sessionStorage.onboardingUserId` is set.

By default sessions persist to `SESSION_STORE_PATH`. Set `SESSION_STORE=postgres` with
`DATABASE_URL` to use Postgres-backed sessions. To enable pgvector retrieval, apply
`db/migrations/001_postgres_pgvector.sql`, populate `knowledge_chunks` with 1536-dimension
embeddings, and set `RAG_VECTOR_ENABLED=true`.

The pre-commit hook updates harness docs, stages the generated docs, then runs lint and Prettier checks.
