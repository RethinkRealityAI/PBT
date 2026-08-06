-- Allow 'supabase' as an email provider.
--
-- A stopgap transport that hands password-reset and address-confirmation mail
-- to the project's own built-in auth mailer, so a deployment can do account
-- recovery before Resend or SMTP credentials exist. Its limits are documented
-- in netlify/functions/_shared/mailer.ts (auth mail only, Supabase's templates,
-- ~2 messages an hour) and surfaced in the admin portal.
--
-- Idempotent: guarded on the table existing, since migrations may run against a
-- partially-synced project.

do $$
begin
  if to_regclass('public.email_settings') is null then
    return;
  end if;

  alter table public.email_settings drop constraint if exists email_settings_provider_check;
  alter table public.email_settings
    add constraint email_settings_provider_check
    check (provider in ('resend', 'smtp', 'supabase'));
end $$;
