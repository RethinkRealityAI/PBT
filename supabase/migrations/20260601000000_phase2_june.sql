-- PBT Phase 2 — June updates.
-- Run after 20260508100000_scenario_builder_fields.sql.
--
-- Adds:
--   • analyzer_events: Pet Vision fields (AI-estimated breed/age/dermatitis,
--     confidence, capture source). Vision persists structured results only —
--     the raw photo is never uploaded.
--   • session_feedback: post-session "rate the simulation" responses
--     (scenario realism, AI response quality, user comfort). Anonymous-safe.
--   • platform_reports: in-app bug reports + suggestions routed to admin.
--   • ai_call_telemetry.call_type: allow 'vision' so the Pet Vision call
--     shows up in the AI Quality / cost telemetry alongside roleplay + eval.

-- ────────────────────────────────────────────────────────────
-- ai_call_telemetry: permit the new 'vision' call type
-- ────────────────────────────────────────────────────────────
alter table public.ai_call_telemetry
  drop constraint if exists ai_call_telemetry_call_type_check;
alter table public.ai_call_telemetry
  add constraint ai_call_telemetry_call_type_check
  check (call_type in ('roleplay','evaluate','voice','hint','vision'));

-- ────────────────────────────────────────────────────────────
-- analyzer_events: Pet Vision Analyzer fields
-- ────────────────────────────────────────────────────────────
alter table public.analyzer_events
  -- 'manual' = fields typed by hand; 'vision' = AI-estimated from a photo
  -- (and possibly hand-corrected before saving).
  add column if not exists source text check (source in ('manual','vision')) default 'manual',
  add column if not exists age_estimate text,
  -- 0.0–1.0 model confidence in the breed call (NOT a percentage).
  add column if not exists breed_confidence numeric
    check (breed_confidence is null or (breed_confidence >= 0 and breed_confidence <= 1)),
  -- Structured dermatitis findings: { severity, indicators[], note }.
  add column if not exists dermatitis jsonb;

-- ────────────────────────────────────────────────────────────
-- session_feedback: "rate the simulation" responses
-- ────────────────────────────────────────────────────────────
create table if not exists public.session_feedback (
  id uuid primary key default gen_random_uuid(),
  -- Nullable: a session may have been run anonymously (no training_sessions
  -- row) so we don't FK-constrain it — we keep the client-side session id as
  -- a loose reference plus the anon session id for attribution.
  session_id uuid,
  user_id uuid references auth.users(id) on delete set null,
  anon_session_id text,
  -- 1–5 Likert ratings. Supplied dimensions per the SOW.
  realism int check (realism between 1 and 5),
  ai_quality int check (ai_quality between 1 and 5),
  comfort int check (comfort between 1 and 5),
  comment text,
  scenario_summary text,
  pushback_id text,
  created_at timestamptz default now()
);

create index if not exists session_feedback_created_idx
  on public.session_feedback (created_at desc);
create index if not exists session_feedback_session_idx
  on public.session_feedback (session_id);

alter table public.session_feedback enable row level security;

-- Anonymous + authed users can write their own feedback; admins read all.
drop policy if exists "any_feedback_insert" on public.session_feedback;
create policy "any_feedback_insert" on public.session_feedback for insert
  with check (
    (auth.uid() is null and user_id is null)
    or auth.uid() = user_id
  );

drop policy if exists "admin_feedback_select" on public.session_feedback;
create policy "admin_feedback_select" on public.session_feedback for select
  using (public.is_admin());

-- ────────────────────────────────────────────────────────────
-- platform_reports: in-app bug reports + suggestions
-- ────────────────────────────────────────────────────────────
create table if not exists public.platform_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  anon_session_id text,
  kind text not null check (kind in ('bug','suggestion')),
  message text not null,
  -- Screen the user was on when they opened the report (best-effort context).
  screen text,
  user_agent text,
  -- Triage workflow state, managed by admins.
  status text not null check (status in ('open','triaged','resolved','dismissed')) default 'open',
  created_at timestamptz default now()
);

create index if not exists platform_reports_created_idx
  on public.platform_reports (created_at desc);
create index if not exists platform_reports_status_idx
  on public.platform_reports (status, created_at desc);

alter table public.platform_reports enable row level security;

-- Anonymous + authed users can file their own reports; admins read all.
drop policy if exists "any_reports_insert" on public.platform_reports;
create policy "any_reports_insert" on public.platform_reports for insert
  with check (
    (auth.uid() is null and user_id is null)
    or auth.uid() = user_id
  );

drop policy if exists "admin_reports_select" on public.platform_reports;
create policy "admin_reports_select" on public.platform_reports for select
  using (public.is_admin());
