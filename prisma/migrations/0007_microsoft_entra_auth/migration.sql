alter table users
  alter column password_hash drop not null;

alter table users
  add column if not exists microsoft_tenant_id text,
  add column if not exists microsoft_object_id text;

create unique index if not exists users_microsoft_identity_key
  on users (microsoft_tenant_id, microsoft_object_id)
  where microsoft_tenant_id is not null
    and microsoft_object_id is not null;

create index if not exists users_microsoft_tenant_idx
  on users (microsoft_tenant_id)
  where microsoft_tenant_id is not null;
