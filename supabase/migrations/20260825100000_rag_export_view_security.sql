-- rag_export_v1 was created as a default (definer-rights) view, so it ran
-- with the postgres owner's privileges and BYPASSED RLS on training_sessions
-- and ai_call_telemetry — combined with the original
-- `grant select ... to authenticated`, any signed-in user could read every
-- user's transcripts via PostgREST (`/rest/v1/rag_export_v1`).
--
-- The only legitimate reader is the admin-rag-export Netlify Function, which
-- uses the service role (BYPASSRLS), so both changes below are pure
-- lock-downs: no code path regresses.
do $$
begin
  if to_regclass('public.rag_export_v1') is not null then
    execute 'alter view public.rag_export_v1 set (security_invoker = true)';
    execute 'revoke select on public.rag_export_v1 from authenticated';
  end if;
end $$;
