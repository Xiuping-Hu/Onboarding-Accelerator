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
development opens the protected workspace as `local-dev-user`. Real sign-in uses the Tax Consulting
SA Microsoft Entra tenant through OIDC authorization code flow with PKCE. Set `DATABASE_URL`, run
`npm run db:migrate:deploy`, then set `AUTH_DISABLED=false` and the `AUTH_MICROSOFT_*` settings from
`.env.example`.

Register a Web redirect URI of
`http://localhost:3000/api/auth/microsoft/callback` for local testing and the equivalent HTTPS URI
for each deployed environment. The Entra application must be single-tenant and use tenant
`e0bc1e92-f544-4358-8d5f-5aabe36f1df6`. The app requests only `openid profile email`; it does not
store Microsoft access or refresh tokens.

With `AUTH_MICROSOFT_AUTO_PROVISION=true`, a tenant user is added to the local `users` table on first
sign-in with role `user`. To pre-provision a user with elevated workflow approval privileges, run:

```powershell
npm run users:create -- --email admin@example.com --name "Admin" --role admin
```

The script creates the local user without a password. On first Microsoft sign-in, the verified
immutable tenant/object identity (`tid` + `oid`) binds to that row by normalized email while the
existing local role is preserved. Browser sessions continue to use a random hashed token in
`auth_sessions`, linked to `users.id`. Set `AUTH_MICROSOFT_AUTO_PROVISION=false` if every user must be
pre-provisioned.

By default sessions persist to `SESSION_STORE_PATH`. Set `SESSION_STORE=postgres` with
`DATABASE_URL` to use Postgres-backed sessions. To enable pgvector retrieval, deploy the Prisma
migrations, populate `knowledge_chunks` with 1536-dimension embeddings, and set
`RAG_VECTOR_ENABLED=true`.

To enable governed RAG knowledge maps, deploy the Prisma migrations, set `SESSION_STORE=postgres`,
and set `RAG_KNOWLEDGE_MAP_ENABLED=true`. Every eligible session reads the current authorized
published roadmap directly from Postgres. The application does not expose a knowledge-map authoring
API, and the feature remains disabled by default so existing file-backed guide maps continue to work
unchanged.

`prisma/migrations` is the sole schema history. See
[Prisma migration adoption](docs/prisma-migration-adoption.md) before deploying to a database
created with the former migration workflow.

## RAG ingestion

Copy `config/rag-sources.example.json` to `config/rag-sources.json`, register only approved
sources, then inspect the extraction result before writing embeddings:

```powershell
npm run rag:ingest -- --dry-run --config config/rag-sources.json
npm run rag:ingest -- --config config/rag-sources.json
npm run rag:ingest -- --source wayfinder --config config/rag-sources.json
```

The durable scheduled-ingestion path uses the same source registry and ingestion service. Configure
an exact cron expression and IANA timezone under a source's `schedule`, then synchronize the source
and schedule records:

```powershell
npm run rag:schedules:sync -- --config config/rag-sources.json
npm run rag:dispatch
npm run rag:worker -- --limit 1
```

`rag:dispatch` is safe for at-least-once delivery and should be invoked by the hosting platform or
external scheduler at a short fixed interval. It only creates idempotent durable runs. `rag:worker`
claims queued runs with a per-source lease and performs acquisition, sanitization, canonical change
detection, bounded structure-aware chunking, incremental embedding, validation, and versioned
publication. Failed or quarantined candidates never replace the current source version.

### Vercel scheduled ingestion

The repository and `apps/web` Vercel configurations invoke `GET /api/internal/rag/cron` daily at
09:00 UTC, covering Hobby projects whose Vercel Root Directory is either the repository root or
`apps/web`.
Vercel reads only the configuration at the selected project root. The protected route dispatches
due database schedules and processes at most one queued run per invocation. Add a random
`CRON_SECRET` to the Vercel Production environment; Vercel supplies it as a bearer token on cron
requests. Also configure the database, embedding, connector, and allowlist variables required by
the registered sources.

The Vercel production prebuild applies Prisma migrations and synchronizes the committed approved
source registry against the production database before publishing the deployment. Operators can
run the same idempotent preparation manually outside Vercel:

```powershell
npm run db:migrate:deploy
npm run rag:schedules:sync -- --config config/rag-sources.json
```

The first synchronization of an enabled scheduled source queues one idempotent initial ingestion
run immediately. Later synchronizations preserve the pending recurring occurrence unless its cron
expression or timezone changes.

The source registry is configuration input and is not read by each cron request. Synchronize it
again whenever a source or its schedule changes. Vercel Hobby projects support only daily cron
jobs; change the provider heartbeat to a daily expression or use a paid plan. Sources that can run
longer than the route's five-minute duration require a dedicated durable worker rather than inline
Vercel execution.

The example Wayfinder cron is illustrative. Operators must select the production day, time, and
timezone deliberately rather than relying on the descriptive `refreshCadence` value.

Candidates held by a manual-review policy or anomaly gate can be approved or rejected explicitly,
and retained published versions can be selected for rollback:

```powershell
npm run rag:review -- --run <run-id> --actor <operator> --approve
npm run rag:review -- --run <run-id> --actor <operator> --reject
npm run rag:rollback -- --source <source-id> --version <version-id> --actor <operator>
```

The registry supports text/Markdown and `.docx` documents, PDFs, reviewed `.vtt`, `.srt`, or `.txt`
transcripts, reviewed audio transcription, public websites, and authenticated SharePoint pages.
PDF extraction requires Poppler's `pdftotext`; scanned PDFs additionally require `ocrmypdf`. Audio
uses the configured OpenAI key and is blocked unless the source has `"reviewed": true`.
The SharePoint connector uses Microsoft Graph app credentials from `RAG_SHAREPOINT_TENANT_ID`,
`RAG_SHAREPOINT_CLIENT_ID`, and `RAG_SHAREPOINT_CLIENT_SECRET`. When those variables are unset, it
falls back to the corresponding `AUTH_MICROSOFT_*` SSO application credentials. Grant that app
least-privilege read access to the approved site. `accessScope` must be listed in
`RAG_ALLOWED_ACCESS_SCOPES` or ingestion and retrieval will exclude it.

Website ingestion uses registered origins and paths, validates every redirect, blocks non-public
network destinations unless a source explicitly opts into a governed private-network connection,
and applies response byte and timeout limits. Retrieval exposes only enabled sources and chunks
belonging to each source's current published version. Previous versions remain available for
controlled rollback and retention.

Mock seed knowledge is disabled by default in production. Set `RAG_SEED_KNOWLEDGE_ENABLED=true`
only for a deliberate non-production bootstrap scenario.
The older request-time directory adapters are likewise disabled in production by default; set
`RAG_INPUT_ADAPTERS_ENABLED=true` only when their inputs are governed to the same standard.

### AI providers

Answer generation is selected with `AI_PROVIDER=openai|deepseek`. DeepSeek uses its OpenAI-format
Chat Completions API and requires `DEEPSEEK_API_KEY`; switch back by setting `AI_PROVIDER=openai`.
Embeddings are selected independently with `EMBEDDING_PROVIDER=openai|local`. The `local` adapter
keeps the existing 1,536-dimension pgvector schema and is intended only for inexpensive keyword-like
development testing; use `openai` and reindex sources for production semantic retrieval.

Each embedding provider/model writes to a separate `embedding_profile`, so profiles can coexist
without mixing vector spaces. Reindex captured database snapshots into the active profile with:

```powershell
npm run rag:reindex-snapshots -- --dry-run --source wayfinder
npm run rag:reindex-snapshots -- --source wayfinder
```

Guide maps are created from the workspace agent flow. A new session starts with an empty canvas; ask
the agent for domain knowledge, then use Create map when the response includes a draft map proposal.
The created map is saved with the session guide state.

## Ingestion-driven onboarding roadmap

The roadmap is one system-owned, versioned artifact derived from the latest successfully published
version of one approved `all_users` knowledge source. Set exactly one source's
`roadmapAuthoritative` registry field to `true`, and make its ID match
`STATIC_ROADMAP_AUTHORITATIVE_SOURCE_ID`. Changed publication enqueues generation; unchanged or
derivation-equivalent content does not roll out another learner version.

Canonical roadmap content and learner state are deliberately separate. A rollout preserves matching
task status/history, retains prior canonical versions and retired item rows for audit, initializes
new items, and advances each user's independent `stateRevision`. Chat sessions continue to own chat
and guide state only; selecting or deleting a chat cannot change roadmap content, progress, or
notices.

The authenticated browser contract is user-scoped and sessionless:

- `GET /api/onboarding` returns either the ingestion-driven preparing state or the applied canonical
  version plus the current user's progress, tasks, and newest unread roadmap notice;
- `PATCH /api/onboarding/tasks/:taskId` accepts only
  `{ status, expectedTaskRevision, expectedStateRevision, clientRequestId }`; and
- `PATCH /api/onboarding/notices/:noticeId` accepts `{ read: true }` and returns `204`.

The workspace renders canonical title/version, stages, sources, and personal progress as read-only.
Only personal task status is editable. After a changed-version rollout, each successfully reconciled
existing user receives one durable in-app notice; the initial v1/backfill does not create notices.

Static roadmap processing is disabled by default. `STATIC_ROADMAP_ENABLED=true` requires
`DATABASE_URL`. `STATIC_ROADMAP_REFRESH_CLAIMS_ENABLED=false` is the kill switch: it pauses new
refresh claims/publication while ingestion, existing roadmap reads, notices, and personal task
transitions remain available. The remaining `STATIC_ROADMAP_*` values in `.env.example` bound
retrieval, retries, leases, user-sync batches, and version the generation inputs.

After the migration, source registry, and environment are ready, enqueue or replay the current
authorized source with a durable operator-controlled request ID, then run bounded worker cycles:

```powershell
npm run roadmap:bootstrap -- --request-id <durable-id>
npm run roadmap:worker -- --limit <1-100>
```

Each worker cycle processes at most one newest eligible refresh and one configured user-sync batch.
Both commands require `STATIC_ROADMAP_ENABLED=true`; the bootstrap request ID is the idempotency key.
Bootstrap first runs the mandatory legacy-integrity preflight and persists its record counts and
fingerprint. Duplicate active plans or stable keys, missing/non-UUID/inactive owners, and invalid
task statuses quarantine only their affected owners. Canonical v1 and valid active-user backfill may
proceed; quarantined owners receive no sync or notice until their integrity exceptions are resolved.
After activation or repair, the next workspace read re-audits that owner, records an idempotent
resolution decision, and queues an initial no-notice sync when the legacy state is unambiguous.

For a temporary serverless bootstrap, set `STATIC_ROADMAP_BOOTSTRAP_REQUEST_ID` to one stable,
operator-controlled value (1-128 letters, numbers, `.`, `_`, `:`, or `-`). The existing
`CRON_SECRET`-protected static-roadmap heartbeat attempts that bootstrap before each worker cycle; it
returns `waiting_for_source` and keeps processing existing work until the authoritative source has a
published version. Repeated heartbeats reuse the same durable idempotency key, and the raw key is not
returned or logged. Keep the variable set until canonical v1 is the current version and its initial
rollout is complete—`enqueued` or `duplicate` alone is not a completion signal—then remove it. A
`duplicate` result includes the durable job's current status. A stable ID cannot retry a terminally
`failed` or `cancelled` refresh; diagnose the outcome and rotate to a new reviewed ID before retrying.
The protected heartbeat is the only HTTP path for this temporary mechanism; no public bootstrap
endpoint is added.

The first configured heartbeat can perform the full legacy audit, generate canonical v1, and apply
one user-sync batch in the route's 300-second budget. Monitor its duration and use the CLI or a
dedicated worker if it approaches that limit. The checked-in ten-minute Vercel schedule requires a
plan with per-minute cron support; Vercel's
[current cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing) limit Hobby schedules to
once per day, so that schedule requires Pro or Enterprise.

For an existing database, deploy additive migration `0012_ingestion_driven_static_roadmap` after
`0011_live_ai_onboarding_roadmap` before enabling this feature. Roll out in this order:

1. Deploy the migration and application with static roadmap processing disabled.
2. Synchronize and verify the single enabled, `all_users`, authoritative source and its published
   current version.
3. Enable the feature with refresh claims paused, then run the idempotent bootstrap. Review its
   persisted legacy-integrity audit and owner-quarantine report before processing canonical v1 and
   the valid-user backfill.
4. Enable claims, run the bounded worker until refresh and user-sync queues drain, and verify applied
   versions, preserved completion, and the absence of synthetic v1 notices.
5. Keep the kill switch available; rollback by pausing claims and serving the last applied good
   version rather than deleting versions or user history.

Production Vercel builds apply pending committed Prisma migrations before compiling the application
and fail closed if the database cannot be migrated. When migration history is absent, the build
verifies the legacy schema before recording its baseline; it refuses partial or drifted schemas.

## Mastra RAG workflows

The snapshot-based three-part RAG workflow from spec 017 is feature-gated. It refines the input,
builds and checkpoints an evidence-backed plan, and executes the plan through a server-owned tool
registry. The initial registry enables read-only grounded answers and knowledge-map searches.
Administrative script adapters remain disabled.

Provision both the Prisma application tables and Mastra's isolated PostgreSQL schema before
enabling the runtime:

```powershell
npm run db:migrate:deploy
npm run mastra:storage:init
```

Then set:

```text
MASTRA_RAG_WORKFLOW_ENABLED=true
MASTRA_STORAGE_SCHEMA=mastra_workflow
MASTRA_STORAGE_DISABLE_INIT=true
```

`MASTRA_STORAGE_DISABLE_INIT=true` prevents runtime schema mutation after the explicit provisioning
step. Development can set it to `false`. Workflow execution snapshots live in the Mastra schema;
they are separate from the application `rag_source_snapshots` content table.

Authenticated workflow endpoints are rooted at
`/api/sessions/:sessionId/rag-workflows`. They support starting a run, reading its safe projection
and audit events, resuming refinement or plan checkpoints, and correcting a failed phase. The
existing chat endpoint is unchanged while the feature is disabled.

The pre-commit hook updates harness docs, stages the generated docs, then runs lint and Prettier checks.
