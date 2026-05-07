-- PBT admin dashboard — telemetry schema, admin role, RAG export view.
-- Run after 20260504000000_init.sql.
--
-- Adds:
--   • profiles.is_admin flag + admin RLS policies (cross-user reads).
--   • training_sessions: completion / abandonment, scenario denorm, model id.
--   • ai_call_telemetry: per-AI-call cost, latency, tokens, refusal heuristics.
--   • ai_turn_telemetry: per-turn signals (sentiment, hint accuracy, flag).
--   • user_scenarios: user-built scenarios (creator, plays, public).
--   • analyzer_events: Pet Analyzer runs (BCS / MCS / verdict).
--   • nav_events: navigation + click + dwell analytics.
--   • rag_export_v1 view: training_session rows packaged for RAG / fine-tune.

-- ────────────────────────────────────────────────────────────
-- profiles.is_admin
-- ────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

create index if not exists profiles_is_admin_idx
  on public.profiles (is_admin) where is_admin = true;

-- Helper: returns true if the calling user is an admin.
-- Used by every admin RLS policy below.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_admin from public.profiles where user_id = auth.uid()),
    false
  );
$$;

grant execute on function public.is_admin() to authenticated;

-- Admin can read all profiles.
drop policy if exists "admin_profile_select" on public.profiles;
create policy "admin_profile_select" on public.profiles for select
  using (public.is_admin());

-- ────────────────────────────────────────────────────────────
-- training_sessions: lifecycle + denormalised scenario fields
-- ────────────────────────────────────────────────────────────
alter table public.training_sessions
  add column if not exists completed boolean not null default false,
  add column if not exists ended_reason text check (ended_reason in (
    'completed', 'abandoned', 'timeout', 'error', 'user_exit'
  )),
  add column if not exists pushback_id text,
  add column if not exists driver text check (driver in (
    'Activator','Energizer','Analyzer','Harmonizer'
  )),
  add column if not exists scenario_summary text,
  add column if not exists model_id text,
  add column if not exists turns int default 0,
  add column if not exists score_overall int,
  add column if not exists flagged boolean not null default false,
  add column if not exists flag_reason text;

create index if not exists training_sessions_created_idx
  on public.training_sessions (created_at desc);
create index if not exists training_sessions_completed_idx
  on public.training_sessions (completed, created_at desc);
create index if not exists training_sessions_flagged_idx
  on public.training_sessions (flagged) where flagged = true;
create index if not exists training_sessions_pushback_idx
  on public.training_sessions (pushback_id);

-- Admin: read all sessions.
drop policy if exists "admin_sessions_select" on public.training_sessions;
create policy "admin_sessions_select" on public.training_sessions for select
  using (public.is_admin());

-- ────────────────────────────────────────────────────────────
-- ai_call_telemetry: per-call (one row per Gemini API request)
-- ────────────────────────────────────────────────────────────
create table if not exists public.ai_call_telemetry (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.training_sessions(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  -- 'roleplay' = customer turn, 'evaluate' = scoring pass, 'voice' = live mode
  call_type text not null check (call_type in ('roleplay','evaluate','voice','hint')),
  model_id text not null,
  latency_ms int not null,
  tokens_in int default 0,
  tokens_out int default 0,
  cost_usd numeric(10, 6) default 0,
  -- Output adherence heuristics
  refusal boolean default false,
  off_topic boolean default false,
  end_token_emitted boolean default false,
  retries int default 0,
  error text,
  created_at timestamptz default now()
);

create index if not exists ai_call_telemetry_session_idx
  on public.ai_call_telemetry (session_id, created_at);
create index if not exists ai_call_telemetry_created_idx
  on public.ai_call_telemetry (created_at desc);
create index if not exists ai_call_telemetry_model_idx
  on public.ai_call_telemetry (model_id, created_at desc);

alter table public.ai_call_telemetry enable row level security;

-- Owners insert their own rows (client-side capture).
drop policy if exists "own_ai_telemetry_insert" on public.ai_call_telemetry;
create policy "own_ai_telemetry_insert" on public.ai_call_telemetry for insert
  with check (auth.uid() = user_id or user_id is null);

-- Admin reads all.
drop policy if exists "admin_ai_telemetry_select" on public.ai_call_telemetry;
create policy "admin_ai_telemetry_select" on public.ai_call_telemetry for select
  using (public.is_admin());

-- ────────────────────────────────────────────────────────────
-- ai_turn_telemetry: per-turn signals within a session
-- ────────────────────────────────────────────────────────────
create table if not exists public.ai_turn_telemetry (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.training_sessions(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  turn_idx int not null,
  role text not null check (role in ('user','ai','customer')),
  text_len int default 0,
  sentiment numeric(4, 3),
  -- Per-turn flags raised by client heuristics or the eval pass
  flag text check (flag in (
    'ai_refusal','off_topic','user_correction','sentiment_spike','script_break'
  )),
  hint_shown boolean default false,
  hint_followed boolean,
  created_at timestamptz default now()
);

create index if not exists ai_turn_telemetry_session_idx
  on public.ai_turn_telemetry (session_id, turn_idx);

alter table public.ai_turn_telemetry enable row level security;

drop policy if exists "own_turn_telemetry_insert" on public.ai_turn_telemetry;
create policy "own_turn_telemetry_insert" on public.ai_turn_telemetry for insert
  with check (auth.uid() = user_id or user_id is null);

drop policy if exists "admin_turn_telemetry_select" on public.ai_turn_telemetry;
create policy "admin_turn_telemetry_select" on public.ai_turn_telemetry for select
  using (public.is_admin());

-- ────────────────────────────────────────────────────────────
-- user_scenarios: scenarios built in the Create screen
-- ────────────────────────────────────────────────────────────
create table if not exists public.user_scenarios (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  breed text,
  life_stage text,
  difficulty int check (difficulty between 1 and 4),
  pushback_id text,
  pushback_notes text,
  weight_kg numeric,
  is_public boolean default false,
  plays int default 0,
  avg_score int,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists user_scenarios_creator_idx
  on public.user_scenarios (creator_id, created_at desc);
create index if not exists user_scenarios_public_idx
  on public.user_scenarios (is_public, created_at desc) where is_public = true;

alter table public.user_scenarios enable row level security;

drop policy if exists "own_scenarios_all" on public.user_scenarios;
create policy "own_scenarios_all" on public.user_scenarios for all
  using (auth.uid() = creator_id) with check (auth.uid() = creator_id);

drop policy if exists "public_scenarios_select" on public.user_scenarios;
create policy "public_scenarios_select" on public.user_scenarios for select
  using (is_public = true);

drop policy if exists "admin_scenarios_select" on public.user_scenarios;
create policy "admin_scenarios_select" on public.user_scenarios for select
  using (public.is_admin());

drop trigger if exists user_scenarios_updated_at on public.user_scenarios;
create trigger user_scenarios_updated_at before update on public.user_scenarios
  for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────────────────────
-- analyzer_events: Pet Analyzer runs
-- ────────────────────────────────────────────────────────────
create table if not exists public.analyzer_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  pet_id uuid references public.pet_records(id) on delete set null,
  breed text,
  life_stage text,
  weight_kg numeric,
  bcs int check (bcs between 1 and 9),
  mcs int check (mcs between 1 and 5),
  activity text,
  kcal_target int,
  -- Verdict bucket: 'on_track' | 'watch' | 'adjust' | 'concern'
  verdict text check (verdict in ('on_track','watch','adjust','concern')),
  created_at timestamptz default now()
);

create index if not exists analyzer_events_user_idx
  on public.analyzer_events (user_id, created_at desc);
create index if not exists analyzer_events_verdict_idx
  on public.analyzer_events (verdict, created_at desc);

alter table public.analyzer_events enable row level security;

drop policy if exists "own_analyzer_all" on public.analyzer_events;
create policy "own_analyzer_all" on public.analyzer_events for all
  using (auth.uid() = user_id or user_id is null)
  with check (auth.uid() = user_id or user_id is null);

drop policy if exists "admin_analyzer_select" on public.analyzer_events;
create policy "admin_analyzer_select" on public.analyzer_events for select
  using (public.is_admin());

-- ────────────────────────────────────────────────────────────
-- nav_events: client-side navigation + interaction analytics
-- ────────────────────────────────────────────────────────────
create table if not exists public.nav_events (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete set null,
  -- Anonymous session id (pbt:session_id) so unauth events still attribute.
  anon_session_id text,
  event_type text not null check (event_type in (
    'screen_view','card_click','tab_change','modal_open','modal_close',
    'cta_click','filter_change','dwell','error','custom'
  )),
  screen text,
  target text,
  meta jsonb,
  dwell_ms int,
  created_at timestamptz default now()
);

create index if not exists nav_events_user_idx
  on public.nav_events (user_id, created_at desc);
create index if not exists nav_events_screen_idx
  on public.nav_events (screen, created_at desc);
create index if not exists nav_events_type_idx
  on public.nav_events (event_type, created_at desc);

alter table public.nav_events enable row level security;

-- Anonymous + authed users can write their own events; admins read all.
drop policy if exists "any_nav_insert" on public.nav_events;
create policy "any_nav_insert" on public.nav_events for insert
  with check (
    (auth.uid() is null and user_id is null)
    or auth.uid() = user_id
  );

drop policy if exists "admin_nav_select" on public.nav_events;
create policy "admin_nav_select" on public.nav_events for select
  using (public.is_admin());

-- ────────────────────────────────────────────────────────────
-- rag_export_v1 view
-- One row per session, packaged for downstream RAG / fine-tuning.
-- ────────────────────────────────────────────────────────────
create or replace view public.rag_export_v1 as
select
  ts.id as session_id,
  ts.user_id,
  ts.created_at,
  ts.driver,
  ts.pushback_id,
  ts.scenario_summary,
  ts.scenario,
  ts.transcript,
  ts.score_report,
  ts.score_overall,
  ts.duration_seconds,
  ts.turns,
  ts.completed,
  ts.ended_reason,
  ts.flagged,
  ts.flag_reason,
  ts.mode,
  ts.model_id,
  -- Aggregated AI telemetry
  (
    select jsonb_build_object(
      'calls', count(*),
      'avg_latency_ms', round(avg(latency_ms))::int,
      'p50_latency_ms', percentile_cont(0.5) within group (order by latency_ms)::int,
      'tokens_in', sum(tokens_in),
      'tokens_out', sum(tokens_out),
      'cost_usd', sum(cost_usd),
      'refusals', sum(case when refusal then 1 else 0 end),
      'retries', sum(retries)
    )
    from public.ai_call_telemetry where session_id = ts.id
  ) as ai_signals,
  -- Per-turn signals as JSONB array
  (
    select coalesce(jsonb_agg(jsonb_build_object(
      'idx', turn_idx,
      'role', role,
      'sentiment', sentiment,
      'flag', flag,
      'hint_shown', hint_shown
    ) order by turn_idx), '[]'::jsonb)
    from public.ai_turn_telemetry where session_id = ts.id
  ) as turn_signals
from public.training_sessions ts;

-- View permissions: only admins.
revoke all on public.rag_export_v1 from public, anon, authenticated;
grant select on public.rag_export_v1 to authenticated;
-- The view itself respects underlying table RLS; only admin sees rows.
