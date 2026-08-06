alter table knowledge_sources
  add column if not exists connector_kind text not null default 'legacy',
  add column if not exists connector_config jsonb not null default '{}'::jsonb,
  add column if not exists allowed_content_types jsonb not null default '[]'::jsonb,
  add column if not exists allowed_triggers jsonb not null default '[]'::jsonb,
  add column if not exists credential_ref text,
  add column if not exists publication_policy text not null default 'auto_after_validation',
  add column if not exists enabled boolean not null default true,
  add column if not exists validation_config jsonb not null default '{}'::jsonb,
  add column if not exists last_successful_run_at timestamptz;

alter table knowledge_source_versions
  add column if not exists manifest_hash text,
  add column if not exists status text not null default 'published',
  add column if not exists producing_run_id uuid,
  add column if not exists connector_version text,
  add column if not exists extractor_version text,
  add column if not exists sanitizer_version text,
  add column if not exists chunker_version text,
  add column if not exists validation_summary jsonb not null default '{}'::jsonb,
  add column if not exists published_at timestamptz,
  add column if not exists rejected_at timestamptz;

update knowledge_source_versions
set manifest_hash = content_hash,
    published_at = coalesce(published_at, captured_at)
where manifest_hash is null;

create table if not exists ingestion_schedules (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references knowledge_sources(id) on delete cascade,
  cron_expression text not null,
  timezone text not null,
  enabled boolean not null default true,
  next_run_at timestamptz not null,
  last_enqueued_at timestamptz,
  misfire_policy text not null default 'run_once',
  max_runtime_seconds integer not null default 900 check (max_runtime_seconds > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id),
  check (misfire_policy in ('run_once'))
);

create index if not exists ingestion_schedules_due_idx
  on ingestion_schedules (enabled, next_run_at);

create table if not exists ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references knowledge_sources(id) on delete cascade,
  trigger_type text not null,
  trigger_ref text,
  requested_by text,
  idempotency_key text not null unique,
  scheduled_for timestamptz,
  available_at timestamptz not null default now(),
  status text not null default 'queued',
  attempt integer not null default 0 check (attempt >= 0),
  worker_id text,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  candidate_version_id text,
  document_count integer not null default 0 check (document_count >= 0),
  character_count integer not null default 0 check (character_count >= 0),
  chunk_count integer not null default 0 check (chunk_count >= 0),
  embedding_count integer not null default 0 check (embedding_count >= 0),
  safe_error_code text,
  safe_error_message text,
  validation_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (trigger_type in ('manual', 'scheduled', 'event', 'reindex')),
  check (status in ('queued', 'running', 'unchanged', 'requires_review', 'succeeded', 'failed', 'cancelled'))
);

create index if not exists ingestion_runs_queue_idx
  on ingestion_runs (status, available_at, created_at);

create index if not exists ingestion_runs_source_created_idx
  on ingestion_runs (source_id, created_at desc);

create index if not exists ingestion_runs_source_lease_idx
  on ingestion_runs (source_id, lease_expires_at);

create table if not exists ingestion_run_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references ingestion_runs(id) on delete cascade,
  event_type text not null,
  reason_code text,
  input_hash text,
  output_hash text,
  metadata jsonb not null default '{}'::jsonb,
  event_at timestamptz not null default now()
);

create index if not exists ingestion_run_events_run_event_idx
  on ingestion_run_events (run_id, event_at);

create table if not exists knowledge_source_documents (
  id uuid primary key default gen_random_uuid(),
  source_version_id text not null references knowledge_source_versions(id) on delete cascade,
  document_key text not null,
  canonical_uri text not null,
  title text not null,
  media_type text not null,
  content_hash text not null,
  content text not null,
  artifact_ref text,
  upstream_updated_at timestamptz,
  etag text,
  access_scope text not null default 'all_users',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source_version_id, document_key)
);

create index if not exists knowledge_source_documents_content_hash_idx
  on knowledge_source_documents (content_hash);

create index if not exists knowledge_source_versions_manifest_idx
  on knowledge_source_versions (source_id, manifest_hash);
