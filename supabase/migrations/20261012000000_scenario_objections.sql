-- PBT Scenario Studio — team-authored objections, trainee scenario species,
-- and "added to the library from…" provenance.
-- Run after 20260925000000_scenario_species.sql.
--
-- STATUS: written 2026-10-12, NOT yet applied to production (the apply was
-- held back for the owner's go-ahead). scripts/verify-db-schema.mjs lists its
-- table and columns as DEFERRED (warning, not failure) until it is. Apply it
-- before, or with, the deploy that ships the Objections tab — without it the
-- Objections tab shows a "database update needed" notice and saves nothing.
--
-- Why (client request, 2026-10-12): the team needs to add new subject areas
-- (probiotics first, feline next) without a deploy, decide per scenario which
-- animal it is for, and turn a trainee's own scenario into a library scenario.
--
-- What it adds:
--   1. public.scenario_objections — objections ("pushback categories")
--      authored in the Studio, alongside the seven built into the code.
--        • id 'team:<slug>' (CHECK) — can never collide with a built-in id,
--          which is what scenario_overrides.pushback_id /
--          user_scenarios.pushback_id / training_sessions.pushback_id store.
--        • species text[] — which animals it applies to ('dog','cat'; never
--          empty); focus_area — the knowledge topic it belongs to (same
--          vocabulary as scenario_overrides.focus_area, validated in code).
--        • coaching jsonb — the same lists as the built-in taxonomy
--          (rootConcerns, acknowledgePatterns, clarifyQuestions,
--          takeActionPatterns, watchOuts); the server merges them into the
--          simulation config so the AI customer uses them like a built-in.
--        • visible = false retires it (hidden from pickers, existing scenarios
--          still play); deleted_at soft-deletes it (refused while a scenario
--          uses it — enforced by admin-objections).
--      RLS on with NO policies: only the service role (admin-objections,
--      flags-resolve, the AI functions) touches it, exactly like
--      scenario_overrides. created_by / updated_by are `on delete set null`:
--      shared content survives its author (see account-delete.ts header).
--   2. user_scenarios.species — 'dog' | 'cat' | NULL (NULL = dog, every row
--      written before trainees could pick an animal).
--   3. scenario_overrides.copied_from — for an `admin:` scenario created from
--      another one ("Add to library" on a trainee's scenario, or Duplicate):
--      the source id ('user:<uuid>' / 'seed:<n>' / 'admin:<uuid>'). Display
--      only — the Studio shows "Already in the library" on the trainee's card.
--      Stripped from the public flags snapshot.
--   4. admin_audit_log entity_type gains 'scenario_objection'.
--
-- Until this is applied the app degrades safely, never fails:
--   • flags-resolve serves no team objections (built-ins only);
--   • admin-objections answers 503 with a plain "run the migration" message;
--   • the trainee app's user_scenarios insert retries without `species`;
--   • admin-scenario-overrides retries a save without `copied_from`.
--
-- Idempotent and guarded: safe to re-run; cross-table alters are skipped on a
-- project where the table does not exist yet.

-- ── 1. scenario_objections ────────────────────────────────────────────────
create table if not exists public.scenario_objections (
  id text primary key,
  title text not null,
  example text not null default '',
  title_fr text,
  example_fr text,
  species text[] not null default array['dog', 'cat']::text[],
  focus_area text,
  coaching jsonb not null default '{}'::jsonb,
  visible boolean not null default true,
  sort_order integer,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'scenario_objections_id_check'
      and conrelid = 'public.scenario_objections'::regclass
  ) then
    alter table public.scenario_objections
      add constraint scenario_objections_id_check
      check (id ~ '^team:[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'scenario_objections_text_check'
      and conrelid = 'public.scenario_objections'::regclass
  ) then
    alter table public.scenario_objections
      add constraint scenario_objections_text_check
      check (
        char_length(btrim(title)) between 1 and 80
        and char_length(example) <= 300
        and (title_fr is null or char_length(title_fr) <= 80)
        and (example_fr is null or char_length(example_fr) <= 300)
        and (focus_area is null or char_length(focus_area) <= 40)
        and octet_length(coaching::text) <= 60000
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'scenario_objections_species_check'
      and conrelid = 'public.scenario_objections'::regclass
  ) then
    alter table public.scenario_objections
      add constraint scenario_objections_species_check
      check (
        cardinality(species) between 1 and 2
        and species <@ array['dog', 'cat']::text[]
      );
  end if;
end $$;

alter table public.scenario_objections enable row level security;
-- No policies: service role only (admin functions + flags-resolve).
revoke all on public.scenario_objections from anon, authenticated;

drop trigger if exists scenario_objections_updated_at on public.scenario_objections;
create trigger scenario_objections_updated_at before update on public.scenario_objections
  for each row execute function public.set_updated_at();

comment on table public.scenario_objections is
  'Team-authored objections (pushback categories) for scenarios, beside the seven built into the code. id = team:<slug>. Service role only.';
comment on column public.scenario_objections.species is
  'Animals the objection applies to: subset of {dog, cat}, never empty.';
comment on column public.scenario_objections.coaching is
  'Built-in taxonomy lists: rootConcerns, acknowledgePatterns, clarifyQuestions, takeActionPatterns, watchOuts (string arrays).';
comment on column public.scenario_objections.visible is
  'false = retired: hidden from pickers; scenarios already built on it still play.';

-- ── 2. user_scenarios.species ─────────────────────────────────────────────
do $$
begin
  if to_regclass('public.user_scenarios') is not null then
    alter table public.user_scenarios
      add column if not exists species text;

    if not exists (
      select 1 from pg_constraint
      where conname = 'user_scenarios_species_check'
        and conrelid = 'public.user_scenarios'::regclass
    ) then
      alter table public.user_scenarios
        add constraint user_scenarios_species_check
        check (species is null or species in ('dog', 'cat'));
    end if;

    comment on column public.user_scenarios.species is
      'Which animal the trainee built the scenario for: dog | cat. NULL = dog.';
  end if;
end $$;

-- ── 3. scenario_overrides.copied_from ─────────────────────────────────────
do $$
begin
  if to_regclass('public.scenario_overrides') is not null then
    alter table public.scenario_overrides
      add column if not exists copied_from text;

    if not exists (
      select 1 from pg_constraint
      where conname = 'scenario_overrides_copied_from_check'
        and conrelid = 'public.scenario_overrides'::regclass
    ) then
      alter table public.scenario_overrides
        add constraint scenario_overrides_copied_from_check
        check (
          copied_from is null
          or (char_length(copied_from) <= 80 and copied_from ~ '^(seed|user|admin):')
        );
    end if;

    comment on column public.scenario_overrides.copied_from is
      'For an admin: scenario created from another one: the source scenario id (user:/seed:/admin:). Display only; never in the public snapshot.';
  end if;
end $$;

-- ── 4. Audit entity type ──────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.admin_audit_log') is not null then
    alter table public.admin_audit_log
      drop constraint if exists admin_audit_log_entity_type_check;
    alter table public.admin_audit_log
      add constraint admin_audit_log_entity_type_check check (
        entity_type in (
          'flag',
          'flag_rule',
          'scenario_override',
          'scenario_objection',
          'simulation_config',
          'user',
          'role',
          'invite',
          'email_settings',
          'email_template',
          'knowledge_document',
          'report'
        )
      );
  end if;
end $$;
