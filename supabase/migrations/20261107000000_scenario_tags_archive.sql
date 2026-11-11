-- PBT Scenario Studio — the team's tag library, and "archive" for scenarios.
-- Run after 20261106000000_echo_quiz_results.sql. Supersedes
-- 20261106000100_audit_echo_quiz_entity.sql (section 4 re-creates the same
-- audit CHECK with 'echo_quiz' AND 'scenario_tag'; running both, in either
-- order, ends with this list as long as this file runs last).
--
-- STATUS: written 2026-11-07, NOT YET APPLIED. Hand-run (Supabase MCP
-- `apply_migration`, the SQL editor or `supabase db push`), then confirm with
-- `npm run verify:db`. Spec:
-- docs/superpowers/specs/2026-11-07-studio-gallery-and-training-library-design.md (A2, A3, A5).
--
-- What it adds:
--   1. public.scenario_tags — team-wide tags for the Studio gallery: a name
--      (1–32 chars, unique case- and space-insensitively among LIVE tags) and
--      a colour key from the fixed palette in src/shared/scenarios/tags.ts
--      (CHECK — never a free hex). `deleted_at` soft-deletes (the endpoint
--      removes its assignments in the same request). ADMIN-ONLY: never in
--      the public flags snapshot, never in an AI prompt.
--   2. public.scenario_tag_assignments — which scenario carries which tag,
--      pk (scenario_id, tag_id). A join table, not a column on
--      scenario_overrides, so tagging a built-in scenario never creates an
--      override row and never bumps an override's `updated_at` (which would
--      make an editor open elsewhere answer 409 "stale"). Indexed by tag_id
--      (deleting a tag, counting its usage).
--      Both tables: RLS on with NO policies, no anon / authenticated grants —
--      only the service role (netlify/functions/admin-scenario-tags.ts)
--      touches them. created_by is `on delete set null`: shared content
--      survives its author (see account-delete.ts header).
--   3. scenario_overrides.archived_at / archived_by — "Archive" in the
--      gallery: hidden from trainees (visible = false, written in the same
--      update) AND out of the default gallery view, listed under
--      "Archived (n)" until restored. Distinct from delete (`deleted_at`,
--      restored through Audit). A row with archived_at set can't be made
--      visible in the same save (admin-scenario-overrides answers 400
--      "restore it first"); the public snapshot never carries either column.
--   4. admin_audit_log entity_type gains 'scenario_tag' (and 'echo_quiz',
--      from 20261106000100, which was never applied).
--
-- Until this is applied the Studio degrades, never fails:
--   • admin-scenario-tags GET answers 200 with no tags and
--     `_notice: 'tags_table_missing'` (the gallery hides tags); POST is a 503;
--   • admin-scenario-overrides?op=capabilities reports `archive: false`, the
--     gallery disables Archive with a tooltip, and op=archive is a 503;
--   • audit writes are best-effort: a refused 'scenario_tag' line is logged.
--
-- Idempotent and guarded: safe to re-run; cross-table alters are skipped on a
-- project where the table does not exist yet. No SECURITY DEFINER functions.

-- ── 1. scenario_tags ──────────────────────────────────────────────────────
create table if not exists public.scenario_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default 'slate',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'scenario_tags_name_check'
      and conrelid = 'public.scenario_tags'::regclass
  ) then
    alter table public.scenario_tags
      add constraint scenario_tags_name_check
      check (char_length(btrim(name)) between 1 and 32);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'scenario_tags_color_check'
      and conrelid = 'public.scenario_tags'::regclass
  ) then
    alter table public.scenario_tags
      add constraint scenario_tags_color_check
      check (color in ('slate', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'indigo', 'purple', 'pink'));
  end if;
end $$;

-- Unique among LIVE tags, case-insensitively. The endpoint stores names
-- normalised (trimmed, inner runs of spaces collapsed — normalizeTagName),
-- checks first and answers 409 'duplicate'; this index settles a race.
create unique index if not exists scenario_tags_live_name_key
  on public.scenario_tags (lower(btrim(name)))
  where deleted_at is null;

alter table public.scenario_tags enable row level security;
-- No policies: service role only (admin-scenario-tags).
revoke all on public.scenario_tags from anon, authenticated;

create or replace trigger scenario_tags_updated_at before update on public.scenario_tags
  for each row execute function public.set_updated_at();

comment on table public.scenario_tags is
  'Team-wide Scenario Studio tags (name + palette colour key). Admin-only: never published to trainees or sent to the AI. Service role only.';

-- ── 2. scenario_tag_assignments ───────────────────────────────────────────
create table if not exists public.scenario_tag_assignments (
  scenario_id text not null,
  tag_id uuid not null references public.scenario_tags (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (scenario_id, tag_id)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'scenario_tag_assignments_scenario_check'
      and conrelid = 'public.scenario_tag_assignments'::regclass
  ) then
    -- Library (seed:) and Studio (admin:) scenarios only — a trainee's own
    -- user: scenario belongs to that trainee.
    alter table public.scenario_tag_assignments
      add constraint scenario_tag_assignments_scenario_check
      check (char_length(scenario_id) <= 80 and scenario_id ~ '^(seed|admin):.+$');
  end if;
end $$;

create index if not exists scenario_tag_assignments_tag_id_idx
  on public.scenario_tag_assignments (tag_id);

alter table public.scenario_tag_assignments enable row level security;
-- No policies: service role only (admin-scenario-tags).
revoke all on public.scenario_tag_assignments from anon, authenticated;

comment on table public.scenario_tag_assignments is
  'Which Studio scenario carries which tag (join table, so tagging never writes scenario_overrides). Service role only.';

-- ── 3. scenario_overrides.archived_at / archived_by ───────────────────────
do $$
begin
  if to_regclass('public.scenario_overrides') is not null then
    alter table public.scenario_overrides add column if not exists archived_at timestamptz;
    alter table public.scenario_overrides add column if not exists archived_by uuid references auth.users (id) on delete set null;
    comment on column public.scenario_overrides.archived_at is
      'Archived in the Studio gallery: hidden from trainees (visible = false) and out of the default gallery until restored. Never in the public snapshot.';
    comment on column public.scenario_overrides.archived_by is
      'Who archived it (display only).';
  end if;
end $$;

-- ── 4. admin_audit_log entity types ───────────────────────────────────────
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
          'scenario_tag',
          'simulation_config',
          'user',
          'role',
          'invite',
          'email_settings',
          'email_template',
          'knowledge_document',
          'report',
          'echo_quiz'
        )
      );
  end if;
end $$;
