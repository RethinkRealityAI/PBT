-- 20261013000000_scenario_success_criteria.sql
--
-- `scenario_overrides.success_criteria` — "what a great answer includes" for
-- ONE scenario, written by the training team in the Scenario Studio (AI brief
-- step) and read ONLY by the scorer (`ai-evaluate`).
--
--   • It sharpens how the five fixed ACT-first dimensions are judged for this
--     scenario ("offers a two-week trial and books a follow-up call"). It never
--     adds, removes or re-weights a dimension.
--   • It is the answer key: the AI customer never sees it, and the public
--     `flags-resolve` snapshot never carries it (the column is not selected
--     there). `ai-evaluate` loads it server-side by `scenario._overrideId`; a
--     request body may supply it only with `preview: true` (the Studio's Test
--     drive scoring an unsaved draft), and a preview never writes a score.
--   • Bounded like the AI notes (`prompt_prefix` / `prompt_suffix`): 1500
--     characters (SCENARIO_LIMITS.successCriteriaMax).
--
-- Degrade path: `admin-scenario-overrides` retries a save without the column
-- when it is missing (`_notice: 'success_criteria_column_missing'`), and the
-- server's override loader falls back to the AI notes alone, so code deployed
-- before this migration keeps working (scoring simply has no criteria).
--
-- Idempotent; safe to re-run.

do $$
begin
  if to_regclass('public.scenario_overrides') is null then
    raise notice 'scenario_overrides missing — skipping success_criteria';
    return;
  end if;

  alter table public.scenario_overrides
    add column if not exists success_criteria text;

  if not exists (
    select 1 from pg_constraint
    where conname = 'scenario_overrides_success_criteria_check'
      and conrelid = 'public.scenario_overrides'::regclass
  ) then
    alter table public.scenario_overrides
      add constraint scenario_overrides_success_criteria_check
      check (success_criteria is null or char_length(success_criteria) <= 1500);
  end if;

  comment on column public.scenario_overrides.success_criteria is
    'What a great answer includes for this scenario. Read by the scorer only (ai-evaluate, server-side); never sent to the AI customer or the public snapshot. <= 1500 chars.';
end
$$;
