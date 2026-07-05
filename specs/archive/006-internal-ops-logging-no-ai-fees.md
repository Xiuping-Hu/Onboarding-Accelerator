# Internal Ops Logging Without AI Fees Spec

## Status

Proposed.

## Repo Findings

- The current workspace UI in `apps/web/src/app/workspace/WorkspaceClient.tsx` fetches
  `/api/logs/summary` and `/api/logs/recent`, then renders activity logs inside the client-facing
  assistant panel.
- Shared contracts in `packages/shared/src/index.ts` include `estimatedFeeUsd` on `AiUsageStats`,
  `AiUsageModelSummary`, and `AiUsageSummary`.
- `apps/web/src/server/openAiService.ts` calculates estimated fees from
  `OPENAI_INPUT_COST_PER_1M_TOKENS` and `OPENAI_OUTPUT_COST_PER_1M_TOKENS`.
- `apps/web/src/server/logService.ts` persists request, error, and AI usage events to the configured
  JSONL `LOG_STORE_PATH`.
- The log API routes are protected by the app auth layer, but they are still part of the same client
  website surface and are consumed by the normal workspace client.

## Goal

Remove AI fee calculation and display from the product, keep operational logging active, and expose
log review only through an independent internal operations website that is not reachable from the
client-facing workspace.

## Non-Goals

- Add billing, metering, invoices, quotas, or customer-visible cost reporting.
- Remove token usage capture.
- Remove request and error logging.
- Build a public status page.
- Let client users browse operational logs.
- Redesign the assistant drawer beyond removing logs and fee presentation. That belongs to
  `008-assistant-ui-agent-drawer.md`.

## Parallelization Notes

- This spec can be implemented in parallel with `007-limited-zoomable-client-canvas.md` because it
  mostly changes contracts, logging routes, and assistant-panel content.
- This spec should be coordinated with `008-assistant-ui-agent-drawer.md` so the assistant-ui drawer
  does not recreate client-visible log or fee UI.
- Shared type changes should land before broad UI work so downstream modules compile against the new
  usage shape.

## Target Architecture

- `apps/web` remains the client-facing onboarding workspace.
- Operational logs remain active on the server through `LogService`.
- A separate internal operations website, preferably a new workspace such as `apps/ops`, owns log
  browsing and summary views.
- The client-facing app does not import log browser API helpers, call log browser endpoints, or render
  log activity.
- AI usage records include model and token counts only. Fees are not computed, persisted, returned, or
  rendered.

## AI Usage Contract Changes

Remove fee fields from shared and internal usage types:

- Remove `estimatedFeeUsd` from `AiUsageStats`.
- Remove inherited fee fields from `AiUsageModelSummary` and `AiUsageSummary`.
- Remove fee aggregation from `LogSummaryResponse.aiUsage`.
- Remove per-message fee rendering from the client.
- Remove `OPENAI_INPUT_COST_PER_1M_TOKENS` and `OPENAI_OUTPUT_COST_PER_1M_TOKENS` from runtime
  configuration and examples.

Required behavior:

- Usage still records `model`, `inputTokens`, `outputTokens`, and `totalTokens`.
- Existing JSONL records that include `estimatedFeeUsd` are tolerated during parsing, but the field is
  ignored and never returned by new public contracts.
- New logs do not include fee fields.
- Tests assert that fee fields are absent from API responses and rendered UI.

## Independent Operations Website

Add an internal-only log review surface outside the client-facing app.

Preferred implementation:

- Create `apps/ops` as a separate Next.js workspace deployed on its own internal hostname.
- Reuse server-side logging read APIs through a small shared package or server-only module, not through
  client-facing `apps/web` routes.
- Protect the website with admin-only authentication. If the account system from
  `005-postgres-account-system.md` is enabled, only `role=admin` users may access it.
- Do not enable broad CORS from the client website to the ops website.
- Keep operational environment variables separate enough that disabling the ops website does not
  disable server logging.

Minimum ops website views:

- Summary: total events, requests, errors, AI requests, token totals, and latest event time.
- Recent events: request, error, and AI usage entries with timestamp, level, user ID when present,
  operation, status, duration, model, and token counts.
- Filters: event type, level, user ID, operation, path, and time range.
- Detail view: a single event with raw operational fields, redacted where required.

## Client-Facing App Requirements

- Remove `getLogSummary` and `getRecentLogs` from the workspace client API module, unless they are
  replaced by test-only helpers outside the production client bundle.
- Remove `logSummary`, `logEvents`, activity-log rendering, and refresh controls from
  `WorkspaceClient.tsx`.
- Remove the "AI fee" metric from the assistant panel.
- Remove fee text from message usage details.
- Remove client-facing routes under `/api/logs/*`, or keep them disabled unless an explicit
  admin-only, internal-host guard is present.
- Ensure normal client users cannot discover or fetch log data from the client website.

## Log Data Security

- Redact secrets, authorization headers, cookies, and raw request bodies.
- Avoid logging full assistant prompts by default. If prompt logging is later required, gate it behind
  a separate operational flag and redact source content that may contain customer data.
- Keep `requestId` in client error responses so support can correlate user reports with server logs.
- Document retention and deletion expectations for JSONL and any future database-backed log store.
- Treat logs as internal operational data, not as customer data exports.

## Implementation Checklist

- [ ] Remove fee fields from shared AI usage contracts.
- [ ] Remove OpenAI fee configuration variables.
- [ ] Remove fee calculation from `OpenAiService`.
- [ ] Update `FileLogService` summary aggregation to ignore legacy fee fields.
- [ ] Update log service tests for token-only AI usage.
- [ ] Remove client workspace log API helpers.
- [ ] Remove client workspace log state, log fetching, activity-log UI, and fee UI.
- [ ] Remove or hard-gate client-facing `/api/logs/summary` and `/api/logs/recent`.
- [ ] Add an independent internal ops website for logs.
- [ ] Add admin-only authorization for the ops website.
- [ ] Add log summary and recent event views to the ops website.
- [ ] Add filtering for event type, level, user ID, operation, path, and time range.
- [ ] Add tests proving client users cannot access log endpoints or log UI.
- [ ] Add tests proving fee fields are not returned in chat, ask, log summary, or log event payloads.
- [ ] Update `.env.example`.
- [ ] Update `README.md`.
- [ ] Update `docs/production-readiness.md`.
- [ ] Verify `npm run lint`.
- [ ] Verify `npm test`.
- [ ] Verify `npm run build`.

## Acceptance Criteria

- Client-facing UI does not show AI fees.
- Client-facing API responses do not include AI fee fields.
- New server logs do not persist AI fee fields.
- Server request, error, and AI usage logging remains active.
- Client users cannot access operational log summaries or recent log events from the client website.
- Internal operators can review logs on a separate protected website.
- Log review shows token usage, model names, request counts, errors, status codes, and durations.
- Documentation explains where logs live, who can access them, and how retention is managed.
