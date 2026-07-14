alter table onboarding_sessions
  add column if not exists revision bigint not null default 0;

create table if not exists knowledge_sources (
  id text primary key,
  uri text not null,
  title text not null,
  owner text not null,
  access_scope text not null default 'all_users',
  refresh_cadence text not null default 'manual',
  current_version_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists knowledge_source_versions (
  id text primary key,
  source_id text not null references knowledge_sources(id) on delete cascade,
  content_hash text not null,
  upstream_updated_at timestamptz not null,
  captured_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (source_id, content_hash)
);

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'knowledge_sources_current_version_fk'
  ) then
    alter table knowledge_sources
      add constraint knowledge_sources_current_version_fk
      foreign key (current_version_id) references knowledge_source_versions(id)
      deferrable initially deferred;
  end if;
end $$;

alter table knowledge_chunks
  add column if not exists source_id text,
  add column if not exists source_version_id text,
  add column if not exists section_key text;

create index if not exists knowledge_chunks_source_version_idx
  on knowledge_chunks (source_id, source_version_id);

create table if not exists knowledge_maps (
  id text primary key,
  slug text not null unique,
  title text not null,
  description text,
  tenant_id text,
  default_access_scope text not null default 'all_users',
  current_version_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists knowledge_map_versions (
  id text primary key,
  map_id text not null references knowledge_maps(id) on delete cascade,
  version_number integer not null,
  status text not null check (status in ('draft', 'published', 'archived')),
  change_note text,
  created_by text not null,
  published_by text,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (map_id, version_number)
);

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'knowledge_maps_current_version_fk'
  ) then
    alter table knowledge_maps
      add constraint knowledge_maps_current_version_fk
      foreign key (current_version_id) references knowledge_map_versions(id)
      deferrable initially deferred;
  end if;
end $$;

create table if not exists knowledge_map_nodes (
  id text primary key,
  map_version_id text not null references knowledge_map_versions(id) on delete cascade,
  stable_key text not null,
  kind text not null,
  title text not null,
  summary text not null,
  owner text,
  display_order integer not null default 0,
  access_scope text not null default 'all_users',
  controlling_document_required boolean not null default false,
  unique (map_version_id, stable_key)
);

create table if not exists knowledge_map_edges (
  id text primary key,
  map_version_id text not null references knowledge_map_versions(id) on delete cascade,
  from_node_id text not null references knowledge_map_nodes(id) on delete cascade,
  to_node_id text not null references knowledge_map_nodes(id) on delete cascade,
  relationship text not null,
  rationale text,
  display_order integer not null default 0
);

create table if not exists knowledge_map_source_bindings (
  id text primary key,
  map_version_id text not null references knowledge_map_versions(id) on delete cascade,
  node_id text references knowledge_map_nodes(id) on delete cascade,
  edge_id text references knowledge_map_edges(id) on delete cascade,
  source_id text not null references knowledge_sources(id) on delete restrict,
  source_version_id text references knowledge_source_versions(id) on delete restrict,
  section_key text,
  evidence_role text not null check (evidence_role in ('authoritative', 'supplemental')),
  check ((node_id is not null) <> (edge_id is not null))
);

create table if not exists knowledge_map_evidence_health (
  map_version_id text not null references knowledge_map_versions(id) on delete cascade,
  target_type text not null check (target_type in ('node', 'edge')),
  target_id text not null,
  state text not null check (state in ('current', 'stale', 'missing', 'conflicting', 'needs_review')),
  reason text,
  evaluated_at timestamptz not null default now(),
  primary key (map_version_id, target_type, target_id)
);

create table if not exists knowledge_audience_memberships (
  account_id text not null,
  tenant_id text,
  access_scope text not null,
  assigned_by text,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  primary key (account_id, access_scope)
);

create table if not exists knowledge_map_suggestions (
  id text primary key,
  map_version_id text not null references knowledge_map_versions(id) on delete cascade,
  proposal jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_by text not null,
  reviewed_by text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists knowledge_map_feedback (
  id text primary key,
  map_version_id text not null references knowledge_map_versions(id) on delete cascade,
  node_id text references knowledge_map_nodes(id) on delete set null,
  message_id text,
  category text not null,
  comment text,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_by text not null,
  created_at timestamptz not null default now(),
  resolved_by text,
  resolved_at timestamptz
);

create table if not exists knowledge_map_audit_events (
  id text primary key,
  actor_user_id text not null,
  action text not null,
  map_id text,
  map_version_id text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
