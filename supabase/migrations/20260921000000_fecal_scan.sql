-- PBT Fecal Scan — telemetry call type.
--
-- `ai-fecal-scan` records ONE ai_call_telemetry row per scan (both model
-- calls summed) with call_type 'fecal_scan'. Until this migration is applied
-- recordCallServer fails soft (the insert is rejected by the CHECK and the
-- warning is swallowed), so the feature works but its calls are invisible in
-- the admin AI Quality screen.
--
-- The knowledge side needs no schema: the fecal charts are ordinary
-- knowledge_documents / knowledge_chunks rows seeded by admin-knowledge
-- (op: 'seed') or scripts/seed-fecal-knowledge.ts.

-- ────────────────────────────────────────────────────────────
-- ai_call_telemetry.call_type — add 'fecal_scan'
-- ────────────────────────────────────────────────────────────
-- Idempotent: the constraint is dropped and re-added with the full list, so
-- re-running this (or running it after a later migration) is safe.
alter table public.ai_call_telemetry
  drop constraint if exists ai_call_telemetry_call_type_check;
alter table public.ai_call_telemetry
  add constraint ai_call_telemetry_call_type_check
  check (call_type in ('roleplay','evaluate','voice','hint','vision','retrieval','fecal_scan'));

-- ────────────────────────────────────────────────────────────
-- flags — desktop sidebar entry for the Fecal Scan screen
-- ────────────────────────────────────────────────────────────
-- The consumer app defaults this flag to true (FLAG_DEFAULTS), so the screen
-- is reachable before this row exists; the row is what lets an admin toggle
-- it from the Flags screen alongside the other nav.sidebar.* switches.
insert into public.flags (key, surface, value_type, default_value, description)
values
  ('nav.sidebar.fecalScan.enabled', 'nav', 'boolean', 'true'::jsonb, 'Sidebar: Fecal Scan.')
on conflict (key) do nothing;
