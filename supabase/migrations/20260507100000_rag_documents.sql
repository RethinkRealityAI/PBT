-- PBT — RAG document store.
--
-- One row per training session, populated when the session ends. Holds the
-- assembled `content` (system prompt + transcript + critique) plus a
-- structured `metadata` blob suitable for filtering/retrieval. An optional
-- `embedding` column is reserved for pgvector use; it stays null until you
-- enable the extension and back-fill via a worker.
--
-- Reads are admin-only (via Netlify Functions + service role); writes are
-- own-rows so the consumer client can populate immediately on session end.

create table if not exists public.rag_documents (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.training_sessions(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  -- The trainable text: scenario context + transcript + scorer critique,
  -- normalised into a single string ready for chunking / embedding.
  content text not null,
  -- Structured metadata for retrieval filters: pushback id, driver, scenario
  -- breed/age/persona, scorecard, telemetry rollup. Mirrors `rag_export_v1`
  -- but persisted at write time so RAG indexers don't have to re-aggregate.
  metadata jsonb not null,
  -- Reserved: drop in `vector(1536)` (or your dimension) once pgvector is on.
  embedding text,
  created_at timestamptz default now()
);

create unique index if not exists rag_documents_session_unique
  on public.rag_documents (session_id);
create index if not exists rag_documents_created_idx
  on public.rag_documents (created_at desc);
create index if not exists rag_documents_pushback_idx
  on public.rag_documents ((metadata->>'pushback_id'));
create index if not exists rag_documents_driver_idx
  on public.rag_documents ((metadata->>'driver'));

alter table public.rag_documents enable row level security;

-- Owners write their own row on session end.
drop policy if exists "own_rag_insert" on public.rag_documents;
create policy "own_rag_insert" on public.rag_documents for insert
  with check (auth.uid() = user_id or user_id is null);

-- No client-side select policy — admin reads go through Netlify Functions
-- using the service role.

-- ─────────────────────────────────────────────────────────────
-- Drop the cross-user admin select policies introduced in the previous
-- migration. With server-side admin API, RLS no longer needs to grant
-- cross-user reads to anyone — Netlify Functions bypass RLS via the
-- service role and enforce admin themselves.
-- ─────────────────────────────────────────────────────────────
drop policy if exists "admin_profile_select" on public.profiles;
drop policy if exists "admin_sessions_select" on public.training_sessions;
drop policy if exists "admin_ai_telemetry_select" on public.ai_call_telemetry;
drop policy if exists "admin_turn_telemetry_select" on public.ai_turn_telemetry;
drop policy if exists "admin_scenarios_select" on public.user_scenarios;
drop policy if exists "admin_analyzer_select" on public.analyzer_events;
drop policy if exists "admin_nav_select" on public.nav_events;

-- The is_admin helper stays — it's still used by the admin Netlify
-- Functions to verify the caller (via `select is_admin from profiles where ...`).
