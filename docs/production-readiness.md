# Production Readiness

## Phase 1 Baseline

Current baseline after this pass:

- `npm run lint`: passes.
- `npm run build`: passes.
- `npm run test -w @onboarding/server`: passes.
- `npm run test -w @onboarding/teams-plugin`: passes.
- `npm audit --audit-level=moderate`: passes after dependency refresh.

Initial blockers found:

- P0: user/session API routes were unauthenticated and sessions were globally readable by ID.
- P0: sessions were process-local and disappeared on restart.
- P1: frontend silently fell back to mock data by default.
- P1: CORS was open, request body size was unbounded, and errors/logging were too loose for production.
- P1: web search returned placeholder results when enabled.
- P2: Teams manifest used localhost, a zero app ID, and placeholder developer URLs.

## API Contracts

Shared contracts live in `packages/shared/src/index.ts`.

- `GET /health` and `GET /ready` return `HealthResponse` and do not require auth.
- `GET /api/sessions` returns `ListSessionsResponse`.
- `POST /api/sessions` accepts `CreateSessionRequest` and returns `CreateSessionResponse`.
- `GET /api/sessions/:sessionId` returns `GetSessionResponse`.
- `PATCH /api/sessions/:sessionId` accepts `UpdateSessionRequest` and returns `UpdateSessionResponse`.
- `DELETE /api/sessions/:sessionId` returns `204`.
- `POST /api/sessions/:sessionId/chat` accepts `ChatRequest` and returns `ChatResponse`.
- `POST /api/sessions/:sessionId/guide/root` accepts `GenerateGuideRootRequest` and returns `GenerateGuideRootResponse`.
- `POST /api/sessions/:sessionId/guide/expand` accepts `ExpandGuideStepRequest` and returns `ExpandGuideStepResponse`.
- `POST /api/ask` accepts `AskRequest` and returns `AskResponse`.

All non-health/readiness API routes require authentication. Session access is scoped by the authenticated user ID.

## Required Production Configuration

Set these before running with `NODE_ENV=production`:

- `CORS_ALLOWED_ORIGINS`: comma-separated production Teams tab origins.
- Authentication: either `API_AUTH_TOKEN` for a trusted gateway/service mode, or all of `AUTH_ISSUER`, `AUTH_AUDIENCE`, and `AUTH_JWKS_URI` for JWT validation.
- `SESSION_STORE_PATH`: writable durable path for session JSON storage.
- `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_TIMEOUT_MS`, and `OPENAI_MAX_RETRIES`.
- `RAG_SHARED_DIRECTORY` for shared files and `RAG_WEBSITE_ALLOWLIST` for allowed website ingestion.

Do not set `AUTH_DISABLED=true` in production. Startup validation rejects that combination.

## RAG Ingestion Setup

The server indexes configured local shared inputs through adapters for documents, sheets, video transcript sidecars, and allowlisted websites.

- Put shared `.md`, `.txt`, and `.csv` files under `RAG_SHARED_DIRECTORY`.
- Put transcript sidecars next to video assets as text files supported by the video adapter.
- Set `RAG_WEBSITE_ALLOWLIST` to explicit HTTPS origins or URLs that the website adapter may fetch.
- Tune `RAG_MAX_FILE_BYTES` and `RAG_MAX_CHUNKS_PER_SOURCE` for the deployment size.

Website retrieval is allowlist-enforced. Placeholder web search is disabled cleanly until a production provider is added.

## Teams Deployment

1. Build the frontend and server with `npm run build`.
2. Host `apps/teams-plugin/dist` at the production HTTPS origin in the Teams manifest.
3. Deploy `apps/server/dist` with the environment variables above.
4. Register the Teams app and identity provider values in Entra ID.
5. Update `apps/teams-plugin/appPackage/manifest.json` app ID, domains, and developer URLs to the deployed tenant values.
6. Zip the contents of `apps/teams-plugin/appPackage` and validate/upload the package in Teams Developer Portal.

For local sideloading, use a local manifest variant or temporarily point the manifest URLs at the dev tunnel host. Do not commit localhost manifest values as the production package.
