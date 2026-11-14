-- GarageFlo Database Schema v2
-- ================================================================
-- Prerequisites:
--   - Run once in the Supabase SQL editor (dashboard > SQL editor)
--   - gen_random_uuid() is built-in (PostgreSQL 13+); no extension needed
--   - Do NOT run this against a database that already has these tables
-- ================================================================

-- ----------------------------------------------------------------
-- TABLES
-- ----------------------------------------------------------------

create table if not exists garages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null default 'My Garage',
  -- Notification preferences with quiet defaults
  notify_days_before integer not null default 7 check (notify_days_before >= 0),
  notify_miles_before integer not null default 500 check (notify_miles_before >= 0),
  notify_hours_before numeric(6,1) not null default 10 check (notify_hours_before >= 0),
  email_notifications boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id)
);

-- Vehicle type stored as constrained text (easier to extend than a PostgreSQL enum)
create table if not exists vehicles (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid references garages(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  type text not null default 'car' check (type in (
    'car', 'truck', 'suv',
    'motorcycle', 'dirt_bike',
    'utv', 'atv',
    'boat', 'personal_watercraft', 'snowmobile',
    'riding_mower', 'push_mower', 'generator',
    'trailer', 'camp_trailer', 'other'
  )),
  year integer check (year >= 1885 and year <= extract(year from now())::integer + 2),
  make text,
  model text,
  name text not null,
  color text,
  vin text,
  serial_number text,
  notes text,
  photo_url text,
  -- Odometer tracking (null for vehicles that track engine hours only)
  mileage integer check (mileage >= 0),
  mileage_is_estimated boolean not null default false,
  mileage_as_of date,
  -- Engine hours tracking (null for vehicles that track mileage only)
  engine_hours numeric(8,1) check (engine_hours >= 0),
  engine_hours_is_estimated boolean not null default false,
  engine_hours_as_of date,
  -- Usage estimates enable projected due-date calculations
  estimated_annual_mileage integer check (estimated_annual_mileage > 0),
  estimated_annual_hours numeric(6,1) check (estimated_annual_hours > 0),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists maintenance_logs (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references vehicles(id) on delete cascade not null,
  service_type text not null,
  performed_at date not null default current_date,
  mileage_at_service integer check (mileage_at_service >= 0),
  hours_at_service numeric(8,1) check (hours_at_service >= 0),
  cost numeric(10,2) check (cost >= 0),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references vehicles(id) on delete cascade not null,
  service_type text not null,
  notes text,
  -- Due thresholds: fires when any non-null threshold is reached (whichever comes first)
  next_due_date date,
  next_due_mileage integer check (next_due_mileage >= 0),
  next_due_hours numeric(8,1) check (next_due_hours >= 0),
  -- Recurrence intervals (all null = one-shot; set any to auto-advance after a service log)
  interval_months integer check (interval_months > 0),
  interval_miles integer check (interval_miles > 0),
  interval_hours numeric(6,1) check (interval_hours > 0),
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  -- Every reminder must have at least one due threshold
  constraint reminders_has_threshold check (
    next_due_date is not null or
    next_due_mileage is not null or
    next_due_hours is not null
  )
);

-- file_url stores the Supabase storage path (e.g. {user_id}/{vehicle_id}/{timestamp}.ext)
-- This is NOT a public URL. The attachments bucket is private.
-- Always generate access URLs via createSignedUrl() — never getPublicUrl().
create table if not exists attachments (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references vehicles(id) on delete cascade not null,
  maintenance_id uuid references maintenance_logs(id) on delete set null,
  file_url text not null,
  file_name text not null,
  file_type text not null,
  file_size integer check (file_size > 0),
  label text,
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ----------------------------------------------------------------

alter table garages enable row level security;
alter table vehicles enable row level security;
alter table maintenance_logs enable row level security;
alter table reminders enable row level security;
alter table attachments enable row level security;

-- Garages: users own their own single garage row
create policy "Users can manage own garages" on garages
  for all using (auth.uid() = user_id);

-- Vehicles: WITH CHECK validates garage ownership on insert/update
-- to prevent cross-user garage_id references
create policy "Users can manage own vehicles" on vehicles
  for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and garage_id in (select id from garages where user_id = auth.uid())
  );

-- Child tables: ownership verified through vehicle
create policy "Users can manage own maintenance logs" on maintenance_logs
  for all using (
    vehicle_id in (select id from vehicles where user_id = auth.uid())
  );

create policy "Users can manage own reminders" on reminders
  for all using (
    vehicle_id in (select id from vehicles where user_id = auth.uid())
  );

create policy "Users can manage own attachments" on attachments
  for all using (
    vehicle_id in (select id from vehicles where user_id = auth.uid())
  );

-- ----------------------------------------------------------------
-- INDEXES
-- ----------------------------------------------------------------

create index if not exists garages_user_id_idx on garages(user_id);

create index if not exists vehicles_user_id_idx on vehicles(user_id);
create index if not exists vehicles_garage_id_idx on vehicles(garage_id);

create index if not exists maintenance_logs_vehicle_id_idx on maintenance_logs(vehicle_id);
create index if not exists maintenance_logs_performed_at_idx on maintenance_logs(performed_at desc);

create index if not exists reminders_vehicle_id_idx on reminders(vehicle_id);
-- Partial index for the cron job: only active reminders with a due date
create index if not exists reminders_active_due_date_idx on reminders(next_due_date)
  where is_active = true and next_due_date is not null;

create index if not exists attachments_vehicle_id_idx on attachments(vehicle_id);
create index if not exists attachments_maintenance_id_idx on attachments(maintenance_id);

-- ----------------------------------------------------------------
-- FUNCTIONS & TRIGGERS
-- ----------------------------------------------------------------

-- Auto-create a garage row for every new Supabase auth user.
-- SET search_path = '' prevents "relation does not exist" in Supabase's
-- security-hardened environment; public.garages is fully qualified.
create or replace function create_garage_for_user()
returns trigger as $$
begin
  insert into public.garages (user_id, name)
  values (new.id, 'My Garage');
  return new;
end;
$$ language plpgsql security definer set search_path = '';

-- Drop and recreate to avoid duplicate trigger on re-run
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function create_garage_for_user();

-- ----------------------------------------------------------------
-- STORAGE
-- ----------------------------------------------------------------

-- Private bucket — files are accessed via signed URLs only
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict do nothing;

-- File path pattern: {user_id}/{vehicle_id}/{timestamp}.{ext}
-- Policies match on the first path component (user_id folder)

create policy "Users can upload own attachments" on storage.objects
  for insert with check (
    bucket_id = 'attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can read own attachments" on storage.objects
  for select using (
    bucket_id = 'attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can update own attachments" on storage.objects
  for update using (
    bucket_id = 'attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete own attachments" on storage.objects
  for delete using (
    bucket_id = 'attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ================================================================
-- ACCOUNT DELETION NOTE
-- ================================================================
-- Database rows cascade cleanly: auth.users → garages → vehicles →
-- {maintenance_logs, reminders, attachments}.
-- Storage files are NOT automatically deleted when rows are deleted.
-- A "delete account" flow must call:
--   supabase.storage.from('attachments').list(userId)
--   supabase.storage.from('attachments').remove([...paths])
-- before deleting the auth.users record.
-- Implement this in a /api/account/delete route in a future milestone.
-- ================================================================
