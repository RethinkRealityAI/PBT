-- Platform report triage (SOW §3.1 "Platform Reporting Tool" — the triage half).
--
-- What this adds:
--   • admin_audit_log entity_type: allow 'platform_report' so status changes
--     made from the admin Reports screen are audited like every other
--     admin write. (platform_reports itself already carries the status
--     column + CHECK from 20260601000000_phase2_june.sql; updates go
--     through the service-role admin-reports function, so no new RLS
--     policy is required.)

alter table public.admin_audit_log
  drop constraint if exists admin_audit_log_entity_type_check;
alter table public.admin_audit_log
  add constraint admin_audit_log_entity_type_check
  check (entity_type in (
    'flag','flag_rule','scenario_override','simulation_config','user',
    'role','invite','email_settings','email_template','knowledge_document',
    'platform_report'
  ));
