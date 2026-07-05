# Next.js Stack Migration Spec

## Goal

Migrate the product from the current npm-workspace split of Express server plus Vite Teams plugin into a Next.js application that owns both frontend and backend responsibilities.

Teams plugin support is out of scope for the target architecture.

## Completion Addon

Each action item includes a completion marker:

- `[ ]` Not complete
- `[x]` Complete

Keep this marker updated as implementation proceeds.

## Target Architecture

- A single Next.js app serves the user interface.
- Next.js route handlers or server actions provide backend API behavior.
- Existing onboarding domain services are preserved where useful and moved behind Next.js server boundaries.
- Shared TypeScript contracts remain available to both client and server code, either as a package or colocated app module.
- Teams manifest, Teams-specific packaging, and Teams plugin runtime assumptions are removed.
- Current session, RAG, guide, chat, auth, logging, and OpenAI behavior are retained unless explicitly replaced by a later product decision.

## Migration Actions

- [x] Create a new Next.js app workspace, for example `apps/web`, configured with TypeScript.
- [x] Choose the Next.js router strategy and document it; default target is the App Router.
- [x] Add required Next.js dependencies and scripts for development, build, lint, and test.
- [x] Decide whether `packages/shared` remains a workspace package or moves into the Next app as an internal module.
- [x] Move shared API/domain contracts into the chosen shared location.
- [x] Replace the Vite Teams frontend entry point with Next.js pages, layouts, and client components.
- [x] Rebuild the current guidance workspace UI in Next.js using the existing React component logic where practical.
- [x] Move browser-only canvas guide rendering into a client component.
- [x] Move frontend API wrapper calls to the new Next.js backend endpoints.
- [x] Remove Teams plugin-only assumptions from frontend auth token discovery.
- [x] Define the new web auth approach for local development and production.
- [x] Port Express route behavior into Next.js route handlers.
- [x] Port session endpoints into Next.js API routes.
- [x] Port chat endpoint behavior into Next.js API routes.
- [x] Port guide root and guide expand endpoint behavior into Next.js API routes.
- [x] Port ask endpoint behavior into Next.js API routes or retire it if no longer needed.
- [x] Port log summary and recent log endpoints into Next.js API routes.
- [x] Preserve health and readiness behavior in a Next-compatible form.
- [x] Move reusable server services into server-only modules.
- [x] Keep or adapt `ChatOrchestrationService`.
- [x] Keep or adapt `GuideOrchestrationService`.
- [x] Keep or adapt `RagService` and source reranking.
- [x] Keep or adapt OpenAI Responses API integration.
- [x] Keep or adapt session persistence.
- [x] Keep or adapt JSONL request, error, and AI usage logging.
- [x] Replace Express middleware concerns with Next.js equivalents.
- [x] Reimplement request identity, request logging, and error handling.
- [x] Reimplement authentication checks for protected backend routes.
- [x] Reimplement rate limiting or choose a production-ready provider.
- [x] Reimplement CORS policy only if the Next app must serve cross-origin clients.
- [x] Update environment variable loading and validation for Next.js runtime rules.
- [x] Separate server-only environment variables from public client variables.
- [x] Remove `apps/teams-plugin` from workspace configuration after the Next UI is live.
- [x] Remove Teams manifest and app package files.
- [x] Remove Vite-specific config and dependencies.
- [x] Remove Express app bootstrap once all backend behavior is handled by Next.js.
- [x] Update root npm scripts to build, dev, lint, and test the Next.js app.
- [x] Update local development workflow documentation.
- [x] Update production deployment documentation.
- [x] Update production readiness notes for Next.js hosting assumptions.
- [x] Update generated harness docs or replace them with Next-aware docs.
- [x] Add or migrate unit tests for shared domain services.
- [x] Add tests for Next.js API route handlers.
- [x] Add tests for core UI state and graph visibility behavior.
- [x] Verify the new app builds successfully.
- [x] Verify the new test suite passes.
- [x] Verify lint and formatting pass.
- [x] Manually smoke-test session creation, guide generation, node expansion, chat, logs, and OpenAI fallback behavior.
- [x] Confirm no Teams plugin files, scripts, manifest references, or deployment steps remain.

## Deferred Decisions

- [x] Decide whether session storage should stay file-based or move to a database.
- [x] Decide whether auth should use NextAuth/Auth.js, custom JWT validation, middleware, or hosting-provider identity.
- [x] Decide whether rate limiting should be in-process, Redis-backed, or delegated to the hosting edge.
- [x] Decide whether RAG ingestion should remain request-time file scanning or become a build/indexing job.
- [x] Decide whether `/api/ask` remains as a legacy compatibility endpoint.

Decision notes:

- Session storage remains file-based for this migration; production docs call out database storage before multi-instance deployment.
- Auth uses the existing custom API token or JWT validation path in Next route handlers; `AUTH_DISABLED=true` remains local-development only.
- Rate limiting remains in-process for local and single-instance use; production docs recommend a shared provider.
- RAG ingestion remains request-time scanning for now.
- `/api/ask` remains available as a compatibility endpoint.

## Acceptance Criteria

- [x] The product runs as a Next.js application.
- [x] The same Next.js app owns frontend rendering and backend API behavior.
- [x] Existing onboarding sessions, guide generation, chat, RAG, logging, and OpenAI fallback behavior are represented in the new stack.
- [x] Teams plugin support is removed from code, scripts, docs, and package configuration.
- [x] `npm run build`, `npm run lint`, and `npm test` pass after migration.
