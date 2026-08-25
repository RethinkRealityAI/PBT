-- flags was created in 20260508000000_admin_flags.sql without RLS enabled,
-- leaving it readable/writable by the anon role via PostgREST. All access is
-- via service-role Netlify Functions (admin-flags, flags-resolve), so enabling
-- RLS with no policies is a pure lock-down: no code path regresses.
do $$
begin
  if to_regclass('public.flags') is not null then
    execute 'alter table public.flags enable row level security';
  end if;
end $$;
