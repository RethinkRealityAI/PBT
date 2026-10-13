-- PBT Scenario Studio — team-authored objections, trainee scenario species,
-- and "added to the library from…" provenance.
-- Run after 20260925000000_scenario_species.sql.
--
-- STATUS: written and APPLIED to production 2026-10-12 (the owner's
-- go-ahead), in parts through the SQL endpoint and recorded in
-- supabase_migrations.schema_migrations. Triggers use CREATE OR REPLACE so
-- the only destructive statement is the audit-log CHECK swap in section 4,
-- which Postgres can't widen in place.
--
-- Why (client request, 2026-10-12): the team needs to add new subject areas
-- (probiotics first, feline next) without a deploy, decide per scenario which
-- animal it is for, and turn a trainee's own scenario into a library scenario.
--
-- What it adds:
--   0. public.scenario_objection_categories — the subject areas training is
--      organised by ("Weight management", "Probiotics", "GI", …) and the
--      KNOWLEDGE CONTAINER for everything inside them.
--        • id = one of the three BUILT-IN category ids ('everyday-nutrition',
--          'weight', 'prescription-diets' — the code knows them even with no
--          row; a row with a built-in id is an admin's EDIT of it: name,
--          French name, attached knowledge) or 'category:<slug>' for one the
--          team created. Built-ins are never deleted (admin-objections).
--        • focus_area (knowledge topic, soft filter) + knowledge_slugs
--          (documents from knowledge_documents) — what every scenario on an
--          objection in this category reads unless the scenario picks its own
--          (src/shared/scenarios/objectionCategories.ts::effectiveKnowledge).
--      RLS on with NO policies, like the other Studio tables.
--   1. public.scenario_objections — objections ("pushback categories")
--      authored in the Studio, alongside the seven built into the code.
--        • id 'team:<slug>' (CHECK) — can never collide with a built-in id,
--          which is what scenario_overrides.pushback_id /
--          user_scenarios.pushback_id / training_sessions.pushback_id store.
--        • category_id — the category it belongs to (built-in id or
--          'category:<slug>'; CHECKed for shape, existence enforced by
--          admin-objections since built-ins have no row to reference).
--        • species text[] — which animals it applies to ('dog','cat'; never
--          empty).
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
--   4. admin_audit_log entity_type gains 'scenario_objection' and
--      'scenario_objection_category'.
--
-- Until this is applied the app degrades safely, never fails:
--   • flags-resolve serves no team objections (built-ins only);
--   • admin-objections answers 503 with a plain "run the migration" message;
--   • the trainee app's user_scenarios insert retries without `species`;
--   • admin-scenario-overrides retries a save without `copied_from`.
--
-- Idempotent and guarded: safe to re-run; cross-table alters are skipped on a
-- project where the table does not exist yet.

-- ── 0. scenario_objection_categories ──────────────────────────────────────
create table if not exists public.scenario_objection_categories (
  id text primary key,
  name text not null,
  name_fr text,
  description text not null default '',
  focus_area text,
  knowledge_slugs text[] not null default array[]::text[],
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
    where conname = 'scenario_objection_categories_id_check'
      and conrelid = 'public.scenario_objection_categories'::regclass
  ) then
    alter table public.scenario_objection_categories
      add constraint scenario_objection_categories_id_check
      check (
        id in ('everyday-nutrition', 'weight', 'prescription-diets')
        or id ~ '^category:[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$'
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'scenario_objection_categories_text_check'
      and conrelid = 'public.scenario_objection_categories'::regclass
  ) then
    alter table public.scenario_objection_categories
      add constraint scenario_objection_categories_text_check
      check (
        char_length(btrim(name)) between 1 and 60
        and (name_fr is null or char_length(name_fr) <= 60)
        and char_length(description) <= 300
        and (focus_area is null or char_length(focus_area) <= 40)
        and cardinality(knowledge_slugs) <= 40
      );
  end if;
end $$;

alter table public.scenario_objection_categories enable row level security;
-- No policies: service role only (admin-objections, flags-resolve, the AI functions).
revoke all on public.scenario_objection_categories from anon, authenticated;

create or replace trigger scenario_objection_categories_updated_at before update on public.scenario_objection_categories
  for each row execute function public.set_updated_at();

comment on table public.scenario_objection_categories is
  'Subject areas for objections (Weight management, Probiotics, GI, …) and the knowledge their scenarios read. Built-in ids are edits of code-defined categories; category:<slug> = team-created. Service role only.';
comment on column public.scenario_objection_categories.knowledge_slugs is
  'knowledge_documents.slug values every scenario in this category reads, unless the scenario picks its own knowledge.';

-- ── 1. scenario_objections ────────────────────────────────────────────────
create table if not exists public.scenario_objections (
  id text primary key,
  title text not null,
  example text not null default '',
  title_fr text,
  example_fr text,
  species text[] not null default array['dog', 'cat']::text[],
  category_id text not null,
  coaching jsonb not null default '{}'::jsonb,
  visible boolean not null default true,
  sort_order integer,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- A database that ran an earlier draft of this file (before categories)
-- already has scenario_objections WITHOUT category_id, so the create above
-- was skipped: add the column, file existing rows under the built-in
-- 'everyday-nutrition' category, then require it. No-ops on a fresh table.
alter table public.scenario_objections add column if not exists category_id text;
update public.scenario_objections set category_id = 'everyday-nutrition' where category_id is null;
alter table public.scenario_objections alter column category_id set not null;

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
        and octet_length(coaching::text) <= 60000
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'scenario_objections_category_check'
      and conrelid = 'public.scenario_objections'::regclass
  ) then
    alter table public.scenario_objections
      add constraint scenario_objections_category_check
      check (
        category_id in ('everyday-nutrition', 'weight', 'prescription-diets')
        or category_id ~ '^category:[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$'
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

create or replace trigger scenario_objections_updated_at before update on public.scenario_objections
  for each row execute function public.set_updated_at();

comment on table public.scenario_objections is
  'Team-authored objections (pushback categories) for scenarios, beside the seven built into the code. id = team:<slug>. Service role only.';
create index if not exists scenario_objections_category_idx
  on public.scenario_objections (category_id) where deleted_at is null;

comment on column public.scenario_objections.category_id is
  'The category (subject area) it belongs to — built-in id or category:<slug>. The category owns the knowledge.';
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
          'scenario_objection_category',
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
