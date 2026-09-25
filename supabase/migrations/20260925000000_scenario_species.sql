-- PBT Scenario Studio — dog / cat species on scenario_overrides.
-- Run after 20260923000000_knowledge_sync_lease.sql.
--
-- ⚠ DEFERRED — written 2026-09-25, NOT applied. Apply it by hand (Supabase
-- SQL editor, MCP `apply_migration`, or `supabase db push`), then confirm with
-- `npm run verify:db` (which only WARNS about this column until then).
--
-- What it adds:
--   • scenario_overrides.species — which animal a scenario is about: 'dog' |
--     'cat', or NULL. NULL means dog: every row written before the Scenario
--     Studio is a dog scenario, and the prompt builders keep the dog prompt
--     byte-identical for it. Plain text + a named CHECK (not an enum), in the
--     same spirit as profiles.locale and scenario_overrides.focus_area.
--
-- What a species does at runtime (see docs/superpowers/specs/
-- 2026-09-25-scenario-studio-design.md §5):
--   • the customer / scorer / coach / voice prompts say "cat" instead of "dog"
--     (src/data/knowledge/promptBuilders.ts);
--   • retrieval gains the HARD knowledge scope tags.species (a cat scenario
--     never grounds on dog-only documents; a dog under one year → 'puppy');
--   • life stage `Puppy (<1)` is DISPLAYED as "Kitten (<1)" for a cat — the
--     stored life-stage vocabulary is unchanged.
--
-- Until this is applied the app degrades safely, never fails:
--   • admin-scenario-overrides retries a save WITHOUT `species` when PostgREST
--     reports the column missing (PGRST204 / 42703) and answers with the saved
--     row plus `"_notice": "species_column_missing"`, so the Studio can tell
--     the admin the species was not stored;
--   • every scenario reads as a dog (no column → no key → today's behaviour).
--
-- Idempotent and guarded: safe to re-run, and a no-op on a project where
-- scenario_overrides does not exist yet (migrations may run out of order
-- against a partially-synced project).

do $$
begin
  if to_regclass('public.scenario_overrides') is not null then
    alter table public.scenario_overrides
      add column if not exists species text;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'scenario_overrides_species_check'
        and conrelid = 'public.scenario_overrides'::regclass
    ) then
      alter table public.scenario_overrides
        add constraint scenario_overrides_species_check
        check (species is null or species in ('dog', 'cat'));
    end if;

    comment on column public.scenario_overrides.species is
      'Which animal the scenario is about: dog | cat. NULL = dog (every pre-Studio row). Drives prompt wording, the knowledge species scope, and the kitten life-stage label.';
  end if;
end $$;
