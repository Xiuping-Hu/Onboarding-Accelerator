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
`db/migrations/003_postgres_account_auth.sql`, followed by the RAG snapshot/profile migrations
`db/migrations/004_rag_source_snapshots.sql` and
`db/migrations/005_knowledge_embedding_profiles.sql`; set `AUTH_DISABLED=false` and
`DATABASE_URL`; then create an account:

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

To enable governed RAG knowledge maps, apply `db/migrations/006_rag_grounded_knowledge_maps.sql`,
set `SESSION_STORE=postgres`, and set `RAG_KNOWLEDGE_MAP_ENABLED=true`. Administrators can create a
validated draft through `POST /api/admin/knowledge-maps` and publish it through the version publish
endpoint. The proposal flow groups reviewed RAG sources into onboarding domains, stores the reviewed
roadmap in Postgres, and every eligible session reads the current published roadmap directly. The
feature remains disabled by default so existing file-backed guide maps continue
to work unchanged.

## RAG ingestion

Copy `config/rag-sources.example.json` to `config/rag-sources.json`, register only approved
sources, then inspect the extraction result before writing embeddings:

```powershell
npm run rag:ingest -- --dry-run --config config/rag-sources.json
npm run rag:ingest -- --config config/rag-sources.json
npm run rag:ingest -- --source wayfinder --config config/rag-sources.json
```

The registry supports text/Markdown and `.docx` documents, PDFs, reviewed `.vtt`, `.srt`, or `.txt`
transcripts, reviewed audio transcription, public websites, and authenticated SharePoint pages.
PDF extraction requires Poppler's `pdftotext`; scanned PDFs additionally require `ocrmypdf`. Audio
uses the configured OpenAI key and is blocked unless the source has `"reviewed": true`.
The SharePoint Wayfinder source uses Microsoft Graph app credentials from
`RAG_SHAREPOINT_TENANT_ID`, `RAG_SHAREPOINT_CLIENT_ID`, and `RAG_SHAREPOINT_CLIENT_SECRET`; grant
the app least-privilege read access to the approved site. `accessScope` must be listed in
`RAG_ALLOWED_ACCESS_SCOPES` or ingestion and retrieval will exclude it.

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

Admin operations are available at `/admin`. The admin console uses the same browser account session
as the workspace and requires the authenticated user role to be `admin`; all `/api/admin/*` routes
enforce that role server-side. In local `AUTH_DISABLED=true` development, the admin login form can
set the role header for smoke testing. Admin audit events, AI rate cards, and AI fee adjustments
persist to `ADMIN_AUDIT_STORE_PATH`, `AI_RATE_CARDS_STORE_PATH`, and
`AI_FEE_ADJUSTMENTS_STORE_PATH`.

The pre-commit hook updates harness docs, stages the generated docs, then runs lint and Prettier checks.
