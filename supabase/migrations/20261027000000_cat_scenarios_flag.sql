-- ============================================================================
-- Cat scenarios behind a feature switch (2026-10-27)
-- ============================================================================
-- The trainee app asked "Which animal?" (Dog | Cat) on Build a scenario and
-- on Home's Today's pick as soon as the library held a cat scenario. The
-- feline content (seed scenarios, product anchors, BCS data — see the
-- Feline SoW) is not ready, so cats are now behind one switch:
--
--   • scenario.cat.enabled (NEW, default OFF) — on: the Dog | Cat switch
--     shows on Build a scenario and Home, a trainee can build a cat scenario,
--     and published cat scenarios are listed and rotated. Off: the trainee
--     app is dogs only — no switch, no cat builds, and a published cat
--     scenario never reaches a trainee (a stored cat preference reads as dog).
--
-- Idempotent: insert … on conflict do nothing.

insert into public.flags (key, surface, value_type, default_value, description)
values
  ('scenario.cat.enabled', 'scenario', 'boolean', 'false'::jsonb,
   'Cat scenarios for trainees: the Dog | Cat switch on Build a scenario and Home, cat builds, and published cat scenarios. Off: dogs only.')
on conflict (key) do nothing;
