-- Platform reports gained a triage write path (admin-reports ?op=status), and
-- every admin write is audited. The audit log's entity_type CHECK predates
-- that surface, so a triage action would be rejected by the constraint and the
-- change would go unrecorded (writeAuditLog is best-effort and swallows the
-- error, so the loss would be silent).
--
-- Idempotent + tolerant of out-of-order application: the constraint is dropped
-- and recreated with the full value set.
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
