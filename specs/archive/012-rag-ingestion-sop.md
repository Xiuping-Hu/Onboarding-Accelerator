# RAG Ingestion SOP Spec

## Status

Proposed.

## Goal

Build a production ingestion workflow that turns company documents, PDFs, videos, voice recordings,
and approved websites into retrieval-ready knowledge chunks for the onboarding assistant.

The workflow must support the company SharePoint Wayfinder page:

- `https://taxconsultingza.sharepoint.com/SitePages/Wayfinder.aspx`

Because the page is protected by Microsoft authentication, ingestion must use an authenticated
SharePoint crawl path rather than the current unauthenticated website fetch adapter.

## Current Repo Findings

- `RagService` currently combines built-in seed knowledge, optional pgvector retrieval, request-time
  shared-directory adapters, website adapter results, and policy-gated web-search placeholders.
- The pgvector path reads from `knowledge_chunks` and is enabled with `RAG_VECTOR_ENABLED=true`.
- The repo has no durable ingestion job for populating `knowledge_chunks`.
- Shared-directory retrieval supports `.txt`, `.md`, `.csv`, `.vtt`, and `.srt` files at request time.
- Website retrieval only fetches allowlisted public HTTP/HTTPS pages and does not authenticate.
- The current built-in seed knowledge is mock onboarding content and should not ship as production
  company knowledge.

## Problem

Company knowledge lives across heterogeneous sources and some of it is access-controlled. The app
needs a repeatable SOP and implementation path that:

- extracts source text,
- normalizes and chunks it,
- embeds it with the configured embedding model,
- stores it in `knowledge_chunks`,
- preserves source provenance,
- prevents unauthorized content exposure,
- and provides a SharePoint crawl path for Wayfinder and similar internal pages.

## Target Behavior

1. Operators can register approved RAG sources with owner, type, URI, access policy, and refresh
   cadence.
2. Ingestion jobs can process documents, PDFs, videos, voice recordings, and websites.
3. SharePoint pages are crawled through authenticated Microsoft Graph or SharePoint APIs.
4. Extracted content is normalized into clean text or Markdown before chunking.
5. Chunks include metadata such as source kind, source URI, title, section, page, timestamp, owner,
   version, permissions/audience, and updated time.
6. Chunks are embedded using `OPENAI_EMBEDDING_MODEL`.
7. Embeddings are upserted into `knowledge_chunks`.
8. Retrieval uses only approved, current, access-appropriate chunks.
9. Production RAG no longer depends on mock seed knowledge.
10. The ingestion workflow has quality checks against a curated evaluation question set.

## Source Handling Requirements

### Documents

- Support `.txt`, `.md`, `.docx`, and common office-exported text formats.
- Convert rich documents to clean Markdown or plain text.
- Preserve headings, source title, document version, and owner metadata.

### PDFs

- Extract text by page.
- Run OCR for scanned PDFs.
- Preserve page number and document title in metadata.
- Keep tables readable where possible by converting rows to labelled text.

### Videos

- Ingest transcript sidecars when available: `.vtt`, `.srt`, or `.txt`.
- Generate transcripts when no sidecar exists.
- Preserve timestamps in metadata so answers can point back to the original moment.

### Voice

- Transcribe audio before indexing.
- Preserve speaker labels when reliable.
- Add meeting/date/source metadata.
- Require review or redaction before indexing sensitive calls.

### Websites

- Crawl only approved URLs and domains.
- Strip navigation, footer, scripts, cookie banners, and other boilerplate.
- Preserve canonical URL, page title, headings, modified date, and crawl time.

### SharePoint Wayfinder

- Add an authenticated SharePoint crawler for
  `https://taxconsultingza.sharepoint.com/SitePages/Wayfinder.aspx`.
- Use Microsoft Graph or SharePoint APIs with an approved service account or app registration.
- Fetch page canvas/body content, title, modified time, author/owner, and linked files when approved.
- Respect SharePoint permissions; either index only content approved for all app users or store ACL
  metadata and filter during retrieval.
- Convert SharePoint page sections into Markdown before chunking.

## Data Model

Continue using `knowledge_chunks` as the retrieval table, with upserts shaped like:

```sql
insert into knowledge_chunks (
  id,
  title,
  excerpt,
  uri,
  source_type,
  metadata,
  embedding,
  updated_at
) values (
  $1,
  $2,
  $3,
  $4,
  'knowledge_base',
  $5::jsonb,
  $6::vector,
  now()
)
on conflict (id) do update set
  title = excluded.title,
  excerpt = excluded.excerpt,
  uri = excluded.uri,
  source_type = excluded.source_type,
  metadata = excluded.metadata,
  embedding = excluded.embedding,
  updated_at = excluded.updated_at;
```

Recommended metadata shape:

```json
{
  "sourceKind": "sharepoint_page",
  "sourceUri": "https://taxconsultingza.sharepoint.com/SitePages/Wayfinder.aspx",
  "sourceTitle": "Wayfinder",
  "section": "Example section",
  "chunkIndex": 0,
  "owner": "Knowledge Owner",
  "version": "2026-07",
  "updatedAt": "2026-07-12T00:00:00.000Z",
  "crawledAt": "2026-07-12T00:00:00.000Z",
  "accessScope": "approved_onboarding_users"
}
```

## Chunking Rules

- Prefer semantic chunks under the current retrieval adapter's 900-character target when practical.
- Keep one concept per chunk.
- Include enough local context for standalone answers.
- Avoid indexing global navigation, duplicate boilerplate, and unrelated appendix material.
- Use deterministic chunk IDs based on source URI, version or updated timestamp, and chunk index.

## Security And Governance

- Do not index confidential or audience-restricted sources without an access-control plan.
- Store source-level permissions or audience metadata when content is not globally visible.
- Filter retrieval by user access before sources are returned to the model.
- Keep source owner and refresh cadence available for audit.
- Log ingestion failures without storing secrets or full private content in logs.

## API And Script Requirements

- Add a source registry configuration or table for approved ingestion sources.
- Add an ingestion script or job entry point, for example `npm run rag:ingest`.
- Add extractor modules for documents, PDFs, transcripts/audio, websites, and SharePoint pages.
- Add a chunker module shared by all extractors.
- Add an embedding/upsert module for `knowledge_chunks`.
- Add dry-run output so operators can inspect chunks before writing to Postgres.
- Add a reindex mode for one source, one source type, or all registered sources.

## Implementation Checklist

- [ ] Define the source registry format for documents, PDFs, videos, voice, websites, and SharePoint.
- [ ] Add ingestion job entry point and npm script.
- [ ] Add shared normalization and chunking utilities.
- [ ] Add deterministic chunk ID generation.
- [ ] Add embedding generation using `OPENAI_EMBEDDING_MODEL`.
- [ ] Add `knowledge_chunks` upsert logic.
- [ ] Add document extraction for `.txt`, `.md`, and `.docx`.
- [ ] Add PDF extraction with OCR fallback for scanned PDFs.
- [ ] Add video transcript ingestion for `.vtt`, `.srt`, and generated transcripts.
- [ ] Add voice transcription ingestion with optional speaker labels.
- [ ] Add public website crawl for allowlisted pages.
- [ ] Add authenticated SharePoint crawl for the Wayfinder page.
- [ ] Add SharePoint crawl support for page metadata, page body, and approved linked files.
- [ ] Add ACL or audience metadata for SharePoint-derived chunks.
- [ ] Add retrieval-time filtering for ACL or audience metadata before enabling restricted content.
- [ ] Remove the current mock seed knowledge from production RAG.
- [ ] Decide whether seed knowledge remains test-only or is replaced by configured bootstrap data.
- [ ] Add ingestion dry-run reports with chunk counts, skipped files, and warnings.
- [ ] Add ingestion quality evaluation questions and expected source IDs.
- [ ] Add tests for chunking, metadata, upsert behavior, and SharePoint crawler parsing.
- [ ] Update `README.md` and `docs/production-readiness.md` with the SOP and runbook.

## Acceptance Criteria

- A registered SharePoint Wayfinder source can be crawled through authenticated access.
- Extracted Wayfinder content is chunked, embedded, and inserted into `knowledge_chunks`.
- Documents, PDFs, videos, voice transcripts, and websites can follow the same ingestion pipeline.
- Retrieval returns source provenance that points back to the original document, page, PDF page, or
  transcript timestamp.
- Mock seed knowledge is no longer returned in production RAG.
- Restricted SharePoint content is not returned to users who should not see it.
- Operators can run a dry run before writing chunks to the vector database.
- The SOP is documented with source preparation, ingestion, validation, and reindexing steps.
