-- ─────────────────────────────────────────────────────────────────────────────
-- ECHO style quiz results — one row per COMPLETED quiz, for admin analytics
-- ─────────────────────────────────────────────────────────────────────────────
--
-- HAND-RUN (see CLAUDE.md "Database migrations & deploy alignment").
-- Idempotent: safe to run twice and out of order. No DROP, no ALTER of an
-- existing table, no UPDATE: one new table, its indexes and comments, and an
-- insert-only backfill.
--
-- Why: workshops sometimes tell trainees to "just click A" through the ECHO
-- quiz to get into the app; those profiles pollute ECHO analytics. Until now
-- the only record was `profiles.echo_primary / echo_secondary / echo_tally`
-- for signed-in users — no answers, no timings, nothing for anonymous users.
-- This table keeps every completed quiz (anonymous included), so the admin
-- portal (Analytics → ECHO) can flag rushed / straight-lined quizzes at READ
-- time (thresholds adjustable live: `src/shared/analytics/echoQuality.ts`).
--
-- Writers (service role only — RLS is on with NO policies and every client
-- grant is revoked; browsers can neither read nor write it):
--   • `echo-quiz-save` — inserts a row per completed quiz, owned by the
--     verified account (`user_id`) or by the device's random id
--     (`anon_session_id`, `pbt:session_id` — like anonymous training
--     sessions). The server DERIVES drivers / tally / primary / secondary from
--     the letters; a client tally is never trusted. Nothing is written with
--     the trainee's "Allow training data use" opt-out or in an admin preview.
--     `claim` moves a device's row to the account after sign-in (guarded in
--     the statement: `user_id is null and anon_session_id = <device>`).
--   • `admin-analytics` POST `op=echo-review` — `review_status` / note /
--     reviewer (permission `insights.review`).
--   • `account-delete` deletes the caller's rows explicitly (the FK also
--     cascades).
--
-- Backfill: one `profile_backfill` row per existing profile with an
-- `echo_tally` (answers unknown → null; drivers and tally copied as stored;
-- time = the profile's created_at). Skipped when that profile already has
-- one (partial unique index), so a re-run inserts nothing.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.echo_quiz_results (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        references auth.users (id) on delete cascade,
  anon_session_id  text        check (anon_session_id is null or anon_session_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  source           text        not null default 'app' check (source in ('app', 'profile_backfill')),
  created_at       timestamptz not null default now(),
  taken_at         timestamptz,
  locale           text        check (locale is null or locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  answers          jsonb       check (answers is null or (jsonb_typeof(answers) = 'array' and jsonb_array_length(answers) <= 16)),
  tie_breaker      jsonb       check (tie_breaker is null or jsonb_typeof(tie_breaker) = 'object'),
  primary_driver   text        not null check (primary_driver in ('Activator', 'Energizer', 'Analyzer', 'Harmonizer')),
  secondary_driver text        check (secondary_driver is null or secondary_driver in ('Activator', 'Energizer', 'Analyzer', 'Harmonizer')),
  tally            jsonb       not null check (jsonb_typeof(tally) = 'object'),
  total_ms         integer     check (total_ms is null or total_ms between 0 and 7200000),
  undo_count       integer     check (undo_count is null or undo_count between 0 and 500),
  review_status    text        not null default 'auto' check (review_status in ('auto', 'include', 'exclude')),
  review_note      text        check (review_note is null or char_length(review_note) <= 500),
  reviewed_by      uuid        references auth.users (id) on delete set null,
  reviewed_at      timestamptz,
  -- Exactly one owner: an account or a device.
  constraint echo_quiz_results_one_owner check (num_nonnulls(user_id, anon_session_id) = 1),
  -- A backfilled row comes from a signed-in profile and has no answers; an
  -- app row always has them.
  constraint echo_quiz_results_source_shape check (
    (source = 'profile_backfill' and user_id is not null and answers is null)
    or (source = 'app' and answers is not null)
  )
);

create index if not exists echo_quiz_results_created_at_idx
  on public.echo_quiz_results (created_at desc);
create index if not exists echo_quiz_results_user_id_idx
  on public.echo_quiz_results (user_id) where user_id is not null;
create index if not exists echo_quiz_results_anon_session_id_idx
  on public.echo_quiz_results (anon_session_id) where anon_session_id is not null;
-- One backfilled row per account (makes the backfill below idempotent).
create unique index if not exists echo_quiz_results_profile_backfill_uniq
  on public.echo_quiz_results (user_id) where source = 'profile_backfill';

alter table public.echo_quiz_results enable row level security;

revoke all on table public.echo_quiz_results from anon, authenticated;
revoke all on table public.echo_quiz_results from public;
grant select, insert, update, delete on table public.echo_quiz_results to service_role;

comment on table public.echo_quiz_results is
  'One row per completed ECHO style quiz (anonymous included), for admin ECHO analytics: '
  'rushed / straight-lined detection is computed at read time. Written by echo-quiz-save '
  '(drivers derived server-side from the letters), reviewed via admin-analytics op=echo-review. '
  'Service role only (RLS on, no policies, no client grants). '
  'Migration 20261106000000_echo_quiz_results.sql.';
comment on column public.echo_quiz_results.anon_session_id is
  'The random per-device id (pbt:session_id) owning an anonymous quiz; null once claimed by an account.';
comment on column public.echo_quiz_results.source is
  'app = recorded by the trainee app; profile_backfill = copied from profiles.echo_* (no answers) when this table was created.';
comment on column public.echo_quiz_results.created_at is
  'Server time the row was written — the authoritative time (profile_backfill: the profile''s created_at).';
comment on column public.echo_quiz_results.taken_at is
  'When the device says the quiz finished (informational, device clock).';
comment on column public.echo_quiz_results.answers is
  'Final answer per question after undos: [{q, letter, driver, ms}] — ms from the question being shown to the answer.';
comment on column public.echo_quiz_results.tie_breaker is
  'The tie-breaker answer {q:16, letter, driver, ms} when the top two drivers tied; else null.';
comment on column public.echo_quiz_results.tally is
  'Votes per driver derived on the server from the letters (tie-breaker included when it counted).';
comment on column public.echo_quiz_results.review_status is
  'auto = the automatic quality flags decide; include / exclude = an admin''s decision, which overrides them.';

-- ── Backfill: existing signed-in profiles ───────────────────────────────────
do $$
begin
  if to_regclass('public.profiles') is not null then
    insert into public.echo_quiz_results
      (user_id, source, created_at, taken_at, primary_driver, secondary_driver, tally)
    select
      p.user_id,
      'profile_backfill',
      coalesce(p.created_at, p.updated_at, now()),
      coalesce(p.created_at, p.updated_at),
      p.echo_primary,
      case when p.echo_secondary in ('Activator', 'Energizer', 'Analyzer', 'Harmonizer') then p.echo_secondary end,
      p.echo_tally
    from public.profiles p
    where p.echo_tally is not null
      and jsonb_typeof(p.echo_tally) = 'object'
      and p.echo_primary in ('Activator', 'Energizer', 'Analyzer', 'Harmonizer')
      and exists (select 1 from auth.users u where u.id = p.user_id)
      and not exists (
        select 1 from public.echo_quiz_results e
        where e.user_id = p.user_id and e.source = 'profile_backfill'
      )
    on conflict do nothing;
  end if;
end $$;
