-- PBT admin dashboard — simulation config (global, admin-editable).
--
-- Stores a single opaque JSONB config row that admins can edit via the
-- admin-simulation-config Netlify Function. The consumer reads the resolved
-- value through flags-resolve (service role, no auth required); the table
-- is NOT directly readable by the anon or authenticated role.

-- ────────────────────────────────────────────────────────────
-- simulation_config — single-row global config store
-- ────────────────────────────────────────────────────────────
create table if not exists public.simulation_config (
  id text primary key default 'global',
  config jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz default now()
);

-- Seed the one canonical row so the consumer always gets a result.
insert into public.simulation_config (id, config)
values ('global', '{}'::jsonb)
on conflict (id) do nothing;

alter table public.simulation_config enable row level security;

-- Admin read policy — uses the existing public.is_admin() helper.
create policy admin_simulation_config_select
  on public.simulation_config
  for select
  using (public.is_admin());

-- Admin write policy (insert, update, delete) — checked on both sides.
create policy admin_simulation_config_all
  on public.simulation_config
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- ────────────────────────────────────────────────────────────
-- admin_audit_log — extend entity_type to allow 'simulation_config'
--
-- The original migration has no CHECK constraint on entity_type
-- (it's documented in a comment only), so we add one now that covers
-- all known values including the new type.
-- ────────────────────────────────────────────────────────────
alter table public.admin_audit_log
  drop constraint if exists admin_audit_log_entity_type_check;

alter table public.admin_audit_log
  add constraint admin_audit_log_entity_type_check
  check (entity_type in ('flag', 'flag_rule', 'scenario_override', 'simulation_config'));
