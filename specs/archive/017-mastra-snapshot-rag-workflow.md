# Mastra Snapshot-Based RAG Workflow Spec

## Status

Proposed. This document defines a future implementation and does not authorize code, dependency,
database, or deployment changes.

## Goal

Use Mastra to orchestrate a governed RAG workflow with exactly three top-level partitions:

1. **Input refinement** resolves ambiguous references, replaces pronouns with explicit entities,
   unifies terms, and decides whether the request has enough context to continue.
2. **Plan module** sets the goal, checks retrieved context, chooses how to achieve the goal and
   records why, creates checkpoints, and corrects only a failed plan phase.
3. **Run module** executes the approved plan through registered scripts or tools and verifies each
   phase.

Every run must use Mastra workflow state and persisted snapshots for recovery and revision. A
failure must not restart the full workflow by default. The system retries only a transiently failed
phase or revises and re-runs that failed phase plus any now-invalid dependent phases.

The workflow must remain grounded in authorized source content, expose concise decision rationale,
and produce an audit trail without storing private chain-of-thought.

## Current Repo Findings

- The application is a TypeScript monorepo with a Next.js App Router server, layered
  controller/service/DTO modules, Prisma, PostgreSQL, and optional pgvector retrieval.
- Mastra is not currently installed or configured.
- `RagService` currently builds one or two query variants and calls seed knowledge, pgvector, input
  adapters, and optional web search. It records an in-memory retrieval trace but does not refine
  input, create an execution plan, suspend for missing context, or recover a failed phase.
- `ChatService` and `AskService` call `RagRetriever` directly and then call `AnswerProvider`. They
  do not have a durable workflow boundary.
- `PgvectorKnowledgeBase` filters by access scopes supplied when the application container is
  created. The filter is globally configured rather than derived from the authenticated user for
  each retrieval. A workflow must not widen this existing boundary.
- The repository already has authoritative source/version models, knowledge-map evidence bindings,
  and source metadata such as `sourceId`, `sourceVersionId`, `sectionKey`, and `accessScope`.
- `RagSourceSnapshot` and `scripts/rag-reindex-snapshots.ts` concern captured source content. They
  are not workflow execution snapshots and must not be reused or renamed to hold Mastra state.
- `createAppContainer()` already uses a `globalThis` singleton to survive Next.js development hot
  reloads. Mastra storage and the Mastra instance need the same singleton lifecycle.
- Existing scripts such as `rag-ingest` and `rag-reindex-snapshots` are administrative operations.
  They must not become generally callable learner tools merely because the run module can invoke
  scripts.

## Problem

The current request path retrieves evidence and produces an answer in one pass. Pronouns can refer
to the wrong entity, synonymous product terms can generate fragmented retrieval, missing
parameters are discovered late, and a model response does not explain which execution approach was
selected.

A single opaque agent loop would make recovery worse. If the final tool call fails, restarting the
agent may repeat retrieval, planning, and earlier mutations. It may also choose a different goal or
repeat a non-idempotent operation.

The workflow needs durable, typed boundaries so it can:

- pause when the request is incomplete;
- resume from persisted state after a process restart;
- retrieve the evidence and decision state for inspection;
- revise only the incorrect portion of a plan;
- retry only the failed execution phase;
- avoid repeating successful side effects; and
- reconstruct what was requested, chosen, executed, corrected, and verified.

## Product And Architectural Decisions

### Mastra Is The Orchestrator

Mastra owns workflow composition, typed step boundaries, state, suspend/resume, retry configuration,
streaming events, snapshots, and time travel. Existing application services remain the domain
implementation behind typed Mastra tools.

Mastra does not replace:

- the existing ingestion pipeline;
- `KnowledgeChunk` or the current pgvector index;
- source/version and knowledge-map governance;
- request authentication and application authorization;
- Prisma as the application data layer; or
- the existing answer-provider abstraction during the initial migration.

The first implementation wraps the existing RAG and knowledge-map services as Mastra tools. A
future migration to Mastra-native vector query helpers is optional and must not change provenance
or authorization contracts.

### Three Nested Partitions

The registered parent workflow is `onboarding-rag-action-v1`. It composes three versioned nested
workflows:

```text
onboarding-rag-action-v1
  input-refinement-v1
  plan-module-v1
  run-module-v1
```

Nested partitions provide stable schemas, focused tests, visible boundaries in Mastra Studio, and
addressable paths for time travel such as `plan-module-v1.correct-phase` or
`run-module-v1.execute-phase`.

The graph definition is static. Model output supplies data to the graph; it never creates
executable workflow code, imports, tool registrations, or arbitrary step names.

### Execution Semantics Are At-Least-Once

Snapshots make recovery durable but cannot make an external side effect exactly once. Every
side-effecting tool therefore requires an idempotency key. The executor uses:

```text
<workflowRunId>:<phaseId>:<phaseRevision>
```

The key remains unchanged during retries of the same phase revision. A corrected phase increments
`phaseRevision`. A successful phase is written to the completed-phase ledger before another phase
is selected. A crash after an external side effect but before the checkpoint is safe only when the
external adapter honors the idempotency key or can reconcile the prior result.

Tools that cannot be idempotent must require a human checkpoint and expose a reconciliation
operation. The workflow must never claim an exactly-once guarantee.

## Non-Goals

- Giving the model arbitrary shell, SQL, filesystem, network, or package-install access.
- Making every existing chat response a side-effecting autonomous action.
- Replacing authoritative company documents with generated plans or summaries.
- Allowing retrieved text to register, select, or change tool permissions.
- Re-running the entire workflow after a local phase failure.
- Automatically compensating or rolling back a completed side effect. Compensation is a separate,
  explicit, authorized, and audited phase.
- Storing private chain-of-thought. The audit stores inputs, evidence references, selected choices,
  concise rationales, outputs, errors, and revisions.
- Treating a mutable workflow snapshot as the immutable audit ledger.
- Using the experimental Mastra Temporal integration in the first implementation.

## Workflow Contracts

All step input, output, suspend, resume, and workflow-state contracts must use Zod schemas. Unknown
fields are rejected at external boundaries.

### Authenticated Start Input

The client may provide:

```ts
interface RagWorkflowStartInput {
  sessionId: string;
  message: string;
  referencedNodeId?: string;
  webSearchEnabled?: boolean;
  clientRequestId: string;
}
```

The server supplies `ownerId`, account role, tenant, allowed access scopes, request ID, and policy
flags through trusted request context. The workflow must never trust a client-supplied owner,
tenant, role, scope, tool name, script name, or approval state.

`clientRequestId` is unique per owner and session. Repeating it returns the existing run instead of
starting a duplicate.

### Shared Workflow State

The workflow state is JSON-serializable and contains only bounded artifacts or references:

```ts
interface RagWorkflowState {
  workflowVersion: 'onboarding-rag-action-v1';
  runId: string;
  sessionId: string;
  actorRef: string;
  currentPartition: 'refinement' | 'plan' | 'run' | 'complete';
  status: 'running' | 'suspended' | 'failed' | 'completed';
  refinement?: RefinedRequest;
  plan?: ExecutionPlan;
  execution: {
    completedPhases: CompletedPhaseRecord[];
    failedPhase?: FailurePacket;
    correctionCount: number;
  };
  budgets: {
    retrievalCalls: number;
    modelCalls: number;
    toolCalls: number;
  };
}
```

`actorRef` is an internal stable identifier. Authorization is reloaded from the database at resume
and immediately before every side-effecting tool; a snapshot of old permissions never grants
continued access.

Large excerpts, embeddings, document bodies, binary output, credentials, raw tokens, and tool
process streams are not stored in workflow state. Store evidence references, artifact IDs, content
hashes, and bounded summaries, then resolve the content after a fresh authorization check.

## Partition 1: Input Refinement

### Purpose

Turn the user's conversational input into an explicit, canonical request without changing its
intent. This partition can retrieve bounded conversational and domain context, but it cannot
execute business actions.

### Step Sequence

1. `load-authorized-input-context`
   - Load a bounded window of session messages.
   - Resolve the selected or referenced knowledge-map node.
   - Load the approved terminology glossary and aliases.
   - Load current user scopes and relevant policy flags.
   - Return references rather than unrestricted session or document dumps.
2. `resolve-pronouns-and-references`
   - Replace pronouns and anaphoric phrases with explicit entities when the referent is supported
     by the current message, referenced node, or bounded conversation.
   - Examples: “it” becomes “the Wayfinder onboarding checklist”; “they” becomes “the People Team.”
   - Do not rewrite quoted text, source excerpts, personal names, or legally significant wording.
   - Record every replacement as `{ original, replacement, evidenceRef, confidence }`.
   - If two or more plausible referents remain, mark the field unresolved instead of guessing.
3. `unify-terms`
   - Map user terms to approved canonical terms using the glossary and knowledge-map stable keys.
   - Preserve the original phrase alongside the canonical phrase.
   - Do not collapse distinct policy, system, role, or product concepts merely because they are
     lexically similar.
   - Unknown terms remain unchanged and are flagged for later retrieval.
4. `assess-context-completeness`
   - Infer the intent class: answer-only, navigation, draft, or executable action.
   - Evaluate required fields for that intent and likely tool family.
   - Detect missing targets, time range, desired output, constraints, approval, or success criteria.
   - Detect contradictions between the request and current authorized context.
5. `refinement-checkpoint`
   - If incomplete or ambiguous, call `suspend()` with structured questions and a reason code.
   - On `resume()`, merge only the supplied clarification, increment `refinementRevision`, and
     re-run the unresolved refinement steps. Do not restart prior retrieval that remains current.
   - If complete, persist the refined artifact and continue to the plan module.

### Output

```ts
interface RefinedRequest {
  revision: number;
  originalInputHash: string;
  canonicalRequest: string;
  intent: 'answer' | 'navigate' | 'draft' | 'execute';
  resolvedReferences: Array<{
    original: string;
    replacement: string;
    evidenceRef: string;
    confidence: number;
  }>;
  termMappings: Array<{
    original: string;
    canonical: string;
    glossaryRef?: string;
  }>;
  knownContextRefs: string[];
  missingFields: string[];
  assumptions: string[];
  status: 'ready' | 'needs_input';
}
```

### Refinement Rules

- A low-confidence replacement is a clarification request, not an assumption.
- Company-specific facts require authorized evidence.
- Generic grammatical expansion may use the model, but entity resolution must cite the message,
  node, glossary, or source reference that supports it.
- Clarification cycles are bounded. After three incomplete resumes, suspend for explicit user
  intervention with the unresolved fields; do not continue with guessed values.

## Partition 2: Plan Module

### Purpose

Convert the refined request into a finite, evidence-backed execution plan. The plan explains the
goal, what context was checked, which approach was selected, how it will run, why that approach was
chosen, and how success will be verified.

### Step Sequence

1. `set-goal`
   - Produce one goal statement, measurable success criteria, constraints, and non-goals.
   - Preserve the user's requested outcome; do not expand scope to adjacent actions.
2. `check-context`
   - Generate bounded, purpose-specific retrieval queries from the refined request.
   - Invoke the authorized RAG tool using current actor scopes.
   - Resolve source IDs to current source versions and record section keys.
   - Separate authoritative company sources from supplemental web sources.
   - Score sufficiency, freshness, conflicts, and missing coverage.
   - Suspend if a required company fact has no current authorized evidence or a controlling source
     conflicts with another controlling source.
3. `make-choice`
   - Compare only feasible, policy-allowed approaches.
   - Select one approach and record `how`, a concise `why`, evidence references, constraints, and
     concise reasons for rejecting meaningful alternatives.
   - The rationale is a decision summary, not hidden chain-of-thought.
4. `build-phase-plan`
   - Create stable phase IDs, dependencies, typed inputs and outputs, allowed tool references,
     preconditions, success checks, retry classification, impact, and approval requirements.
5. `validate-plan`
   - Reject cycles, missing dependencies, unknown tools, unbounded loops, unauthorized tools,
     invalid schemas, unsupported script arguments, missing success checks, and non-idempotent
     side effects without a checkpoint.
   - Ensure every company-specific execution claim has an evidence reference.
6. `plan-checkpoint`
   - Persist `planRevision`, the decision summary, evidence references, and plan hash.
   - Suspend for approval when a phase is destructive, externally visible, privileged,
     non-idempotent, or explicitly configured for human review.
   - Read-only and pre-approved low-impact plans may continue automatically.
7. `correct-phase`
   - Accept a `FailurePacket` from the run module.
   - Revise the failed phase only, preserving its stable `phaseId` and incrementing
     `phaseRevision`.
   - Preserve all completed independent phases.
   - Invalidate only unexecuted descendants whose inputs or assumptions depend on the revised
     output.
   - Re-run `check-context`, `make-choice`, and `validate-plan` only for the failed phase and its
     invalidated descendants.
   - Append a plan revision event containing the reason, before/after hashes, changed fields, and
     affected phase IDs.

### Plan Output

```ts
interface ExecutionPlan {
  planId: string;
  revision: number;
  goal: {
    statement: string;
    successCriteria: string[];
    constraints: string[];
    nonGoals: string[];
  };
  contextAssessment: {
    sufficient: boolean;
    evidenceRefs: string[];
    conflicts: string[];
    missingCoverage: string[];
  };
  choice: {
    approach: string;
    how: string;
    why: string;
    evidenceRefs: string[];
    rejectedAlternatives: Array<{ approach: string; reason: string }>;
  };
  phases: PlanPhase[];
  planHash: string;
}

interface PlanPhase {
  phaseId: string;
  phaseRevision: number;
  title: string;
  dependsOn: string[];
  toolId: string;
  input: Record<string, unknown>;
  expectedOutputSchemaRef: string;
  preconditions: string[];
  successChecks: string[];
  evidenceRefs: string[];
  impact: 'read_only' | 'reversible' | 'externally_visible' | 'destructive';
  approval: 'none' | 'user' | 'admin';
  retryPolicy: 'never' | 'transient_only';
}
```

### Plan Correction Rules

- A correction cannot silently change the top-level goal.
- A changed goal starts a new plan revision and requires a new plan checkpoint.
- A successful phase is never changed to pending by default.
- If a completed phase's output is incompatible with the corrected phase, suspend and propose an
  explicit compensation or follow-up phase. Do not silently repeat or undo it.
- A full replan is allowed only when the user changes the goal or global context invalidates every
  phase. Even then, the completed-phase ledger remains authoritative and prevents repeated side
  effects.

## Partition 3: Run Module

### Purpose

Execute the checked plan through typed, registered tools or script adapters. Planning text is data;
only the server-owned registry can map a `toolId` to executable code.

### Static Execution Loop

The run module uses a static loop:

```text
preflight
  -> select-next-phase
  -> phase-checkpoint-before
  -> execute-phase
  -> verify-phase
  -> phase-checkpoint-after
  -> while pending phases remain
  -> synthesize-result
```

`select-next-phase` chooses a pending phase whose dependencies are complete. It never accepts a raw
tool implementation from model output.

### Tool Registry

Every registry entry defines:

```ts
interface WorkflowToolDefinition {
  id: string;
  inputSchema: unknown;
  outputSchema: unknown;
  allowedRoles: Array<'user' | 'admin'>;
  impact: 'read_only' | 'reversible' | 'externally_visible' | 'destructive';
  idempotency: 'required' | 'supported' | 'not_applicable';
  timeoutMs: number;
  execute(input: unknown, context: AuthorizedToolContext): Promise<unknown>;
  verify?(output: unknown, context: AuthorizedToolContext): Promise<ToolVerification>;
}
```

Initial tool families are:

- authorized RAG retrieval backed by `RagService` and per-request access scopes;
- published knowledge-map lookup, search, and node-detail retrieval;
- grounded answer or draft generation through `AnswerProvider`;
- explicitly approved session operations with optimistic revision checks; and
- admin-only wrappers for approved maintenance scripts.

There is no generic `shell`, `exec`, `sql`, `fetch-any-url`, `read-any-file`, or `run-script` tool.

### Script Adapter Rules

An approved script adapter:

- maps one fixed tool ID to one repository-owned entry point;
- validates arguments with a dedicated schema;
- passes arguments as an array with shell interpretation disabled;
- uses an explicit working directory and environment allowlist;
- sets a timeout and bounded stdout/stderr capture;
- never forwards credentials, arbitrary environment variables, globs, redirects, or command
  fragments from model output;
- checks actor role and required human approval immediately before start;
- records script version/commit, argument hash, exit code, duration, and bounded output hash; and
- implements a dry-run mode when the underlying operation supports it.

The existing `rag:ingest` and `rag:reindex-snapshots` scripts remain admin-only and disabled from
interactive workflows until separate operational approval enables their adapters.

### Phase Execution And Verification

Before each phase:

- reload the actor and access scopes;
- verify that the plan revision and phase revision are current;
- revalidate tool permission and approval;
- resolve evidence references against current source versions;
- ensure dependencies are in the completed ledger; and
- write the pre-execution checkpoint and idempotency key.

After each phase:

- validate the output schema;
- run declared deterministic checks and the tool verifier;
- store an artifact reference and bounded result summary;
- append an audit event; and
- add the phase to the completed ledger before choosing another phase.

The final result includes the goal, completed phases, generated artifact references, evidence
references, corrections, unresolved warnings, and user-safe errors. It does not expose credentials,
raw process output, hidden prompts, or chain-of-thought.

## Retry, Replan, And Recovery Policy

Failures are classified before a recovery action:

| Failure class          | Examples                                                     | Recovery                                                                |
| ---------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Transient              | timeout, rate limit, temporary provider outage               | Mastra step retry for the same phase and idempotency key                |
| Plan defect            | wrong tool, missing parameter, invalid phase assumption      | time travel to `plan-module-v1.correct-phase`; revise failed phase only |
| Verification failure   | tool returned but postcondition failed                       | correct the failed phase or add an explicit follow-up phase             |
| Context gap            | missing source, ambiguous target, stale controlling evidence | suspend and request input or source-owner action                        |
| Authorization/policy   | scope removed, approval denied, tool forbidden               | suspend or fail; never auto-retry                                       |
| Unexpected code defect | schema invariant or unclassified exception                   | fail safely, audit, and allow operator time travel after review         |

Transient retries are bounded to three attempts with delay/backoff supported by the pinned Mastra
version. A retry increments `attempt` but not `phaseRevision` and does not repeat completed phases.

When automatic retries are exhausted, the orchestration service inspects the failed step in the
Mastra result:

- retryable after operator/provider recovery: `timeTravel()` to
  `run-module-v1.execute-phase` with the saved phase input;
- plan defect: `timeTravel()` to `plan-module-v1.correct-phase` with a `FailurePacket`;
- missing input or approval: resume the suspended checkpoint; or
- terminal defect: leave the run failed with the snapshot available for inspection.

```ts
interface FailurePacket {
  runId: string;
  planRevision: number;
  phaseId: string;
  phaseRevision: number;
  failureClass:
    | 'transient'
    | 'plan_defect'
    | 'verification'
    | 'context_gap'
    | 'authorization'
    | 'unexpected';
  errorCode: string;
  safeMessage: string;
  inputHash: string;
  outputHash?: string;
  completedPhaseIds: string[];
  evidenceRefs: string[];
}
```

Correction is bounded to three revisions per phase. Exceeding the bound suspends for human review.

## Snapshot, Revision, And Audit Design

### Mastra Workflow Snapshots

Configure Mastra with persistent PostgreSQL storage. Mastra snapshots capture run input, step
statuses and outputs, execution paths, retry state, suspension metadata, workflow state, and the
run ID. They are used to:

- resume input clarification or approval checkpoints;
- recover after a process restart;
- retrieve the state that produced a plan or failure;
- time travel to a failed execution or correction step; and
- compare plan revisions during investigation.

All snapshot data must be JSON-serializable and bounded. Evidence content is represented by
versioned references rather than copied document bodies.

### Checkpoint Policy

Logical checkpoints occur:

1. after refinement is ready;
2. after plan validation and choice recording;
3. immediately before every side-effecting phase;
4. after every verified phase;
5. whenever the workflow suspends;
6. before and after a plan correction; and
7. at terminal success or failure.

Mastra's persisted workflow state supports recovery. `suspend()` creates the durable boundary when
human input, approval, or external action is required. Time travel uses the stored snapshot to
reconstruct earlier successful steps and starts execution at the selected static step.

### Storage Isolation

Use the existing PostgreSQL server but a dedicated schema such as `mastra_workflow`. Configure
`PostgresStore` with `schemaName` so Mastra tables do not collide with Prisma-managed application
tables or the existing `rag_source_snapshots` table.

Production runtime must not perform uncontrolled schema mutation. Pin compatible Mastra package
versions, provision or upgrade the Mastra schema in an explicit deployment step, and start the
runtime with automatic initialization disabled after readiness is confirmed. Development may use
controlled initialization.

The Mastra instance, `PostgresStore`, and any dedicated `pg.Pool` use a `globalThis` singleton in
Next.js development to prevent duplicate instances during hot reload.

### Application Run Projection

Mastra storage is the execution-state source. Add an application-owned run projection in a future
Prisma migration so authorization and product queries do not depend on reading Mastra's internal
tables directly:

```text
rag_workflow_runs
  run_id
  workflow_version
  session_id
  owner_id
  client_request_id
  status
  current_partition
  plan_revision
  created_at
  updated_at
  completed_at
  safe_error_code
```

Ownership checks use this projection before loading, resuming, correcting, or time traveling a run.
A run ID alone is never authorization.

### Immutable Audit Events

Workflow snapshots are mutable recovery artifacts and may contain state that is later revised.
Audit therefore uses an append-only application table:

```text
rag_workflow_audit_events
  id
  run_id
  actor_user_id
  event_type
  partition
  step_id
  phase_id
  plan_revision
  event_at
  reason_code
  evidence_refs
  input_hash
  output_hash
  metadata
```

Required events include run start, partition start/complete/suspend, refinement replacement,
clarification, retrieval, goal set, choice made, plan checkpoint, approval, phase start/retry/
complete/fail, correction, time travel, resume, and terminal result.

The audit event records concise user-facing rationale and references to the relevant run and
artifacts. It must not record private chain-of-thought, secrets, full source bodies, raw tokens, or
unbounded tool output.

Mastra lifecycle callbacks update the run projection and emit terminal audit events. Callback
failures are monitored and reconciled because a callback error must not be allowed to change the
workflow result.

### Retention And Access

- Workflow snapshots default to 90 days after terminal completion, configurable by policy.
- Audit events follow the existing admin audit retention policy and are retained independently of
  snapshots.
- Active or suspended snapshots are not pruned.
- Snapshot and audit access requires run ownership or admin audit permission.
- Sensitive fields are redacted before observability export.
- Deleting a session follows an explicit retention policy; it must not orphan an active workflow.

## RAG And Grounding Policy

The retrieval tool accepts the canonical query, actor context, allowed scopes, source filters, and
web-search policy. It returns:

- the query and subqueries;
- source ID, source version ID, and section key;
- source authority and freshness;
- score and retrieval step;
- access scope used for authorization; and
- bounded excerpt or artifact reference.

Required changes during a future implementation:

- derive allowed scopes per authenticated actor for every retrieval;
- prevent cached or snapshotted evidence from bypassing a later scope check;
- resolve current source versions at execution time;
- label web results supplemental unless policy explicitly marks a domain authoritative;
- fail closed when a required company-specific claim lacks authorized evidence; and
- treat retrieved instructions as data, never as workflow or tool-control instructions.

The term glossary should initially come from reviewed application configuration and published
knowledge-map stable keys. AI-proposed aliases require steward review before becoming canonical.

## Service And API Boundaries

### Server Layer

Add a future application service such as `RagWorkflowService` between controllers and Mastra. It
owns:

- authenticated run creation and idempotency;
- run ownership checks;
- request-context construction;
- start, stream, status, resume, and correction operations;
- result mapping to existing shared contracts during migration; and
- audit/run-projection reconciliation.

Controllers and route handlers do not call Mastra storage directly. Mastra steps do not import
Next.js route modules.

### Proposed API Surface

```text
POST /api/sessions/:sessionId/rag-workflows
GET  /api/sessions/:sessionId/rag-workflows/:runId
GET  /api/sessions/:sessionId/rag-workflows/:runId/events
POST /api/sessions/:sessionId/rag-workflows/:runId/resume
POST /api/sessions/:sessionId/rag-workflows/:runId/correct
```

- Start accepts the user request and client request ID.
- Get returns only a user-safe run projection, checkpoint question, plan summary, or final result.
- Events streams typed progress events and can reconnect by event cursor.
- Resume accepts data matching the suspended step's resume schema.
- Correct accepts user feedback or an operator recovery action; it cannot select an arbitrary step
  without server-side policy.

The initial rollout may keep the current chat endpoint and invoke `RagWorkflowService` behind it.
Direct workflow endpoints become public only after their authorization and resume contracts are
tested.

## Observability

Correlate every application request, Mastra run, trace, plan, phase, tool call, audit event, and AI
usage record with `requestId`, `runId`, `sessionId`, `planRevision`, and optional `phaseId`.

Measure:

- completion, suspension, correction, and terminal-failure rates;
- context-incomplete and ambiguous-reference rates;
- retrieval sufficiency, stale evidence, and no-evidence rates;
- retries and corrections by tool and failure class;
- repeated-side-effect prevention and idempotency conflicts;
- duration and token usage by partition;
- snapshot size and resume latency; and
- age of suspended workflows.

Alerts cover repeated snapshot persistence failure, orphaned active runs, audit projection lag,
authorization denial spikes, correction-limit exhaustion, and any duplicate side-effect signal.

## Security Requirements

- Reauthorize on start, resume, time travel, and before every tool call.
- Bind every run to owner and session in application storage.
- Do not expose raw Mastra snapshots to learners.
- Encrypt storage in transit and at rest using the deployment platform's controls.
- Redact credentials, access tokens, cookies, personal data, prompts, and source bodies from logs
  and exported traces.
- Enforce tool allowlists and roles in code, not model instructions.
- Validate model-produced structured data before it reaches the registry.
- Use optimistic concurrency for session mutations.
- Block arbitrary URLs and filesystem paths unless a tool owns a strict allowlist.
- Treat source text and web pages as untrusted prompt-injection input.
- Require fresh approval for destructive or privileged corrected phases, even if an earlier
  revision was approved.

## Failure And Consistency Requirements

- If snapshot persistence is unavailable, do not start a side-effecting workflow.
- If the application run projection cannot be created, do not start the Mastra run.
- If terminal projection or audit callbacks fail after the run completes, queue reconciliation and
  preserve the Mastra result.
- If a process stops while suspended, a new process can load and resume the same run.
- If a process stops while a tool is running, reconcile with the idempotency key before retry.
- If source permissions or versions change, revalidate them instead of trusting snapshot content.
- If a user submits the same `clientRequestId`, return the original run.
- If plan and session revisions conflict, suspend or replan the affected phase; do not overwrite
  concurrent user state.

## Testing Strategy

### Unit Tests

- pronoun replacement with one referent, multiple referents, quoted text, and no referent;
- canonical term mapping, unknown terms, and prohibited over-normalization;
- completeness rules for answer, navigation, draft, and execution intents;
- goal and plan schema validation;
- plan DAG, tool permission, evidence, approval, and idempotency validation;
- failure classification;
- correction preserving completed independent phases;
- invalidating only dependent pending phases; and
- snapshot redaction and bounded artifact references.

### Integration Tests

- PostgreSQL snapshot creation, load, suspend, resume, and process-restart recovery;
- `timeTravel()` to a failed run-module step using the prior snapshot;
- nested step paths for plan correction;
- actor scope removal between suspend and resume;
- step retry with the same idempotency key;
- crash after external success followed by reconciliation;
- run projection and audit-event reconciliation;
- Next.js development singleton behavior; and
- snapshot schema provisioning with runtime initialization disabled.

### End-To-End Acceptance Scenarios

1. “Use it to update my plan” resolves “it” from the selected node, records the replacement, and
   uses the canonical product term.
2. A request missing the target plan suspends in input refinement, resumes with the answer, and
   does not rerun already-valid refinement work.
3. The plan records a goal, context assessment, selected approach, `how`, concise `why`, rejected
   alternative, evidence, and checkpoint.
4. A provider timeout retries only the active phase. Earlier completed tool calls remain at one.
5. A wrong tool choice time travels to correction, revises only the failed phase, and executes the
   corrected phase without re-running refinement or successful phases.
6. A failed verification revises the affected phase and invalidates only its pending descendants.
7. A server restart resumes a suspended run from PostgreSQL snapshots.
8. An administrator can reconstruct replacements, sources, choices, approvals, calls, retries,
   corrections, and results from audit events without viewing chain-of-thought.
9. Another user cannot read, resume, correct, or time travel the run by knowing its ID.
10. A required company-specific action with no authorized current evidence suspends or fails
    closed instead of generating an ungrounded plan.

## Rollout Plan

### Phase 1: Foundation

- Pin mutually compatible stable versions of `@mastra/core`, `@mastra/pg`, and required logging
  packages.
- Create the isolated Mastra PostgreSQL schema and controlled provisioning step.
- Add the Mastra singleton, workflow schemas, run projection, and append-only audit events.
- Add read-only authorized RAG and knowledge-map tools.

### Phase 2: Shadow Planning

- Run refinement and planning behind a feature flag while the current chat response remains the
  user-visible result.
- Compare canonical queries, source selection, context sufficiency, plan quality, latency, and
  cost.
- Do not invoke side-effecting tools.

### Phase 3: Read-Only Execution

- Enable answer, navigation, and draft tools.
- Exercise suspend/resume, time travel, retries, corrections, event streaming, and process recovery.

### Phase 4: Controlled Mutations

- Add one reversible, idempotent session tool.
- Require user approval and enforce optimistic concurrency.
- Validate duplicate prevention and audit reconstruction before expanding the registry.

### Phase 5: Privileged Script Adapters

- Add only explicitly approved administrative adapters.
- Keep them admin-only with a dry run and human checkpoint.
- Do not enable a general script runner.

Rollback at every phase disables new run creation while preserving status, resume, export, and
audit access for existing runs.

## Acceptance Criteria

The proposal is complete when a future implementation demonstrates:

- one parent Mastra workflow with the three named partitions;
- typed schemas at every workflow and tool boundary;
- explicit reference resolution, term unification, and completeness suspension;
- goal, context check, approach choice, `how`, concise `why`, validation, and plan checkpoint;
- tool/script execution only through a server-owned registry;
- durable PostgreSQL snapshots and restart-safe suspend/resume;
- time travel to a failed or correction step;
- transient retry of only the failed phase;
- correction of only the failed phase and dependent pending phases;
- no repeat of successful side effects in recovery tests;
- per-request authorization and source-scope enforcement;
- an immutable, redacted audit trail linked to run and plan revisions; and
- no regression to existing source provenance or knowledge-map governance.

## Mastra References

This design relies on the current stable Mastra workflow APIs and must be rechecked when
implementation begins:

- [Workflows overview](https://mastra.ai/docs/workflows/overview)
- [Workflow snapshots](https://mastra.ai/docs/workflows/snapshots)
- [Suspend and resume](https://mastra.ai/docs/workflows/suspend-and-resume)
- [Workflow time travel](https://mastra.ai/docs/workflows/time-travel)
- [Workflow error handling and retries](https://mastra.ai/docs/workflows/error-handling)
- [PostgreSQL storage](https://mastra.ai/reference/storage/postgresql)
- [RAG retrieval](https://mastra.ai/docs/rag/retrieval)
- [Observability tracing](https://mastra.ai/docs/observability/tracing/overview)
