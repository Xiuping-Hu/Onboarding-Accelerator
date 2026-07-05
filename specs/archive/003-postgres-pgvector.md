# Postgres And pgvector Spec

## Goal

Add an optional Postgres persistence path for onboarding sessions and pgvector-backed knowledge retrieval for production RAG.

## Completion Addon

Each action item includes a completion marker:

- `[ ]` Not complete
- `[x]` Complete

Keep this marker updated as implementation proceeds.

## Target Architecture

- Local development remains file-backed by default.
- Production can use Postgres for durable, multi-instance session storage.
- pgvector retrieval is opt-in and uses OpenAI embeddings for query vectors.
- Existing seed, shared-directory, website, and web-search retrieval continue to work.
- Tests do not require a live Postgres server.

## Implementation Actions

- [x] Add Postgres driver dependencies.
- [x] Add a shared database client/pool helper.
- [x] Add a Postgres implementation of `SessionRepository`.
- [x] Add configuration for `SESSION_STORE=postgres`, `DATABASE_URL`, Postgres SSL, and pool size.
- [x] Keep file sessions as the default local behavior.
- [x] Add an OpenAI embeddings provider for vector search queries.
- [x] Add a pgvector knowledge retriever.
- [x] Wire pgvector retrieval into `RagService` behind `RAG_VECTOR_ENABLED`.
- [x] Add schema migration SQL for sessions and `knowledge_chunks`.
- [x] Add environment examples and production documentation.
- [x] Add mocked unit tests for Postgres sessions and pgvector retrieval.
- [x] Verify lint and tests pass.

## Acceptance Criteria

- [x] `SESSION_STORE=postgres` uses Postgres-backed sessions.
- [x] `RAG_VECTOR_ENABLED=true` retrieves ranked rows from `knowledge_chunks` using pgvector cosine distance.
- [x] Existing file-backed sessions and non-vector RAG behavior remain available.
- [x] The app validates missing required database config at startup.
- [x] `npm run lint` and `npm test` pass.
