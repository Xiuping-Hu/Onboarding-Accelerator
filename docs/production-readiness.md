# Production Readiness

## Current Stack

The product now runs as a single Next.js App Router application in `apps/web`.

- UI rendering lives in `apps/web/src/app`.
- Backend behavior lives in Next.js route handlers under `apps/web/src/app/api`.
- Reusable server services live in `apps/web/src/server`.
- Shared request/response contracts remain in `packages/shared`.

## API Contracts

Shared contracts live in `packages/shared/src/index.ts`.

- `GET /health` and `GET /ready` return `HealthResponse` and do not require auth.
- `GET /metrics` returns basic in-process request counters.
- `POST /api/auth/login` validates an email/password against Postgres users, creates a server-side auth session, sets an HttpOnly cookie, and returns `LoginResponse`.
- `POST /api/auth/logout` revokes the browser session and clears the auth cookie.
- `GET /logout` and `POST /logout` revoke the browser session and redirect to `/login`.
- `GET /api/auth/me` returns `CurrentUserResponse`.
- `GET /api/sessions` returns `ListSessionsResponse`.
- `POST /api/sessions` accepts `CreateSessionRequest` and returns `CreateSessionResponse`.
- `GET /api/sessions/:sessionId` returns `GetSessionResponse`.
- `PATCH /api/sessions/:sessionId` accepts `UpdateSessionRequest` and returns `UpdateSessionResponse`.
- `DELETE /api/sessions/:sessionId` returns `204`.
- `POST /api/sessions/:sessionId/chat` accepts `ChatRequest` and returns `ChatResponse`.
- `POST /api/sessions/:sessionId/guide/root` reads the current authorized published roadmap from Postgres and returns `GenerateGuideRootResponse` without generating session-specific topology.
- `POST /api/admin/knowledge-maps/proposals` groups reviewed RAG sources into domain-categorized roadmap drafts.
- `POST /api/admin/knowledge-maps` stores a reviewed roadmap draft and the version publish endpoint makes it available to eligible sessions.
- `POST /api/ask` accepts `AskRequest` and returns `AskResponse`.
- `GET /api/logs/summary` returns `LogSummaryResponse`.
- `GET /api/logs/recent?limit=10` returns `LogEventsResponse`.
- `GET /api/admin/activity` returns admin-filtered activity logs for `admin` users.
- `POST /api/admin/activity/export`, `POST /api/admin/activity/retention`, and `DELETE /api/admin/activity` provide audited admin log operations.
- `GET /api/admin/ai-fees/summary` returns admin-only AI fee reporting based on token usage and configured rate cards.
- `GET /api/admin/ai-fees/rates`, `POST /api/admin/ai-fees/rates`, and `PATCH /api/admin/ai-fees/rates/:rateId` manage AI fee rate cards.
- `POST /api/admin/ai-fees/recalculate` recalculates admin-only fee estimates for the selected usage range.
- `GET /api/admin/ai-fees/adjustments` and `POST /api/admin/ai-fees/adjustments` manage audited manual fee adjustment records.
- `GET /api/admin/audit` returns recent admin audit events.

Protected API routes require the auth session cookie; `/api/auth/login` is public so the browser can create that cookie after a successful password check. `/health`, `/ready`, and `/metrics` are public operational endpoints. Session access is scoped by the authenticated user ID.
Admin APIs additionally require `role = admin`; the admin console at `/admin` does not expose operational data until those server-side checks pass.

## Router And Shared Code Decisions

The app uses the Next.js App Router. `packages/shared` remains a workspace package so contracts are importable from both client components and server modules without duplicating domain types.

## Required Production Configuration

Set these before running with `NODE_ENV=production`:

- Authentication: set `AUTH_DISABLED=false`, `DATABASE_URL`, `AUTH_COOKIE_NAME`, `AUTH_SESSION_DURATION_MS`, `AUTH_SECURE_COOKIE=true`, `AUTH_LOGIN_RATE_LIMIT_WINDOW_MS`, and `AUTH_LOGIN_RATE_LIMIT_MAX`.
- Session storage: use `SESSION_STORE=postgres` with `DATABASE_URL` for multi-instance deployments, or `SESSION_STORE=file` plus `SESSION_STORE_PATH` for local/single-instance JSON storage.
- Logging: Vercel deployments emit structured request, error, and AI usage logs to the platform
  collector. Other runtimes use `LOG_STORE_PATH`, which must point to a writable durable path.
- `ADMIN_AUDIT_STORE_PATH`: writable durable path for JSONL admin audit events.
- `AI_RATE_CARDS_STORE_PATH`: writable durable path for AI rate-card JSON storage.
- `AI_FEE_ADJUSTMENTS_STORE_PATH`: writable durable path for manual AI fee adjustment JSONL storage.
- `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_TIMEOUT_MS`, and `OPENAI_MAX_RETRIES`.
- Do not copy loopback provider proxies such as `DEEPSEEK_PROXY_URL=http://127.0.0.1:10808` into
  Vercel. They refer to the developer machine locally but to the serverless function in production;
  Vercel runtime calls ignore loopback proxy values as a defensive fallback.
- `RAG_SHARED_DIRECTORY` for shared files and `RAG_WEBSITE_ALLOWLIST` for allowed website ingestion.
- pgvector RAG: apply `db/migrations/001_postgres_pgvector.sql`, populate `knowledge_chunks`, then set `RAG_VECTOR_ENABLED=true`, `DATABASE_URL`, and optionally `OPENAI_EMBEDDING_MODEL` and `RAG_VECTOR_LIMIT`.
- governed knowledge maps: apply migrations through `006_rag_grounded_knowledge_maps.sql`, set
  `SESSION_STORE=postgres`, and enable `RAG_KNOWLEDGE_MAP_ENABLED=true`. Readiness must treat missing
  Postgres map/session persistence as a configuration failure.

Apply `db/migrations/001_postgres_pgvector.sql`, `db/migrations/002_users_table.sql`, and `db/migrations/003_postgres_account_auth.sql` before enabling password auth. Use `npm run users:create -- --email admin@example.com --name "Admin" --role admin` to create the first administrator. The app intentionally has no `/register` page or registration API.

Do not set `AUTH_DISABLED=true` in production. Startup validation rejects that combination. CORS is not configured by default because the Next app serves UI and API from the same origin; add a hosting/provider policy only if a future cross-origin client is introduced.

## Local Development

Use `AUTH_DISABLED=true` locally to skip password login and enter the workspace as `local-dev-user`. To exercise real login locally, run Postgres, apply the migrations, set `AUTH_DISABLED=false`, set `DATABASE_URL`, and create a user with `npm run users:create`.

## Deployment

1. Run `npm install`.
2. Run `npm run lint`, `npm test`, and `npm run build`.
3. Apply database migrations when using Postgres or pgvector.
4. Deploy the Next.js app from `apps/web` to a Node-compatible Next host.
5. Provide the production environment variables above.
6. Ensure the configured session and log paths are backed by durable storage.

## Deferred Production Choices

- The current in-process rate limiter is suitable for local and single-instance use; production should use Redis, an edge/provider limiter, or another shared backend.
- RAG ingestion is request-time file and website scanning unless `knowledge_chunks` is populated separately. Larger deployments should move all ingestion to an indexing job.
- Admin activity logs, AI rate cards, and audit events currently use file-backed storage. Multi-instance production should move those admin operations stores to PostgreSQL.
