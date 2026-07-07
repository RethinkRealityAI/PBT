-- PBT July — user & admin account management.
-- Run after 20260602000000_simulation_config.sql.
--
-- Adds:
--   • profiles.disabled — soft-disable flag mirrored to a Supabase Auth ban by
--     the admin-user-actions function (disabled users can't sign in).
--   • admin_audit_log entity_type: allow 'user' so account actions
--     (promote/demote admin, disable/enable, create, delete) are audited.

alter table public.profiles
  add column if not exists disabled boolean not null default false;

create index if not exists profiles_disabled_idx
  on public.profiles (disabled) where disabled = true;

-- Extend the audit-log entity_type check to include 'user'.
alter table public.admin_audit_log
  drop constraint if exists admin_audit_log_entity_type_check;
alter table public.admin_audit_log
  add constraint admin_audit_log_entity_type_check
  check (entity_type in ('flag','flag_rule','scenario_override','simulation_config','user'));
