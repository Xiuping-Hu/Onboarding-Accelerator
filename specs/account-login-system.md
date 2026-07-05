# Account and Login System Spec

## Assumption

The Next.js migration is complete. The application lives in `apps/web`, with frontend screens and backend route handlers served by the same Next.js app.

## Goal

Add a simple internal account and login system.

There is no public registration flow. Accounts are created by an administrator through direct database insert, migration seed, or a controlled internal script.

## Completion Addon

Each action item includes a completion marker:

- `[ ]` Not complete
- `[x]` Complete

Keep this marker updated as implementation proceeds.

## Scope

- Add password-based login for internal users.
- Add session cookie authentication for the Next.js app.
- Protect workspace and API routes.
- Scope onboarding sessions and logs by authenticated user where appropriate.
- Provide a simple admin account creation path without public registration.

## Non-Goals

- Public sign-up or self-service registration.
- Password reset by email.
- OAuth or SSO integration.
- User profile management UI.
- Multi-tenant organization management UI.
- Fine-grained role-based authorization beyond a minimal admin flag unless later required.

## Account Creation Policy

Accounts are created outside the public app flow.

Supported approaches, in preferred order:

1. Internal admin CLI or script that hashes a password and inserts the user.
2. SQL insert using a precomputed password hash.
3. Seed migration for the first admin account in local or staging environments only.

The app must not expose a public `/register` page or public registration API endpoint.

## Proposed Data Model

- `users`
  - `id`
  - `email`
  - `display_name`
  - `password_hash`
  - `role`
  - `is_active`
  - `last_login_at`
  - `created_at`
  - `updated_at`

- `auth_sessions`
  - `id`
  - `user_id`
  - `session_token_hash`
  - `expires_at`
  - `created_at`
  - `last_seen_at`
  - `revoked_at`
  - `user_agent`
  - `ip_address`

- `login_audit_events`
  - `id`
  - `user_id`
  - `email`
  - `event_type`
  - `success`
  - `reason`
  - `ip_address`
  - `user_agent`
  - `created_at`

## Security Requirements

- Store password hashes only; never store plaintext passwords.
- Use a modern password hashing algorithm such as Argon2id or bcrypt.
- Hash session tokens before storing them in the database.
- Use `HttpOnly`, `Secure`, `SameSite=Lax` cookies for browser sessions.
- Expire sessions after a configured duration.
- Rotate or renew session expiry on active use only if explicitly desired.
- Reject login for inactive users.
- Use generic login failure messages.
- Rate-limit login attempts by IP and email.
- Add audit logs for successful and failed login attempts.
- Avoid exposing whether an email exists.

## Authentication Flow

1. User opens the app.
2. Middleware or server layout checks for a valid session cookie.
3. Unauthenticated users are redirected to `/login`.
4. User submits email and password.
5. Server validates credentials.
6. Server creates an `auth_sessions` row.
7. Server sets a secure session cookie.
8. User is redirected to the workspace.
9. API route handlers read the authenticated user from the session.
10. Logout revokes the session and clears the cookie.

## Route and UI Design

- `/login`
  - Public page.
  - Email and password fields.
  - Generic error display.

- `/logout`
  - Server action or route that revokes the current session and clears the cookie.

- `/workspace`
  - Protected app page.

- `/api/*`
  - Protected by session auth unless explicitly public.

- `/health` and `/ready`
  - Public operational endpoints.

No `/register` route should exist.

## Migration Actions

- [ ] Confirm PostgreSQL user and session tables from the database spec are available.
- [ ] Choose password hashing library.
- [ ] Add password hashing dependency to the Next.js app workspace.
- [ ] Add auth configuration variables for cookie name, session duration, and secure-cookie behavior.
- [ ] Add `users` table migration.
- [ ] Add `auth_sessions` table migration.
- [ ] Add `login_audit_events` table migration.
- [ ] Add unique index for normalized user email.
- [ ] Add indexes for active session lookup and session expiry cleanup.
- [ ] Add user repository module.
- [ ] Add auth session repository module.
- [ ] Add login audit repository module.
- [ ] Add password hashing and verification utility.
- [ ] Add session token creation and hashing utility.
- [ ] Add server-only current-user lookup helper.
- [ ] Add route protection helper for API handlers.
- [ ] Add Next.js middleware or server-layout guard for protected pages.
- [ ] Add `/login` page.
- [ ] Add login server action or route handler.
- [ ] Add logout route handler or server action.
- [ ] Add generic login failure UI.
- [ ] Remove or disable previous `AUTH_DISABLED`, API token, or header-based auth for production.
- [ ] Keep a deliberate local-dev auth mode only if explicitly documented.
- [ ] Update session ownership logic to use authenticated database user IDs.
- [ ] Update onboarding session creation to set `owner_user_id`.
- [ ] Update session listing and lookup to enforce owner scoping.
- [ ] Update logs to record authenticated user IDs.
- [ ] Add login attempt rate limiting.
- [ ] Add audit events for login success, login failure, logout, and inactive-account attempts.
- [ ] Add internal admin account creation script.
- [ ] Document direct SQL account insertion as a fallback.
- [ ] Add local seed path for the first admin user.
- [ ] Ensure account creation tooling hashes passwords correctly.
- [ ] Add tests for password hashing and verification.
- [ ] Add tests for successful login.
- [ ] Add tests for failed login.
- [ ] Add tests for inactive user rejection.
- [ ] Add tests for protected API routes.
- [ ] Add tests for protected page redirects.
- [ ] Add tests confirming no registration route exists.
- [ ] Update `.env.example`.
- [ ] Update README login instructions.
- [ ] Update production deployment documentation.
- [ ] Verify `npm run build` passes.
- [ ] Verify `npm run lint` passes.
- [ ] Verify `npm test` passes.
- [ ] Manually smoke-test login, logout, protected workspace access, protected API access, and owner-scoped sessions.

## Admin Account Creation Options

### Preferred Script

Add an internal script such as:

```powershell
npm run users:create -- --email admin@example.com --name "Admin" --role admin
```

The script should prompt for a password, hash it, and insert the account.

### Direct SQL Fallback

Allow direct SQL only when the password hash has already been generated by trusted tooling.

The documentation should make clear that admins must never insert plaintext passwords.

## Acceptance Criteria

- [ ] Users can log in with admin-created accounts.
- [ ] Users cannot self-register.
- [ ] Login creates a secure server-side session.
- [ ] Logout revokes the session and clears the cookie.
- [ ] Protected pages redirect unauthenticated users to `/login`.
- [ ] Protected API routes reject unauthenticated requests.
- [ ] Sessions and onboarding data are scoped to the authenticated user.
- [ ] Passwords and session tokens are never stored in plaintext.
- [ ] Admin account creation is documented and repeatable.
- [ ] Build, lint, and tests pass.
