# Postgres Account System Spec

## Goal

Implement the internal password login system backed by Postgres users and server-side browser
sessions. There is no public registration flow; administrators create accounts with controlled
tooling or trusted SQL that uses precomputed password hashes.

## Completion Status

- [x] Add password-based login for internal users.
- [x] Add HttpOnly cookie authentication for the Next.js app.
- [x] Protect workspace and API routes.
- [x] Scope onboarding sessions and logs by authenticated user IDs.
- [x] Provide an internal admin account creation path without public registration.

## Implemented Data Model

- [x] `users` table in `db/migrations/002_users_table.sql`.
- [x] Case-insensitive unique user email index.
- [x] `auth_sessions` table in `db/migrations/003_postgres_account_auth.sql`.
- [x] Active-session and expiry-cleanup indexes.
- [x] `login_audit_events` table in `db/migrations/003_postgres_account_auth.sql`.

## Implemented Auth Flow

- [x] `/login` is public and redirects authenticated users to `/workspace`.
- [x] `/workspace` redirects unauthenticated users to `/login`.
- [x] `POST /api/auth/login` validates email and password.
- [x] Successful login creates an `auth_sessions` row.
- [x] Successful login stores only a hashed session token in Postgres.
- [x] Successful login sets a secure-capable `HttpOnly`, `SameSite=Lax` cookie.
- [x] `GET /api/auth/me` reads the authenticated user from the cookie session.
- [x] `POST /api/auth/logout` and `/logout` revoke the session and clear the cookie.
- [x] `/health`, `/ready`, and `/metrics` remain public operational endpoints.
- [x] No `/register` page or public registration API exists.

## Implemented Security Controls

- [x] Passwords are stored as bcrypt hashes through `bcryptjs`.
- [x] Session tokens are generated from cryptographic random bytes.
- [x] Session tokens are SHA-256 hashed before storage.
- [x] Inactive users cannot log in.
- [x] Login failures use a generic error message.
- [x] Login attempts are rate-limited by IP and normalized email.
- [x] Login success, login failure, inactive-account attempts, and logout are audited.
- [x] Production rejects `AUTH_DISABLED=true`.
- [x] Password auth requires `DATABASE_URL`.
- [x] Local development can deliberately use `AUTH_DISABLED=true`.

## Implemented Modules

- [x] User repository module.
- [x] Auth session repository module.
- [x] Login audit repository module.
- [x] Password hashing and verification utility.
- [x] Session token creation and hashing utility.
- [x] Server current-user lookup helper.
- [x] Central protected API route helper.
- [x] Internal `npm run users:create` account creation script.

## Verification

- [x] Tests cover password hashing and verification.
- [x] Tests cover successful login session creation.
- [x] Tests cover failed login.
- [x] Tests cover inactive user rejection.
- [x] Tests cover protected API rejection.
- [x] Tests confirm no registration route exists.
- [x] `npm test` passes.
- [x] `npm run lint` passes.
- [x] `npm run build` passes.

## Documentation

- [x] `.env.example` includes auth cookie, session duration, secure-cookie, and login rate-limit variables.
- [x] `README.md` documents migrations, login, account creation, and SQL fallback rules.
- [x] `docs/production-readiness.md` documents production auth configuration and deployment steps.
