-- Supabase setup for the Baja / Formula SAE endurance race dashboard.
-- Run this in the Supabase SQL editor for the project used by Vercel.
--
-- SECURITY NOTE:
-- These RLS policies intentionally allow public read/write access for the
-- first no-login team dashboard version. Restrict these policies before using
-- this app for anything sensitive or publicly editable.

create extension if not exists pgcrypto;

create table if not exists public.races (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  duration_seconds integer not null check (duration_seconds > 0),
  started_at timestamptz,
  status text not null default 'not_started'
    check (status in ('not_started', 'running', 'paused', 'finished')),
  paused_at timestamptz,
  total_paused_seconds numeric not null default 0 check (total_paused_seconds >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.laps (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races(id) on delete cascade,
  lap_number integer not null check (lap_number > 0),
  lap_duration_seconds numeric not null check (lap_duration_seconds >= 0),
  race_elapsed_seconds numeric not null check (race_elapsed_seconds >= 0),
  created_at timestamptz not null default now(),
  unique (race_id, lap_number)
);

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

alter table public.races enable row level security;
alter table public.laps enable row level security;

drop policy if exists "Public dashboard can read races" on public.races;
create policy "Public dashboard can read races"
on public.races
for select
to anon
using (true);

drop policy if exists "Public dashboard can insert races" on public.races;
create policy "Public dashboard can insert races"
on public.races
for insert
to anon
with check (true);

drop policy if exists "Public dashboard can update races" on public.races;
create policy "Public dashboard can update races"
on public.races
for update
to anon
using (true)
with check (true);

drop policy if exists "Public dashboard can delete races" on public.races;
create policy "Public dashboard can delete races"
on public.races
for delete
to anon
using (true);

drop policy if exists "Public dashboard can read laps" on public.laps;
create policy "Public dashboard can read laps"
on public.laps
for select
to anon
using (true);

drop policy if exists "Public dashboard can insert laps" on public.laps;
create policy "Public dashboard can insert laps"
on public.laps
for insert
to anon
with check (true);

drop policy if exists "Public dashboard can update laps" on public.laps;
create policy "Public dashboard can update laps"
on public.laps
for update
to anon
using (true)
with check (true);

drop policy if exists "Public dashboard can delete laps" on public.laps;
create policy "Public dashboard can delete laps"
on public.laps
for delete
to anon
using (true);

-- Realtime benefits from full row identity for DELETE events.
alter table public.races replica identity full;
alter table public.laps replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'races'
  ) then
    alter publication supabase_realtime add table public.races;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'laps'
  ) then
    alter publication supabase_realtime add table public.laps;
  end if;
end $$;

-- Optional seed for the same active race ID used by the client.
insert into public.races (id, name, duration_seconds, status)
values ('00000000-0000-0000-0000-000000000001', 'Active Endurance Race', 14400, 'not_started')
on conflict (id) do nothing;
