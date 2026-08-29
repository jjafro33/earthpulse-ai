-- =========================================================
-- EarthPulse AI — Initial schema
-- Run via: supabase db push   (or paste into the SQL editor)
-- =========================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------
-- profiles: one row per authenticated user
-- ---------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- locations: canonical, deduplicated points of interest
-- ---------------------------------------------------------
create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  created_at timestamptz not null default now()
);
create index if not exists idx_locations_lat_lon on public.locations (latitude, longitude);

-- ---------------------------------------------------------
-- observations: normalized NASA POWER climate observations
-- ---------------------------------------------------------
create table if not exists public.observations (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references public.locations(id) on delete set null,
  latitude double precision not null,
  longitude double precision not null,
  obs_date date not null,
  temperature_c double precision,
  precipitation_mm double precision,
  solar_radiation_kwh_m2 double precision,
  source text not null default 'NASA_POWER',
  created_at timestamptz not null default now(),
  unique (latitude, longitude, obs_date)
);
create index if not exists idx_observations_lat_lon_date on public.observations (latitude, longitude, obs_date);
create index if not exists idx_observations_location on public.observations (location_id);

-- ---------------------------------------------------------
-- fire_events: normalized NASA FIRMS active-fire detections
-- ---------------------------------------------------------
create table if not exists public.fire_events (
  id uuid primary key default gen_random_uuid(),
  latitude double precision not null,
  longitude double precision not null,
  brightness_k double precision,
  confidence text check (confidence in ('low', 'nominal', 'high')),
  satellite text,
  detected_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_fire_events_lat_lon on public.fire_events (latitude, longitude);
create index if not exists idx_fire_events_detected_at on public.fire_events (detected_at desc);

-- ---------------------------------------------------------
-- analysis_results: AI Earth Insight outputs (evidence trail)
-- ---------------------------------------------------------
create table if not exists public.analysis_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  location_label text,
  latitude double precision,
  longitude double precision,
  input_metrics jsonb not null,
  explanation text not null,
  observations jsonb not null default '[]'::jsonb,
  possible_explanations jsonb not null default '[]'::jsonb,
  confidence double precision check (confidence between 0 and 1),
  created_at timestamptz not null default now()
);
create index if not exists idx_analysis_results_user on public.analysis_results (user_id);
create index if not exists idx_analysis_results_lat_lon on public.analysis_results (latitude, longitude);

-- ---------------------------------------------------------
-- saved_locations: per-user bookmarked locations
-- ---------------------------------------------------------
create table if not exists public.saved_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  created_at timestamptz not null default now()
);
create index if not exists idx_saved_locations_user on public.saved_locations (user_id);

-- ---------------------------------------------------------
-- api_cache: generic cache for NASA POWER / FIRMS responses
-- ---------------------------------------------------------
create table if not exists public.api_cache (
  cache_key text primary key,
  endpoint text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_api_cache_endpoint on public.api_cache (endpoint);
create index if not exists idx_api_cache_created_at on public.api_cache (created_at);

-- =========================================================
-- Row Level Security
-- =========================================================

alter table public.profiles enable row level security;
alter table public.locations enable row level security;
alter table public.observations enable row level security;
alter table public.fire_events enable row level security;
alter table public.analysis_results enable row level security;
alter table public.saved_locations enable row level security;
alter table public.api_cache enable row level security;

-- profiles: users manage only their own profile
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- locations / observations / fire_events: public read (they are
-- shared, non-personal NASA-derived reference data); writes are
-- restricted to the service role used by Edge Functions.
create policy "locations_public_read" on public.locations
  for select using (true);
create policy "observations_public_read" on public.observations
  for select using (true);
create policy "fire_events_public_read" on public.fire_events
  for select using (true);

-- analysis_results: publicly readable (evidence should be
-- inspectable), but a user can only see rows tied to their own
-- account when user_id is set; anonymous/demo rows (user_id null)
-- remain visible to everyone for evidence-mode transparency.
create policy "analysis_results_read" on public.analysis_results
  for select using (user_id is null or auth.uid() = user_id);
create policy "analysis_results_insert_own" on public.analysis_results
  for insert with check (user_id is null or auth.uid() = user_id);

-- saved_locations: strictly private to the owning user
create policy "saved_locations_select_own" on public.saved_locations
  for select using (auth.uid() = user_id);
create policy "saved_locations_insert_own" on public.saved_locations
  for insert with check (auth.uid() = user_id);
create policy "saved_locations_update_own" on public.saved_locations
  for update using (auth.uid() = user_id);
create policy "saved_locations_delete_own" on public.saved_locations
  for delete using (auth.uid() = user_id);

-- api_cache: no client access at all; only Edge Functions
-- (using the service role key, which bypasses RLS) read/write it.
create policy "api_cache_no_client_access" on public.api_cache
  for all using (false) with check (false);

-- =========================================================
-- updated_at trigger for profiles
-- =========================================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- =========================================================
-- Auto-create a profile row when a new user signs up
-- =========================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
