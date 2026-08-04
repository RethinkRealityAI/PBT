-- PBT August — role-based access control, admin invitations, and branded
-- transactional email.
-- Run after 20260801000000_profile_locale.sql.
--
-- Adds:
--   • admin_roles            — named permission bundles (7 system presets +
--                              any custom roles an owner creates)
--   • profiles.admin_role    — which role an account holds (null = not admin)
--   • profiles.permission_overrides
--                            — per-user { grant: [], revoke: [] } on top of
--                              the role
--   • admin_invites          — single-use, expiring invitations
--   • email_settings         — provider (resend | smtp), sender identity,
--                              encrypted credentials
--   • email_templates        — editable branded transactional templates
--   • email_log              — delivery outcomes, for the admin Email screen
--
-- Back-compat: profiles.is_admin stays the flag every existing RLS policy
-- reads. A trigger keeps it exactly `admin_role is not null`, so the two can
-- never disagree.

-- ────────────────────────────────────────────────────────────
-- admin_roles
-- ────────────────────────────────────────────────────────────
create table if not exists public.admin_roles (
  key text primary key,
  name text not null,
  description text not null default '',
  -- Permission keys from src/shared/access/permissions.ts. Kept as text[] on
  -- purpose: adding a permission in code must not require a migration.
  permissions text[] not null default '{}',
  -- System roles ship with the product: re-permissionable, never deletable.
  is_system boolean not null default false,
  rank integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

-- Seed the system presets. `on conflict do nothing` so re-running the
-- migration never clobbers permissions an owner has since tuned.
insert into public.admin_roles (key, name, description, permissions, is_system, rank) values
  ('owner', 'Owner',
   'Full control, including owners, roles, billing-level settings, and data export. Holds every permission automatically — including ones added in future releases.',
   array['team.read','team.manage','roles.manage','invites.manage','owners.manage','audit.read','overview.read','insights.read','analytics.read','sessions.read','quality.read','scenarios.read','scenarios.write','simulation.read','simulation.write','knowledge.read','knowledge.write','flags.read','flags.write','feedback.read','reports.read','analyzer.read','email.read','email.templates.write','email.settings.write','email.send','rag.export','preview.read'],
   true, 0),
  ('admin', 'Admin',
   'Runs the platform day to day: team, content, flags, analytics, and email. Cannot promote or demote owners.',
   array['team.read','team.manage','roles.manage','invites.manage','audit.read','overview.read','insights.read','analytics.read','sessions.read','quality.read','scenarios.read','scenarios.write','simulation.read','simulation.write','knowledge.read','knowledge.write','flags.read','flags.write','feedback.read','reports.read','analyzer.read','email.read','email.templates.write','email.settings.write','email.send','rag.export','preview.read'],
   true, 10),
  ('content_manager', 'Content Manager',
   'Owns what the trainer says: scenarios, simulation tuning, knowledge base, and feature flags.',
   array['overview.read','insights.read','sessions.read','scenarios.read','scenarios.write','simulation.read','simulation.write','knowledge.read','knowledge.write','flags.read','flags.write','feedback.read','preview.read'],
   true, 20),
  ('clinical_reviewer', 'Clinical Reviewer',
   'Reviews training quality and clinical accuracy. Reads sessions and scorecards, edits knowledge content, touches nothing else.',
   array['overview.read','insights.read','sessions.read','quality.read','scenarios.read','simulation.read','knowledge.read','knowledge.write','feedback.read','analyzer.read','preview.read'],
   true, 30),
  ('analyst', 'Analyst',
   'Read-only across analytics, sessions, and AI quality. Can export the RAG corpus.',
   array['overview.read','insights.read','analytics.read','sessions.read','quality.read','scenarios.read','feedback.read','reports.read','analyzer.read','rag.export'],
   true, 40),
  ('support', 'Support',
   'Front line for users: sees accounts and can disable or re-enable them, triages feedback and reports.',
   array['overview.read','team.read','team.manage','sessions.read','feedback.read','reports.read','analyzer.read','preview.read'],
   true, 50),
  ('comms_manager', 'Comms Manager',
   'Owns transactional email — templates, sender identity, provider credentials, and invitations. Nothing else.',
   array['team.read','invites.manage','email.read','email.templates.write','email.settings.write','email.send'],
   true, 60)
on conflict (key) do nothing;

alter table public.admin_roles enable row level security;

drop policy if exists "admin_roles_select" on public.admin_roles;
create policy "admin_roles_select" on public.admin_roles for select
  using (public.is_admin());
drop policy if exists "admin_roles_all" on public.admin_roles;
create policy "admin_roles_all" on public.admin_roles for all
  using (public.is_admin()) with check (public.is_admin());

-- ────────────────────────────────────────────────────────────
-- profiles.admin_role + permission_overrides
-- ────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists admin_role text references public.admin_roles(key) on delete set null;

alter table public.profiles
  add column if not exists permission_overrides jsonb not null default '{}'::jsonb;

-- Existing admins had unrestricted power; 'owner' is the only role that
-- preserves that exactly. Nobody loses access on deploy — an owner can then
-- demote the team to narrower roles from the portal.
update public.profiles
   set admin_role = 'owner'
 where is_admin = true and admin_role is null;

create index if not exists profiles_admin_role_idx
  on public.profiles (admin_role) where admin_role is not null;

-- Keep the legacy is_admin flag in lockstep with admin_role so every existing
-- RLS policy (public.is_admin()) keeps working unchanged.
create or replace function public.sync_is_admin()
returns trigger
language plpgsql
as $$
begin
  new.is_admin := new.admin_role is not null;
  return new;
end;
$$;

drop trigger if exists profiles_sync_is_admin on public.profiles;
create trigger profiles_sync_is_admin
  before insert or update of admin_role on public.profiles
  for each row execute function public.sync_is_admin();

-- …and the reverse, so any legacy code path that still writes is_admin
-- directly lands on a real role instead of an admin with no permissions.
create or replace function public.sync_admin_role()
returns trigger
language plpgsql
as $$
begin
  if new.is_admin and new.admin_role is null then
    new.admin_role := 'admin';
  elsif not new.is_admin and new.admin_role is not null then
    new.admin_role := null;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_sync_admin_role on public.profiles;
create trigger profiles_sync_admin_role
  before update of is_admin on public.profiles
  for each row execute function public.sync_admin_role();

-- Owner check, for policies that must exclude narrower admin roles.
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where user_id = auth.uid() and admin_role = 'owner' and disabled = false
  );
$$;

-- ────────────────────────────────────────────────────────────
-- admin_invites
-- ────────────────────────────────────────────────────────────
create table if not exists public.admin_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role_key text not null references public.admin_roles(key) on delete restrict,
  permission_overrides jsonb not null default '{}'::jsonb,
  display_name text,
  -- SHA-256 of the token that went out in the email. The plaintext token is
  -- shown once, in the email, and never stored — a database leak cannot be
  -- replayed into an admin account.
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_user_id uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  send_count integer not null default 1,
  last_sent_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists admin_invites_email_idx on public.admin_invites (lower(email));
create index if not exists admin_invites_pending_idx
  on public.admin_invites (expires_at)
  where accepted_at is null and revoked_at is null;

alter table public.admin_invites enable row level security;

-- No anon/authenticated access at all: invites are read and written only by
-- the service-role Netlify Functions, which do their own permission checks.
-- Acceptance is a public endpoint that never exposes the row.
drop policy if exists "admin_invites_select" on public.admin_invites;
create policy "admin_invites_select" on public.admin_invites for select
  using (public.is_admin());

-- ────────────────────────────────────────────────────────────
-- email_settings — single row, provider + sender identity
-- ────────────────────────────────────────────────────────────
create table if not exists public.email_settings (
  id text primary key default 'global',
  provider text not null default 'resend' check (provider in ('resend','smtp')),
  from_email text not null default '',
  from_name text not null default 'PBT',
  reply_to text,
  -- Ciphertext only (AES-256-GCM, key from EMAIL_SECRET_KEY). The plaintext
  -- never leaves the function runtime and is never returned to the browser.
  resend_api_key_cipher text,
  smtp_host text,
  smtp_port integer default 587,
  smtp_user text,
  smtp_pass_cipher text,
  smtp_secure boolean not null default false,
  -- Absolute base URL used to build links in emails (invite, reset).
  app_base_url text,
  -- Brand overrides for the email shell: logo text, accent colour, footer.
  brand jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.email_settings (id) values ('global') on conflict (id) do nothing;

alter table public.email_settings enable row level security;

-- Deliberately no policy for anon/authenticated: even an admin's browser
-- session must go through the Netlify Function, which strips the ciphertext.
drop policy if exists "email_settings_none" on public.email_settings;

-- ────────────────────────────────────────────────────────────
-- email_templates
-- ────────────────────────────────────────────────────────────
create table if not exists public.email_templates (
  key text primary key,
  name text not null,
  description text not null default '',
  subject text not null,
  preheader text not null default '',
  -- Ordered content blocks ({ type: 'heading'|'paragraph'|'button'|'callout'
  -- |'divider'|'list', ... }). Rendered by the shared branded shell so every
  -- email looks like the product without anyone writing table HTML.
  blocks jsonb not null default '[]'::jsonb,
  -- Escape hatch: when set, this raw HTML is sent instead of the blocks.
  html_override text,
  enabled boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.email_templates enable row level security;

drop policy if exists "email_templates_select" on public.email_templates;
create policy "email_templates_select" on public.email_templates for select
  using (public.is_admin());

-- ────────────────────────────────────────────────────────────
-- email_log — delivery outcomes
-- ────────────────────────────────────────────────────────────
create table if not exists public.email_log (
  id uuid primary key default gen_random_uuid(),
  template_key text not null,
  to_email text not null,
  subject text not null,
  provider text not null,
  status text not null check (status in ('sent','failed','skipped')),
  error text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists email_log_created_idx on public.email_log (created_at desc);
create index if not exists email_log_template_idx on public.email_log (template_key, created_at desc);

alter table public.email_log enable row level security;

drop policy if exists "email_log_select" on public.email_log;
create policy "email_log_select" on public.email_log for select
  using (public.is_admin());

-- ────────────────────────────────────────────────────────────
-- admin_audit_log — new entity types
-- ────────────────────────────────────────────────────────────
alter table public.admin_audit_log
  drop constraint if exists admin_audit_log_entity_type_check;
alter table public.admin_audit_log
  add constraint admin_audit_log_entity_type_check
  check (entity_type in (
    'flag','flag_rule','scenario_override','simulation_config','user',
    'role','invite','email_settings','email_template'
  ));
