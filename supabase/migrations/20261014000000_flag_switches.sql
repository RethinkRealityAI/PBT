-- ============================================================================
-- Feature switches that now do what they say (2026-10-14)
-- ============================================================================
-- Four switches in Admin → Flags were never read by the app, so flipping them
-- did nothing — including *Voice mode in chat*, which the handbook offered as
-- the fastest way to cut AI spend. The code now honours all four; this
-- migration brings the stored rows in line with what each one controls:
--
--   • screen.fecalScan.enabled (NEW) — a real off switch for Fecal Scan: the
--     screen, its Home tile, the Pet Analyzer link and the sidebar entry.
--     Until now only the sidebar entry could be hidden.
--   • component.chat.coach_drawer — was "coach hints drawer (planned)" with a
--     default of OFF that switched nothing (coach hints shipped always-on).
--     It is now the coach hints' off switch, so its default becomes ON to
--     keep today's behaviour. Guarded on the old description so a re-run can
--     never undo an admin's later choice.
--   • Descriptions for voice, the scorecard's journey strip and the Home
--     greeting override, each guarded on the old text for the same reason.
--   • The Content Manager role's description said "simulation tuning"; the
--     screen is called AI tuning. Updated only if nobody has edited it.
--
-- Idempotent: insert … on conflict do nothing; every update is guarded on
-- the exact text it replaces.

insert into public.flags (key, surface, value_type, default_value, description)
values
  ('screen.fecalScan.enabled', 'screen', 'boolean', 'true'::jsonb,
   'Fecal Scan screen, with its Home tile, Pet Analyzer link and sidebar entry.')
on conflict (key) do nothing;

update public.flags
   set default_value = 'true'::jsonb,
       description = 'In-chat coach hints (the Coach button and its panel).',
       updated_at = now()
 where key = 'component.chat.coach_drawer'
   and description = 'In-chat coach hints drawer (planned).';

update public.flags
   set description = 'Voice mode in chat. Off: text only, and the server refuses new voice sessions.',
       updated_at = now()
 where key = 'screen.voice.enabled'
   and description = 'Voice mode in chat.';

update public.flags
   set description = 'Resolution journey strip (how the client''s mood moved) on the scorecard and past-session detail.',
       updated_at = now()
 where key = 'component.stats.sentiment_chart'
   and description = 'Sentiment chart on Stats screen.';

update public.flags
   set description = 'Override the greeting above the Home headline ("Good day."). Empty = default.',
       updated_at = now()
 where key = 'field.home.welcome_eyebrow'
   and description = 'Override the welcome eyebrow text on Home. Empty = default.';

do $$
begin
  if to_regclass('public.admin_roles') is not null then
    update public.admin_roles
       set description = 'Owns what the trainer says: scenarios, AI tuning, knowledge base, and feature flags.'
     where key = 'content_manager'
       and description = 'Owns what the trainer says: scenarios, simulation tuning, knowledge base, and feature flags.';
  end if;
end $$;
