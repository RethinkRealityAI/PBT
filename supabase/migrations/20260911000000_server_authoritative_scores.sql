-- ────────────────────────────────────────────────────────────────────────────
-- Server-authoritative scores on training_sessions
-- ────────────────────────────────────────────────────────────────────────────
--
-- THREAT: `training_sessions` has an own-rows RLS policy, which is exactly
-- right for a trainee saving their own transcript — but "own row" also means
-- a signed-in browser could upsert its own row with a hand-crafted
-- `score_report` / `score_overall` (a perfect 100, a fabricated critique) and
-- the History / Stats / Insights / RAG export surfaces would treat it as a
-- real evaluation. Now that scoring runs server-side (`ai-evaluate`, which
-- writes with the service role), the client has no legitimate reason to ever
-- send those two columns.
--
-- This trigger makes the database enforce that: a request running as the
-- `authenticated` or `anon` JWT role may not INSERT a non-null score and may
-- not UPDATE either score column to a different value. Everything else on the
-- row (transcript, duration_seconds, ended_reason, …) stays writable by the
-- owner, so the client's existing upsert keeps working as long as it omits
-- the score columns (an omitted column keeps `old` on UPDATE → passes).
--
-- The service role (`ai-evaluate`) and the SQL editor (`postgres`) pass:
-- `auth.role()` is 'service_role' / NULL there, and `current_user` is not
-- one of the two JWT roles.
--
-- `ai-evaluate` (netlify/functions/ai-evaluate.ts) is the ONLY writer of
-- score_report / score_overall.
--
-- Idempotent and hand-run (see CLAUDE.md → "Database migrations & deploy
-- alignment"). Apply with `npm run verify:db` before shipping the client
-- change that stops sending score columns.

create or replace function public.guard_server_authoritative_scores()
returns trigger
language plpgsql
as $$
declare
  caller text := coalesce(auth.role(), current_user::text);
begin
  if caller in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.score_report is not null or new.score_overall is not null then
        raise exception 'score_report is server-authoritative'
          using errcode = '42501';
      end if;
    elsif tg_op = 'UPDATE' then
      if new.score_report is distinct from old.score_report
         or new.score_overall is distinct from old.score_overall then
        raise exception 'score_report is server-authoritative'
          using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;

comment on function public.guard_server_authoritative_scores() is
  'Rejects client-role (authenticated/anon) writes to training_sessions.score_report / score_overall. Only the service role (ai-evaluate) may set a score.';

-- The trigger references training_sessions, which lives in the init
-- migration; guard so this file is safe to run against a partially-synced
-- project (migrations are hand-run and may land out of order).
do $$
begin
  if to_regclass('public.training_sessions') is not null then
    drop trigger if exists training_sessions_score_guard on public.training_sessions;
    create trigger training_sessions_score_guard
      before insert or update on public.training_sessions
      for each row
      execute function public.guard_server_authoritative_scores();
  end if;
end
$$;
