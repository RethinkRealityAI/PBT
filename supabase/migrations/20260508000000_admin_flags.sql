-- PBT admin dashboard — feature flags, scenario overrides, audit log.
--
-- Adds the data layer powering admin-controlled toggles across the consumer
-- app: which surfaces show, in-screen component visibility, scenario library
-- composition, AI prompt overrides, and audience-targeted rollouts.
--
-- All cross-user reads/writes happen through the Netlify admin functions
-- (`/.netlify/functions/admin-flags`, `admin-scenario-overrides`,
-- `admin-audit-log`, `flags-resolve`) which verify `profiles.is_admin` via
-- the service role. Consumer reads of resolved flag values go through the
-- public `flags-resolve` function (no auth required); the underlying tables
-- are not directly readable by the anon role.

-- ────────────────────────────────────────────────────────────
-- flags — registry of every flag the consumer app honours
-- ────────────────────────────────────────────────────────────
create table if not exists public.flags (
  key text primary key,
  -- Coarse grouping for the admin UI (surface tabs).
  surface text not null check (surface in (
    'screen','nav','scenario','component','field','ai'
  )),
  value_type text not null check (value_type in ('boolean','string','number','json')),
  default_value jsonb not null,
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists flags_surface_idx on public.flags (surface);

-- ────────────────────────────────────────────────────────────
-- flag_rules — audience-targeted overrides per flag
-- ────────────────────────────────────────────────────────────
-- audience JSONB shape (all keys optional; AND across keys, OR within an array):
--   { "drivers": ["Activator","Energizer"],
--     "user_ids": ["<uuid>", ...],
--     "anon_session_ids": ["<id>", ...],
--     "percentage": 25,
--     "clinic_ids": ["<uuid>", ...]   -- reserved for Phase 5
--   }
create table if not exists public.flag_rules (
  id uuid primary key default gen_random_uuid(),
  flag_key text not null references public.flags(key) on delete cascade,
  -- Higher priority wins. Default 100; explicit user/clinic rules typically 200+.
  priority int not null default 100,
  audience jsonb not null default '{}'::jsonb,
  value jsonb not null,
  enabled boolean not null default true,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists flag_rules_key_idx
  on public.flag_rules (flag_key, priority desc) where enabled = true;

alter table public.flag_rules enable row level security;
-- No public policies — all access via service role through admin functions.

-- ────────────────────────────────────────────────────────────
-- scenario_overrides — admin edits to seed + user-built scenarios
-- ────────────────────────────────────────────────────────────
-- scenario_id is a free-form string so it can address either a SEED scenario
-- ("seed:weight-denial-lab") or a user_scenarios.id (UUID stringified).
create table if not exists public.scenario_overrides (
  scenario_id text primary key,
  visible boolean not null default true,
  sort_order int,
  title_override text,
  context_override text,
  opening_line_override text,
  difficulty_override int check (difficulty_override between 1 and 4),
  persona_override text,
  -- Bounded AI overrides — the canonical customer prompt + scoring rubric
  -- always remain authoritative. These wrap the customer turn only.
  prompt_prefix text,
  prompt_suffix text,
  -- Hard cap matches client-side validator. Each ≤ 1500 chars.
  constraint scenario_overrides_prefix_len check (char_length(coalesce(prompt_prefix, '')) <= 1500),
  constraint scenario_overrides_suffix_len check (char_length(coalesce(prompt_suffix, '')) <= 1500),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz default now()
);

alter table public.scenario_overrides enable row level security;
-- No public policies — admin functions only.

-- ────────────────────────────────────────────────────────────
-- admin_audit_log — every admin write produces a row
-- ────────────────────────────────────────────────────────────
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  -- 'flag' | 'flag_rule' | 'scenario_override'
  entity_type text not null,
  entity_id text not null,
  -- 'create' | 'update' | 'delete' | 'revert'
  action text not null,
  before jsonb,
  after jsonb,
  note text,
  created_at timestamptz default now()
);

create index if not exists admin_audit_log_created_idx
  on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_entity_idx
  on public.admin_audit_log (entity_type, entity_id, created_at desc);

alter table public.admin_audit_log enable row level security;
-- No public policies — admin functions only.

-- ────────────────────────────────────────────────────────────
-- updated_at triggers
-- ────────────────────────────────────────────────────────────
drop trigger if exists flags_updated_at on public.flags;
create trigger flags_updated_at before update on public.flags
  for each row execute function public.set_updated_at();

drop trigger if exists flag_rules_updated_at on public.flag_rules;
create trigger flag_rules_updated_at before update on public.flag_rules
  for each row execute function public.set_updated_at();

drop trigger if exists scenario_overrides_updated_at on public.scenario_overrides;
create trigger scenario_overrides_updated_at before update on public.scenario_overrides
  for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────────────────────
-- Seed the flag registry with the keys the consumer app references.
-- Values can be re-tuned later by admins; defaults preserve current behaviour.
-- ────────────────────────────────────────────────────────────
insert into public.flags (key, surface, value_type, default_value, description)
values
  -- Whole-screen toggles (truthy = screen reachable).
  ('screen.analyzer.enabled',  'screen',    'boolean', 'true'::jsonb, 'Pet Analyzer screen.'),
  ('screen.act_guide.enabled', 'screen',    'boolean', 'true'::jsonb, 'ACT Guide screen.'),
  ('screen.resources.enabled', 'screen',    'boolean', 'true'::jsonb, 'Library / Resources screen.'),
  ('screen.stats.enabled',     'screen',    'boolean', 'true'::jsonb, 'Stats screen.'),
  ('screen.history.enabled',   'screen',    'boolean', 'true'::jsonb, 'History screen.'),
  ('screen.create.enabled',    'screen',    'boolean', 'true'::jsonb, 'Build-a-scenario screen.'),
  ('screen.voice.enabled',     'screen',    'boolean', 'true'::jsonb, 'Voice mode in chat.'),

  -- Mobile bottom nav + desktop sidebar items.
  ('nav.tab.home.enabled',     'nav',       'boolean', 'true'::jsonb, 'Home tab in mobile bottom bar.'),
  ('nav.tab.history.enabled',  'nav',       'boolean', 'true'::jsonb, 'History tab in mobile bottom bar.'),
  ('nav.tab.resources.enabled','nav',       'boolean', 'true'::jsonb, 'Library tab in mobile bottom bar.'),
  ('nav.tab.settings.enabled', 'nav',       'boolean', 'true'::jsonb, 'You / Settings tab in mobile bottom bar.'),
  ('nav.sidebar.create.enabled',   'nav',   'boolean', 'true'::jsonb, 'Sidebar: Build scenario.'),
  ('nav.sidebar.analyzer.enabled', 'nav',   'boolean', 'true'::jsonb, 'Sidebar: Pet Analyzer.'),
  ('nav.sidebar.history.enabled',  'nav',   'boolean', 'true'::jsonb, 'Sidebar: History.'),
  ('nav.sidebar.resources.enabled','nav',   'boolean', 'true'::jsonb, 'Sidebar: Library.'),

  -- In-screen components (granular kill switches).
  ('component.home.save_progress_banner', 'component', 'boolean', 'true'::jsonb, 'Save-progress banner on Home.'),
  ('component.home.act_guide_card',       'component', 'boolean', 'true'::jsonb, 'ACT Guide card on Home.'),
  ('component.home.echo_profile_card',    'component', 'boolean', 'true'::jsonb, 'ECHO profile card on Home.'),
  ('component.home.library_card',         'component', 'boolean', 'true'::jsonb, 'Library quick-card on Home.'),
  ('component.chat.coach_drawer',         'component', 'boolean', 'false'::jsonb, 'In-chat coach hints drawer (planned).'),
  ('component.stats.sentiment_chart',     'component', 'boolean', 'true'::jsonb, 'Sentiment chart on Stats screen.'),

  -- Field-level overrides (string values).
  ('field.home.headline',     'field', 'string', '""'::jsonb, 'Override the Home hero headline. Empty = use default.'),
  ('field.home.welcome_eyebrow', 'field', 'string', '""'::jsonb, 'Override the welcome eyebrow text on Home. Empty = default.')
on conflict (key) do nothing;
