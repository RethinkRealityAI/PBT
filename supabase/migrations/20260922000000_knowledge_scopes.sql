-- PBT September — knowledge scopes (docs/superpowers/specs/2026-09-21-knowledge-scopes-design.md).
-- Run after 20260921000000_fecal_scan.sql.
--
-- Every retrieval consumer (roleplay, scoring, coach, scenario-builder AI,
-- Fecal Scan) reads ONE knowledge_chunks table. Isolation used to be
-- incidental — a cat stool chart tagged `focus: gi` was a legitimate hit for a
-- GI roleplay, and a zero-hit focus retry searched the whole corpus. Scope is
-- now a property of the DOCUMENT, chosen by the admin who filed it:
--
--   tags.tools   jsonb string array — WHO may retrieve it
--                (roleplay · scoring · coach · scenario-builder · fecal-scan)
--   tags.species jsonb string array — WHICH animals (dog · puppy · cat)
--
-- Retrieval treats both as HARD filters (`tags @> '{"tools":["…"]}'`, i.e.
-- "array contains") and never relaxes them; see
-- netlify/functions/_shared/retrieval.ts.
--
-- Adds:
--   • a backfill of tools/species on knowledge_documents.metadata.tags and on
--     every knowledge_chunks.tags row, plus promotion of the scalar
--     `species: 'dog'` the first fecal seed wrote into a one-element array;
--   • match_knowledge_chunks(…) re-created with doc_slug + doc_title columns,
--     so a retrieved passage can say which document it came from (the admin
--     search tester and the Fecal Scan grounding panel both show it).
--
-- ⚠ APPLY THIS WITH (OR BEFORE) THE DEPLOY. Until it runs, chunks carry no
-- `tools` tag and are therefore invisible to scoped retrieval — the app would
-- degrade to un-grounded prompts (fail-open, not broken, but ungrounded).
--
-- Idempotent and hand-run (see CLAUDE.md → "Database migrations").

-- The four training-session tools. Fecal Scan is deliberately NOT in the
-- default set (mirrors DEFAULT_KNOWLEDGE_TOOLS in
-- src/shared/knowledge/knowledgeScopes.ts): a document only reaches the scan
-- when someone files it there on purpose.

-- ────────────────────────────────────────────────────────────
-- 1. Backfill knowledge_documents.metadata.tags
-- ────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.knowledge_documents') is null then
    return;
  end if;

  -- 1a. Make sure there IS a tags object to write into (jsonb_set only
  --     creates the last element of a path).
  update public.knowledge_documents
     set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{tags}', '{}'::jsonb, true)
   where jsonb_typeof(coalesce(metadata, '{}'::jsonb) -> 'tags') is distinct from 'object';

  -- 1b. Promote a scalar species ("dog") to a one-element array (["dog"]).
  update public.knowledge_documents
     set metadata = jsonb_set(
           metadata,
           '{tags,species}',
           jsonb_build_array(metadata -> 'tags' -> 'species'),
           true)
   where jsonb_typeof(metadata -> 'tags' -> 'species') = 'string';

  -- 1c. tools where missing: the fecal charts are scan-only, everything else
  --     gets the training-session set.
  update public.knowledge_documents
     set metadata = jsonb_set(
           metadata,
           '{tags,tools}',
           case
             when slug like 'fecal:%' then '["fecal-scan"]'::jsonb
             else '["roleplay","scoring","coach","scenario-builder"]'::jsonb
           end,
           true)
   where jsonb_typeof(metadata -> 'tags' -> 'tools') is distinct from 'array';

  -- 1d. species where missing: a fecal chart is about its own species (the
  --     slug is `fecal:<species>`); anything else applies to every animal.
  update public.knowledge_documents
     set metadata = jsonb_set(
           metadata,
           '{tags,species}',
           case
             when slug like 'fecal:%' then jsonb_build_array(split_part(slug, ':', 2))
             else '["dog","puppy","cat"]'::jsonb
           end,
           true)
   where jsonb_typeof(metadata -> 'tags' -> 'species') is distinct from 'array';
end
$$;

-- ────────────────────────────────────────────────────────────
-- 2. Backfill knowledge_chunks.tags
--    Retrieval filters on CHUNK tags, so this is the half that actually
--    decides what a tool can see. The fecal rule joins back to the document
--    because a chunk row does not carry the slug.
-- ────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.knowledge_chunks') is null
     or to_regclass('public.knowledge_documents') is null then
    return;
  end if;

  update public.knowledge_chunks
     set tags = coalesce(tags, '{}'::jsonb)
   where tags is null or jsonb_typeof(tags) is distinct from 'object';

  update public.knowledge_chunks
     set tags = jsonb_set(tags, '{species}', jsonb_build_array(tags -> 'species'), true)
   where jsonb_typeof(tags -> 'species') = 'string';

  update public.knowledge_chunks kc
     set tags = jsonb_set(
           kc.tags,
           '{tools}',
           case
             when kd.slug like 'fecal:%' then '["fecal-scan"]'::jsonb
             else '["roleplay","scoring","coach","scenario-builder"]'::jsonb
           end,
           true)
    from public.knowledge_documents kd
   where kd.id = kc.doc_id
     and jsonb_typeof(kc.tags -> 'tools') is distinct from 'array';

  update public.knowledge_chunks kc
     set tags = jsonb_set(
           kc.tags,
           '{species}',
           case
             when kd.slug like 'fecal:%' then jsonb_build_array(split_part(kd.slug, ':', 2))
             else '["dog","puppy","cat"]'::jsonb
           end,
           true)
    from public.knowledge_documents kd
   where kd.id = kc.doc_id
     and jsonb_typeof(kc.tags -> 'species') is distinct from 'array';
end
$$;

-- ────────────────────────────────────────────────────────────
-- 3. match_knowledge_chunks — add provenance columns
--    Same 4-arg signature as 20260816000000_knowledge_safety.sql, same body
--    (including `kd.deleted_at is null`), plus doc_slug / doc_title. The
--    RETURN type changes, so the old function must be dropped first —
--    CREATE OR REPLACE cannot change a function's result type.
-- ────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.knowledge_chunks') is not null
     and to_regclass('public.knowledge_documents') is not null then
    drop function if exists public.match_knowledge_chunks(vector, int, jsonb, text[]);

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
      similarity float,
      doc_slug text,
      doc_title text
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
        1 - (kc.embedding <=> query_embedding) as similarity,
        kd.slug as doc_slug,
        kd.title as doc_title
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

-- Re-assert the grants 20260917000000_advisor_hardening.sql set: the function
-- was just re-created, so PostgreSQL's default EXECUTE grant to PUBLIC is
-- back. Only the service role (which bypasses grants) may call this — it is a
-- SECURITY DEFINER read path into the whole clinical corpus, and no RLS policy
-- references it, so revoking cannot break a policy.
do $$
declare
  fn text;
begin
  for fn in
    select p.oid::regprocedure::text
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'match_knowledge_chunks'
  loop
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon', fn);
    execute format('revoke all on function %s from authenticated', fn);
  end loop;
end
$$;
