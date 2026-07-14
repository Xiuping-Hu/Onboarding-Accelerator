# RAG-Grounded Onboarding Knowledge Map Spec

## Status

Proposed.

## Repo Findings

- Spec 011 established the current empty-first workflow: the user asks the assistant, receives an
  optional draft guide map, and explicitly creates a session-owned map.
- The local `createDraftGuideMap` helper in `apps/web/src/server/chatService.ts` currently turns up
  to four retrieved sources into root nodes with generic `Context` and `Action` children. It does
  not synthesize concepts, workflows, dependencies, or other semantic relationships.
- When retrieval returns no sources, the current fallback can still propose an ungrounded map with
  `Clarify the domain` and `Identify workflows` nodes.
- `GuideGraphState` stores a complete rooted tree inside each `OnboardingSession`. Nodes have one
  parent and child list; cross-links and typed relationships are not persisted.
- Guide nodes use random IDs, so the same concept cannot be identified reliably across sessions or
  regenerated map versions.
- Created guide nodes embed complete `SourceProvenance` records, including excerpts. A later source
  update, removal, or access-policy change does not invalidate the persisted copy.
- Current draft proposals exist only in client state until map creation. Reloading the workspace
  before creation loses the proposal.
- Map creation resolves submitted source IDs from the session's chat history, which prevents a
  client from attaching arbitrary source records, but it has no complete validation for duplicate
  IDs, missing parents, cycles, overwrite races, or evidence coverage.
- `GuideOrchestrationService.expand` reveals children already saved in the session. It does not
  retrieve new evidence or enrich a selected node.
- Chat can return related guide-node IDs, but matching is a keyword scan over node text rather than
  map-aware retrieval.
- The ingestion foundation described by spec 012 now includes source registration, deterministic
  chunks, embedding profiles, pgvector retrieval, and metadata for owner, access scope, version,
  refresh cadence, and update time.
- Migration 004 defines `rag_source_snapshots`, but the current ingestion service does not maintain
  that table and its one-row-per-source shape does not provide immutable source-version history.
- Pgvector retrieval filters globally configured access scopes. It does not yet derive allowed
  scopes from the authenticated user for every request.
- The workspace already treats the canvas as the primary onboarding surface. There is no end-user
  manual feature to migrate; authoritative content currently remains in the registered source
  documents.

## Problem

The current guide is a useful interaction prototype, but its generated structure is a snapshot of
one retrieval result. It can present source titles as if they were a meaningful learning model,
create placeholder structure without evidence, and retain stale or no-longer-authorized excerpts.
Different users asking the same question can receive unrelated node identities and topology.

Replacing this with a generated user manual would preserve the same discovery problem in a longer,
linear format. Learners need a stable view of how company concepts, roles, systems, workflows, and
tasks connect. They also need contextual explanations without treating generated prose as company
policy.

## Goal

Make a governed knowledge map the primary orientation and navigation layer:

- Source documents remain the authoritative record.
- A versioned, human-reviewed map provides stable concepts and relationships.
- RAG explains nodes, answers questions, and proposes role- or goal-specific routes through the
  published map.
- Every company-specific map claim and answer is grounded in accessible, current evidence.
- Source ownership, freshness, conflicts, and missing coverage are visible rather than hidden by
  generated prose.
- Personalization changes only a user's session overlay and never silently rewrites the canonical
  map.

## Product Decision

The product uses four distinct artifacts:

| Artifact                  | Purpose                                 | Authority                        | Lifecycle                        |
| ------------------------- | --------------------------------------- | -------------------------------- | -------------------------------- |
| Source document           | Exact policy, process, or reference     | Authoritative company record     | Owned and updated at the source  |
| Published knowledge map   | Shared orientation and relationships    | Human-reviewed navigation model  | Immutable, versioned publication |
| Session onboarding map    | Role- and goal-specific map projection  | Derived from a published version | User/session overlay             |
| RAG answer or explanation | Context for the user's current question | Evidence-backed assistance       | Transient and citation-dependent |

The application must not generate a parallel long-form manual. A node contains only enough text to
orient the learner. Exact procedures, policy wording, forms, and compliance content link back to the
controlling source.

AI may propose map changes, but only a human map steward may publish them. User questions and source
refreshes must never mutate a published map automatically.

## Relationship To Existing Specs

- This spec builds on the session workflow and canvas behavior completed in spec 011.
- This spec uses the ingestion, provenance, and source-governance foundation described in spec 012.
- This spec supersedes spec 011's ad hoc draft topology generation for new maps. It does not remove
  the empty-first canvas, explicit map creation, session persistence, focus, or child-reveal
  behavior.
- Existing generated session maps remain readable during migration and are never silently promoted
  into canonical knowledge.

## Non-Goals

- Replacing authoritative documents, required operating procedures, policies, or compliance
  manuals.
- Treating unrestricted web search as authoritative company knowledge.
- Allowing AI to publish or silently edit canonical nodes, relationships, evidence, or access
  policy.
- Building a general-purpose graph database, ontology platform, or enterprise search replacement.
- Building a learning-management system, employee assessment product, or HR performance tracker.
- Inferring a learner's team, professional role, or goals from sensitive data. Personalization uses
  explicit inputs or approved profile attributes.
- Migrating or rewriting old session maps without an explicit user or operator action.

## Product Roles

- **Learner** explores the map, follows a personal route, asks grounded questions, and opens source
  documents.
- **Map steward** reviews map structure and evidence, previews audience views, and recommends
  publication or rollback. In the MVP, a steward must also be an application `admin` to perform a
  mutation.
- **Source owner** approves source use and resolves stale, missing, or conflicting content.
- **Administrator** manages source and audience policies, feature rollout, and audit access.

An account's application role (`user` or `admin`) is separate from an onboarding role such as
`graduate-accountant` or `team-lead`. Learner-selected roles, teams, and goals filter already
authorized content; they never grant an audience or source permission.

## Target Learner Experience

1. A new session starts with an empty personal overlay and offers `Create my onboarding map`.
2. The learner provides an onboarding goal and may select an approved role or team filter.
3. The server projects accessible nodes from the current published map version. It does not ask the
   model to invent a new company topology.
4. The canvas shows a concise overview of concepts, workflows, tools, decisions, tasks, and their
   typed relationships.
5. Selecting a node reveals:
   - what it is and why it matters,
   - prerequisites and suggested next steps,
   - the responsible source owner,
   - freshness and evidence state,
   - cited authoritative sources,
   - `Ask about this` and `Open source` actions.
6. Asking a question returns a grounded answer, highlights related accessible nodes, and can offer a
   suggested route through existing nodes.
7. A role- or goal-specific route is saved as an overlay. It does not add, delete, or rewrite
   canonical nodes or edges.
8. When evidence is missing, stale, conflicting, or inaccessible, the assistant abstains or narrows
   its answer and makes the limitation clear.
9. When a newer map version is published, a pinned session remains stable and shows an explicit
   update option.
10. For exact procedures or compliance content, the assistant orients the learner and links to the
    controlling document rather than presenting generated text as the final authority.

## Target Architecture

```text
Approved source documents
          |
          v
Ingestion, snapshots, chunks, and embeddings
          |
          +-----------------------+
          |                       |
          v                       v
Map proposal service       Grounded retrieval
          |                       ^
          v                       |
Validation and steward review     |
          |                       |
          v                       |
Immutable published map ----------+
          |
          v
Authorized role/goal projection
          |
          v
Session overlay -> canvas, node detail, and node-aware chat
```

The canonical map is stored independently of `OnboardingSession`. A session pins a published map
version and stores only projection and interaction state. APIs hydrate the accessible graph and
source evidence at request time.

## Canonical Knowledge Model

Add durable records with the following responsibilities:

### `knowledge_sources` And `knowledge_source_versions`

- `knowledge_sources` provides stable source identity, registry ID, owner, URI, audience, refresh
  cadence, and current version ID.
- `knowledge_source_versions` stores immutable captures with a content hash, upstream modified time,
  capture time, review state, and metadata.
- Ingestion writes or resolves the source version before writing chunks and links every chunk to that
  version plus a stable section/page/timestamp key.
- Source-version and chunk writes for one ingestion result are transactional. A failed index must not
  advance the source's current version pointer.
- Existing `rag_source_snapshots` data may be backfilled, but it is not the version-history contract
  for published maps.

### `knowledge_maps`

- Stable map identity, slug, title, description, tenant or organization, default audience, and
  current published version ID.
- One map may have many immutable versions but only one current published version.

### `knowledge_map_versions`

- Map ID, monotonic version number, `draft`, `published`, or `archived` status, change note, creator,
  publisher, creation time, and publication time.
- A published version is immutable. Rollback changes the map's current version pointer; it does not
  edit an old version.

### `knowledge_map_nodes`

- Version-specific row ID plus a `stableKey` that identifies the same concept across versions. The
  key is unique within its map, and each version contains at most one row for that key.
- Node kind: `concept`, `role`, `system`, `workflow`, `task`, `decision`, `resource`, or `milestone`.
- Short title, orientation summary, owner, display order, audience policy, freshness policy, and an
  optional `controllingDocumentRequired` flag.
- Node text must remain concise enough for map navigation. Extended explanation is retrieved and
  generated on demand.

### `knowledge_map_edges`

- Version-specific edge identity, source and target version-row IDs from the same map version,
  display order, and rationale.
- Relationship type: `contains`, `prerequisite`, `learning_precedes`, `workflow_transition`, `uses`,
  `owned_by`, or `related`.
- Layout may use one `contains` or `learning_precedes` relationship as the primary parent while
  retaining other typed cross-links.
- `contains`, `prerequisite`, and `learning_precedes` relationships must form valid directed acyclic
  views. `workflow_transition` may represent a reviewed loop; `related` may be non-hierarchical.

### `knowledge_map_source_bindings`

- Node or edge ID, stable source registry ID, optional section/page/timestamp selector, evidence role
  (`authoritative` or `supplemental`), source version observed during review, and validity dates.
- Bindings use durable source and section identity rather than an embedding-row ID, so re-chunking
  does not break the map.
- Retrieval may resolve a binding to current chunk IDs, but chunk IDs are evidence instances rather
  than canonical map keys.

### `knowledge_map_evidence_health`

- Map version, target node or edge ID, current state (`current`, `stale`, `missing`, `conflicting`,
  or `needs_review`), reason, evaluated source versions, and evaluation time.
- Health is a mutable operational assessment derived from immutable bindings and current source
  versions. Updating it never edits a published version's topology, claims, or bindings.
- Learner and steward APIs join this state at read time and fail closed when no valid assessment can
  be produced.

### `knowledge_audience_memberships`

- Account ID, organization or tenant ID when configured, access scope, assignment source, assigner,
  validity window, and timestamps.
- The server owns these assignments. A learner cannot add a scope by changing a role, team, goal, or
  request payload.
- The MVP may operate as one organization, but it still requires explicit account-to-scope records
  rather than relying only on an environment-wide allowlist.

### `knowledge_map_suggestions`

- Proposed node, edge, or binding change; supporting evidence; generation metadata; review state;
  reviewer; decision; and timestamps.
- Suggestions are draft-only and never appear in learner responses before acceptance into a
  published version.

### `knowledge_map_feedback`

- Map and version ID, optional node or assistant-message reference, issue category, learner comment,
  review state, resolution, actor IDs, and timestamps.
- Categories include `inaccurate`, `stale`, `missing`, `source_inaccessible`, and `other`.
- Feedback enters the steward queue without copying full source content into the record.

### `knowledge_map_audit_events`

- Actor, action, map/version/target IDs, minimal metadata, and timestamp.
- Publish and rollback write their audit event in the same Postgres transaction as the version
  pointer change. The existing file audit service may receive a mirrored event through a
  transactional outbox, but it is not the atomic publication record.

## Transaction And Concurrency Requirements

- Extend the database port with a transaction callback that checks out one connection and supplies a
  client-bound query interface for the complete callback. Calling `BEGIN` and `COMMIT` through the
  current pooled `DatabaseClient.query` method is not sufficient.
- Source-version creation, chunk replacement, and the source current-version pointer commit or roll
  back together on that connection.
- Map-version publication or rollback, the current-version pointer, and the database audit/outbox
  event commit or roll back together on that connection.
- Add a monotonic session `revision` and compare-and-swap repository operations. Creating a proposal,
  consuming it, replacing guide state, and updating overlay state must include the expected revision
  or an equivalent atomic predicate.
- The create-map transition atomically verifies the owner, `uninitialized` origin, proposal ID,
  pinned map version, proposal expiry, and current revision before writing `published_map` state and
  incrementing the revision.
- A proposal can be consumed once. Concurrent or stale requests return a conflict and cannot
  overwrite a newer proposal or accepted overlay.
- The MVP requires `SESSION_STORE=postgres`. File-backed sessions remain available only while the
  feature is disabled unless their repository later implements equivalent atomic transition and CAS
  guarantees.
- Transaction and CAS retry behavior is bounded, idempotent where applicable, and covered by forced
  rollback and concurrent-request tests.

## Session Overlay Model

Make guide persistence an explicit union so legacy sessions remain readable:

```ts
type GuideGraphState = UninitializedGuideState | LegacyGeneratedGuideState | PublishedMapGuideState;

interface UninitializedGuideState {
  origin: 'uninitialized';
  pendingProposal?: MapProjectionProposal;
}

interface PublishedMapGuideState {
  origin: 'published_map';
  mapId: string;
  mapVersionId: string;
  projectedNodeKeys: string[];
  selectedNodeKey?: string;
  expandedNodeKeys: string[];
  pathNodeKeys: string[];
  onboardingRoleKey?: string;
  teamKey?: string;
  goal: string;
}

interface MapProjectionProposal {
  id: string;
  sessionRevision: number;
  mapId: string;
  mapVersionId: string;
  nodeKeys: string[];
  pathNodeKeys: string[];
  onboardingRoleKey?: string;
  teamKey?: string;
  goal: string;
  createdAt: string;
  expiresAt: string;
}
```

- An existing empty guide without an `origin` discriminator is read as `uninitialized`; a guide with
  embedded nodes is read as `legacy_generated`.
- `LegacyGeneratedGuideState` preserves the existing embedded `nodes` representation behind the
  compatibility and authorization layer.
- `PublishedMapGuideState` stores stable canonical node keys, not source excerpts, canonical node
  copies, or version-row IDs.
- Selection, expansion, and the personal route use stable node keys and are overlay state. They are
  not canonical map fields.
- The server renders either state into the existing client-facing `GuideGraph` during migration.
- A session pins `mapVersionId` until the learner accepts an update preview.
- The exact state transition is `uninitialized` -> persisted proposal preview -> explicit create-map
  confirmation -> `published_map`. Chat alone cannot accept the proposal or create the map.

Identity rules are explicit:

- Database foreign keys and learner-facing node-detail routes use version-row node IDs.
- `stableKey` is unique within a knowledge map and provides continuity across immutable versions.
- Session overlays store stable keys. When hydrating a session, the server resolves each key only
  within the session's pinned map and version, then returns version-row IDs in `GuideGraph`.
- No API may resolve an unscoped stable key or accept a node ID from another map version.
- Session repositories and summaries use discriminated helpers for node count, selection, and
  serialization. Code must narrow the state before reading legacy `guide.nodes`.

## Map Projection Requirements

- Build projections only from a published map version and nodes authorized for the current user.
- Accept an explicit onboarding goal and optional approved role/team keys.
- Select and order existing canonical nodes; do not create company facts or relationships during
  projection.
- A model-assisted selector may return only node IDs supplied by the server. Unknown IDs are
  rejected.
- Suggested routes use published edges. If relevant nodes are disconnected, show them as separate
  results rather than inventing a dependency.
- The same map version, access policy, role, and normalized goal must produce stable node identity
  and ordering on repeated loads.
- Apply a configurable visible-node limit and progressive disclosure so the first view remains
  understandable without discarding reachable content.
- If no published or sufficiently grounded map covers the goal, return a `map_unavailable` or
  `coverage_gap` state. Do not create generic placeholder nodes.

## RAG Map Proposal And Publishing Requirements

Map generation is an administrative drafting tool, not an end-user publication path:

1. A steward selects a map objective, approved source set, and intended audience.
2. Retrieval uses reviewed, current chunks from those sources.
3. The model returns a structured draft containing node kinds, stable-key suggestions, typed edges,
   concise summaries, and evidence references drawn only from the supplied retrieval context.
4. The server rejects unknown source IDs and validates the graph before saving a draft.
5. The steward reviews the visual graph, evidence for every claim, warnings, and an audience preview.
6. Accepted changes are saved to a new or existing draft version. They never overwrite a published
   version.
7. Publication is atomic, requires an application `admin` in the MVP or a future explicit steward
   capability, and creates its database audit event in the same transaction.

The model-facing structured result is a proposal, not a persistence contract:

```ts
interface RagKnowledgeMapDraft {
  objective: string;
  nodes: Array<{
    clientKey: string;
    suggestedStableKey: string;
    kind: KnowledgeMapNodeKind;
    title: string;
    summary: string;
    owner?: string;
    evidence: EvidenceBindingCandidate[];
  }>;
  edges: Array<{
    clientKey: string;
    fromClientKey: string;
    toClientKey: string;
    relationship: KnowledgeMapRelationship;
    rationale?: string;
    evidence: EvidenceBindingCandidate[];
  }>;
}

interface EvidenceBindingCandidate {
  sourceId: string;
  sourceVersionId: string;
  sectionKey?: string;
  role: 'authoritative' | 'supplemental';
}
```

The server maps client keys to version-row IDs, normalizes stable keys, and resolves every evidence
candidate against the exact retrieval context before saving a suggestion or draft.

Validation must detect:

- duplicate stable keys or node IDs,
- missing edge endpoints and orphaned required nodes,
- invalid primary-parent, prerequisite, or next-step cycles,
- unsupported node or edge types,
- missing owner or audience policy,
- missing, stale, conflicting, or inaccessible authoritative bindings,
- evidence references outside the proposal's retrieval context,
- node claims that do not meet the configured grounding threshold,
- oversized titles, summaries, node counts, or prompt payloads,
- and source instructions that attempt to alter system behavior.

A draft may preserve warnings for steward resolution. Publication must fail when required evidence,
authorization, graph integrity, or audience-safety checks fail.

## Retrieval And Grounding Requirements

Node-aware chat uses a two-lane retrieval strategy:

1. Resolve the authenticated user's tenant and allowed audiences.
2. Load only authorized map nodes, edges, bindings, and source metadata.
3. Use the selected node, accessible neighbors, onboarding role, and goal as context while preserving
   the learner's literal question.
4. Retrieve node-bound authoritative sources first.
5. Run hybrid semantic and lexical retrieval across other accessible company chunks to fill relevant
   context gaps.
6. Rerank for query relevance, authority, freshness, and source diversity.
7. Generate an answer from the returned evidence and return cited source IDs plus related canonical
   node IDs.
8. Treat map labels and summaries as navigation context, not as evidence for a company-specific
   factual claim.
9. Abstain when evidence does not meet the grounding threshold and identify the missing source or
   owner when permitted.

Additional rules:

- A `controllingDocumentRequired` node and any policy, procedure, legal, or compliance question must
  meet its threshold with current `authoritative` bindings. Supplemental or web evidence may add
  context, but it cannot satisfy the threshold, override controlling material, or prevent
  abstention.
- Optional web-search results remain visually and semantically separate from approved company
  sources.
- Web results cannot support a published company-map claim until registered, reviewed, and ingested
  as an approved source.
- Retrieved source content is untrusted data. Prompts delimit it as evidence and ignore instructions
  found inside it.
- Answers include inline source attribution and APIs return complete authorized provenance for the
  evidence UI.
- Node-scoped retrieval records the selected version-scoped node ID, map version, retrieval trace,
  and AI usage without logging full restricted chunks.

## Freshness, Conflict, And Revocation Requirements

- Compare each binding's reviewed source version with the current immutable source-version record
  after ingestion.
- Mark the affected node and edge evidence-health records `stale` when a source changes; queue a
  review item without editing the immutable map version.
- A source refresh may propose a version diff but cannot edit or republish the map automatically.
- Detect missing bound sections and conflicting authoritative sources. Do not choose one silently.
- Show freshness state and last reviewed time to stewards. Show a concise learner warning when a
  node is safe to display but its evidence needs review.
- A permission revocation takes effect immediately, including for sessions pinned to an older map
  version.
- Authorization applies to node existence, titles, summaries, edges, snippets, source metadata, and
  generated answers. The product must not reveal that inaccessible content exists.
- Persist stable source bindings and map references in sessions, never hydrated restricted excerpts.

## Persisted Evidence And Revocation Requirements

- New assistant messages persist answer text plus stable citation references, not copied
  `SourceProvenance` excerpts. Evidence is hydrated after authorization on every response.
- Every session list, get, root-load, chat, and update response passes through one authorization and
  redaction serializer; repositories never return raw persisted guide or chat evidence directly to
  a client.
- Before returning a historical assistant answer, reauthorize every source used to ground it. If any
  required source is revoked, deleted, or cannot be resolved, hide the complete assistant answer and
  its evidence behind a generic `historical_answer_unavailable` state. Partial text redaction is not
  considered safe.
- Reauthorize legacy guide sources on every read. Strip stored excerpts, URIs, and metadata unless
  they resolve to a currently authorized source identity.
- If a legacy node's derived title or summary cannot be shown safely because all supporting sources
  are unauthorized or unresolvable, omit the node and return only a session-level
  `legacy_content_unavailable` notice.
- Backfill stable citation/source references where existing metadata permits. Unresolvable historical
  content fails closed; a one-time migration does not replace read-time enforcement.
- Apply the same serializer to `ListSessionsResponse`, which currently carries full sessions, and to
  session summaries such as `guideNodeCount`.

## API Requirements

### Learner APIs

`POST /api/sessions/:sessionId/guide/root`

- Preserve the current workspace load boundary.
- Return an empty graph plus any authorized pending proposal for `uninitialized` state.
- Hydrate a `published_map` projection from the pinned version, resolve current evidence health, and
  report whether a newer accessible published version exists.
- Render `legacy_generated` state only through the per-read authorization and redaction rules.

`POST /api/sessions/:sessionId/guide/map/proposal`

- Accept an explicit goal, optional approved onboarding-role/team filters, and optional published map
  version.
- Authorize and project existing published nodes, issue a proposal ID, persist the proposal in
  `UninitializedGuideState`, and return a preview.
- Never accept client-authored node text, edges, audience scopes, or source evidence.

`POST /api/sessions/:sessionId/guide/map`

- During migration, accept a discriminated request union:
  - `mode: 'published_projection'` contains a server-issued proposal ID.
  - `mode: 'legacy_draft'` contains the existing `DraftGuideMap` and is accepted only when the
    published-map feature is disabled or the session is already on the legacy flow.
- Treat an untagged historical payload as `legacy_draft` only during the compatibility window and
  reject ambiguous or mixed payloads.
- Reload the persisted proposal, reauthorize its pinned published version, and reject an expired,
  mismatched, or already-consumed proposal.
- Authorize, project, persist the session overlay, and return a hydrated `GuideGraph`.
- Reject overwrite of an existing map unless the request includes an explicit, validated update or
  replacement action.

`POST /api/sessions/:sessionId/chat`

- Continue accepting the learner's question and selected node.
- Return authorized citations, version-scoped focus-node IDs, derived evidence health, and an optional
  `MapProjectionProposal` when the session has no map.
- Persist a pending proposal in `UninitializedGuideState` so reload does not lose it.
- Return legacy `draftGuideMap` only for a session using the feature-flagged legacy flow.

`POST /api/sessions/:sessionId/guide/expand`

- Continue revealing existing accessible children or neighbors without generating topology.
- Hydrate current evidence only after authorization.

`GET /api/sessions/:sessionId/guide/nodes/:nodeId`

- Return node detail, typed relationships, owner, freshness, controlling-document indicator, and
  authorized source provenance.
- Resolve `nodeId` only inside the session's pinned map version.
- Return not found for inaccessible nodes rather than exposing their existence.

`GET /api/sessions/:sessionId/guide/search?query=:query`

- Search accessible nodes using lexical matching and, when configured, semantic ranking.
- Return version-row node IDs, concise match context, relationship/path hints, and no restricted
  source text.
- Return an empty result rather than leaking hidden-node counts or titles.

`POST /api/sessions/:sessionId/guide/feedback`

- Accept a visible node ID or assistant-message ID, issue category, and optional concise comment.
- Verify that the referenced item belongs to the session and was visible to the learner.
- Create an audited steward-queue item without copying retrieved chunks or hidden source metadata.

`POST /api/sessions/:sessionId/guide/rebase` (later phase)

- Preview the difference between the pinned and current published versions.
- Apply an accepted update while preserving selection and path by `stableKey` where the
  corresponding nodes still exist.

### Steward And Admin APIs

- Create a knowledge map and draft version.
- Generate an evidence-backed proposal for an approved source set and audience.
- Read and update a draft's nodes, edges, source bindings, and change note.
- Validate a draft and preview it for a selected audience.
- Compare draft, published, and historical versions.
- Publish atomically, view version history, and roll back the current-version pointer.
- List stale, missing, conflicting, unowned, and insufficiently grounded items.
- Accept or reject AI suggestions with an audited decision.

All map mutation endpoints require server-side authorization, optimistic concurrency, schema
validation, request-size limits, and audit logging.

The published-map feature requires Postgres, the canonical-map migrations, a transaction-capable
database port, and `SESSION_STORE=postgres` for the MVP. It remains disabled when they are
unavailable, and readiness fails when the flag is enabled without those guarantees. Existing
file-backed session behavior continues when the feature is disabled.

## Client Requirements

### Learner Workspace

- Keep the full-screen canvas and explicit create-map action from spec 011.
- Replace source-title roots and generic context/action children with the authorized published-map
  projection.
- Render typed edge labels and distinguish at least concept, workflow, task, decision, system, and
  source/resource nodes without relying only on color.
- Keep node titles and summaries concise; put generated explanation and evidence in a node inspector
  rather than expanding canvas cards into manual pages.
- Add `Ask about this`, `Open source`, prerequisite, next-step, owner, and freshness affordances to
  the inspector.
- Add map search that focuses accessible matching nodes and offers an empty, non-leaking zero-result
  state.
- Add `Report a problem` for inaccurate, stale, missing, or inaccessible node/answer content and
  route the report to the steward queue.
- Highlight focus nodes returned by chat and let a suggested path be previewed before saving it to
  the session overlay.
- Show `coverage_gap`, stale evidence, conflict, and abstention states without manufacturing content.
- Show when a newer published version is available and require an explicit update confirmation.
- Provide a keyboard-operable outline/list equivalent for users who cannot navigate the spatial
  canvas.
- Never render inaccessible placeholder nodes, hidden-edge gaps, or restricted-source counts.

### Steward Workspace

- Add an admin-only knowledge-map area for draft graph editing, source binding, validation results,
  audience preview, version diff, publication, rollback, and review queues.
- Show evidence beside each proposed node or edge and make unsupported AI suggestions visually
  distinct from accepted steward content.
- Require confirmation with a change note before publish or rollback.
- Preserve a complete audit trail of the actor and decision without storing source secrets.

## Authorization And Security Requirements

- Replace globally configured retrieval scope as the sole control with scopes derived per request
  from the authenticated account, tenant, and approved audience assignments.
- Enforce the same policy in map queries, projection, source resolution, vector retrieval, chat, and
  rebase operations.
- Resolve allowed audiences from server-owned `knowledge_audience_memberships`; never union them
  with an onboarding role, team, goal, or client-supplied scope.
- Compute a node's effective audience no broader than all authoritative evidence used to support its
  learner-visible claims.
- Prevent cross-tenant map IDs, node IDs, source IDs, and version IDs from being resolved.
- Allow only application `admin` accounts to mutate maps in the MVP. A later steward capability may
  delegate a subset of those operations through explicit server-owned grants.
- Audit publication, rollback, access-policy changes, source-binding changes, and suggestion
  decisions.
- Do not log credentials, full restricted chunks, or unnecessary learner question text.
- Sanitize source links and treat retrieved markup and instructions as untrusted.

## Evaluation And Success Metrics

Before rollout, create a pilot-domain evaluation set with representative goals, questions, expected
nodes, acceptable source IDs, expected abstentions, and forbidden cross-audience results.

Compare the map experience with the current source/document-navigation baseline using:

- median time to locate the correct authoritative source,
- successful completion of representative onboarding tasks,
- first-answer resolution without human escalation,
- correct-source citation rate and retrieval recall at the configured result limit,
- grounded-answer and appropriate-abstention rates,
- unauthorized node, edge, snippet, and source disclosures,
- search-to-node success and zero-result queries,
- node, citation, and source-open rates,
- stale, missing, conflicting, and ungrounded map-item counts,
- map-proposal review time and freshness-SLA compliance,
- and answer latency, token usage, and estimated AI fee.

Instrumentation may record map version, stable node IDs, actions, result counts, latency, and usage.
It must avoid capturing full source content or unnecessary sensitive query text.

## Compatibility And Migration

- Add a feature flag for published knowledge maps and enable it first for one pilot audience.
- Read an existing guide without an `origin` discriminator as `uninitialized` when it has no nodes
  and as `legacy_generated` when it contains nodes.
- Keep authorized legacy content readable through per-response source resolution and redaction; hide
  unverifiable content using the explicit legacy-unavailable states.
- New sessions use `uninitialized` when the feature is enabled. They transition to `published_map`
  only after an authorized proposal preview and explicit create-map action.
- Do not silently convert legacy nodes into canonical content. A steward may use them only as
  untrusted suggestions in a reviewed draft.
- Use the discriminated create-map request and feature flag to isolate legacy and published flows.
  Deprecate `ChatResponse.draftGuideMap` and `mode: 'legacy_draft'` after the new projection flow is
  verified, and remove them only after compatibility telemetry shows no active use.
- Backfill resolvable historical citation references and apply fail-closed read-time authorization
  to old chat and guide JSON.
- Replace direct `guide.nodes` access in repositories, session summaries, list/get/update routes,
  services, tests, and generated harness documentation with discriminated-state helpers.
- Pin active sessions to their selected map version and offer an explicit rebase preview for future
  versions.

## Rollout Plan

1. **Foundation:** choose one onboarding domain, confirm source owners and audiences, generate a
   structured RAG draft from reviewed sources, curate the baseline map, and establish evaluation and
   access-control fixtures.
2. **Browse-only pilot:** validate and publish the immutable map through the basic admin workflow,
   then verify graph clarity, evidence coverage, accessibility, and audience filtering.
3. **Grounded navigation beta:** enable node-aware RAG, citation display, abstention, and related-node
   focus for the pilot audience.
4. **Personal routes:** enable explicit role/goal projections and saved session overlays.
5. **Steward automation:** add richer visual editing, update suggestions, owner notifications,
   cross-version diff, explicit rebase, and delegated steward capabilities.
6. **Expansion:** add domains only after grounding, freshness, access, usability, latency, and cost
   gates pass.

## MVP Delivery Boundary

The target model supports later expansion, but the first implementation boundary is one secure pilot
domain. Spec 014's MVP is complete when it provides:

- durable source versions, one versioned canonical map, stable nodes and typed edges, bindings,
  derived evidence health, explicit audience memberships, and transactional map audit records;
- a transaction-capable database port plus revisioned Postgres session transitions that prevent
  double proposal consumption and lost overlay updates;
- a structured RAG draft from reviewed pilot sources, server validation, human admin review, atomic
  publish, version history, and rollback;
- the uninitialized -> preview -> explicit-create flow and a stable authorized role/goal projection;
- root hydration, map search, node detail, source links, feedback, node-aware grounded chat,
  citations, focus mapping, and appropriate abstention;
- per-read authorization and fail-closed handling for published, legacy guide, and historical chat
  content;
- the spatial canvas plus a keyboard-operable outline view;
- feature-flagged legacy compatibility, Postgres readiness enforcement, negative access tests, and
  the pilot evaluation.

Rich visual steward editing, automated conflict resolution, owner notifications, ongoing AI update
suggestions, delegated steward permissions, cross-version visual diff, and learner-driven rebase are
later rollout gates. They remain governed by this target design but do not block the MVP pilot.

## Implementation Strategy

1. Add durable source versions plus canonical map, version, node, edge, source-binding, evidence
   health, audience-membership, suggestion, feedback, and transactional audit persistence.
2. Add shared canonical-map, session-overlay, proposal, detail, freshness, and API contracts.
3. Implement per-request audience resolution and use it consistently in pgvector and map services.
4. Add draft generation, structured-output validation, basic admin review, preview, publish,
   rollback, and audit services.
5. Add deterministic projection and compatibility adapters from canonical maps to `GuideGraph`.
6. Add node-aware two-lane retrieval, evidence hydration, abstention, and focus-node mapping.
7. Add learner node inspection, typed relationships, version update, and accessible outline UI.
8. Add the basic admin map workspace, feedback queue, and freshness review workflow.
9. Run the pilot evaluation and enable each rollout phase only after its gates pass.

## Implementation Checklist

- [x] Add this spec to `specs/README.md` as `014` with `Proposed` status.

### MVP

- [ ] Define source, source-version, canonical map, version, node, edge, binding, evidence-health,
      audience-membership, suggestion, feedback, and transactional-audit migrations.
- [ ] Add a connection-bound transaction callback to the database port and repository adapters.
- [ ] Add session revisions and atomic compare-and-swap guide transitions.
- [ ] Require Postgres, `SESSION_STORE=postgres`, and successful map migrations when the
      published-map flag is enabled.
- [ ] Update ingestion to write immutable source versions and stable section identities before
      linked chunks.
- [ ] Add stable keys and immutable published-version behavior.
- [ ] Add the uninitialized, legacy-generated, and published-map guide-state union.
- [ ] Persist ordered projected node keys and server-issued proposals in the correct guide state.
- [ ] Add map-projection, node-detail, evidence-health, search, feedback, and audit contracts.
- [ ] Replace direct `guide.nodes` reads with discriminated repository and API helpers.
- [ ] Preserve accurate session serialization, selection updates, and `guideNodeCount` for every
      guide-state variant.
- [ ] Resolve audience scopes from authenticated users and tenants per request.
- [ ] Add server-owned account-to-audience memberships; learner filters cannot grant access.
- [ ] Apply authorization consistently to map topology, bindings, chunks, snippets, and answers.
- [ ] Persist citation references instead of copied excerpts for new assistant messages.
- [ ] Add per-read authorization and fail-closed redaction for historical chat and legacy maps.
- [ ] Add structured RAG map-proposal generation from reviewed source sets.
- [ ] Validate graph integrity, grounding, freshness, ownership, audience, and payload limits.
- [ ] Add draft persistence, optimistic concurrency, publish, rollback, and transactional audit
      logic.
- [ ] Add stable source/section bindings that survive re-chunking.
- [ ] Add derived evidence-health calculation and source-refresh stale/missing review queues.
- [ ] Add deterministic role/goal projection from published stable keys and edges.
- [ ] Replace ungrounded fallback maps with explicit coverage-gap behavior.
- [ ] Persist pending map projections so workspace reload preserves them.
- [ ] Support discriminated legacy and published requests on the create-map route.
- [ ] Hydrate uninitialized, published, and legacy state through the existing root-guide route.
- [ ] Add node-aware authoritative and hybrid retrieval lanes.
- [ ] Add grounding thresholds, citation validation, controlled-content rules, and abstention.
- [ ] Add typed-edge rendering and canonical-node focus mapping.
- [ ] Add the learner node inspector, evidence/freshness display, and source actions.
- [ ] Add authorized map search and a non-leaking zero-result state.
- [ ] Add learner feedback submission and a basic admin review queue.
- [ ] Add an accessible outline/list equivalent to the spatial map.
- [ ] Add the basic admin draft, evidence, audience-preview, publish, rollback, and review UI.
- [ ] Add AI usage operations and fee reporting for proposal, projection, and refresh work.
- [ ] Add evaluation fixtures for node relevance, source citations, abstention, and audience isolation.
- [ ] Add negative tests proving inaccessible topology and source metadata never leak.
- [ ] Add tests for graph validation, immutable versions, concurrency, rollback, stale detection, and
      re-chunk-safe bindings.
- [ ] Add tests for source-version transactions and atomic publication audit.
- [ ] Add concurrent proposal/create/overlay tests proving stale revisions cannot overwrite state.
- [ ] Add tests for projection determinism, state transitions, legacy compatibility, and proposal
      persistence.
- [ ] Add tests for session list/get/update serialization and historical-answer revocation.
- [ ] Add tests for node-aware chat, focus-node mapping, source hydration, and web-source separation.
- [ ] Add learner and steward accessibility and keyboard-navigation tests.
- [ ] Update `README.md` and `docs/production-readiness.md` after implementation.
- [ ] Verify `npm run lint`.
- [ ] Verify `npm test`.
- [ ] Verify `npm run build`.

### Later Rollout Phases

- [ ] Add rich visual steward editing and cross-version graph diff.
- [ ] Add explicit learner rebase preview and stable-key migration behavior.
- [ ] Add automated conflict analysis, owner notifications, and ongoing RAG update suggestions.
- [ ] Add explicit delegated map-steward capabilities if administration must extend beyond admins.

## MVP Acceptance Criteria

- An admin can use RAG over reviewed pilot sources to create a structured draft, see validation and
  evidence, make a human publication decision, and atomically publish or roll back an immutable map
  version with its audit record.
- A learner can create a role- or goal-specific onboarding map from an accessible published version
  without generating or storing a parallel user manual.
- The published map contains stable semantic nodes and typed relationships, not source titles with
  generic children.
- Every learner-visible company-specific node claim has current authorized evidence, or the product
  displays an explicit missing, stale, or coverage-gap state and does not fill the gap.
- A learner can select a node, ask a scoped question, receive a cited answer, focus related map
  nodes, and open the controlling source.
- A learner can search accessible map nodes, receive a non-leaking zero-result state, and report a
  node or answer problem to the admin review queue.
- The spatial map has a keyboard-operable outline that exposes the same authorized nodes, details,
  relationships, and actions.
- Search, chat, source refresh, and learner actions cannot mutate canonical topology.
- AI-proposed nodes, edges, and bindings cannot reach learners until an authorized admin reviews and
  publishes a new immutable version.
- Role and goal personalization changes only the session overlay and uses published stable keys and
  edges; it cannot add an access scope.
- New sessions follow the persisted `uninitialized` -> proposal preview -> explicit create ->
  `published_map` transition, and a reload cannot lose or implicitly accept the proposal.
- Re-chunking a source does not break its stable map binding.
- Source changes create immutable source versions and reviewable stale or missing-evidence health
  without silently rewriting a published map.
- Permission changes immediately remove unauthorized nodes, edges, snippets, source metadata, and
  historical answers from every session response, including sessions pinned to older versions.
- Authorized, verifiable legacy generated maps remain readable during migration; unresolvable or
  revoked legacy content fails closed and is never treated as canonical knowledge.
- The feature remains disabled without Postgres sessions and a transaction-capable map repository,
  and fails readiness when enabled without the required migrations and guarantees.
- Tests cover source-version transactions, guide-state serialization, draft validation, audience
  preview, publication/audit atomicity, version history, rollback, proposal persistence, historical
  redaction, and negative access cases.
- Concurrent chat, proposal, create-map, and overlay updates cannot consume a proposal twice or
  overwrite a newer session revision.
- The pilot evaluation improves authoritative-source discovery or representative onboarding-task
  success over the current baseline without reducing groundedness or access-control quality.
- Lint, tests, and production build pass after implementation.

## Later Phase Exit Criteria

- Learners can preview and explicitly rebase to a newer map version while preserving valid overlay
  state through scoped stable-key resolution.
- Admins can compare graph versions visually and review automated source-change suggestions without
  allowing automatic publication.
- Conflicting authoritative evidence and freshness breaches create owner notifications and tracked
  resolution work.
- Delegated map stewards, if introduced, receive only explicit server-owned capabilities and cannot
  broaden learner audiences.
