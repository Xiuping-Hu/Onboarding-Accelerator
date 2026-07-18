create extension if not exists vector;

create table if not exists onboarding_sessions (
  id uuid primary key,
  owner_id text not null,
  title text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  settings jsonb not null default '{}'::jsonb,
  chat_history jsonb not null default '[]'::jsonb,
  guide jsonb not null default '{}'::jsonb
);

create index if not exists onboarding_sessions_owner_updated_idx
  on onboarding_sessions (owner_id, updated_at desc);

create table if not exists knowledge_chunks (
  id text primary key,
  title text not null,
  excerpt text not null,
  uri text,
  source_type text not null default 'knowledge_base',
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536) not null,
  updated_at timestamptz not null default now()
);

create index if not exists knowledge_chunks_embedding_idx
  on knowledge_chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);
