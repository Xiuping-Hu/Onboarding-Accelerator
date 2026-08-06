# Scheduled And Extensible RAG Ingestion Spec

## Status

Implemented through the deterministic scheduled-ingestion milestone and manual-source foundation.
Optional semantic-memory enrichment remains deferred until a concrete use case justifies it.

## Relationship To Existing Specs

This spec refines and extends the production ingestion direction in spec 012. It preserves the
versioned source-of-truth and evidence requirements in spec 014 while keeping ingestion independent
from the interactive Mastra workflow in spec 017.

The central decision is that ingestion is a deterministic data pipeline, not an agent workflow.
An LLM may later create optional semantic memory from already sanitized, versioned content, but an
LLM is not responsible for acquisition, security sanitization, chunking, publication, access
control, scheduling, or recovery.

## Goal

Build a reliable ingestion system that can refresh an approved website or SharePoint source on a
schedule and can grow to support manual uploads, APIs, shared drives, databases, media, and
event-driven sources without duplicating the core ingestion flow.

The first implementation milestone must provide:

- one scheduled website or SharePoint source,
- manual refresh of the same source,
- durable run and schedule state,
- deterministic sanitization and chunking,
- content-change detection,
- candidate validation and atomic publication,
- current-version-only retrieval,
- rollback to a previous source version,
- and no dependency on a generative LLM.

## Design Decisions

### Ingestion Does Not Need An Agent

The core workflow is known in advance:

```text
trigger
  -> acquire
  -> sanitize
  -> normalize
  -> detect change
  -> chunk
  -> embed
  -> validate
  -> publish
```

The workflow does not require dynamic planning, autonomous tool selection, or multi-agent
coordination. Typed application services and explicit policies are more reliable, observable, and
cost-effective.

An embedding model is still required for vector retrieval. Embedding generation is a bounded data
transformation and is not treated as generative agent reasoning.

### Manual And Automated Are Trigger Modes

Manual and automated must not be modeled as source formats. A source is described across three
independent dimensions:

| Dimension      | Examples                                                                  |
| -------------- | ------------------------------------------------------------------------- |
| Connector      | `http_website`, `sharepoint`, `manual_artifact`, future `api`, `database` |
| Content format | `html`, `text`, `docx`, `pdf`, `audio`, `json`, `csv`                     |
| Trigger        | `manual`, `scheduled`, future `event`, `reindex`                          |

A SharePoint source can therefore run weekly and also allow an administrator to request an
immediate refresh. A manual artifact source can later acquire a new uploaded version without
requiring a separate chunking or publication implementation.

### Acquisition And Extraction Are Separate

A connector owns where and how data is acquired. An extractor owns how a media type becomes
normalized documents. Neither owns chunking, embeddings, or publication.

Examples:

- an HTTP connector acquires HTML and routes it to the HTML extractor,
- a SharePoint connector acquires page canvas content or linked files and routes each artifact by
  media type,
- and a manual artifact connector reads an immutable upload and routes a PDF to the PDF extractor.

### Publication Is Versioned And Atomic

New content is written as an invisible candidate version. Retrieval continues using the current
version until acquisition, extraction, chunking, embedding, and validation all succeed. Publishing
is a short atomic change of the source's current-version pointer.

The previous version remains available for rollback and retention. A failed, empty, incomplete, or
suspicious refresh never replaces known-good retrieval data.

## Current Repository Findings

- `apps/web/src/server/ragIngestion/types.ts` uses one `kind` union that combines acquisition
  channel and content format.
- `apps/web/src/server/ragIngestion/sourceRegistry.ts` loads a static JSON registry. Its
  `refreshCadence` value is descriptive and does not create scheduled work.
- `apps/web/src/server/ragIngestion/ingestionService.ts` directly coordinates extraction,
  chunking, embedding, version registration, and writes.
- `apps/web/src/server/ragIngestion/extractors.ts` contains a growing source-kind switch and owns
  both remote acquisition and content extraction.
- `scripts/rag-ingest.ts` is the current durable entry point, but it has no run ledger,
  idempotency, source lease, retry schedule, or recovery checkpoint.
- `scripts/rag-ingest.ts` starts all selected sources with `Promise.all`, so source concurrency is
  not bounded by an operational budget.
- `apps/web/src/server/ragIngestion/chunker.ts` groups blank-line-separated sections toward a
  900-character target. It does not split a single oversized paragraph, count model tokens,
  preserve explicit heading paths, or provide format-specific rules.
- Chunk identity currently depends on URI, upstream timestamp, and chunk index. A timestamp-only
  change or an inserted paragraph can cause unnecessary chunk and embedding churn.
- `apps/web/src/server/ragIngestion/knowledgeChunkWriter.ts` deletes chunks that are absent from the
  latest write, which removes the simplest rollback path and can make a partial crawl destructive.
- Source versioning is coupled to the knowledge-map feature flag instead of being a baseline
  ingestion guarantee.
- Pgvector retrieval filters embedding profile and access scope but does not require the chunk's
  source version to equal `KnowledgeSource.currentVersionId`.
- `RagSourceSnapshot` stores one mutable record per source and is not sufficient as a durable,
  version-scoped reindex and rollback artifact.
- `ragIngestion` and request-time `ragAdapters` overlap. Scheduled production ingestion should use
  the durable pipeline; request-time adapters should not become a second scheduled system.

## Capability Assessment

| Function      | Weight | Requirement-specific reason                                           | Required mechanism                                  |
| ------------- | ------ | --------------------------------------------------------------------- | --------------------------------------------------- |
| Perception    | Heavy  | Sources vary by access channel, media type, and crawl shape           | Connector and extractor registries                  |
| Memory        | Heavy  | Schedules, retries, leases, versions, and recovery cross process runs | Durable source, schedule, run, artifact, and events |
| Reasoning     | Light  | Routes follow explicit source configuration and media types           | Deterministic routing and policy rules              |
| Action        | Heavy  | The system fetches external data and changes retrieval content        | Bounded worker and staged atomic publication        |
| Reflection    | Heavy  | Empty, partial, duplicate, or anomalous data must be rejected         | Manifest comparison and candidate validation        |
| Collaboration | Light  | Stewards register sources and review exceptional changes              | Narrow administration and approval paths            |
| Governance    | Heavy  | Private content, credentials, and retrieval writes have material risk | Least privilege, budgets, audit, and access checks  |

## Topology Decision

The primary topology is a chain because all accepted data follows the same ordered transformations.
The secondary topology is a bounded route inside acquisition and extraction because connectors and
media formats require different handlers.

```text
trigger
  -> source and policy lookup
  -> connector route
  -> extractor route
  -> common deterministic chain
  -> candidate publication
```

Rejected alternatives:

- Do not use a multi-agent system; there is no beneficial delegation boundary in the core flow.
- Do not use Mastra to schedule ingestion; the workflow does not change its plan at runtime.
- Do not initially parallelize pages within one source; atomic completeness is more important than
  crawl speed.
- Treat retries as bounded error recovery, not as an open-ended reasoning or quality loop.

## Target Components

### Source Registry Repository

The source registry becomes a durable repository backed by Postgres. JSON remains useful as a
bootstrap/import format but is not the runtime system of record for scheduling.

The source definition owns:

- stable source ID,
- title, canonical URI, owner, and access scope,
- connector kind and connector configuration,
- expected or allowed content formats,
- allowed triggers,
- publication policy,
- enabled or disabled state,
- credential reference,
- acquisition, runtime, and embedding budgets,
- and source-specific validation thresholds.

The record stores a reference to an external secret, never the secret value.

### Schedule Dispatcher

The dispatcher performs only durable scheduling work:

1. Run at a small fixed platform interval, recommended every five minutes.
2. Claim due schedules using database row locking such as `FOR UPDATE SKIP LOCKED`.
3. Create an idempotent queued ingestion run for each due occurrence.
4. Advance `nextRunAt` according to the cron expression and named timezone.
5. Record a dispatch event.
6. Return without performing long acquisition, OCR, transcription, or embedding work.

The default misfire policy is `run_once`: after downtime, create one catch-up run instead of
replaying every missed occurrence.

### Ingestion Worker

The worker claims a queued run, acquires a source-specific lease, renews its heartbeat during work,
and owns the run through a terminal state.

Only one run may actively mutate a source at a time. Equivalent duplicate schedule deliveries
resolve to the same run. A manual run that collides with an active scheduled run is queued or
coalesced according to its idempotency key; it does not execute concurrently.

The worker has bounded concurrency across independent sources. The first release can use a
concurrency of one and increase it only after metrics show that sequential processing cannot meet
the scheduling window.

### Connector Registry

Connectors implement an explicit contract similar to:

```ts
interface SourceConnector {
  kind: string;
  validate(source: SourceDefinition): Promise<void>;
  probe(context: AcquisitionContext): Promise<ChangeProbe>;
  acquire(context: AcquisitionContext): AsyncIterable<AcquiredArtifact>;
}
```

`validate` checks static configuration and policy. `probe` provides an inexpensive change signal
when the source supports one. `acquire` returns bounded artifacts and provenance. Connectors do not
chunk, embed, or publish.

The initial connectors are:

- `http_website`,
- `sharepoint`,
- and `manual_artifact` when governed upload storage is introduced.

### Extractor Registry

Extractors implement an explicit media-type contract similar to:

```ts
interface ContentExtractor {
  supports(mediaType: string): boolean;
  extract(artifact: AcquiredArtifact): AsyncIterable<NormalizedDocument>;
}
```

The extractor registry replaces the central source-kind switch. Existing HTML, text, DOCX, PDF,
transcript, and audio logic moves behind this boundary over time.

### Sanitizer And Normalizer

Security sanitization and content normalization remain deterministic application code.

Security sanitization includes:

- supported-type validation,
- malware scanning for uploaded artifacts,
- active-content and script removal,
- URL and redirect policy enforcement,
- source-specific PII or confidentiality policy,
- and rejection of executable or unsupported content.

Content normalization includes:

- encoding and line-ending normalization,
- navigation, cookie banner, footer, and repeated-boilerplate removal,
- heading, paragraph, list, and table preservation,
- transcript speaker and time-range preservation,
- and stable canonical-document metadata.

The pipeline treats all acquired content as untrusted data. It never executes instructions, scripts,
or tool requests found inside source content.

### Change Detector

Each normalized document receives:

- a stable document key,
- canonical URI,
- canonical normalized text,
- content hash,
- upstream metadata,
- and retrieval-relevant metadata.

The document content hash is computed from canonical normalized content plus stable metadata that
affects retrieval. Crawl timestamps and unreliable upstream modification timestamps are excluded
from the content hash.

The source manifest hash is computed from sorted `(documentKey, contentHash)` pairs. A matching
manifest completes the run as `unchanged` without chunking, embedding, or publishing.

HTTP ETags and modification times are useful probe signals but are not the final source of truth. A
connector may report no change from a valid conditional request; otherwise canonical hashing makes
the final decision.

### Candidate Validator

The validator decides whether a candidate may become current. It verifies:

- crawl completeness,
- non-empty canonical content,
- expected document and section presence where configured,
- document, character, and chunk-count changes against source thresholds,
- chunk size and metadata invariants,
- embedding count and dimension,
- duplicate-content bounds,
- access-scope presence,
- and representative retrieval probes.

The default anomaly policy quarantines an empty result or an unexpected reduction of more than 50%
in document count or canonical character count. Each source can define tighter thresholds.

### Version Publisher

The publisher writes candidate documents and chunks under an unpublished source version. Retrieval
must exclude that version. After verification, a short transaction:

1. marks the prior version as superseded,
2. marks the candidate as published,
3. changes `KnowledgeSource.currentVersionId`,
4. completes the ingestion run,
5. and records an immutable publication event.

Old version chunks are not deleted during publication. A separate retention process removes
unreferenced superseded or rejected versions after the retention period.

## Data Lifecycle

```text
external source
  -> bounded temporary acquisition
  -> sanitized canonical documents
  -> immutable candidate version
  -> version-scoped chunks and embeddings
  -> validated current version
  -> access-controlled retrieval
```

### Raw Artifacts

- Public website responses may be discarded after canonical extraction when audit policy permits.
- Manually uploaded files are immutable artifacts in governed encrypted storage.
- Authenticated or restricted source artifacts follow the source's access and retention policy.
- Raw bytes are never written to logs.

### Canonical Documents

Canonical documents are retained in encrypted storage or a protected database representation so
they can be re-chunked and re-embedded without reacquiring the source. Each document is scoped to a
source version and includes provenance and an artifact reference.

### Retrieval Chunks

Chunks contain sanitized text, their embedding, and stable provenance. Retrieval must require:

- the active embedding profile,
- an enabled source,
- the source's current version,
- and an access scope allowed for the authenticated user.

Candidate, rejected, superseded, disabled, and unauthorized chunks are not visible to the answer
model or source UI.

## Proposed Data Model

### KnowledgeSource Extensions

Add or represent:

- `connectorKind`,
- `connectorConfig`,
- `allowedContentTypes`,
- `allowedTriggers`,
- `credentialRef`,
- `publicationPolicy`,
- `enabled`,
- `currentVersionId`,
- `lastSuccessfulRunAt`,
- and source-level acquisition and validation budgets.

`refreshCadence` can remain a human-readable compatibility field but is not executable scheduling
state.

### IngestionSchedule

Required fields include:

- ID and source ID,
- cron expression,
- IANA timezone,
- enabled state,
- `nextRunAt`,
- `lastEnqueuedAt`,
- misfire policy,
- and maximum runtime.

The operator must choose an exact cron expression and timezone. A value such as `weekly` must not be
silently converted into an arbitrary day or time.

### IngestionRun

Required fields include:

- ID and source ID,
- trigger type and trigger reference,
- requester for manual runs,
- unique idempotency key,
- scheduled occurrence,
- status,
- attempt count,
- worker and lease information,
- start, heartbeat, and completion timestamps,
- candidate version ID,
- document, character, chunk, and embedding counts,
- safe failure code and safe message,
- and validation summary.

Run statuses are:

```text
queued
running
unchanged
requires_review
succeeded
failed
cancelled
```

### IngestionRunEvent

Run events are immutable and record state transitions, route selection, attempts, timings, counts,
reason codes, and input or output hashes. They do not store credentials or full source content.

### KnowledgeSourceVersion

Extend version records with:

- source manifest hash,
- lifecycle status,
- producing run ID,
- connector version,
- extractor version,
- sanitizer version,
- chunker version,
- validation summary,
- and publication or rejection timestamps.

Version content is immutable. Lifecycle metadata may transition from candidate to published,
superseded, rejected, or purged.

### KnowledgeSourceDocument

Add a version-scoped document manifest containing:

- source version ID,
- stable document key,
- canonical URI and title,
- media type,
- content hash,
- canonical-content or artifact reference,
- upstream timestamp and ETag when available,
- access metadata,
- and extractor metadata.

This supersedes the single-row-per-source limitations of `RagSourceSnapshot`.

### KnowledgeChunk

Every production chunk must have non-null source ID, source version ID, document key, section key,
access scope, chunker version, and canonical-content hash metadata. Version-scoped retention replaces
root-source cleanup during publication.

## Scheduled Execution Semantics

Scheduled ingestion is at-least-once and must therefore be idempotent.

- Scheduled idempotency key: source ID plus schedule ID plus scheduled occurrence.
- Manual idempotency key: source ID plus caller-provided client request ID.
- Reindex idempotency key: source version plus embedding profile plus reindex request ID.
- A lease expiration allows a worker to reclaim a crashed run.
- A heartbeat prevents a healthy long-running worker from being reclaimed.
- A terminal run is never executed again under the same idempotency key.

Retry policy:

- retry timeouts, HTTP 408, HTTP 429, and eligible HTTP 5xx failures,
- retry transient database and embedding-provider failures,
- use exponential backoff with jitter,
- cap automatic attempts at three,
- do not automatically retry invalid configuration, authentication rejection, unsupported content,
  deterministic validation failure, or security-policy rejection,
- and retain the current version for every failed attempt.

The deployment product may use a hosting-provider cron, an external scheduler, or a dedicated
worker platform. The architectural requirement is a durable dispatcher, run ledger, and worker
lease; it is not tied to a particular vendor.

## Website Connector Requirements

The initial website connector must:

- allow only registered HTTP or HTTPS URLs,
- require HTTPS in production unless an explicit exemption exists,
- default to one page,
- require explicit allowed paths, maximum depth, and maximum page count for crawling,
- use conditional requests when supported,
- set bounded connection and response timeouts,
- cap redirects and revalidate every redirect target,
- cap response bytes before and during body reading,
- accept only approved content types,
- block loopback, link-local, private-network, and metadata-service destinations,
- re-resolve and validate DNS as required to reduce rebinding risk,
- preserve canonical URL, page title, heading structure, modification metadata, and fetch time,
- and reject client-rendered empty shells instead of publishing them as valid content.

A headless-browser connector is a later extension. Add it only when approved sites measurably fail
static extraction and its larger security and runtime surface is justified.

## SharePoint Connector Requirements

The SharePoint connector must:

- use Microsoft Graph with least-privilege application access to the approved site,
- store only a credential reference in source configuration,
- enumerate all required pagination links,
- preserve site, page, section, author, modification, and canonical-link metadata,
- record an explicit complete-crawl marker,
- enforce page and linked-file budgets,
- respect the registered source access policy,
- and reject a partial enumeration as a publishable source manifest.

If the initial scheduled target is Wayfinder, it uses this connector rather than the public HTTP
connector.

## Manual Artifact Requirements

Manual sources use the same downstream pipeline:

1. An administrator uploads an immutable artifact to governed storage.
2. Malware scanning and type validation complete.
3. A manual ingestion run references the artifact version.
4. The extractor registry selects the correct media handler.
5. Sanitization, normalization, hashing, chunking, embedding, validation, and publication follow the
   common chain.

Production manual sources must not rely on application-server local filesystem paths. Sensitive
audio remains blocked until the review decision and reviewer identity are recorded.

## Chunking Design

### Problems With The Current Split

The current 900-character paragraph accumulator is predictable but does not provide a hard size
limit, semantic structure, stable incremental identities, or format-specific behavior. A single
large paragraph can exceed the target, and insertion near the beginning of a document can renumber
many later chunks.

### Required Chunking Algorithm

Use a deterministic, structure-aware recursive chunker. No LLM is required.

1. Parse canonical content into structural blocks.
2. Attach each block to a stable document key, heading path, section anchor, and source locator.
3. Group adjacent related blocks toward a configurable target token count.
4. If a block exceeds the hard maximum, split recursively at paragraph, sentence, punctuation, and
   finally token boundaries.
5. Add small sentence-aligned neighbor overlap when useful.
6. Validate the final token count and provenance of every chunk.

Suggested initial values, subject to evaluation:

- target size: approximately 400 model tokens,
- hard maximum: approximately 650 model tokens,
- overlap: 40 to 60 model tokens,
- minimum useful chunk: approximately 80 model tokens.

The values remain configuration, not permanent constants. Retrieval evaluation decides whether
they should change.

### Format-Specific Rules

- HTML and SharePoint pages preserve heading breadcrumbs and canonical section anchors.
- Lists keep their introductory paragraph and related items together when within the hard maximum.
- Tables repeat the table header and split by complete rows.
- PDFs preserve page or page-range locators and avoid losing headings at page boundaries.
- Transcripts split on speaker and timestamp boundaries and preserve time ranges.
- Documents preserve heading hierarchy and do not mix unrelated top-level sections merely to fill a
  token target.

### Chunk Context

Each chunk includes a lightweight contextual prefix or equivalent metadata such as:

```text
Wayfinder > Employee Benefits > Medical Aid
```

The prefix makes the chunk independently understandable without copying large neighboring sections.

### Stable Chunk Identity

Chunk identity is derived from:

- source ID,
- stable document key,
- stable section anchor,
- canonical chunk-content hash,
- and chunker version.

Timestamp and array index alone are insufficient. Stable content identities allow unchanged chunks
to reuse embeddings even when another document section moves.

### Chunk Validation

Before publication:

- no chunk is empty,
- no chunk exceeds the hard token limit,
- every chunk has source, version, document, section, URI, owner, and access provenance,
- reserved governance metadata cannot be overridden by arbitrary source metadata,
- duplicate chunks remain below a configured threshold,
- chunks contain no active content,
- and representative queries retrieve the expected sections.

## Incremental Embedding

The worker compares candidate chunk-content hashes with compatible prior chunks under the same
embedding profile and chunker version.

- Reuse an existing embedding for an identical canonical chunk when policy permits.
- Generate embeddings only for added or changed chunks.
- Do not reuse embeddings across incompatible embedding profiles.
- Record the embedding provider, model, dimensions, and profile.
- Validate every vector before candidate publication.
- A provider failure leaves the candidate unpublished and the current version unchanged.

## Situation And Failure Handling

| Situation                          | Required behavior                                                       |
| ---------------------------------- | ----------------------------------------------------------------------- |
| Source unchanged                   | Complete as `unchanged`; generate no new embeddings                     |
| Upstream timeout, 429, or 5xx      | Retry within cap; keep current version                                  |
| Authentication or config rejection | Fail without automatic retry; require operator action                   |
| Empty extraction                   | Quarantine or fail; never interpret as deletion                         |
| Suspicious content reduction       | Set `requires_review`; retain current version                           |
| Partial multi-page crawl           | Reject entire candidate; retain complete current manifest               |
| Embedding provider failure         | Retry transient error; leave candidate unpublished                      |
| Duplicate scheduler delivery       | Return existing idempotent run                                          |
| Manual and scheduled collision     | Serialize using per-source lease                                        |
| Worker crash                       | Reclaim after lease expiry and resume from durable state                |
| Unsafe redirect or private address | Reject before reading content                                           |
| Unsupported content type           | Fail with safe reason; do not attempt agent conversion                  |
| Source disabled or revoked         | Exclude immediately from retrieval; retain or purge according to policy |
| Confirmed upstream page deletion   | Remove only through a complete successfully validated new manifest      |
| Bad candidate already published    | Roll back by atomically selecting the retained prior source version     |

## Optional Agent-Derived Memory

Agent enrichment is a separate downstream capability:

```text
published sanitized source version
  -> optional bounded enrichment task
  -> typed output validation
  -> proposed derived memory
  -> policy or human review
  -> supplemental memory publication
```

Appropriate optional uses include:

- summaries and topic labels,
- entity and relationship extraction,
- process or procedure extraction,
- knowledge-map suggestions,
- possible contradiction reports,
- and evaluation-question generation.

The agent boundary must satisfy all of the following:

- The agent receives sanitized, authorized, bounded content, never credentials or unrestricted raw
  artifacts.
- Output conforms to a versioned schema.
- Every memory references its source ID, source version ID, and supporting sections.
- Output records model and prompt version.
- Agent memory is supplemental and cannot override authoritative chunks or access policy.
- Agent failure does not fail or roll back core ingestion.
- A new source version marks dependent derived memory stale.
- High-impact memory requires policy or human approval before publication.

This design distinguishes three kinds of memory:

| Memory                  | Agent required | Purpose                                                 |
| ----------------------- | -------------- | ------------------------------------------------------- |
| Run and schedule state  | No             | Idempotency, retries, leases, recovery, and audit       |
| Source/version content  | No             | Canonical documents, chunks, embeddings, and provenance |
| Semantic derived memory | Optional       | Summaries, concepts, relationships, and suggestions     |

No agent-memory component belongs in the first scheduled-ingestion milestone.

## Governance

- Only administrators can register, enable, disable, reschedule, or change source definitions.
- Initial source publication requires review.
- Normal validated refreshes may publish automatically according to source policy.
- Empty, partial, access-changing, or anomalous candidates require review.
- Credentials remain in an approved secret store and are scoped to the connector and source.
- Source budgets limit bytes, pages, documents, runtime, chunks, embedding tokens, and concurrent
  work.
- Authorization applies to chunk text, source metadata, citations, historical hydration, and
  derived memory.
- Disabling or revoking a source takes effect at retrieval time without waiting for reindexing.
- Logs and events store IDs, hashes, counts, timings, and safe errors rather than full source text.
- Retrieved content is untrusted evidence and cannot issue system or tool instructions.

Suggested retention defaults:

- ingestion runs and events: 90 days,
- current source version: while the source is active,
- superseded versions: at least three versions or 90 days,
- rejected candidates: enough time for investigation, then purge,
- and versions referenced by published knowledge maps: until the references are removed.

## Observability

Record metrics by source, connector, and run status:

- dispatcher delay,
- queue wait and run duration,
- acquisition bytes and documents,
- canonical character count,
- changed and unchanged manifests,
- chunk count and token distribution,
- reused and generated embeddings,
- retries and failure reason,
- consecutive failures,
- freshness lag,
- candidate validation outcome,
- and publication or rollback result.

Alert when:

- a source reaches three consecutive failures,
- freshness exceeds twice its configured cadence,
- a lease or run exceeds maximum runtime,
- extraction is empty,
- a candidate crosses anomaly thresholds,
- an access policy changes unexpectedly,
- or unauthorized retrieval is detected.

## Evaluation

### Unit Tests

- Connector and extractor route selection is deterministic.
- Unsupported or ambiguous routes fail before acquisition.
- Canonical hashing ignores crawl-time-only differences.
- Manifest hashes are stable regardless of document iteration order.
- Duplicate scheduled and manual request IDs are idempotent.
- Lease acquisition and expiration serialize source work.
- Retry classification distinguishes transient and permanent errors.
- The chunker enforces its hard token maximum.
- Oversized paragraphs split at sentence and token boundaries.
- HTML, tables, PDFs, and transcripts preserve their required locators.
- Stable chunk identity reuses unchanged chunks after unrelated document edits.
- Reserved governance metadata cannot be overridden by source metadata.
- Candidate validation rejects empty, partial, oversized, and anomalous data.

### Integration Tests

- HTTP `304` completes as unchanged without embedding calls.
- A changed website creates a new version and atomically becomes current.
- A website failure leaves the current version retrievable.
- Redirect to a disallowed or private destination is rejected.
- Complete SharePoint pagination produces a publishable manifest.
- A failed SharePoint page or pagination request rejects the entire candidate.
- Embedding failure leaves candidate chunks invisible.
- Retrieval returns only enabled, authorized, current-version chunks.
- Rollback restores retrieval from the prior version.
- A manual PDF and scheduled HTML source share the downstream pipeline.

### Adversarial Cases

- A page contains prompt-injection instructions or tool-like commands.
- A redirect chain leaves the allowlisted origin.
- DNS resolves to a private address after initial validation.
- A successful response is an authentication page rather than the expected content.
- Boilerplate dominates the page and meaningful text disappears.
- A crawl returns only the first pagination page.
- Upstream content rapidly changes during one crawl.
- Two workers claim the same due occurrence.
- A worker crashes after candidate chunks are written but before publication.
- Source metadata attempts to override access scope or source version.

### Reliability Thresholds

- Zero unauthorized retrievals.
- One run per idempotency key.
- No failed or quarantined run changes `currentVersionId`.
- No partial crawl removes previously current documents.
- Unchanged sources generate zero new embeddings.
- Dispatcher delay remains below two dispatcher intervals under expected load.
- Every current chunk has complete provenance and passes its token limit.
- Retrieval evaluation shows no material regression before automatic publication is enabled.

## Rollout Plan

### Phase 1: Version And Run Foundation

- Add durable source, schedule, run, event, and document-manifest state.
- Make source versioning independent of the knowledge-map feature flag.
- Require current-version filtering in retrieval.
- Preserve prior versions and add rollback behavior.

### Phase 2: Deterministic Pipeline Refactor

- Introduce connector and extractor registries.
- Move existing extraction implementations behind the new contracts.
- Add canonical sanitization, hashing, manifest comparison, and validation.
- Replace the current chunker with the bounded structure-aware implementation.
- Add incremental embedding reuse.

### Phase 3: Scheduled Website Or SharePoint Source

- Add the dispatcher, run claim, source lease, heartbeat, and bounded retry behavior.
- Configure the exact target source, cron expression, and timezone.
- Run in dry-run and candidate-only modes.
- Compare candidate retrieval against the current index.
- Enable automatic publication only after the evaluation threshold passes.

### Phase 4: Manual And Additional Sources

- Add governed immutable upload storage and the manual artifact connector.
- Add new connectors or extractors without changing the common pipeline.
- Retire production request-time ingestion where durable ingestion covers the same sources.

### Phase 5: Optional Semantic Memory

- Introduce only after a concrete structured-memory use case is approved.
- Keep enrichment independent from ingestion success.
- Require evidence links, schema validation, freshness handling, and policy review.

## Minimal Build And Scaling Triggers

The minimal build is a single deterministic worker, one scheduled connector, manual reruns, durable
state, versioned publication, rollback, and observability.

Add complexity only when evidence justifies it:

| Addition                   | Justifying signal                                                          |
| -------------------------- | -------------------------------------------------------------------------- |
| Cross-source parallelism   | Sequential work cannot complete inside the scheduling window               |
| Page-level parallelism     | Large complete crawls dominate latency and deterministic merge is proven   |
| Headless browser connector | Approved sites repeatedly fail because content is client-rendered          |
| Event triggers             | Source systems provide reliable change events and polling is wasteful      |
| Semantic-memory agent      | Measured value from structured interpretation exceeds cost and review risk |
| Dynamic orchestration      | Static dependencies repeatedly fail because execution plans must change    |

## Acceptance Criteria

- An approved website or Wayfinder source can be scheduled with an exact cron expression and
  timezone.
- The same source can be refreshed manually through the same application service.
- Scheduled delivery is idempotent and source execution is serialized.
- An unchanged source performs no chunk publication or embedding generation.
- A valid changed source is sanitized, normalized, chunked, embedded, validated, and atomically
  published.
- An empty, incomplete, failed, or anomalous run leaves the current version unchanged.
- Old source versions remain available for controlled rollback and retention.
- Retrieval returns only enabled, authorized chunks belonging to the current source version.
- Chunking has a hard token maximum, stable provenance, stable content identity, and format-specific
  behavior.
- Adding a connector or extractor does not require rewriting scheduling, validation, embedding, or
  publication.
- Core ingestion operates when no generative LLM is configured or available.
- Any future agent-derived memory remains supplemental, evidence-linked, version-scoped, and
  independently reviewable.

## Operator Decisions Required Before Implementation

- Confirm whether the first scheduled target is the public website connector or SharePoint
  Wayfinder connector.
- Choose the exact cron expression and IANA timezone.
- Choose the initial publication policy: review every change or automatically publish validated
  non-anomalous updates after first-version approval.
- Choose governed storage for immutable manual artifacts and canonical normalized documents.
- Confirm source-specific page, byte, runtime, token, and anomaly budgets.
- Confirm retention requirements for restricted source artifacts and superseded versions.
