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

The repository and `apps/web` Vercel configurations invoke `GET /api/internal/rag/cron` every five
minutes, covering projects whose Vercel Root Directory is either the repository root or `apps/web`.
Vercel reads only the configuration at the selected project root. The protected route dispatches
due database schedules and processes at most one queued run per invocation. Add a random
`CRON_SECRET` to the Vercel Production environment; Vercel supplies it as a bearer token on cron
requests. Also configure the database, embedding, connector, and allowlist variables required by
the registered sources.

Before enabling the cron in production, apply the Prisma migrations and synchronize the approved
source registry against the production database:

```powershell
npm run db:migrate:deploy
npm run rag:schedules:sync -- --config config/rag-sources.json
```

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
The SharePoint Wayfinder source uses Microsoft Graph app credentials from
`RAG_SHAREPOINT_TENANT_ID`, `RAG_SHAREPOINT_CLIENT_ID`, and `RAG_SHAREPOINT_CLIENT_SECRET`; grant
the app least-privilege read access to the approved site. `accessScope` must be listed in
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

## Onboarding plans, tasks, and progress

Onboarding lifecycle state is separate from guide navigation state. AI generation or manual
creation makes a plan live immediately. Every edit creates an immutable journey-definition version,
reconciles learner task instances, records revision/task events, and recalculates progress
deterministically from progress-bearing task weights. Guide nodes are never interpreted as completed
tasks, and there is no draft or activation lifecycle.

Authenticated lifecycle endpoints are rooted at `/api/sessions/:sessionId/onboarding`:

- `GET` returns the current learner's active plan projection or an explicit `no-active-plan` state;
- `POST` creates an empty or populated live manual plan using a client request ID;
- `POST /generate` creates a validated, grounded live plan with AI;
- `POST /commands/impact` previews completed-work impact and `POST /commands` applies one typed,
  revision-bound live edit;
- `POST /ai-proposals` creates a persisted typed AI diff, while `/apply` and `/dismiss` resolve it;
- `GET /history` returns immutable plan-revision events;
- `POST /cancellation-impact` and `POST /cancel` perform an explicit, reasoned cancellation; and
- `PATCH /tasks/:taskId` performs a revisioned, idempotent task transition and returns the updated
  unified projection.

Overview, Roadmap, Upcoming Tasks, and Tasks consume that same projection. Learner progress follows
the active learner across chat sessions, and deleting the originating chat does not delete the plan.
File-backed development stores lifecycle data beside `SESSION_STORE_PATH` in
`onboarding-plans.json`; PostgreSQL deployments require migrations
`0009_onboarding_task_progress` through `0011_live_ai_onboarding_roadmap`.
Production Vercel builds apply pending committed Prisma migrations before compiling the application
and fail closed if the database cannot be migrated. When the migration history is absent, the build
first verifies the complete legacy schema from migrations `0001` through `0007` before recording
that baseline; it refuses partial or drifted schemas. Preview and local builds do not mutate the
production schema.

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
