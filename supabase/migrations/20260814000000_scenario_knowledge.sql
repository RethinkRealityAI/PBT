-- PBT August — scenario ↔ knowledge links (admin scenario creator UX pass).
-- Run after 20260805000000_rbac_invites_email.sql.
--
-- Adds:
--   • scenario_overrides.focus_area — the clinical focus a scenario belongs to
--     (weight / gi / dermatitis / urinary / aging / communication). Plain text
--     with a length CHECK, not an enum, so future focus areas need no migration
--     (same rationale as profiles.locale).
--   • scenario_overrides.knowledge_slugs — jsonb array of knowledge_documents
--     slugs explicitly attached to the scenario. Retrieval restricts to these
--     documents when present, else falls back to the focus-area tag filter.
--   • match_knowledge_chunks(…, doc_slugs) — the similarity RPC gains an
--     optional document-slug restriction (joined via knowledge_documents), so
--     explicit attachments work against already-embedded chunks without
--     re-embedding. The old 3-arg signature is dropped to avoid PostgREST
--     overload ambiguity.

alter table public.scenario_overrides
  add column if not exists focus_area text
    check (focus_area is null or char_length(focus_area) <= 40);
alter table public.scenario_overrides
  add column if not exists knowledge_slugs jsonb;

comment on column public.scenario_overrides.focus_area is
  'Clinical focus area key (weight/gi/dermatitis/urinary/aging/…); filters RAG retrieval for this scenario.';
comment on column public.scenario_overrides.knowledge_slugs is
  'jsonb string array of knowledge_documents.slug explicitly attached to this scenario.';

-- Replace the retrieval RPC with a doc-slug-aware version. Guard on the chunks
-- table existing (migrations may run out of order on a partially-synced project).
do $$
begin
  if to_regclass('public.knowledge_chunks') is not null
     and to_regclass('public.knowledge_documents') is not null then
    drop function if exists public.match_knowledge_chunks(vector, int, jsonb);

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
        and kc.tags @> filter
        and (doc_slugs is null or kd.slug = any(doc_slugs))
      order by kc.embedding <=> query_embedding
      limit match_count;
    $func$;
  end if;
end $$;
