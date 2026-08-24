-- PBT August — knowledge-base safety net (admin audit findings #2, #3, #12).
-- Run after 20260814000000_scenario_knowledge.sql.
--
-- Adds:
--   • knowledge_documents.deleted_at — deleting a document from the admin
--     Knowledge screen becomes a SOFT delete ("Recently deleted"), so an
--     accidental delete no longer destroys an ingested corpus. Chunks are left
--     in place; retrieval simply stops seeing them (see the RPC below), which
--     makes restore free — no re-embedding.
--   • admin_audit_log entity_type 'knowledge_document' — knowledge deletes are
--     now audited (and revertible from the audit log).
--   • match_knowledge_chunks(…) — same 4-arg signature, plus a
--     `kd.deleted_at is null` join filter so soft-deleted documents drop out of
--     retrieval immediately.
--   • knowledge_chunk_counts — a per-document chunk count view. The admin
--     Knowledge screen used to fetch every chunk row's doc_id to count them,
--     which PostgREST silently truncates at 1000 rows (under-reporting the
--     corpus). Service-role only: security_invoker keeps RLS on the base table
--     governing access rather than the view owner's rights.

-- ────────────────────────────────────────────────────────────
-- knowledge_documents.deleted_at
-- ────────────────────────────────────────────────────────────
alter table public.knowledge_documents
  add column if not exists deleted_at timestamptz;

comment on column public.knowledge_documents.deleted_at is
  'Soft-delete tombstone. Non-null rows are hidden from the Knowledge list and from RAG retrieval, but are restorable (their chunks + embeddings survive).';

create index if not exists knowledge_documents_deleted_idx
  on public.knowledge_documents (deleted_at);

-- ────────────────────────────────────────────────────────────
-- admin_audit_log — new entity type
-- ────────────────────────────────────────────────────────────
alter table public.admin_audit_log
  drop constraint if exists admin_audit_log_entity_type_check;
alter table public.admin_audit_log
  add constraint admin_audit_log_entity_type_check
  check (entity_type in (
    'flag','flag_rule','scenario_override','simulation_config','user',
    'role','invite','email_settings','email_template','knowledge_document'
  ));

-- ────────────────────────────────────────────────────────────
-- match_knowledge_chunks — hide soft-deleted documents from retrieval
-- Same 4-arg signature as 20260814000000_scenario_knowledge.sql.
-- ────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.knowledge_chunks') is not null
     and to_regclass('public.knowledge_documents') is not null then
    create or replace function public.match_knowledge_chunks(
      query_embedding vector(768),
      match_count int default 4,
      filter jsonb default '{}',
      doc_slugs text[] default null
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
    as $func$
      select
        kc.content,
        kc.citation,
        kc.tags,
        1 - (kc.embedding <=> query_embedding) as similarity
      from public.knowledge_chunks kc
      join public.knowledge_documents kd on kd.id = kc.doc_id
      where kc.embedding is not null
        and kd.deleted_at is null
        and kc.tags @> filter
        and (doc_slugs is null or kd.slug = any(doc_slugs))
      order by kc.embedding <=> query_embedding
      limit match_count;
    $func$;
  end if;
end $$;

-- ────────────────────────────────────────────────────────────
-- knowledge_chunk_counts — chunks per document, counted in the database
-- ────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.knowledge_chunks') is not null then
    execute $v$
      create or replace view public.knowledge_chunk_counts as
      select doc_id, count(*)::int as chunks
      from public.knowledge_chunks
      group by doc_id;
    $v$;
    execute $v$ alter view public.knowledge_chunk_counts set (security_invoker = true) $v$;
  end if;
end $$;
