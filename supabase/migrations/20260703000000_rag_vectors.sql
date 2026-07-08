-- PBT July — RAG vectors: embeddings + similarity search (SOW §3.2).
-- Run after 20260702000000_rag_foundation.sql.
--
-- Adds:
--   • pgvector extension.
--   • knowledge_chunks — embedded segments of knowledge_documents
--     (vector(768): gemini-embedding-001, MRL-truncated + L2-normalised).
--   • match_knowledge_chunks() — cosine similarity RPC with jsonb tag filter,
--     called by the public rag-retrieve function via the service role.
--   • ai_call_telemetry call_type 'retrieval'.
-- Session-chunk (rag_chunks) embeddings are deferred to a later pass.

create extension if not exists vector;

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references public.knowledge_documents(id) on delete cascade,
  chunk_idx int not null,
  content text not null,
  token_estimate int,
  -- Filterable tags (AND-of-equality via @> containment): category, focus
  -- area (gi/dermatitis/urinary/weight/aging), pushback_id, driver, etc.
  tags jsonb,
  -- Human-readable citation, e.g. "Davies et al., 2024 — Vet Rec".
  citation text,
  embedding vector(768),
  created_at timestamptz default now(),
  unique (doc_id, chunk_idx)
);

create index if not exists knowledge_chunks_doc_idx
  on public.knowledge_chunks (doc_id, chunk_idx);
create index if not exists knowledge_chunks_tags_idx
  on public.knowledge_chunks using gin (tags);
create index if not exists knowledge_chunks_embedding_idx
  on public.knowledge_chunks using hnsw (embedding vector_cosine_ops);

alter table public.knowledge_chunks enable row level security;

drop policy if exists "admin_knowledge_chunks_select" on public.knowledge_chunks;
create policy "admin_knowledge_chunks_select" on public.knowledge_chunks for select
  using (public.is_admin());
drop policy if exists "admin_knowledge_chunks_all" on public.knowledge_chunks;
create policy "admin_knowledge_chunks_all" on public.knowledge_chunks for all
  using (public.is_admin()) with check (public.is_admin());

-- Cosine similarity search with optional AND-of-equality tag filter.
-- '{}'::jsonb @> matches everything, so no filter = full-corpus search.
create or replace function public.match_knowledge_chunks(
  query_embedding vector(768),
  match_count int default 4,
  filter jsonb default '{}'
)
returns table (
  content text,
  citation text,
  tags jsonb,
  similarity float
)
language sql
stable
security definer
set search_path = public
as $$
  select
    kc.content,
    kc.citation,
    kc.tags,
    1 - (kc.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks kc
  where kc.embedding is not null
    and kc.tags @> filter
  order by kc.embedding <=> query_embedding
  limit match_count;
$$;

-- Telemetry: allow the retrieval call type.
alter table public.ai_call_telemetry
  drop constraint if exists ai_call_telemetry_call_type_check;
alter table public.ai_call_telemetry
  add constraint ai_call_telemetry_call_type_check
  check (call_type in ('roleplay','evaluate','voice','hint','vision','retrieval'));
