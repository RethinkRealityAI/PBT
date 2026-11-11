-- 20261107000100_category_icons.sql
--
-- `scenario_objection_categories.icon` — the picture a TEAM category wears on
-- the trainee's Training library cards (and in the Studio), chosen by an
-- admin in the Scenario Studio's category editor.
--
--   • A key from ONE fixed vocabulary (`CATEGORY_ICON_KEYS` in
--     src/shared/scenarios/categoryIcons.ts) — never a free URL, emoji or
--     SVG. The CHECK below mirrors that list; add a key to both together.
--   • Null = unset: the app guesses one from the category's name /
--     description (`guessCategoryIcon`), falling back to `tag`.
--   • Built-in categories (everyday-nutrition, weight, prescription-diets)
--     have FIXED icons in code; `admin-objections` never stores one for them.
--   • Published to trainees through the `flags-resolve` snapshot
--     (`snapshot.objectionCategories[].icon`) — it is display-only.
--
-- Degrade path: until this runs, every reader retries without the column
-- (`isMissingCategoryIconColumn`, netlify/functions/_shared/objectionsStore.ts)
-- and `admin-objections` saves a category without its icon
-- (`_notice: 'icon_column_missing'`), so the app keeps working and shows the
-- guessed icon.
--
-- Idempotent; safe to re-run.

do $$
begin
  if to_regclass('public.scenario_objection_categories') is null then
    raise notice 'scenario_objection_categories missing — apply 20261012000000_scenario_objections.sql first; skipping icon';
    return;
  end if;

  alter table public.scenario_objection_categories
    add column if not exists icon text;

  if not exists (
    select 1 from pg_constraint
    where conname = 'scenario_objection_categories_icon_check'
      and conrelid = 'public.scenario_objection_categories'::regclass
  ) then
    alter table public.scenario_objection_categories
      add constraint scenario_objection_categories_icon_check
      check (
        icon is null or icon in (
          'bowl', 'scale', 'pill', 'stethoscope', 'droplet', 'kidney', 'sprout', 'heart',
          'bone', 'sparkles', 'shield', 'clock', 'coins', 'users', 'message', 'tag'
        )
      );
  end if;

  comment on column public.scenario_objection_categories.icon is
    'Icon key for a team category (src/shared/scenarios/categoryIcons.ts CATEGORY_ICON_KEYS); null = guessed from the name. Built-ins have fixed icons and never store one.';
end
$$;
