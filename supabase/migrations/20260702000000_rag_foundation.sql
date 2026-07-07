-- PBT July — RAG pipeline foundation (SOW §3.2).
-- Run after 20260701000000_user_management.sql.
--
-- Adds:
--   • knowledge_documents — the ingested working knowledge base (driver
--     personas, pushback taxonomy, ACT guide, clinical reference + custom
--     docs), one row per document, ready to feed an embedder. Seeded from the
--     code knowledge modules via the admin-knowledge function's 'seed' op.
--   • rag_chunks — embedding-ready segments of each training session
--     (customer/staff exchange pairs + a coaching summary chunk), tagged with
--     structured metadata. Complements the per-session rag_documents row.

-- ────────────────────────────────────────────────────────────
-- knowledge_documents
-- ────────────────────────────────────────────────────────────
create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  -- Stable identity for code-seeded docs (e.g. 'driver:Activator',
  -- 'pushback:cost', 'act:acknowledge', 'clinical:bcs'); custom docs get
  -- 'custom:<uuid>'.
  slug text not null unique,
  title text not null,
  category text not null check (category in ('driver','pushback','act','clinical','custom')),
  content text not null,
  metadata jsonb,
  -- Where this came from: 'code-seed' for module-derived docs, 'admin' for
  -- hand-entered ones.
  source text not null default 'admin' check (source in ('code-seed','admin')),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists knowledge_documents_category_idx
  on public.knowledge_documents (category);

alter table public.knowledge_documents enable row level security;

-- Admin-only (reads via service-role functions; the consumer app's prompts
-- already embed this knowledge from code).
drop policy if exists "admin_knowledge_select" on public.knowledge_documents;
create policy "admin_knowledge_select" on public.knowledge_documents for select
  using (public.is_admin());
drop policy if exists "admin_knowledge_all" on public.knowledge_documents;
create policy "admin_knowledge_all" on public.knowledge_documents for all
  using (public.is_admin()) with check (public.is_admin());

drop trigger if exists knowledge_documents_updated_at on public.knowledge_documents;
create trigger knowledge_documents_updated_at before update on public.knowledge_documents
  for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────────────────────
-- rag_chunks — segmented, tagged, embedding-ready session slices
-- ────────────────────────────────────────────────────────────
create table if not exists public.rag_chunks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.training_sessions(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  chunk_idx int not null,
  -- 'exchange' = one customer→staff turn pair; 'coaching' = the scorer's
  -- critique + better-alternative for the whole session.
  chunk_type text not null check (chunk_type in ('exchange','coaching')),
  content text not null,
  token_estimate int,
  -- Structured filters for retrieval: driver, pushback_id, breed, mode,
  -- score_band, turn_range, dimension scores, etc.
  tags jsonb,
  created_at timestamptz default now(),
  unique (session_id, chunk_idx)
);

create index if not exists rag_chunks_session_idx
  on public.rag_chunks (session_id, chunk_idx);
create index if not exists rag_chunks_tags_idx
  on public.rag_chunks using gin (tags);

alter table public.rag_chunks enable row level security;

-- Owner writes their own session's chunks (mirrors rag_documents); admin reads all.
drop policy if exists "own_rag_chunks_insert" on public.rag_chunks;
create policy "own_rag_chunks_insert" on public.rag_chunks for insert
  with check (auth.uid() = user_id);
drop policy if exists "own_rag_chunks_update" on public.rag_chunks;
create policy "own_rag_chunks_update" on public.rag_chunks for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "admin_rag_chunks_select" on public.rag_chunks;
create policy "admin_rag_chunks_select" on public.rag_chunks for select
  using (public.is_admin());
