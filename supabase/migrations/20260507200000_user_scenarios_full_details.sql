-- PBT — capture the full scenario shape on user_scenarios so the admin
-- dashboard can show what each user actually built (persona, driver,
-- context, opening line) instead of only title + breed + difficulty.
--
-- All columns are additive + nullable so existing rows keep working.
-- Old rows will display "—" for the new fields in the admin UI.

alter table public.user_scenarios
  add column if not exists persona text,
  add column if not exists suggested_driver text
    check (
      suggested_driver is null
      or suggested_driver in ('Activator','Energizer','Analyzer','Harmonizer')
    ),
  add column if not exists context text,
  add column if not exists opening_line text,
  add column if not exists scenario_summary text;

create index if not exists user_scenarios_persona_idx
  on public.user_scenarios (persona);
create index if not exists user_scenarios_driver_idx
  on public.user_scenarios (suggested_driver);
