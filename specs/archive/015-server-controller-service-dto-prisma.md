# Server Controller, Service, DTO, and Prisma Refactor Spec

## Status

Complete. The implementation was completed after this specification was accepted. Real PostgreSQL
integration coverage runs when a disposable `TEST_DATABASE_URL` is supplied.

## Repo Findings

- The server runs inside the Next.js App Router application under `apps/web`. There is no separate
  API process to replace or deploy.
- Route files currently mix transport concerns with request validation, authorization-dependent
  orchestration, service selection, business branching, audit writes, and response construction.
- Zod request schemas are declared inside route files. Closely related shapes such as user settings
  are duplicated, and the TypeScript interfaces in `packages/shared` do not validate runtime data.
- `handleApiRoute` provides useful shared authentication, rate limiting, request IDs, error mapping,
  metrics, and request logging. Admin authorization is layered on top by `handleAdminApiRoute`, but
  the Microsoft auth and logout routes bypass parts of that pipeline.
- `getServerServices` is both a singleton factory and a service locator. Its returned object mixes
  application services, persistence adapters, external providers, configuration, and mutable
  metrics.
- Several existing classes already resemble services, but their boundaries are inconsistent.
  `KnowledgeMapService`, for example, combines business validation, authorization-aware queries,
  persistence mapping, transaction coordination, and raw SQL in one file.
- PostgreSQL is accessed through a small `DatabaseClient` abstraction backed by `pg`. Raw queries
  exist in user, auth-session, login-audit, session, knowledge-map, RAG ingestion, and pgvector
  code, as well as operational scripts.
- `withTransaction` silently runs without a transaction when the database adapter does not expose
  one. That fallback is unsafe for operations whose correctness depends on atomic publication,
  ingestion, pointer updates, or audit records.
- Seven hand-written SQL migrations define the current database. They include `pgcrypto`,
  `pgvector`, partial and expression indexes, check constraints, deferrable foreign keys, JSONB,
  and a `vector(1536)` column.
- Postgres sessions already use optimistic concurrency through a `revision` predicate. The file
  repository and current error translation do not express a distinct concurrency conflict.
- File-backed sessions, request logs, admin audit records, AI rate cards, and fee adjustments are
  intentional local or runtime adapters. Moving all of those records into Postgres would be a
  separate product and data-retention change.
- Tests are strongest around services and repositories. Raw-database tests use hand-written
  `DatabaseClient` fakes that are coupled to query order and SQL text; controller-specific and real
  Postgres repository integration coverage is limited.
- `/health` and `/ready` currently return the same static response. Readiness does not prove that a
  configured database is reachable or migrated.

## Problem

The current structure is workable for a small server, but transport, business, and persistence
decisions are spread across route and service files. Adding endpoints or changing storage requires
touching multiple layers without a stable boundary. Runtime DTO validation and compile-time API
types can drift, service tests often know about HTTP or SQL details, and raw database access makes
schema changes harder to review.

The refactor needs to introduce explicit controller, service, DTO, and persistence layers without
changing the product behavior or forcing a risky all-at-once rewrite. Prisma must become the normal
PostgreSQL access path while preserving database features that Prisma does not model natively.

## Goals

- Make every route file a thin Next.js adapter with no validation or business logic.
- Put HTTP parsing, DTO validation, response selection, and transport metadata in controllers.
- Put use-case orchestration and business rules in framework-independent services.
- Put all external request, parameter, query, and response contracts in named DTO modules.
- Put persistence behind domain-oriented repository ports and Prisma repository adapters.
- Make Prisma Client the only application entry point for relational Postgres access.
- Preserve pgvector through safe, parameterized Prisma raw SQL isolated to a vector repository.
- Preserve all existing route paths, authentication rules, successful status codes, JSON shapes,
  redirects, cookies, download formats, and feature-flag behavior during the structural migration.
- Preserve file-backed adapters where they are currently supported.
- Keep complex operations atomic and make transaction ownership explicit.
- Improve unit, contract, and Postgres integration test boundaries.
- Support an incremental rollout with a working application after each migrated module.

## Non-Goals

- Splitting the Next.js server into a separate service or changing the deployment topology.
- Changing UI behavior, endpoint URLs, or public product capabilities.
- Redesigning authentication, RAG ranking, guide generation, knowledge-map governance, logging,
  fee calculation, or admin workflows.
- Migrating file-backed operational data into Postgres.
- Replacing Postgres, pgvector, Zod, or the shared client contract package.
- Normalizing the session `chat_history` and `guide` JSON documents into new relational tables.
- Removing the local file session option.
- Introducing a general dependency-injection framework, decorator framework, or class-heavy DTO
  system.
- Using `prisma db push` against shared, staging, or production databases.
- Fixing unrelated API inconsistencies as part of the layering change. Behavior changes require a
  follow-up spec or an explicitly approved amendment to this one.

## Architecture Decisions

1. **Keep Next.js App Router.** Existing `route.ts` files remain the public framework entry points.
2. **Use vertical modules.** Session, auth, guide, knowledge-map, and admin code live together by
   feature rather than in global `controllers`, `services`, and `dto` folders.
3. **Routes adapt; controllers translate; services decide; repositories persist.** Dependencies
   point inward and no inner layer imports from an outer layer.
4. **Use Zod DTOs, not DTO classes.** Each DTO module exports schemas, inferred input types, and
   explicit response serializers. This matches the current stack and avoids duplicate class
   metadata.
5. **Keep domain and transport types separate.** `packages/shared` remains the public JSON contract.
   Prisma-generated types never become API response types or service contracts.
6. **Use explicit constructor or factory injection.** The production container creates the graph;
   tests create only the controller, service, or repository under test.
7. **Use Prisma for ordinary relational access.** Direct `pg.Pool.query` and the current
   `DatabaseClient` disappear from application repositories and scripts.
8. **Retain `pg` only as Prisma's PostgreSQL driver.** `@prisma/adapter-pg` owns the pool used by
   Prisma; application code must not bypass Prisma with that pool.
9. **Keep pgvector SQL explicit.** The vector column is represented as
   `Unsupported("vector")`; similarity search and vector writes use `$queryRaw`/`$executeRaw` or
   TypedSQL with parameters, never `$queryRawUnsafe` or string interpolation.
10. **Services own transaction boundaries.** Repositories perform persistence operations with the
    root Prisma client or a supplied transaction client. A required transaction can never degrade
    into non-transactional execution.
11. **Migrate by vertical slice.** Old and new modules may coexist temporarily behind the route
    wrapper and container, but a migrated route cannot reach back into `getServerServices`.

## Target Request Flow

```text
Next.js route.ts
      |
      v
HTTP route wrapper
request id, authentication, admin policy, rate limit, logging, error mapping
      |
      v
Controller
parse params/query/body DTO -> call one use case -> serialize HTTP result
      |
      v
Application service
authorization-aware business rules, orchestration, transaction boundary
      |
      +--------------------+---------------------+
      |                    |                     |
      v                    v                     v
Repository ports     AI/RAG provider ports   File-store ports
      |
      v
Prisma repositories -> Prisma Client -> PostgreSQL / pgvector
```

The only layers allowed to know about Next.js `NextRequest`, `NextResponse`, cookies, redirects,
headers, or HTTP status codes are the route wrapper and controllers. The only layer allowed to
know about Prisma models and Prisma error types is infrastructure.

## Target Layout

```text
prisma/
  schema.prisma
  migrations/
    0001_postgres_pgvector/migration.sql
    ...
    0007_microsoft_entra_auth/migration.sql
prisma.config.ts

apps/web/src/
  generated/prisma/                 # generated, never edited by hand
  app/**/route.ts                    # thin route adapters
  server/
    bootstrap/
      appContainer.ts
      testContainer.ts
    core/
      errors/
        appError.ts
        errorCodes.ts
      http/
        controller.ts
        createRouteHandler.ts
        httpResult.ts
        requestParsers.ts
      ports/
        clock.ts
        idGenerator.ts
    infrastructure/
      prisma/
        prismaClient.ts
        prismaTypes.ts
        prismaErrorMapper.ts
      file/
        ...existing file adapters...
    modules/
      auth/
        auth.controller.ts
        auth.dto.ts
        auth.service.ts
        auth.repository.ts
        prisma-auth.repository.ts
        auth.mapper.ts
      sessions/
        session.controller.ts
        session.dto.ts
        session.service.ts
        session.repository.ts
        prisma-session.repository.ts
        file-session.repository.ts
        session.mapper.ts
      chat/
      guide/
      knowledge-maps/
      rag/
      logs/
      admin-activity/
      admin-ai-fees/
      admin-audit/
      system/
```

Exact filenames may be combined when a module is small, but the layer boundaries and dependency
rules are required. Generated Prisma output must be reproducible through a script and excluded from
manual review. The implementation must document whether generated output is committed; the
preferred repository policy is to ignore it and run generation before type-check/build in local and
CI environments.

## DTO Contract

Each `<module>.dto.ts` owns the transport contract for that module:

- Zod schemas for path parameters, query parameters, request bodies, and externally sourced JSON.
- `z.infer` input types derived from those schemas; no hand-written duplicate request type.
- Named response DTO types based on the public types from `@onboarding/shared` where applicable.
- Response serializer functions that convert domain values into the existing public JSON shape.
- Boundary normalization such as trimming, query-string coercion, enum validation, limits, and
  default transport values.
- No Prisma imports, repository records, secrets, password/session-token hashes, or internal owner
  fields.

DTO naming follows the use case, for example:

```text
CreateSessionBodySchema / CreateSessionBody
SessionIdParamsSchema / SessionIdParams
UpdateSessionBodySchema / UpdateSessionBody
CreateSessionResponseDto
toSessionResponseDto(session)
```

The implementation must consolidate duplicated DTO fragments such as `UserSettings`, activity
filters, evidence bindings, and pagination limits. Request DTOs may be server-only. Shared response
types remain in `packages/shared` so the web client does not import server code.

Every JSON response passes through a serializer even when the initial serializer is structurally
simple. This prevents Prisma `Date`, `BigInt`, `Decimal`, JSON values, internal IDs, and future
relations from leaking through automatic serialization.

## Controller Contract

A controller method:

- receives a typed HTTP context from the shared route wrapper;
- parses only the DTO pieces it needs;
- obtains the authenticated actor and request metadata from context;
- calls one top-level application service method;
- selects the existing success status, headers, cookie/redirect action, or download response;
- serializes the service result through a response DTO; and
- lets typed application errors reach the shared error mapper.

A controller method must not:

- issue Prisma queries or call a repository directly;
- contain domain branching, graph projection, fee calculation, source resolution, or audit policy;
- acquire dependencies from a global service locator;
- catch unknown errors merely to turn them into a generic response; or
- return a Prisma model or unvalidated external-provider payload.

Controllers can return a framework-neutral `HttpResult` for JSON, empty, text, redirect, and file
responses. The route wrapper turns that result into a `Response` and applies cookies/headers. This
keeps response semantics testable without starting Next.js.

## Service Contract

Application services expose use cases using plain TypeScript command/query objects and domain
results. They may depend on repository ports, AI/RAG ports, the clock, and ID generation, but not on
Next.js, Zod, or concrete Prisma classes.

Services are responsible for:

- ownership and role-dependent business decisions not already enforced by the route policy;
- orchestration across repositories and providers;
- defaults that are product behavior rather than transport parsing;
- transaction boundaries and optimistic-concurrency decisions;
- deciding when audit events are required and keeping transactional audit writes atomic; and
- translating expected missing, disabled, invalid-state, and conflict conditions into stable
  application errors.

Examples of required splits:

- `answerQuestion` becomes `AskService.ask`.
- `ChatOrchestrationService` becomes the module's application `ChatService`; source and session
  persistence remain behind ports.
- `KnowledgeMapService` is split into an application service plus Prisma repositories for maps,
  versions, nodes, bindings, feedback, audiences, and source reads. Graph validation remains pure
  domain code.
- `AdminOpsService` is split by activity, audit, rate-card, adjustment, and fee-summary use cases.
  Its existing file adapters remain infrastructure implementations.
- Session CRUD moves out of repository implementations. Repositories persist complete records;
  `SessionService` applies title/settings/guide update rules and ownership-aware errors.

## Route-to-Controller Map

All existing paths remain in place.

| Route family                                   | Controller methods                                                            | Primary service methods                                       |
| ---------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `/health`, `/ready`, `/metrics`                | `SystemController.health`, `ready`, `metrics`                                 | `SystemService.getHealth`, `getReadiness`, `getMetrics`       |
| `/api/auth/me`                                 | `AuthController.me`                                                           | `AuthService.getCurrentUser`                                  |
| `/api/auth/logout`                             | `AuthController.logout`                                                       | `AuthService.logout`                                          |
| `/api/auth/microsoft/start`                    | `AuthController.microsoftStart`                                               | `MicrosoftAuthService.startAuthorization`                     |
| `/api/auth/microsoft/callback`                 | `AuthController.microsoftCallback`                                            | `MicrosoftAuthService.completeAuthorization`                  |
| `/api/ask`                                     | `AskController.ask`                                                           | `AskService.ask`                                              |
| `/api/sessions`                                | `SessionController.list`, `create`                                            | `SessionService.list`, `create`                               |
| `/api/sessions/:sessionId`                     | `SessionController.get`, `update`, `remove`                                   | `SessionService.get`, `update`, `remove`                      |
| `/api/sessions/:sessionId/chat`                | `ChatController.send`                                                         | `ChatService.chat`                                            |
| `/api/sessions/:sessionId/guide/root`          | `GuideController.generateRoot`                                                | `GuideService.generateRoot`                                   |
| `/api/sessions/:sessionId/guide/nodes/:nodeId` | `GuideController.getNode`                                                     | `GuideService.getNodeDetail`                                  |
| `/api/sessions/:sessionId/guide/search`        | `GuideController.search`                                                      | `GuideService.search`                                         |
| `/api/sessions/:sessionId/guide/feedback`      | `GuideController.submitFeedback`                                              | `GuideService.submitFeedback`                                 |
| `/api/logs/recent`, `/api/logs/summary`        | `LogController.recent`, `summary`                                             | `LogQueryService.listRecent`, `summarize`                     |
| `/api/admin/activity/**`                       | `AdminActivityController.get`, `query`, `remove`, `export`, `updateRetention` | corresponding `AdminActivityService` use cases                |
| `/api/admin/audit`                             | `AdminAuditController.list`                                                   | `AdminAuditService.listRecent`                                |
| `/api/admin/ai-fees/**`                        | `AdminAiFeeController` query/mutation methods                                 | `AiFeeService`, `AiRateCardService`, `AiFeeAdjustmentService` |
| `/api/admin/knowledge-maps/**`                 | `AdminKnowledgeMapController.propose`, `createDraft`, `publish`               | `KnowledgeMapService` use cases                               |

Each route file should only import the route-handler factory and the relevant controller binding.
No route file may declare a Zod schema or call a service/repository directly.

## HTTP Wrapper and Error Model

Refactor the useful behavior in `handleApiRoute` into one configurable route wrapper rather than
duplicating it in controllers. Route metadata declares `public`, `authenticated`, or `admin`
access. The wrapper continues to provide request IDs, rate limiting, metrics, request/error logs,
and the `x-request-id` header.

Expected errors use a stable `AppError` hierarchy or tagged union with an internal code, safe
message, optional details, and HTTP mapping. At minimum it covers authentication, forbidden,
validation, not found, feature disabled, conflict, rate limit, and unexpected infrastructure
failure. Prisma known-request errors are translated in infrastructure before they cross into a
service.

During this refactor:

- existing successful response bodies and status codes remain byte-for-byte compatible where
  ordering is meaningful;
- existing redirects, cookies, content types, content-disposition headers, cache headers, and
  `Retry-After` behavior remain compatible;
- validation details remain hidden in production;
- internal SQL, Prisma error metadata, stack traces, connection strings, and provider payloads are
  never returned; and
- disabled-feature and not-found behavior is covered by contract tests before any deliberate error
  envelope cleanup.

## Prisma Foundation

### Dependencies and Generation

Add compatible, matching Prisma packages at the workspace root:

- runtime: `@prisma/client` and `@prisma/adapter-pg`;
- development: `prisma`;
- retain `pg` as the adapter driver and retain `@types/pg` for development.

Use the current `prisma-client` generator with an explicit ESM output path under
`apps/web/src/generated/prisma`. Add root scripts for:

```text
prisma:generate
prisma:format
db:migrate:dev
db:migrate:deploy
db:migrate:status
db:studio
```

`prisma:generate` must run before the web production build and in CI. Generation may use a
non-production placeholder connection string when no database connection is required; migration
and integration commands must always use an explicit real test/deployment database. Prisma CLI and
client versions must be upgraded together.

### Client Lifetime

Create one server-only Prisma client factory using `PrismaPg` and the existing connection options.
Cache the client on `globalThis` in local Next.js development to prevent hot-reload connection
growth. Production creates one client per process. Tests can inject a client and explicitly
disconnect it.

The factory owns `DATABASE_URL`, `POSTGRES_POOL_MAX`, and SSL configuration. No controller or
service reads these variables directly. Edge runtime is not supported for database-backed routes;
those routes must continue to use the Node.js runtime.

### Schema Coverage

`prisma/schema.prisma` must model every existing Postgres table and relationship, including:

- onboarding sessions;
- users, auth sessions, and login audit events;
- RAG source snapshots, knowledge sources, source versions, and chunks;
- knowledge maps, versions, nodes, edges, bindings, evidence health, audience memberships,
  suggestions, feedback, and transactional audit events.

Use idiomatic Prisma model/field names with `@@map` and `@map` so the physical table and column
names do not change. Preserve exact database types, defaults, delete actions, unique constraints,
and supported indexes. Keep check constraints, partial/expression indexes, deferrable constraints,
extension creation, and pgvector indexes in migration SQL when Prisma Schema Language cannot
represent them.

JSONB fields remain Prisma `Json` at the persistence boundary. Mappers validate and convert them to
domain types. `revision` maps to `BigInt`; the session mapper performs a checked conversion to the
existing public number. Timestamps map to `DateTime` internally and ISO strings in DTOs.

The `knowledge_chunks.embedding` field is declared `Unsupported("vector")`. Code must not rely on
Prisma Studio or ordinary generated model operations to read that field.

### Existing Migration Adoption

The current seven migrations are production history and must not be regenerated from scratch or
silently replaced by `db push`.

1. Create Prisma migration directories `0001` through `0007` and copy the existing SQL into each
   `migration.sql` without semantic changes.
2. Apply the history to a disposable Postgres database with pgvector installed.
3. Introspect that database, normalize Prisma names with mappings, and verify that a migration diff
   contains no destructive or unexplained drift.
4. For a new environment, use `prisma migrate deploy` to apply all seven migrations.
5. For every existing environment, back up first and run `prisma migrate resolve --applied` for
   each of the seven verified migrations so Prisma records, but does not re-run, them.
6. Record the rollout procedure and migration checksums. Verify `prisma migrate status` before
   deploying application code that relies on Prisma.
7. Make `prisma/migrations` the only active migration source. Keep `db/migrations` as a clearly
   marked historical archive until all environments have adopted Prisma history; do not maintain
   two editable copies.

All future schema changes use `prisma migrate dev --create-only`, review and customize the SQL,
then apply with `prisma migrate deploy`. Production deployments never use `migrate dev` or
`db push`.

### Repositories and Raw SQL

Prisma repositories map persistence records to domain records before returning. Services must not
receive `Prisma.*GetPayload`, generated enums, transaction clients, or Prisma exceptions.

Use generated CRUD/query APIs for users, auth sessions, login audit, sessions, source metadata,
knowledge-map records, memberships, feedback, and audit records. Preserve access-scope filters and
ownership predicates in the repository query itself; do not load unauthorized rows and filter them
only in memory.

Raw SQL is limited to:

- pgvector similarity search;
- writes that cast an embedding to `vector(1536)`;
- extension-specific operations not expressible through generated Prisma APIs; and
- a reviewed complex query only when generated Prisma would change correctness or produce an
  unacceptable query plan.

Every exception requires a named repository method, parameterized `$queryRaw`/`$executeRaw` or
TypedSQL, a comment explaining why generated Prisma cannot express it, and an integration test.
Unsafe raw APIs are prohibited.

### Transactions and Concurrency

Use interactive `prisma.$transaction(async (tx) => ...)` for multi-step read/validate/write use
cases. Transaction callbacks must contain database work and deterministic in-memory validation
only; AI calls, HTTP requests, file I/O, and other slow external work happen before or after the
transaction.

The following operations remain atomic:

- source version creation, chunk replacement, and current-version pointer update;
- knowledge-map draft creation with nodes, edges, bindings, and audit record;
- map publication with validation, version state, current-version pointer, and audit record; and
- any session transition that requires revision compare-and-swap.

Session compare-and-swap uses an ownership and revision predicate in `updateMany` or equivalent,
checks the affected count, and reloads the record. The repository distinguishes missing ownership
from a stale revision without exposing another user's session. Public error behavior remains
compatible until a separate conflict-contract change is approved.

Retry behavior is bounded and only used for operations proven idempotent. Transaction isolation is
selected explicitly for publication or ingestion if the default permits a race discovered by the
integration tests.

## Dependency Container

Replace the mixed `getServerServices` service locator with `createAppContainer(overrides?)`.
Construction proceeds in one direction:

```text
config -> infrastructure clients -> repository/provider adapters
       -> application services -> controllers
```

The production accessor may cache the completed container on `globalThis`, but only route bindings
use that accessor. Controllers and services receive dependencies in their constructors/factories.
Tests pass fakes through explicit overrides and never mutate global production dependencies.

The container can expose grouped `controllers`, `services`, and `infrastructure` for bootstrap and
diagnostics, but application code cannot use it as a runtime lookup mechanism.

## Incremental Implementation Plan

### Phase 1: Freeze Contracts

- Add or strengthen route contract tests for every existing method, including status, payload,
  redirects, cookies, download headers, authorization, feature-disabled behavior, and errors.
- Add representative fixtures for session JSON, knowledge maps, admin exports, and auth callbacks.
- Record a schema-only dump and verify all seven current migrations on a disposable database.

### Phase 2: Add Prisma Without Switching Runtime Queries

- Add Prisma packages, configuration, schema, generation scripts, and adopted migration history.
- Generate the client and add the singleton adapter-pg factory.
- Add migration status and drift checks to CI.
- Do not change repository selection or endpoint behavior in this phase.

### Phase 3: Introduce HTTP and DTO Foundations

- Add `HttpResult`, controller context, request parsers, application errors, and the configurable
  route wrapper.
- Move duplicated Zod schemas into module DTO files without changing constraints/defaults.
- Add DTO and wrapper tests.

### Phase 4: Migrate Core Persistence

- Implement Prisma repositories for users, auth sessions, login audit, and Postgres sessions.
- Switch one repository at a time through container wiring and run contract plus Postgres tests.
- Preserve the file session adapter and the existing `SESSION_STORE` selection.
- Migrate user provisioning to the same Prisma user repository or a shared application command.

### Phase 5: Migrate Endpoint Modules Vertically

- Migrate session CRUD, auth, ask/chat, guide, logs, and admin modules one route family at a time.
- For each family: DTO first, then service, controller, route adapter, tests, and old-code removal.
- Move audit orchestration from routes into the mutating application service.
- Keep file-backed log/admin adapters behind their ports.

### Phase 6: Migrate Knowledge and RAG Persistence

- Split knowledge-map business logic from persistence and graph validation.
- Implement Prisma repositories for sources, maps, audiences, feedback, and audits.
- Isolate vector search/writes in the parameterized raw-SQL vector repository.
- Migrate ingestion and reindex scripts to the Prisma unit of work.
- Add forced-rollback, access-control, pgvector, and concurrency integration tests.

### Phase 7: Remove Compatibility Infrastructure

- Remove `DatabaseClient`, `withTransaction`, direct application `pg` queries, route-local schemas,
  and `getServerServices` after the last consumer moves.
- Retire duplicate active SQL migration instructions and update runtime documentation.
- Make readiness verify database connectivity and migration state when a database-backed feature is
  required, while preserving a valid local file-only mode.
- Run the complete validation suite and compare route contracts with the Phase 1 baseline.

## Testing Strategy

### DTO Tests

- valid, boundary, defaulted, coerced, unknown, and malformed inputs;
- duplicated shapes use the same schema fragment;
- response serializers do not leak internal fields and serialize dates/BigInt correctly.

### Controller Tests

- parsed DTO and authenticated actor passed to exactly one service method;
- JSON, empty, redirect, cookie, text, and download results preserve existing semantics;
- service/application errors flow to the central mapper;
- controllers never need Prisma or real provider instances.

### Service Tests

- use in-memory or explicit fake ports, not SQL-text mocks;
- cover ownership, feature flags, audit decisions, map validation, fallback behavior, and transaction
  selection;
- use injected clock and ID generation where deterministic assertions matter.

### Prisma Repository Integration Tests

- run against disposable PostgreSQL with the vector extension; SQLite is not an acceptable stand-in;
- apply `prisma migrate deploy` to an empty database before tests;
- cover mappings, constraints, ownership filters, JSON round trips, timestamps, revision CAS,
  unique violations, transaction rollback, and delete actions;
- cover vector insert/search and prove query inputs remain parameters;
- verify authorization filters do not return inaccessible map topology or source metadata.

### Route Contract and Build Tests

- retain and expand `apiRoutes.test.ts` for public compatibility;
- add migration status/drift checks in CI;
- run `npm run lint`, `npm test`, and `npm run build`;
- production build must generate Prisma Client from a clean checkout.

## Observability and Operations

- Keep request ID, request duration, status, actor ID, and route logging at the HTTP wrapper.
- Log stable application error codes, not raw Prisma query arguments or confidential DTO bodies.
- Add Prisma query-event logging only behind a development diagnostic flag; never log embeddings,
  source content, tokens, cookies, or connection strings.
- `/ready` checks Prisma connectivity only when configuration enables a database-dependent feature.
  A file-only local configuration remains ready without Postgres.
- Deployment order is migrations first, then compatible application code. A failed migration blocks
  rollout.
- Connection pool sizing must account for the number of Next.js process instances; the adapter
  factory remains the single owner of pool configuration.

## Implementation Checklist

- [x] Add this specification and index it.
- [x] Add route-contract coverage before structural code changes.
- [x] Add matching Prisma dependencies and root scripts.
- [x] Add `prisma.config.ts`, complete schema mappings, and explicit generated output.
- [x] Adopt migrations 001 through 007 in Prisma history.
- [x] Document the existing-environment baseline procedure.
- [x] Add the adapter-pg Prisma singleton and test lifecycle.
- [x] Add core HTTP result, context, wrapper, parser, and error modules.
- [x] Move every route-local schema into a feature DTO module.
- [x] Add response serializers for every public endpoint family.
- [x] Add the explicit application container and test overrides.
- [x] Add Prisma user, auth-session, login-audit, and session repositories.
- [x] Preserve file session behavior through the same session repository port.
- [x] Move session mutation rules into `SessionService`.
- [x] Migrate auth, ask, chat, guide, logs, and admin routes by vertical slice.
- [x] Move mutating audit decisions from controllers/routes into services.
- [x] Split knowledge-map service logic from Prisma persistence.
- [x] Add Prisma source, map, audience, feedback, and audit repositories.
- [x] Isolate all pgvector raw SQL in a reviewed vector repository.
- [x] Migrate ingestion, reindex, and user-provisioning scripts from direct `pg` access.
- [x] Add opt-in real Postgres migration/repository/transaction integration tests.
- [x] Add authorization-negative and concurrency tests.
- [x] Remove direct application `pg` queries and the optional transaction fallback.
- [x] Remove `DatabaseClient`, route-local schemas, and `getServerServices` after migration.
- [x] Update README, production readiness, and operational migration instructions.
- [x] Verify Prisma generation from a clean checkout.
- [x] Verify `npm run lint`.
- [x] Verify `npm test`.
- [x] Verify `npm run build`.

## Acceptance Criteria

- Every existing route delegates through the common route wrapper to a named controller method.
- No route file declares validation schemas, contains business branching, writes audits, or calls a
  service/repository directly.
- Every external input is validated by a named DTO schema before reaching a service.
- Every external output is produced by an explicit DTO serializer and matches the pre-refactor
  route contract.
- Controllers depend on services only; services contain no Next.js, HTTP, Zod, or Prisma imports.
- Repositories expose domain records and translate Prisma errors; Prisma-generated records never
  escape infrastructure.
- Prisma is the only relational database access path for the application and operational scripts.
  The `pg` pool is used only through `@prisma/adapter-pg`.
- No unsafe Prisma raw-query API exists. All pgvector operations are isolated, parameterized, and
  covered by Postgres integration tests.
- The Prisma schema maps the complete existing database without renaming physical objects or losing
  extensions, constraints, indexes, relations, JSONB behavior, or vector behavior.
- Fresh databases can run all migrations with `prisma migrate deploy`; existing databases can be
  baselined without reapplying schema changes or losing data.
- Draft creation, publication, ingestion, and revision-sensitive session writes remain atomic and
  pass forced-rollback/concurrency tests.
- File-backed session and operational adapters continue to work in supported configurations.
- Auth, API paths, success payloads/statuses, redirects, cookies, downloads, rate limits, request
  IDs, feature flags, and access-control behavior remain compatible.
- A clean checkout can generate Prisma Client, lint, test, and build successfully.
- Runtime and operations documentation identify Prisma migrations as the sole active schema-change
  workflow.

## Risks and Mitigations

| Risk                                                 | Mitigation                                                                                                                         |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Existing database is accidentally re-migrated        | Verify checksums, back up, baseline each deployed environment with `migrate resolve`, and require `migrate status` before rollout. |
| Prisma schema omits Postgres-only behavior           | Preserve custom SQL in adopted migrations and run schema-diff plus integration checks against disposable Postgres.                 |
| pgvector becomes unusable through generated CRUD     | Keep the vector field unsupported and isolate reads/writes in tested parameterized raw SQL.                                        |
| Large rewrite causes contract regressions            | Freeze contracts first and migrate one complete vertical slice at a time.                                                          |
| Prisma models leak into API/domain types             | Require repository mappers and explicit response DTO serializers.                                                                  |
| Long interactive transactions exhaust the pool       | Keep provider calls and file I/O outside transactions, bound timeouts, and test rollback paths.                                    |
| Next.js hot reload creates too many connections      | Use one global development client and centralize adapter pool ownership.                                                           |
| Authorization filtering changes during query rewrite | Keep filters in repository queries and add negative integration and route-contract tests.                                          |
| Two migration directories drift                      | Make Prisma history authoritative after rollout and mark the old directory as a non-editable archive.                              |

## References

- [Prisma: add Prisma ORM to an existing PostgreSQL project](https://www.prisma.io/docs/getting-started/setup-prisma/add-to-existing-project/relational-databases/baseline-your-database-typescript-postgres)
- [Prisma: baselining an existing database](https://www.prisma.io/docs/orm/prisma-migrate/workflows/baselining)
- [Prisma: PostgreSQL extensions and pgvector](https://docs.prisma.io/docs/postgres/database/postgres-extensions)
- [Prisma: generating Prisma Client](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/generating-prisma-client)
- [Prisma: transactions](https://www.prisma.io/docs/orm/prisma-client/queries/transactions)
- [Prisma: customizing migrations](https://www.prisma.io/docs/orm/prisma-migrate/workflows/customizing-migrations)
