# Production Readiness

## Current Stack

The product now runs as a single Next.js App Router application in `apps/web`.

- UI rendering lives in `apps/web/src/app`.
- Backend behavior lives in Next.js route handlers under `apps/web/src/app/api`.
- Controllers, application services, DTOs, and persistence adapters live in
  `apps/web/src/server`.
- Shared request/response contracts remain in `packages/shared`.

## API Contracts

Shared contracts live in `packages/shared/src/index.ts`.

- `GET /health` and `GET /ready` return `HealthResponse` and do not require auth.
- `GET /metrics` returns basic in-process request counters.
- `GET /api/auth/microsoft/start` creates a signed, short-lived OIDC state cookie and redirects to the tenant-specific Microsoft authorization endpoint with PKCE and nonce.
- `GET /api/auth/microsoft/callback` validates the authorization response and ID token, binds the verified Microsoft `tid` + `oid` identity to a local Postgres user, and creates the existing server-side browser session.
- `POST /api/auth/logout` revokes the browser session and clears the auth cookie.
- `GET /logout` and `POST /logout` revoke the browser session and redirect to `/login`.
- `GET /api/auth/me` returns `CurrentUserResponse`.
- `GET /api/sessions` returns `ListSessionsResponse`.
- `POST /api/sessions` accepts `CreateSessionRequest` and returns `CreateSessionResponse`.
- `GET /api/sessions/:sessionId` returns `GetSessionResponse`.
- `PATCH /api/sessions/:sessionId` accepts `UpdateSessionRequest` and returns `UpdateSessionResponse`.
- `DELETE /api/sessions/:sessionId` returns `204`.
- `POST /api/sessions/:sessionId/chat` accepts `ChatRequest` and returns `ChatResponse`.
- `GET /api/onboarding` returns the authenticated user's applied static roadmap, separate user
  progress state, and newest unread roadmap notice, or an explicit ingestion-driven preparing state.
- `PATCH /api/onboarding/tasks/:taskId` accepts only
  `{ status, expectedTaskRevision, expectedStateRevision, clientRequestId }` and changes personal
  progress.
- `PATCH /api/onboarding/notices/:noticeId` accepts only `{ read: true }`, acknowledges the owner's
  notices through that roadmap version, and returns `204`.
- Legacy session-scoped roadmap definition mutations are retired. During the compatibility window
  they return authenticated `410 Gone` without side effects; they are not generation backdoors.
- `POST /api/sessions/:sessionId/guide/root` reads the current authorized published roadmap from Postgres and returns `GenerateGuideRootResponse` without generating session-specific topology.
- `POST /api/ask` accepts `AskRequest` and returns `AskResponse`.
- `GET /api/internal/rag/cron` is a `CRON_SECRET`-protected Vercel heartbeat that dispatches due
  source schedules and processes one queued ingestion run.
- `GET /api/logs/summary` returns `LogSummaryResponse`.
- `GET /api/logs/recent?limit=10` returns `LogEventsResponse`.

Protected API routes require the auth session cookie; the Microsoft start/callback routes are public
so the OIDC redirect can create that cookie after a verified sign-in. Authenticated mutations reject
cross-site browser requests using Origin and Fetch Metadata checks. `/health`, `/ready`, and
`/metrics` are public operational endpoints. Session APIs scope chat/guide state; the sessionless
onboarding APIs scope canonical reads, personal task state, and notices directly by the authenticated
local user ID. A chat selection or deletion cannot alter roadmap state.

## Router And Shared Code Decisions

The app uses the Next.js App Router. `packages/shared` remains a workspace package so contracts are importable from both client components and server modules without duplicating domain types.

## Required Production Configuration

Set these before running with `NODE_ENV=production`:

- Authentication: set `AUTH_DISABLED=false`, `DATABASE_URL`, `AUTH_COOKIE_NAME`, `AUTH_SESSION_DURATION_MS`, `AUTH_SECURE_COOKIE=true`, and every `AUTH_MICROSOFT_*` setting in `.env.example`. Register the exact callback URL as a Web redirect URI in the Entra application.
- Session storage: use `SESSION_STORE=postgres` with `DATABASE_URL` for multi-instance deployments, or `SESSION_STORE=file` plus `SESSION_STORE_PATH` for local/single-instance JSON storage.
- Logging: Vercel deployments emit structured request, error, and AI usage logs to the platform
  collector. Other runtimes use `LOG_STORE_PATH`, which must point to a writable durable path.
- `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_TIMEOUT_MS`, and `OPENAI_MAX_RETRIES`.
- Do not copy loopback provider proxies such as `DEEPSEEK_PROXY_URL=http://127.0.0.1:10808` into
  Vercel. They refer to the developer machine locally but to the serverless function in production;
  Vercel runtime calls ignore loopback proxy values as a defensive fallback.
- `RAG_SHARED_DIRECTORY` for shared files and `RAG_WEBSITE_ALLOWLIST` for allowed website ingestion.
- pgvector RAG: run `npm run db:migrate:deploy`, populate `knowledge_chunks`, then set
  `RAG_VECTOR_ENABLED=true`, `DATABASE_URL`, and optionally `OPENAI_EMBEDDING_MODEL` and
  `RAG_VECTOR_LIMIT`.
- governed knowledge maps: deploy all Prisma migrations, set
  `SESSION_STORE=postgres`, and enable `RAG_KNOWLEDGE_MAP_ENABLED=true`. Readiness must treat missing
  Postgres map/session persistence as a configuration failure.
- scheduled RAG ingestion on Vercel: set a random `CRON_SECRET`, deploy the provider heartbeat from
  `vercel.json`, and synchronize the approved source registry against the production database. The
  cron route dispatches due schedules and processes one queued run within a five-minute function
  budget.
- ingestion-driven static roadmap: deploy migration `0012_ingestion_driven_static_roadmap`, set
  `STATIC_ROADMAP_ENABLED=true`, and set `STATIC_ROADMAP_AUTHORITATIVE_SOURCE_ID` to the registry's
  one enabled `all_users` source marked `roadmapAuthoritative`. `DATABASE_URL`, vector retrieval, and
  the configured generation provider must be available. Workload controls are
  `STATIC_ROADMAP_RETRIEVAL_LIMIT_PER_QUERY`, `STATIC_ROADMAP_USER_SYNC_BATCH_SIZE`,
  `STATIC_ROADMAP_MAX_REFRESH_ATTEMPTS`, `STATIC_ROADMAP_MAX_USER_SYNC_ATTEMPTS`,
  `STATIC_ROADMAP_LEASE_MS`, and `STATIC_ROADMAP_RETRY_BASE_MS`. Treat
  `STATIC_ROADMAP_OBJECTIVE_VERSION`, `STATIC_ROADMAP_RETRIEVAL_CONFIG_VERSION`,
  `STATIC_ROADMAP_RETRIEVAL_QUERY_SET_VERSION`, `STATIC_ROADMAP_GENERATOR_SCHEMA_VERSION`,
  `STATIC_ROADMAP_PROMPT_VERSION`, and `STATIC_ROADMAP_DECODING_CONFIG_VERSION` as auditable release
  inputs; changing one intentionally creates a new derivation identity.

Set `STATIC_ROADMAP_REFRESH_CLAIMS_ENABLED=false` to pause new refresh claims and canonical
publication. This kill switch does not disable knowledge ingestion, applied roadmap reads, notices,
or personal task transitions. Leave it `false` during migration/bootstrap preparation and incident
containment; queued work remains durable for a later retry.

Run `npm run db:migrate:deploy` before enabling Microsoft auth. Use
`npm run users:create -- --email user@example.com --name "User" --role user` to pre-provision the
first user; the verified Microsoft identity binds on first sign-in. The app intentionally
has no password login, `/register` page, or registration API.

Do not set `AUTH_DISABLED=true` in production. Startup validation rejects that combination. CORS is not configured by default because the Next app serves UI and API from the same origin; add a hosting/provider policy only if a future cross-origin client is introduced.

## Local Development

Use `AUTH_DISABLED=true` locally only when deliberately skipping authentication. To exercise real
login locally, configure `DATABASE_URL`, run `npm run db:migrate:deploy`, set `AUTH_DISABLED=false`,
configure the Entra app credentials, and register
`http://localhost:3000/api/auth/microsoft/callback` as a Web redirect URI.

## Deployment

1. Run `npm install`.
2. Run `npm run lint`, `npm test`, and `npm run build`.
3. Run `npm run db:migrate:status`, then `npm run db:migrate:deploy` when using Postgres or pgvector.
4. Deploy the Next.js app from `apps/web` to a Node-compatible Next host.
5. Provide the production environment variables above.
6. Ensure the configured session and log paths are backed by durable storage.

Existing databases created with the legacy SQL migration workflow must be baselined before the
first Prisma deployment. Follow [Prisma migration adoption](prisma-migration-adoption.md); do not
run deploy first against such a database.

## Static Roadmap Operations

Migration `0012_ingestion_driven_static_roadmap` is additive and must follow
`0011_live_ai_onboarding_roadmap`. It adds the canonical root/version linkage, refresh and rollout
queues, per-user sync state, reconciliation events, evidence pins, governance records, and durable
update notices without deleting legacy plans, task events, or versions.

Use this rollout order:

1. Deploy `0012` and the application with `STATIC_ROADMAP_ENABLED=false` and refresh claims paused.
2. Synchronize the source registry; verify exactly one enabled `all_users` source is marked
   `roadmapAuthoritative`, its ID matches the environment, and it has a published current version.
3. Enable the feature while keeping claims paused. Run one bootstrap with a unique operator request
   ID; replaying that ID must not create another job. Review its mandatory legacy-integrity audit and
   owner-quarantine report before canonical v1 generation begins.
4. Enable claims and run bounded workers until the refresh job, rollout, and captured user-sync cohort
   finish. Canonical v1/backfill and new-account initialization must not emit update notices.
5. Verify the current version, per-user `appliedVersionId`, sync failures/retries, preserved completed
   states, and notice/version consistency before declaring cutover complete.

The operator commands are:

```powershell
npm run roadmap:bootstrap -- --request-id <durable-id>
npm run roadmap:worker -- --limit <1-100>
```

Both require `STATIC_ROADMAP_ENABLED=true`. Bootstrap uses the current authorized source and treats
the durable request ID as its idempotency key; it has no source, session, or user override. Each
worker cycle processes at most one newest eligible refresh followed by the configured bounded
user-sync batch, and stops early when both queues are empty.

In serverless deployments, `STATIC_ROADMAP_BOOTSTRAP_REQUEST_ID` can temporarily run the same
bootstrap through the existing `CRON_SECRET`-protected `/api/internal/static-roadmap/cron`
heartbeat. Use one reviewed 1-128 character ID containing only letters, numbers, `.`, `_`, `:`, and
`-`. The heartbeat attempts bootstrap before refresh and user-sync processing. A missing or
unpublished authoritative source is a typed `waiting_for_source` result, returns HTTP 200, and does
not prevent existing queued work from running. Hard bootstrap failures remain a failed heartbeat but
also do not skip either worker. Responses and logs omit the raw request ID.

Leave the temporary variable in place until canonical v1 is the current version and the initial
rollout is complete; `enqueued` and `duplicate` only confirm durable request acceptance. Then remove
the variable. A `duplicate` result reports the durable refresh job's current status. If that stable
ID's job reports `failed` or `cancelled`, diagnose the outcome and rotate to a new reviewed ID:
replaying the old ID is intentionally a duplicate and does not revive the terminal job. This
mechanism does not add a public bootstrap endpoint.

Budget the first configured heartbeat for all three sequential phases: the full legacy audit and
bootstrap enqueue, canonical generation/publication, and one bounded user-sync batch. The route sets
`maxDuration = 300`; monitor actual function duration and fall back to the CLI commands or a
dedicated worker if execution approaches that ceiling. Vercel applies Function duration limits to
cron invocations ([cron management](https://vercel.com/docs/cron-jobs/manage-cron-jobs)). The
checked-in `*/10 * * * *` schedule also requires Pro or Enterprise: Vercel's
[current cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing) restrict Hobby projects to
one invocation per day and reject more frequent schedules at deployment.

Bootstrap audits and fingerprints the legacy journey-version, plan, task, event, revision, and
proposal records before it can enqueue canonical v1. Duplicate active plans or stable keys,
missing/non-UUID/inactive owners, and invalid task statuses are persisted as owner-level quarantine
findings. Canonical v1 and valid active users may proceed, but quarantined owners are excluded from
the initial cohort and cannot initialize lazily or receive a notice. Resolve those exceptions through
the governed migration process; do not bypass the audit, guess between ambiguous rows, or coerce
orphan owner IDs. Once an account is active and its legacy rows are repaired, the next authenticated
roadmap read performs an owner-scoped re-audit, records an idempotent resolution event, and queues an
initial no-notice sync to the current canonical version.

Each later changed authoritative publication enqueues at most one refresh. The worker publishes one
immutable canonical version, reconciles the captured active-user cohort in bounded batches, and
creates a notice only in the same transaction as each successful non-initial user sync.
Derivation-equivalent content advances provenance without a rollout or notice.

During an incident, set `STATIC_ROADMAP_REFRESH_CLAIMS_ENABLED=false`; do not delete queued jobs,
versions, retired item rows, events, or notices. Continue serving each user's last applied good
version and personal task transitions. Recovery is a normal retry or a newly published retained good
version, never an in-place database edit or pointer rewrite.

## Deferred Production Choices

- The current in-process rate limiter is suitable for local and single-instance use; production should use Redis, an edge/provider limiter, or another shared backend.
- The Vercel cron adapter is appropriate only for sources that reliably finish inside the function
  duration. Longer OCR, transcription, or large-crawl jobs need a dedicated worker that consumes
  the existing durable ingestion queue. Request-time adapters remain a development compatibility
  path and should not be the production source of truth.
