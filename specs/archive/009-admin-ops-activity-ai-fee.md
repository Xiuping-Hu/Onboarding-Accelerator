# Admin Operations Website for Activity Logs and AI Fees Spec

## Assumption

The account and login system in `004-account-login-system.md` is the intended account source for
the client workspace. The admin operations website must use the same user records, credentials,
session mechanism, and role field as the client-facing app.

## Goal

Add an admin-only managed website for internal operations staff to review and manage activity logs
and AI fee reporting.

The client workspace must not expose AI fee management. Admins use the managed website to inspect
usage, configure fee rules, export operational data, and perform controlled log maintenance.

## Implementation Status

Complete. The first implementation uses the current file-backed runtime stores:

- Activity events are read from `LOG_STORE_PATH`.
- Admin audit events are written to `ADMIN_AUDIT_STORE_PATH`.
- AI rate cards are written to `AI_RATE_CARDS_STORE_PATH`.
- AI fee summaries are calculated from logged token usage and active rate cards.

Admin authorization is enforced server-side on every `/api/admin/*` route. The `/admin` website is a
client console over those protected APIs because the current app account session is browser-header
based rather than cookie-session based.

## Completion Addon

Each action item includes a completion marker:

- `[ ]` Not complete
- `[x]` Complete

Keep this marker updated as implementation proceeds.

## Scope

- Add a protected admin website inside the existing Next.js app.
- Reuse the same account data and session authentication as the client workspace.
- Restrict all admin pages and admin APIs to users whose role is `admin`.
- Provide activity log browsing, filtering, export, retention, and controlled deletion workflows.
- Provide AI fee configuration and reporting based on recorded model usage.
- Audit every admin action that changes log retention, deleted records, fee rules, or fee overrides.

## Non-Goals

- Creating a separate admin account store.
- Allowing non-admin users to view or manage operational logs.
- Public billing, invoicing, payment collection, or customer-facing chargeback.
- Showing AI fees in the client workspace unless a later product decision explicitly requires it.
- Exposing raw secrets, authorization tokens, passwords, or full request bodies in the admin UI.

## Account and Authorization Requirements

- Admin login uses the same login page, user repository, session cookie, and session validation as
  the client workspace.
- The `users.role` field is the authorization source of truth.
- Only `role = admin` can access admin pages and admin APIs.
- Non-admin authenticated users who open admin routes receive a `403` response or a friendly access
  denied page.
- Unauthenticated users are redirected to login, then denied unless their authenticated account is an
  admin.
- Admin route handlers must re-check authorization server-side; client-only guards are not enough.
- The system must not support a separate admin password, bypass token, or shared admin secret.

## Proposed Routes and Pages

- `/admin`
  - Admin operations landing page with current activity and AI usage summary.

- `/admin/activity`
  - Activity log table with filters, search, pagination, and export controls.

- `/admin/activity/:eventId`
  - Event detail view with safe redaction of sensitive values.

- `/admin/ai-fees`
  - AI fee dashboard with totals by model, user, session, operation, and date range.

- `/admin/ai-fees/rates`
  - Rate-card management page for model pricing and effective dates.

- `/admin/audit`
  - Admin action audit trail.

## Admin API Design

- `GET /api/admin/activity`
  - Returns paginated and filtered log events.

- `GET /api/admin/activity/:eventId`
  - Returns one redacted log event.

- `POST /api/admin/activity/export`
  - Creates a CSV or JSONL export for the selected filters.

- `POST /api/admin/activity/retention`
  - Updates retention policy.

- `DELETE /api/admin/activity`
  - Deletes events matching a constrained filter after confirmation.

- `GET /api/admin/ai-fees/summary`
  - Returns AI token usage and estimated fees for a date range.

- `GET /api/admin/ai-fees/rates`
  - Lists configured rate cards.

- `POST /api/admin/ai-fees/rates`
  - Creates a new rate card.

- `PATCH /api/admin/ai-fees/rates/:rateId`
  - Updates a future-dated or disabled rate card.

- `POST /api/admin/ai-fees/recalculate`
  - Recalculates fee estimates from token usage and active rate cards.

- `GET /api/admin/audit`
  - Returns admin action audit events.

## Activity Log Management Requirements

- Support filtering by date range, event type, user ID, session ID, request ID, HTTP status,
  operation, and model.
- Support stable pagination for large log stores.
- Support export to CSV and JSONL.
- Redact sensitive values before display and export.
- Show request, error, and AI usage events in a unified timeline.
- Show event counts, error counts, AI request counts, and token totals for the active filter.
- Deletion must require an explicit constrained filter, a preview count, and a confirmation step.
- Retention policy changes must be audited.
- Log deletion must be audited with actor, filter summary, count, timestamp, and reason.

## AI Fee Management Requirements

- AI fee calculations are admin-only operational reporting.
- Record token usage independently from fee estimates.
- Configure rate cards by provider, model, input token rate, output token rate, currency, and
  effective date range.
- Preserve historical fee calculations by linking estimates to the rate card used.
- Allow fee recalculation for a selected date range when a rate card is corrected.
- Support summaries by date range, model, operation, user, and session.
- Support CSV export of AI usage and fee summaries.
- Support manual adjustment records with a required reason and admin audit event.
- Display when usage has no matching rate card instead of silently treating it as zero cost.
- Do not send fee estimates back to normal client workspace responses.

## Proposed Data Model

- `users`
  - Uses the account table from `004-account-login-system.md`.
  - Requires `role` values that include `admin`.

- `admin_audit_events`
  - `id`
  - `actor_user_id`
  - `action`
  - `target_type`
  - `target_id`
  - `metadata`
  - `ip_address`
  - `user_agent`
  - `created_at`

- `ai_rate_cards`
  - `id`
  - `provider`
  - `model`
  - `currency`
  - `input_cost_per_1m_tokens`
  - `output_cost_per_1m_tokens`
  - `effective_from`
  - `effective_to`
  - `is_active`
  - `created_by_user_id`
  - `created_at`
  - `updated_at`

- `ai_fee_estimates`
  - `id`
  - `usage_event_id`
  - `rate_card_id`
  - `input_tokens`
  - `output_tokens`
  - `total_tokens`
  - `estimated_fee`
  - `currency`
  - `calculated_at`

- `ai_fee_adjustments`
  - `id`
  - `usage_event_id`
  - `amount`
  - `currency`
  - `reason`
  - `created_by_user_id`
  - `created_at`

## Storage Strategy

- If JSONL logging remains the runtime log store, the first implementation may read through the
  existing log service and add admin-safe filtering and export helpers.
- For multi-instance production, activity events, AI usage, rate cards, fee estimates, and admin
  audit events should move to PostgreSQL so filtering, retention, and recalculation are reliable.
- The admin website must not depend on browser-local state for authorization or auditability.

## UI Requirements

- Admin pages should be dense, scannable operational views rather than marketing pages.
- Tables must support sorting, filtering, pagination, empty states, loading states, and error states.
- Destructive actions must use confirmation dialogs with a clear preview of affected records.
- Fee dashboards must distinguish raw token usage from calculated fee estimates.
- Event detail views must show redaction markers where sensitive fields were removed.
- All admin pages must keep navigation separate from the client workspace.

## Security Requirements

- Enforce admin authorization in middleware, server page loaders, and every admin route handler.
- Protect mutating admin APIs from CSRF.
- Never display raw passwords, password hashes, session tokens, auth headers, API keys, or cookies.
- Redact request bodies and headers by default.
- Require an admin action audit event for rate changes, recalculation, retention changes, exports,
  and deletion.
- Rate-limit admin login and sensitive admin mutations.
- Ensure exported files inherit the same redaction rules as the UI.

## Migration Actions

- [x] Confirm the account system includes a durable `users.role` field with an `admin` value.
- [x] Add shared current-user helper that exposes role information to server code.
- [x] Add reusable `requireAdminUser` authorization helper.
- [x] Add admin route protection for `/admin/*`.
- [x] Add admin API protection for `/api/admin/*`.
- [x] Add `admin_audit_events` storage.
- [x] Add `ai_rate_cards` storage.
- [x] Add AI fee estimate calculation from stored usage and rate cards.
- [x] Add `ai_fee_adjustments` storage.
- [x] Add log query service with filtering, pagination, redaction, and export support.
- [x] Add AI fee calculation service.
- [x] Add AI fee recalculation workflow.
- [x] Add admin audit writer for every mutating admin action.
- [x] Add `/admin` operations landing page.
- [x] Add `/admin/activity` page.
- [x] Add activity event detail page.
- [x] Add activity export workflow.
- [x] Add activity retention workflow.
- [x] Add constrained activity deletion workflow.
- [x] Add `/admin/ai-fees` dashboard.
- [x] Add `/admin/ai-fees/rates` management page.
- [x] Add rate-card create, update, disable, and effective-date validation.
- [x] Add fee recalculation UI and API.
- [x] Add `/admin/audit` page.
- [x] Add tests for admin route access by admin users.
- [x] Add tests that non-admin users receive `403`.
- [x] Add tests that unauthenticated users are redirected or rejected.
- [x] Add tests for sensitive field redaction.
- [x] Add tests for log filtering and pagination.
- [x] Add tests for export redaction.
- [x] Add tests for rate-card validation.
- [x] Add tests for AI fee calculation and recalculation.
- [x] Add tests for admin audit events.
- [x] Update `.env.example`.
- [x] Update README admin setup documentation.
- [x] Update production deployment documentation.
- [x] Verify `npm run build` passes.
- [x] Verify `npm run lint` passes.
- [x] Verify `npm test` passes.
- [x] Add automated smoke coverage for admin login, non-admin denial, activity browsing, export, fee rates, and
      recalculation.

## Acceptance Criteria

- [x] Admin users can open the managed website using the same account data as the client app.
- [x] Non-admin users cannot access admin pages or admin APIs.
- [x] Activity logs can be searched, filtered, paginated, exported, retained, and deleted through
      controlled admin workflows.
- [x] Sensitive log fields are redacted in the UI and exports.
- [x] AI fee rates can be managed by admins.
- [x] AI fees can be calculated and recalculated from recorded token usage.
- [x] Client workspace responses and UI do not expose admin-only AI fee details.
- [x] All mutating admin actions are written to an admin audit trail.
- [x] Build, lint, and tests pass.
