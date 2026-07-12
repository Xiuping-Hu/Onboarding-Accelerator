alter table knowledge_chunks
  add column if not exists embedding_profile text not null default 'openai:text-embedding-3-small';

alter table knowledge_chunks
  drop constraint if exists knowledge_chunks_pkey;

alter table knowledge_chunks
  add constraint knowledge_chunks_pkey primary key (id, embedding_profile);

create index if not exists knowledge_chunks_embedding_profile_idx
  on knowledge_chunks (embedding_profile);
