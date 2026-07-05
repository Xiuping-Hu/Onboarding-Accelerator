create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text not null,
  password_hash text not null,
  role text not null default 'user',
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists users_email_idx
  on users (lower(email));

create unique index if not exists users_email_normalized_key
  on users (lower(email));

create index if not exists users_role_idx
  on users (role);

create index if not exists users_active_idx
  on users (is_active);
