-- 20261015000000_anonymous_sessions.sql
--
-- Anonymous practice sessions are recorded, without identifying details.
--
-- PBT is anonymous-first: most trainees practise without an account. Until
-- now only signed-in sessions reached `training_sessions` (the client upserts
-- its own row, which RLS ties to `auth.uid()`), so an anonymous session left
-- nothing but app-usage events (`nav_events`) and AI-call telemetry — no
-- transcript, no score, no objection — and the admin Analytics could not see
-- it. On 1 October 2026 alone, 79 anonymous devices opened ~60 text sessions
-- and ~90 voice sessions that are invisible in Analytics → Sessions.
--
--   • `user_id` becomes nullable. An anonymous row carries `anon_session_id`
--     instead: the random per-device id the app already keeps in
--     `pbt:session_id` and sends with every `nav_events` / `session_feedback`
--     row. No name, no email, no account. A CHECK keeps every row owned by
--     one or the other.
--   • Anonymous rows are written ONLY by the server (service role): the new
--     `session-save` function (the conversation, when it ends or is left) and
--     `ai-evaluate` (the score). RLS is unchanged — `auth.uid() = user_id` is
--     never true for a NULL owner, so no browser can read or write them.
--     Both writers refuse when the trainee switched off "Allow training data
--     use" (`allowTelemetry: false`) and in the admin's preview mode.
--   • `locale` — the app language the session was played in ('en' / 'fr' …;
--     regex CHECK like `profiles.locale`, so a new locale needs no migration).
--     Written for signed-in and anonymous sessions from this release on.
--   • `origin` — 'app' (written by the app or the server, as always) or
--     'reconstructed' (rebuilt below from app-usage events for anonymous
--     sessions played before this release; no transcript and no score were
--     ever stored for those, and the screens say so).
--
-- Backfill (idempotent): one 'reconstructed' row per anonymous text session
-- the app announced with a `session_open` event, never overwriting a real
-- row. It knows when the session started, which objection, the mode and the
-- device; it ended "Finished" when the same device opened the scorecard
-- before its next session (within 90 minutes), "Left" (with the reason the
-- app logged) on a `session_abandon` event, and unknown otherwise. Anonymous
-- VOICE sessions before this release logged no `session_open`, so they cannot
-- be rebuilt (their AI usage is still in `ai_call_telemetry`).
--
-- `nav_events` is anonymous-insertable and its timestamps come from the
-- browser, so the backfill trusts nothing it reads:
--   • only events between the product's first release (2026-05-01) and the
--     release cutoff (2026-10-16 00:00 UTC), so a later re-run never rebuilds
--     a session this release recorded or failed to record;
--   • a leave or scorecard moment counts only within 6 hours after the open
--     (otherwise the ending stays unknown);
--   • durations are clamped to 0–6 h before the integer cast;
--   • the objection id is at most 65 characters.
--
-- Apply BEFORE deploying this release. The code writes and reads these
-- columns everywhere sessions are saved, not only in the admin: on a database
-- without them, signed-in session saves (`locale`), scores (`ai-evaluate`),
-- the sign-in backfill (`origin`), `session-save` and Analytics → Sessions all
-- fail. `npm run verify:db` reports the missing columns. Safe to re-run.

do $$
begin
  if to_regclass('public.training_sessions') is null then
    raise notice 'training_sessions missing — skipping anonymous sessions';
    return;
  end if;

  alter table public.training_sessions alter column user_id drop not null;
  alter table public.training_sessions add column if not exists anon_session_id text;
  alter table public.training_sessions add column if not exists locale text;
  alter table public.training_sessions add column if not exists origin text not null default 'app';

  if not exists (
    select 1 from pg_constraint
    where conname = 'training_sessions_owner_check'
      and conrelid = 'public.training_sessions'::regclass
  ) then
    alter table public.training_sessions
      add constraint training_sessions_owner_check
      check (user_id is not null or anon_session_id is not null);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'training_sessions_anon_session_id_check'
      and conrelid = 'public.training_sessions'::regclass
  ) then
    alter table public.training_sessions
      add constraint training_sessions_anon_session_id_check
      check (anon_session_id is null or char_length(anon_session_id) between 8 and 64);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'training_sessions_locale_check'
      and conrelid = 'public.training_sessions'::regclass
  ) then
    alter table public.training_sessions
      add constraint training_sessions_locale_check
      check (locale is null or locale ~ '^[a-z]{2}(-[A-Z]{2})?$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'training_sessions_origin_check'
      and conrelid = 'public.training_sessions'::regclass
  ) then
    alter table public.training_sessions
      add constraint training_sessions_origin_check
      check (origin in ('app', 'reconstructed'));
  end if;
end $$;

create index if not exists training_sessions_anon_session_idx
  on public.training_sessions (anon_session_id)
  where anon_session_id is not null;

comment on column public.training_sessions.anon_session_id is
  'Random per-device id (pbt:session_id) of an anonymous trainee; null for signed-in sessions. Written only by the server.';
comment on column public.training_sessions.locale is
  'App language the session was played in (en, fr, …). Null on sessions before 2026-10-15.';
comment on column public.training_sessions.origin is
  'app = recorded by the app/server; reconstructed = rebuilt from nav_events for an anonymous session before 2026-10-15 (no transcript, no score).';

-- ─── Backfill: rebuild anonymous text sessions from app-usage events ──────

do $$
begin
  if to_regclass('public.nav_events') is null then
    raise notice 'nav_events missing — skipping the anonymous backfill';
    return;
  end if;

  with opens as (
    select
      (n.meta->>'sessionId')::uuid as id,
      min(n.created_at) as opened_at,
      (array_agg(n.anon_session_id order by n.created_at))[1] as anon_id,
      (array_agg(n.meta->>'mode' order by n.created_at))[1] as mode,
      (array_agg(n.meta->>'driver' order by n.created_at))[1] as driver,
      (array_agg(n.meta->>'scenario' order by n.created_at))[1] as pushback_id
    from public.nav_events n
    where n.target = 'session_open'
      and n.user_id is null
      and n.anon_session_id is not null
      and char_length(n.anon_session_id) between 8 and 64
      and n.meta->>'sessionId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and char_length(n.meta->>'scenario') between 1 and 65
      and n.created_at >= timestamptz '2026-05-01 00:00:00+00'
      and n.created_at < least(now(), timestamptz '2026-10-16 00:00:00+00')
    group by 1
  ),
  sequenced as (
    select o.*,
      lead(o.opened_at) over (partition by o.anon_id order by o.opened_at) as next_open
    from opens o
  ),
  abandons as (
    select
      (n.meta->>'sessionId')::uuid as id,
      min(n.created_at) as left_at,
      (array_agg(n.meta->>'reason' order by n.created_at))[1] as reason,
      max(case when (n.meta->>'turns') ~ '^[0-9]{1,3}$' then (n.meta->>'turns')::int end) as turns
    from public.nav_events n
    where n.target = 'session_abandon'
      and n.meta->>'sessionId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and n.created_at < least(now(), timestamptz '2026-10-16 00:00:00+00')
    group by 1
  ),
  rebuilt as (
    select
      s.*,
      -- A leave stamped before the open or more than 6 h after it is clock
      -- skew or forged — ignored, so the ending stays unknown.
      case when a.left_at > s.opened_at and a.left_at <= s.opened_at + interval '6 hours' then a.left_at end as left_at,
      a.reason,
      case when a.left_at > s.opened_at and a.left_at <= s.opened_at + interval '6 hours' then a.turns end as turns,
      (
        select min(v.created_at)
        from public.nav_events v
        where v.anon_session_id = s.anon_id
          and v.event_type = 'screen_view'
          and v.screen = 'stats'
          and v.created_at > s.opened_at
          and v.created_at < least(
            coalesce(s.next_open, 'infinity'::timestamptz),
            s.opened_at + interval '90 minutes',
            timestamptz '2026-10-16 00:00:00+00'
          )
      ) as scored_at
    from sequenced s
    left join abandons a on a.id = s.id
  )
  insert into public.training_sessions (
    id, user_id, anon_session_id, origin, scenario, transcript, mode, completed,
    ended_reason, pushback_id, driver, turns, duration_seconds, created_at, flagged
  )
  select
    r.id,
    null,
    r.anon_id,
    'reconstructed',
    jsonb_build_object('pushback', jsonb_build_object('id', r.pushback_id)),
    '[]'::jsonb,
    case when r.mode in ('text', 'voice') then r.mode else 'text' end,
    -- Finished = reached the scorecard and was not left first.
    (r.scored_at is not null and (r.left_at is null or r.left_at > r.scored_at)),
    case
      when r.left_at is not null and (r.scored_at is null or r.left_at < r.scored_at)
        then case when r.reason in ('user_exit', 'timeout', 'error') then r.reason else 'abandoned' end
      when r.scored_at is not null then 'completed'
      else null
    end,
    r.pushback_id,
    case when r.driver in ('Activator', 'Energizer', 'Analyzer', 'Harmonizer') then r.driver end,
    r.turns,
    -- Clamped BEFORE the cast: an out-of-range epoch must never abort the
    -- migration with "integer out of range".
    case
      when r.left_at is not null and (r.scored_at is null or r.left_at < r.scored_at)
        then least(greatest(extract(epoch from (r.left_at - r.opened_at)), 0), 21600)::int
      when r.scored_at is not null
        then least(greatest(extract(epoch from (r.scored_at - r.opened_at)), 0), 21600)::int
    end,
    coalesce(
      case when r.left_at is not null and (r.scored_at is null or r.left_at < r.scored_at) then r.left_at end,
      r.scored_at,
      r.opened_at
    ),
    false
  from rebuilt r
  where r.pushback_id is not null
  on conflict (id) do nothing;
end $$;
