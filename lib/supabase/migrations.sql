-- GarageFlo Database Schema
-- Run this in your Supabase SQL editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Garages table (one per user for MVP)
create table if not exists garages (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null default 'My Garage',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id)
);

-- Vehicles table
create table if not exists vehicles (
  id uuid primary key default uuid_generate_v4(),
  garage_id uuid references garages(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  type text not null default 'car',
  year integer,
  make text,
  model text,
  name text not null,
  mileage integer,
  color text,
  notes text,
  photo_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Maintenance logs table
create table if not exists maintenance_logs (
  id uuid primary key default uuid_generate_v4(),
  vehicle_id uuid references vehicles(id) on delete cascade not null,
  service_type text not null,
  performed_at date not null default current_date,
  mileage_at_service integer,
  cost numeric(10, 2),
  notes text,
  created_at timestamptz default now()
);

-- Reminders table
create table if not exists reminders (
  id uuid primary key default uuid_generate_v4(),
  vehicle_id uuid references vehicles(id) on delete cascade not null,
  service_type text not null,
  remind_by_date date,
  remind_by_mileage integer,
  next_due_date date,
  next_due_mileage integer,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Attachments table
create table if not exists attachments (
  id uuid primary key default uuid_generate_v4(),
  vehicle_id uuid references vehicles(id) on delete cascade not null,
  maintenance_id uuid references maintenance_logs(id) on delete set null,
  file_url text not null,
  file_name text not null,
  file_type text not null,
  label text,
  created_at timestamptz default now()
);

-- RLS Policies
alter table garages enable row level security;
alter table vehicles enable row level security;
alter table maintenance_logs enable row level security;
alter table reminders enable row level security;
alter table attachments enable row level security;

-- Garage policies
create policy "Users can manage own garages" on garages
  for all using (auth.uid() = user_id);

-- Vehicle policies
create policy "Users can manage own vehicles" on vehicles
  for all using (auth.uid() = user_id);

-- Maintenance policies
create policy "Users can manage own maintenance logs" on maintenance_logs
  for all using (
    vehicle_id in (select id from vehicles where user_id = auth.uid())
  );

-- Reminder policies
create policy "Users can manage own reminders" on reminders
  for all using (
    vehicle_id in (select id from vehicles where user_id = auth.uid())
  );

-- Attachment policies
create policy "Users can manage own attachments" on attachments
  for all using (
    vehicle_id in (select id from vehicles where user_id = auth.uid())
  );

-- Auto-create garage for new users
create or replace function create_garage_for_user()
returns trigger as $$
begin
  insert into garages (user_id, name)
  values (new.id, 'My Garage');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function create_garage_for_user();

-- Storage bucket for attachments
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict do nothing;

create policy "Users can upload own attachments" on storage.objects
  for insert with check (bucket_id = 'attachments' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can read own attachments" on storage.objects
  for select using (bucket_id = 'attachments' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can delete own attachments" on storage.objects
  for delete using (bucket_id = 'attachments' and auth.uid()::text = (storage.foldername(name))[1]);
