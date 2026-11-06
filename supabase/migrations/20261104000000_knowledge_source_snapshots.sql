-- ─────────────────────────────────────────────────────────────────────────────
-- Private source text for the external knowledge corpora
-- ─────────────────────────────────────────────────────────────────────────────
--
-- HAND-RUN (see CLAUDE.md "Database migrations & deploy alignment").
-- Idempotent: safe to run twice and out of order. No DROP statements.
--
-- public.knowledge_source_snapshots holds the reviewed Markdown snapshot of
-- every document in an external corpus — the Royal Canin Academy articles
-- (`corpus = 'academy'`) and the Royal Canin feline assets (`'feline'`).
-- The repository is public and that text is © Royal Canin, so it is kept out
-- of git: git holds only the manifests (`knowledge/<corpus>/manifest.json`),
-- which PIN each document's sha256 (`contentHash`). The knowledge sync
-- (`netlify/functions/_shared/knowledgeExternal.ts`) reads a row only when
-- sha256(content) equals the pin; a missing row, a mismatch or an unreadable
-- table skips the whole corpus and retires nothing.
--
-- A row here is NEVER retrievable by itself: only the sync, with the
-- corpus's publish gate open, writes knowledge_documents / knowledge_chunks.
--
-- `meta` carries provenance that must not be in a public repo (e.g. the
-- Box share URL of a feline asset). It is read by the service role only.
--
-- RLS is enabled with NO policies and every client grant is revoked: only
-- the service role (scripts with SUPABASE_SERVICE_ROLE_KEY, the Netlify
-- functions) can read or write it.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.knowledge_source_snapshots (
  corpus       text        not null check (corpus ~ '^[a-z][a-z0-9-]{1,31}$'),
  slug         text        not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,199}$'),
  content      text        not null check (char_length(content) between 1 and 2000000),
  content_hash text        not null check (content_hash ~ '^[0-9a-f]{64}$'),
  source_hash  text                 check (source_hash is null or source_hash ~ '^[0-9a-f]{64}$'),
  meta         jsonb       not null default '{}'::jsonb check (jsonb_typeof(meta) = 'object'),
  updated_at   timestamptz not null default now(),
  primary key (corpus, slug)
);

alter table public.knowledge_source_snapshots enable row level security;

revoke all on table public.knowledge_source_snapshots from anon, authenticated;
revoke all on table public.knowledge_source_snapshots from public;
grant select, insert, update, delete on table public.knowledge_source_snapshots to service_role;

comment on table public.knowledge_source_snapshots is
  'Reviewed source text of the external knowledge corpora (academy, feline), kept out of the public git repo. '
  'The knowledge sync accepts a row only when sha256(content) equals the contentHash pinned in '
  'knowledge/<corpus>/manifest.json. Service role only (RLS on, no policies, no client grants). '
  'Migration 20261104000000_knowledge_source_snapshots.sql.';
comment on column public.knowledge_source_snapshots.corpus is
  'External corpus: academy (Royal Canin Academy articles) | feline (Royal Canin feline assets).';
comment on column public.knowledge_source_snapshots.slug is
  'Document slug inside the corpus, without the corpus prefix (the sync writes <corpus>:<slug>).';
comment on column public.knowledge_source_snapshots.content is
  'The document body as Markdown (what knowledge_documents.content will hold).';
comment on column public.knowledge_source_snapshots.content_hash is
  'sha256 hex of content — must equal the manifest pin or the sync skips the corpus.';
comment on column public.knowledge_source_snapshots.source_hash is
  'sha256 hex of the source (canonicalised CMS JSON for academy; the file bytes for feline).';
comment on column public.knowledge_source_snapshots.meta is
  'Provenance (title, authors, edition, pages, source URL, …). May hold links that must stay out of git.';
