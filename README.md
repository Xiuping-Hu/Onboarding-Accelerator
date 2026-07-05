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

`npm run dev` starts the Next.js app at `http://localhost:3000`. With `AUTH_DISABLED=true`, local
development opens the protected workspace as `local-dev-user`. For the real account flow, apply
`db/migrations/001_postgres_pgvector.sql`, `db/migrations/002_users_table.sql`, and
`db/migrations/003_postgres_account_auth.sql`; set `AUTH_DISABLED=false` and `DATABASE_URL`; then
create an account:

```powershell
npm run users:create -- --email admin@example.com --name "Admin" --role admin
```

The script prompts for a password, stores only a bcrypt hash, and inserts the user into Postgres.
There is no public registration route. As a fallback, direct SQL account creation must use a
precomputed password hash; never insert plaintext passwords.

By default sessions persist to `SESSION_STORE_PATH`. Set `SESSION_STORE=postgres` with
`DATABASE_URL` to use Postgres-backed sessions. To enable pgvector retrieval, apply
`db/migrations/001_postgres_pgvector.sql`, populate `knowledge_chunks` with 1536-dimension
embeddings, and set `RAG_VECTOR_ENABLED=true`.

The pre-commit hook updates harness docs, stages the generated docs, then runs lint and Prettier checks.
