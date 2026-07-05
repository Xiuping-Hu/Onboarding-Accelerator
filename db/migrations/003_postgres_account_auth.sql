create extension if not exists pgcrypto;

create table if not exists auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  session_token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  user_agent text,
  ip_address text
);

create index if not exists auth_sessions_active_lookup_idx
  on auth_sessions (session_token_hash, expires_at)
  where revoked_at is null;

create index if not exists auth_sessions_user_active_idx
  on auth_sessions (user_id, expires_at desc)
  where revoked_at is null;

create index if not exists auth_sessions_expiry_cleanup_idx
  on auth_sessions (expires_at)
  where revoked_at is null;

create table if not exists login_audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users (id) on delete set null,
  email text,
  event_type text not null,
  success boolean not null,
  reason text,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint login_audit_event_type_check
    check (event_type in ('login_success', 'login_failure', 'login_inactive', 'logout'))
);

create index if not exists login_audit_events_user_created_idx
  on login_audit_events (user_id, created_at desc);

create index if not exists login_audit_events_email_created_idx
  on login_audit_events (lower(email), created_at desc);

create index if not exists login_audit_events_created_idx
  on login_audit_events (created_at desc);
