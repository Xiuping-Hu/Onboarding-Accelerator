# Production Readiness

## Current Stack

The product now runs as a single Next.js App Router application in `apps/web`.

- UI rendering lives in `apps/web/src/app`.
- Backend behavior lives in Next.js route handlers under `apps/web/src/app/api`.
- Reusable server services live in `apps/web/src/server`.
- Shared request/response contracts remain in `packages/shared`.

## API Contracts

Shared contracts live in `packages/shared/src/index.ts`.

- `GET /health` and `GET /ready` return `HealthResponse` and do not require auth.
- `GET /metrics` returns basic in-process request counters.
- `GET /api/sessions` returns `ListSessionsResponse`.
- `POST /api/sessions` accepts `CreateSessionRequest` and returns `CreateSessionResponse`.
- `GET /api/sessions/:sessionId` returns `GetSessionResponse`.
- `PATCH /api/sessions/:sessionId` accepts `UpdateSessionRequest` and returns `UpdateSessionResponse`.
- `DELETE /api/sessions/:sessionId` returns `204`.
- `POST /api/sessions/:sessionId/chat` accepts `ChatRequest` and returns `ChatResponse`.
- `POST /api/sessions/:sessionId/guide/root` accepts `GenerateGuideRootRequest` and returns `GenerateGuideRootResponse`.
- `POST /api/sessions/:sessionId/guide/expand` accepts `ExpandGuideStepRequest` and returns `ExpandGuideStepResponse`.
- `POST /api/ask` accepts `AskRequest` and returns `AskResponse`.
- `GET /api/logs/summary` returns `LogSummaryResponse`.
- `GET /api/logs/recent?limit=10` returns `LogEventsResponse`.

All non-health/readiness API routes require authentication. Session access is scoped by the authenticated user ID.

## Router And Shared Code Decisions

The app uses the Next.js App Router. `packages/shared` remains a workspace package so contracts are importable from both client components and server modules without duplicating domain types.

## Required Production Configuration

Set these before running with `NODE_ENV=production`:

- Authentication: either `API_AUTH_TOKEN` for trusted gateway/service mode, or all of `AUTH_ISSUER`, `AUTH_AUDIENCE`, and `AUTH_JWKS_URI` for JWT validation.
- `SESSION_STORE_PATH`: writable durable path for session JSON storage.
- `LOG_STORE_PATH`: writable durable path for JSONL request, error, and AI usage logs.
- `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_TIMEOUT_MS`, and `OPENAI_MAX_RETRIES`.
- `RAG_SHARED_DIRECTORY` for shared files and `RAG_WEBSITE_ALLOWLIST` for allowed website ingestion.

Do not set `AUTH_DISABLED=true` in production. Startup validation rejects that combination. CORS is not configured by default because the Next app serves UI and API from the same origin; add a hosting/provider policy only if a future cross-origin client is introduced.

## Local Development

Use `AUTH_DISABLED=true` locally. Requests default to `local-dev-user`; setting `sessionStorage.onboardingUserId` in the browser scopes sessions to another local test user.

## Deployment

1. Run `npm install`.
2. Run `npm run lint`, `npm test`, and `npm run build`.
3. Deploy the Next.js app from `apps/web` to a Node-compatible Next host.
4. Provide the production environment variables above.
5. Ensure the configured session and log paths are backed by durable storage, or replace the file repositories with a managed database/log provider.

## Deferred Production Choices

- File-based session storage should move to a database before multi-instance deployment.
- The current in-process rate limiter is suitable for local and single-instance use; production should use Redis, an edge/provider limiter, or another shared backend.
- RAG ingestion is request-time file and website scanning. Larger deployments should move ingestion to an indexing job.
