-- Profile display-language preference (i18n).
--
-- • profiles.locale: BCP-47-ish language tag ('en', 'fr', future 'fr-ca' …).
--   Validated by regex rather than an enum CHECK so adding a locale never
--   needs another migration; the app's Locale union is the real gatekeeper.
-- • Idempotent + guarded per CLAUDE.md migration rules (may run out of order
--   against a partially-synced project).

do $$
begin
  if to_regclass('public.profiles') is not null then
    alter table public.profiles
      add column if not exists locale text not null default 'en';

    -- Re-create the constraint idempotently.
    alter table public.profiles
      drop constraint if exists profiles_locale_format;
    alter table public.profiles
      add constraint profiles_locale_format
      check (locale ~ '^[a-z]{2}(-[a-z]{2})?$');
  end if;
end $$;
