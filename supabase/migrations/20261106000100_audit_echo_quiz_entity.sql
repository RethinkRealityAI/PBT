-- ─────────────────────────────────────────────────────────────────────────────
-- Audit log: the 'echo_quiz' entity type (ECHO quiz reviews)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- HAND-RUN. Idempotent. NOT YET APPLIED to production (2026-11-06): it
-- re-creates an existing CHECK on admin_audit_log, which needs the owner's
-- go-ahead. Until it runs, an ECHO quiz review (Analytics → ECHO → Include /
-- Exclude / Reset, `admin-analytics` op=echo-review) still saves — the
-- reviewer and time are stored on the row itself (`echo_quiz_results.
-- reviewed_by / reviewed_at`) — but its audit-log line is refused by the
-- CHECK and only logged by the function (best-effort, like every audit write).
-- ─────────────────────────────────────────────────────────────────────────────

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
