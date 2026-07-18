create table if not exists rag_source_snapshots (
  source_id text primary key,
  uri text not null,
  title text not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now()
);
