-- Scenario Studio end-to-end check — remove EVERYTHING the run created.
-- Replace :uid with the QA account's user id (account.json) before running.
-- Every statement is scoped to that account or to the "QA E2E" / "qa-e2e"
-- prefixes the fixtures use, so nothing real can match.
--
-- The admin's own deletes are SOFT (deleted_at), which is why this hard
-- delete exists. Run it ONCE at the end; it is idempotent.

begin;

-- 1. Knowledge documents the run uploaded (and their embedded chunks).
delete from public.knowledge_chunks
 where doc_id in (select id from public.knowledge_documents where title like 'QA E2E ·%');
delete from public.knowledge_documents where title like 'QA E2E ·%';

-- 2. Scenarios the run saved (admin:<uuid> rows only — never a library row).
delete from public.scenario_overrides
 where scenario_id like 'admin:%'
   and (created_by = ':uid' or title_override like 'QA E2E%' or card_title_override like 'QA E2E%');

-- 3. Objections, then the categories they were filed under.
delete from public.scenario_objections where id like 'team:qa-e2e%';
delete from public.scenario_objection_categories where id like 'category:qa-e2e%';

-- 4. The run's audit entries (written by the QA account only).
delete from public.admin_audit_log where actor_id = ':uid';

-- 5. Anything the account itself left behind (Test drive records nothing,
--    so these should already be empty), then the account (profile cascades).
delete from public.ai_call_telemetry where user_id = ':uid';
delete from public.ai_turn_telemetry where user_id = ':uid';
delete from public.nav_events where user_id = ':uid';
delete from auth.users where id = ':uid';

commit;

-- Proof: every count must be 0.
select 'knowledge_documents' as what, count(*) from public.knowledge_documents where title like 'QA E2E ·%'
union all select 'knowledge_chunks (orphans)', count(*) from public.knowledge_chunks c where not exists (select 1 from public.knowledge_documents d where d.id = c.doc_id)
union all select 'scenario_overrides', count(*) from public.scenario_overrides where title_override like 'QA E2E%' or card_title_override like 'QA E2E%' or created_by = ':uid'
union all select 'scenario_objections', count(*) from public.scenario_objections where id like 'team:qa-e2e%'
union all select 'scenario_objection_categories', count(*) from public.scenario_objection_categories where id like 'category:qa-e2e%'
union all select 'admin_audit_log', count(*) from public.admin_audit_log where actor_id = ':uid'
union all select 'auth.users', count(*) from auth.users where id = ':uid'
union all select 'profiles', count(*) from public.profiles where user_id = ':uid';
