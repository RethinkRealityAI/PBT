-- ─────────────────────────────────────────────────────────────────────────────
-- Knowledge sync lease + explicit retrieval grant
-- ─────────────────────────────────────────────────────────────────────────────
--
-- HAND-RUN (see CLAUDE.md "Database migrations & deploy alignment").
-- Idempotent: safe to run twice and out of order.
--
-- 1. public.knowledge_sync_lease — a single-row lease that serialises the
--    self-seeding knowledge sync (`netlify/functions/_shared/knowledgeSyncRun.ts`).
--    The background function's cooldown reads `metadata.sync.syncedAt`, which
--    is only written AFTER a sync finishes, so N cold `flags-resolve`
--    instances after a deploy could each start a full sync: multiplied
--    Gemini spend, and one run's chunk delete-then-insert interleaving with
--    another's (a document body from run B with chunks from run A). The sync
--    now takes this lease before planning and exits quietly when another run
--    holds it.
--
--    RLS is enabled with NO policies: no client role can read or write it.
--    Only the two SECURITY DEFINER functions below touch the row, and only
--    the service role may execute them.
--
-- 2. match_knowledge_chunks — explicit EXECUTE grant to service_role.
--    20260917000000_advisor_hardening.sql / 20260922000000_knowledge_scopes.sql
--    revoked PUBLIC/anon/authenticated and claimed the service role "bypasses
--    grants". It does not: service_role bypasses RLS, not function privileges.
--    Retrieval has only worked because of Supabase's default privileges
--    granting EXECUTE on new public functions to service_role. Make it
--    explicit so a project without those defaults (or a future re-create)
--    cannot silently break retrieval.
--
-- Until this migration is applied, the sync refuses to run (it fails closed
-- on a missing lease function, logs why, and leaves the stored corpus as is);
-- retrieval and the rest of the app are unaffected.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Lease table ──────────────────────────────────────────────────────────

create table if not exists public.knowledge_sync_lease (
  id int primary key check (id = 1),
  holder text,
  expires_at timestamptz not null default now()
);

alter table public.knowledge_sync_lease enable row level security;

-- No policies on purpose (deny-all for anon/authenticated). Drop any that a
-- previous hand-edit may have added.
do $$
declare
  pol record;
begin
  for pol in
    select policyname
      from pg_policies
     where schemaname = 'public'
       and tablename = 'knowledge_sync_lease'
  loop
    execute format('drop policy if exists %I on public.knowledge_sync_lease', pol.policyname);
  end loop;
end
$$;

revoke all on table public.knowledge_sync_lease from public;
revoke all on table public.knowledge_sync_lease from anon;
revoke all on table public.knowledge_sync_lease from authenticated;

-- ── Lease functions ─────────────────────────────────────────────────────────

-- Take (or renew) the lease. Atomic: a single INSERT … ON CONFLICT DO UPDATE
-- whose update only applies when the current lease has expired or is already
-- ours; concurrent callers serialise on the row lock, so exactly one wins.
-- Returns true when `p_holder` holds the lease after the call.
create or replace function public.knowledge_sync_try_lease(p_holder text, p_ttl_seconds int)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  got text;
begin
  if p_holder is null or length(p_holder) = 0 or length(p_holder) > 200 then
    return false;
  end if;
  if p_ttl_seconds is null or p_ttl_seconds <= 0 then
    return false;
  end if;

  insert into public.knowledge_sync_lease as l (id, holder, expires_at)
  values (1, p_holder, now() + make_interval(secs => least(p_ttl_seconds, 3600)))
  on conflict (id) do update
    set holder = excluded.holder,
        expires_at = excluded.expires_at
    where l.expires_at < now()
       or l.holder = excluded.holder
  returning l.holder into got;

  return got is not null and got = p_holder;
end;
$$;

-- Release the lease, but only if `p_holder` still holds it (a run that
-- overran its TTL must not release a successor's lease).
create or replace function public.knowledge_sync_release_lease(p_holder text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.knowledge_sync_lease
     set holder = null,
         expires_at = now() - interval '1 second'
   where id = 1
     and holder = p_holder;
end;
$$;

-- Explicit privileges — do not rely on default privileges either way.
revoke all on function public.knowledge_sync_try_lease(text, int) from public;
revoke all on function public.knowledge_sync_try_lease(text, int) from anon;
revoke all on function public.knowledge_sync_try_lease(text, int) from authenticated;
grant execute on function public.knowledge_sync_try_lease(text, int) to service_role;

revoke all on function public.knowledge_sync_release_lease(text) from public;
revoke all on function public.knowledge_sync_release_lease(text) from anon;
revoke all on function public.knowledge_sync_release_lease(text) from authenticated;
grant execute on function public.knowledge_sync_release_lease(text) to service_role;

-- ── 2. match_knowledge_chunks — explicit service_role grant ────────────────

do $$
declare
  fn text;
begin
  if to_regprocedure('public.match_knowledge_chunks(vector, integer, jsonb, text[])') is not null then
    execute 'grant execute on function public.match_knowledge_chunks(vector, integer, jsonb, text[]) to service_role';
  else
    -- `vector` may live in a schema that is not on this session's search_path
    -- (e.g. `extensions`), which makes the signature above unresolvable even
    -- though the function exists. Grant on every overload by name instead.
    for fn in
      select p.oid::regprocedure::text
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname = 'match_knowledge_chunks'
    loop
      execute format('grant execute on function %s to service_role', fn);
    end loop;
  end if;
end
$$;
