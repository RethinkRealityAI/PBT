-- PBT initial schema — run in your Supabase project SQL editor.
-- After running, confirm RLS policies in the dashboard → Authentication → Policies.

-- profiles: 1:1 with auth.users
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  echo_primary text check (echo_primary in ('Activator','Energizer','Analyzer','Harmonizer')),
  echo_secondary text check (echo_secondary in ('Activator','Energizer','Analyzer','Harmonizer')),
  echo_tally jsonb,
  theme text default 'system' check (theme in ('light','dark','system')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- training_sessions: chat history + scorecard
create table if not exists public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scenario jsonb not null,
  transcript jsonb not null,
  score_report jsonb,
  duration_seconds int,
  mode text check (mode in ('text','voice')),
  created_at timestamptz default now()
);

-- pet_records: analyzer history
create table if not exists public.pet_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  breed text,
  weight_kg numeric,
  bcs int check (bcs between 1 and 9),
  mcs text check (mcs in ('normal','mild','moderate','severe')),
  activity text check (activity in ('active','inactive')),
  created_at timestamptz default now()
);

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.training_sessions enable row level security;
alter table public.pet_records enable row level security;

-- Policies (own-rows only)
drop policy if exists "own_profile_select" on public.profiles;
create policy "own_profile_select" on public.profiles for select using (auth.uid() = user_id);
drop policy if exists "own_profile_insert" on public.profiles;
create policy "own_profile_insert" on public.profiles for insert with check (auth.uid() = user_id);
drop policy if exists "own_profile_update" on public.profiles;
create policy "own_profile_update" on public.profiles for update using (auth.uid() = user_id);

drop policy if exists "own_sessions_all" on public.training_sessions;
create policy "own_sessions_all" on public.training_sessions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own_pets_all" on public.pet_records;
create policy "own_pets_all" on public.pet_records for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Indexes
create index if not exists training_sessions_user_id_idx
  on public.training_sessions (user_id, created_at desc);
create index if not exists pet_records_user_id_idx
  on public.pet_records (user_id, created_at desc);

-- Update timestamp trigger
create or replace function public.set_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
