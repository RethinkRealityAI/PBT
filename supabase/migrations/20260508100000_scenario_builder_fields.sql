-- PBT admin builder — extends scenario_overrides with all card + scenario-
-- defining fields so admins can:
--
--   • Fully customise the consumer-side scenario library card (title,
--     subtitle, info-modal copy, start-button label, accent driver).
--   • Author brand-new library scenarios from scratch (id form `admin:<uuid>`)
--     where the override row IS the scenario — no base in code required.
--
-- Existing rows keyed `seed:<i>` or `user:<uuid>` keep their semantics:
-- they are sparse overlays on top of a base scenario in code or
-- user_scenarios. The new `admin:<uuid>` rows are dense — every required
-- field below is non-null and the row acts as the canonical scenario.

alter table public.scenario_overrides
  -- Card-level customisation
  add column if not exists card_title_override text,
  add column if not exists card_subtitle_override text,
  add column if not exists info_modal_title text,
  -- Markdown body for the per-scenario info modal opened from the card's
  -- info icon. Empty/null = info button hidden.
  add column if not exists info_modal_body text,
  add column if not exists start_button_label text,
  -- Card-only driver tint (e.g. show a Harmonizer-styled card for an
  -- Activator scenario). Does not affect AI behaviour.
  add column if not exists card_driver_override text check (
    card_driver_override is null
    or card_driver_override in ('Activator','Energizer','Analyzer','Harmonizer')
  ),
  -- Scenario-defining fields (used by `admin:<uuid>` rows; nullable for the
  -- existing seed/user override forms).
  add column if not exists breed text,
  add column if not exists life_stage text,
  add column if not exists pushback_id text,
  add column if not exists pushback_notes text,
  add column if not exists suggested_driver text check (
    suggested_driver is null
    or suggested_driver in ('Activator','Energizer','Analyzer','Harmonizer')
  ),
  add column if not exists weight_kg numeric,
  -- Soft delete + auto-derived "is admin scenario" so the consumer resolver
  -- can quickly fan out without a regex on the id.
  add column if not exists deleted_at timestamptz,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  -- Card text length sanity caps (mirror prompt cap pattern).
  constraint scenario_overrides_card_title_len
    check (char_length(coalesce(card_title_override, '')) <= 120),
  constraint scenario_overrides_card_subtitle_len
    check (char_length(coalesce(card_subtitle_override, '')) <= 240),
  constraint scenario_overrides_info_modal_body_len
    check (char_length(coalesce(info_modal_body, '')) <= 4000),
  constraint scenario_overrides_start_button_len
    check (char_length(coalesce(start_button_label, '')) <= 40);

-- Index used by the resolver to materialise admin-only scenarios fast.
create index if not exists scenario_overrides_admin_idx
  on public.scenario_overrides (sort_order)
  where scenario_id like 'admin:%' and deleted_at is null;

create index if not exists scenario_overrides_alive_idx
  on public.scenario_overrides (updated_at desc)
  where deleted_at is null;
