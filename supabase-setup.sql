-- Supabase setup for the Baja / Formula SAE endurance race dashboard.
-- Run this in the Supabase SQL editor for the project used by Vercel.
--
-- SECURITY NOTE:
-- These Row Level Security policies intentionally allow public read/write
-- access for the first no-login team dashboard version. Restrict these
-- policies before using this app for anything sensitive or broadly shared.

create extension if not exists pgcrypto;

create table if not exists public.races (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  duration_seconds integer not null check (duration_seconds > 0),
  target_lap_seconds numeric check (target_lap_seconds is null or target_lap_seconds > 0),
  started_at timestamptz,
  status text not null default 'not_started'
    check (status in ('not_started', 'running', 'paused', 'finished')),
  paused_at timestamptz,
  total_paused_seconds numeric not null default 0 check (total_paused_seconds >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.races
  add column if not exists target_lap_seconds numeric
    check (target_lap_seconds is null or target_lap_seconds > 0);

create table if not exists public.laps (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races(id) on delete cascade,
  lap_number integer not null check (lap_number > 0),
  lap_duration_seconds numeric not null check (lap_duration_seconds >= 0),
  race_elapsed_seconds numeric not null check (race_elapsed_seconds >= 0),
  created_at timestamptz not null default now(),
  unique (race_id, lap_number)
);

create table if not exists public.stop_events (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races(id) on delete cascade,
  event_type text not null check (event_type in ('pit_in', 'pit_out', 'paddock_in', 'paddock_out')),
  race_elapsed_seconds numeric not null check (race_elapsed_seconds >= 0),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stints (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  start_elapsed_seconds numeric not null check (start_elapsed_seconds >= 0),
  end_elapsed_seconds numeric check (end_elapsed_seconds is null or end_elapsed_seconds >= 0),
  start_lap_number integer not null default 0 check (start_lap_number >= 0),
  end_lap_number integer check (end_lap_number is null or end_lap_number >= 0),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.issue_logs (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races(id) on delete cascade,
  severity text not null default 'info' check (severity in ('info', 'watch', 'critical')),
  message text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.tracked_teams (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races(id) on delete cascade,
  school_name text not null,
  car_number text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_status_events (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races(id) on delete cascade,
  team_id uuid not null references public.tracked_teams(id) on delete cascade,
  status text not null check (status in ('on_track', 'in_pit', 'in_paddock', 'unknown', 'retired')),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists laps_race_lap_number_idx on public.laps (race_id, lap_number);
create index if not exists stop_events_race_created_idx on public.stop_events (race_id, created_at);
create index if not exists drivers_race_created_idx on public.drivers (race_id, created_at);
create index if not exists stints_race_created_idx on public.stints (race_id, created_at);
create index if not exists issue_logs_race_created_idx on public.issue_logs (race_id, created_at desc);
create index if not exists tracked_teams_race_car_idx on public.tracked_teams (race_id, car_number);
create index if not exists team_status_events_race_created_idx on public.team_status_events (race_id, created_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists races_set_updated_at on public.races;
create trigger races_set_updated_at
before update on public.races
for each row
execute function public.set_updated_at();

drop trigger if exists drivers_set_updated_at on public.drivers;
create trigger drivers_set_updated_at
before update on public.drivers
for each row
execute function public.set_updated_at();

drop trigger if exists issue_logs_set_updated_at on public.issue_logs;
create trigger issue_logs_set_updated_at
before update on public.issue_logs
for each row
execute function public.set_updated_at();

drop trigger if exists tracked_teams_set_updated_at on public.tracked_teams;
create trigger tracked_teams_set_updated_at
before update on public.tracked_teams
for each row
execute function public.set_updated_at();

alter table public.races enable row level security;
alter table public.laps enable row level security;
alter table public.stop_events enable row level security;
alter table public.drivers enable row level security;
alter table public.stints enable row level security;
alter table public.issue_logs enable row level security;
alter table public.tracked_teams enable row level security;
alter table public.team_status_events enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'races',
    'laps',
    'stop_events',
    'drivers',
    'stints',
    'issue_logs',
    'tracked_teams',
    'team_status_events'
  ]
  loop
    execute format('drop policy if exists "Public dashboard can read %1$s" on public.%1$I', table_name);
    execute format('create policy "Public dashboard can read %1$s" on public.%1$I for select to anon using (true)', table_name);

    execute format('drop policy if exists "Public dashboard can insert %1$s" on public.%1$I', table_name);
    execute format('create policy "Public dashboard can insert %1$s" on public.%1$I for insert to anon with check (true)', table_name);

    execute format('drop policy if exists "Public dashboard can update %1$s" on public.%1$I', table_name);
    execute format('create policy "Public dashboard can update %1$s" on public.%1$I for update to anon using (true) with check (true)', table_name);

    execute format('drop policy if exists "Public dashboard can delete %1$s" on public.%1$I', table_name);
    execute format('create policy "Public dashboard can delete %1$s" on public.%1$I for delete to anon using (true)', table_name);

    execute format('alter table public.%I replica identity full', table_name);

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;

insert into public.races (id, name, duration_seconds, status)
values ('00000000-0000-0000-0000-000000000001', 'Active Endurance Race', 14400, 'not_started')
on conflict (id) do nothing;
