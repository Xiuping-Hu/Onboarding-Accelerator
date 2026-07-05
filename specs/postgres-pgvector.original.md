# Postgres and pgvector Spec

## Assumption

The Next.js migration is complete. The application lives in `apps/web`, with backend behavior implemented through Next.js server modules and route handlers.

## Goal

Add PostgreSQL as the primary application database and pgvector as the semantic retrieval store for onboarding knowledge.

This replaces file-backed sessions and logs, and introduces persistent vector-backed RAG retrieval.

## Completion Addon

Each action item includes a completion marker:

- `[ ]` Not complete
- `[x]` Complete

Keep this marker updated as implementation proceeds.

## Scope

- Store application data in PostgreSQL.
- Enable the `vector` extension through pgvector.
- Persist onboarding sessions, chat messages, guide state, logs, knowledge sources, source chunks, and embeddings.
- Keep domain services behind repository/service interfaces so route handlers do not depend directly on SQL.
- Support local development with a reproducible Postgres setup.
- Support production through a managed Postgres-compatible service that supports pgvector.

## Non-Goals

- Public account registration.
- Admin UI for database management.
- Replacing OpenAI chat behavior.
- Building a separate vector database service.
- Requiring pgvector migration before the current Next.js app can run in local fallback mode, unless the team explicitly removes file fallback.

## Recommended Stack Decision

- Use PostgreSQL as the system of record.
- Use pgvector inside PostgreSQL rather than a separate vector DB.
- Use a migration tool with committed SQL migrations.
- Use a typed database access layer from server-only modules.
- Keep embeddings dimension configurable and tied to the selected embedding model.

## Proposed Data Model

### Application Tables

- `users`
  - Owned by the account/login spec.
  - Other tables should reference this table by `id`.

- `onboarding_sessions`
  - `id`
  - `owner_user_id`
  - `title`
  - `settings_json`
  - `selected_node_id`
  - `expanded_node_ids_json`
  - `created_at`
  - `updated_at`

- `chat_messages`
  - `id`
  - `session_id`
  - `role`
  - `content`
  - `sources_json`
  - `guide_node_ids_json`
  - `focus_step_ids_json`
  - `usage_json`
  - `created_at`

- `guide_nodes`
  - `id`
  - `session_id`
  - `parent_id`
  - `title`
  - `summary`
  - `detail`
  - `depth`
  - `status`
  - `sources_json`
  - `can_expand`
  - `max_depth`
  - `created_at`
  - `updated_at`

- `request_logs`
  - `id`
  - `request_id`
  - `level`
  - `type`
  - `method`
  - `path`
  - `status_code`
  - `duration_ms`
  - `user_id`
  - `session_id`
  - `message`
  - `operation`
  - `usage_json`
  - `created_at`

### RAG Tables

- `knowledge_sources`
  - `id`
  - `source_type`
  - `source_kind`
  - `title`
  - `uri`
  - `metadata_json`
  - `content_hash`
  - `created_at`
  - `updated_at`

- `knowledge_chunks`
  - `id`
  - `source_id`
  - `chunk_index`
  - `text`
  - `excerpt`
  - `metadata_json`
  - `token_count`
  - `content_hash`
  - `created_at`
  - `updated_at`

- `knowledge_embeddings`
  - `chunk_id`
  - `embedding_model`
  - `embedding`
  - `created_at`

The `embedding` column should use pgvector, for example `vector(n)`, where `n` matches the configured embedding model.

## Indexing Requirements

- Add foreign-key indexes for all session, user, source, and chunk references.
- Add `updated_at` indexes for session listing and log browsing.
- Add pgvector ANN indexes after the embedding dimension and distance metric are finalized.
- Add uniqueness constraints for source URI/content hashes and chunk content hashes where useful.

## Retrieval Behavior

- Preserve existing lexical retrieval as a fallback.
- Add embedding generation for source chunks during ingestion.
- Add semantic search using pgvector nearest-neighbor queries.
- Merge semantic, lexical, and optional website/search results through the existing source-merging layer.
- Record enough metadata to show source title, excerpt, URI, source type, score, and confidence.
- Do not embed private or unapproved content unless it is explicitly part of the configured knowledge ingestion path.

## Migration Actions

- [ ] Choose and document the database access layer and migration tool.
- [ ] Add database dependencies to the Next.js app workspace.
- [ ] Add `DATABASE_URL` and database pool configuration to server config.
- [ ] Add local Postgres setup documentation.
- [ ] Add a local setup path for enabling the `vector` extension.
- [ ] Add initial SQL migration for base database extensions.
- [ ] Add migration for application session, chat, guide, and log tables.
- [ ] Add migration for RAG source, chunk, and embedding tables.
- [ ] Add server-only database connection module.
- [ ] Add database health check utility.
- [ ] Replace file session repository with a Postgres-backed repository.
- [ ] Keep the existing session repository interface stable where practical.
- [ ] Replace JSONL log service with a Postgres-backed log service.
- [ ] Preserve log summary and recent-log response contracts.
- [ ] Add database-backed knowledge source repository.
- [ ] Add database-backed knowledge chunk repository.
- [ ] Add embedding repository using pgvector.
- [ ] Add ingestion workflow for shared directory documents.
- [ ] Add ingestion workflow for shared directory sheets.
- [ ] Add ingestion workflow for video transcript sidecars.
- [ ] Add ingestion workflow for allowlisted websites.
- [ ] Add content hashing to avoid duplicate source and chunk ingestion.
- [ ] Add embedding generation service.
- [ ] Add retry and partial-failure handling for embedding generation.
- [ ] Add semantic retrieval through pgvector nearest-neighbor search.
- [ ] Merge semantic results with existing lexical retrieval results.
- [ ] Add source provenance mapping from database rows to shared response contracts.
- [ ] Add migration path from existing session JSON files, if existing local data must be preserved.
- [ ] Add migration path from existing JSONL log files, if existing local logs must be preserved.
- [ ] Update all route handlers to use the database-backed services.
- [ ] Update test fixtures to use isolated test database setup or repository fakes.
- [ ] Add repository unit tests for sessions.
- [ ] Add repository unit tests for logs.
- [ ] Add RAG ingestion tests.
- [ ] Add semantic retrieval tests.
- [ ] Add pgvector migration smoke test.
- [ ] Update environment examples and production docs.
- [ ] Verify `npm run build` passes.
- [ ] Verify `npm run lint` passes.
- [ ] Verify `npm test` passes.
- [ ] Manually smoke-test session creation, chat, guide expansion, logs, and retrieval with Postgres enabled.

## Operational Actions

- [ ] Choose managed Postgres provider for production.
- [ ] Confirm provider supports pgvector.
- [ ] Define backup and restore process.
- [ ] Define migration deployment process.
- [ ] Define connection pool limits for the chosen Next.js hosting environment.
- [ ] Define retention policy for request logs and AI usage logs.
- [ ] Define reindexing process for knowledge embeddings.
- [ ] Define how failed embeddings are retried or inspected.

## Acceptance Criteria

- [ ] The app can run with PostgreSQL as the primary persistence layer.
- [ ] Sessions survive server restarts without local JSON files.
- [ ] Logs and AI usage summaries are read from PostgreSQL.
- [ ] Knowledge sources and chunks are stored in PostgreSQL.
- [ ] pgvector semantic retrieval returns relevant source chunks.
- [ ] Existing chat, guide, and source response contracts still work.
- [ ] The implementation has tests for database repositories and RAG retrieval.
- [ ] Build, lint, and tests pass.
