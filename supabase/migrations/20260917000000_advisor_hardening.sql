-- ────────────────────────────────────────────────────────────────────────────
-- Security-advisor hardening (pre-handover sweep)
-- ────────────────────────────────────────────────────────────────────────────
--
-- Closes the two actionable findings from Supabase's security linter that can
-- be fixed in SQL without changing behaviour. Run alongside the
-- server-authoritative-scores migration.
--
-- Deliberately NOT changed here, with reasons, so the next person doesn't
-- "fix" them and break production:
--
--   • `is_admin()` / `is_owner()` executable by anon + authenticated
--     (lint 0028/0029). These are called INSIDE RLS policy expressions, and a
--     policy expression is evaluated with the querying role's privileges — so
--     revoking EXECUTE would make every policy that uses them raise instead of
--     returning false. They also leak nothing: each returns a boolean about
--     the CALLER, so an anonymous caller gets `false`. Left as-is on purpose.
--
--   • `rls_enabled_no_policy` on admin_audit_log, email_settings, flag_rules,
--     flags and scenario_overrides (lint 0008, INFO). This is the intended
--     posture, not an oversight: RLS on with no policy denies every client
--     role, and those tables are reached only by service-role Netlify
--     Functions that check a named permission first
--     (see CLAUDE.md → "Access control"). Deny-by-default is the goal.
--
--   • `vector` extension in the public schema (lint 0014). Supabase's own
--     default location. Moving it rewrites every pgvector reference and the
--     `match_knowledge_chunks` signature for no attacker-visible gain.
--
-- Idempotent and hand-run (see CLAUDE.md → "Database migrations & deploy
-- alignment").

-- ── 1. Pin search_path on the existing trigger/helper functions ────────────
--
-- A role-mutable search_path lets a role with CREATE on an earlier schema
-- shadow an object the function body resolves unqualified. ALTER (rather than
-- CREATE OR REPLACE) so the bodies are untouched — this changes resolution
-- only. `pg_catalog` first so built-ins can't be shadowed; `public` after so
-- the unqualified table references in these bodies still resolve.
do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    alter function public.set_updated_at() set search_path = pg_catalog, public;
  end if;
  if to_regprocedure('public.sync_is_admin()') is not null then
    alter function public.sync_is_admin() set search_path = pg_catalog, public;
  end if;
  if to_regprocedure('public.sync_admin_role()') is not null then
    alter function public.sync_admin_role() set search_path = pg_catalog, public;
  end if;
end
$$;

-- ── 2. Take the knowledge-base retrieval RPC off the public API ────────────
--
-- `match_knowledge_chunks` is SECURITY DEFINER and, by PostgreSQL's default
-- grant to PUBLIC, was callable over PostgREST by anyone — signed in or not —
-- at /rest/v1/rpc/match_knowledge_chunks. That is a direct read path into the
-- curated clinical knowledge base: with crafted embeddings and a large
-- match_count, an anonymous caller could walk the whole corpus.
--
-- Nothing legitimate needs that grant. The only caller is
-- `netlify/functions/_shared/retrieval.ts`, which runs with the service role
-- (and the service role bypasses these grants), behind the rate-limited
-- `rag-retrieve` endpoint. No RLS policy references the function, so revoking
-- cannot break a policy the way it would for is_admin().
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
