-- GlucoAI initial schema (Part 6: Database + RLS)

-- Profiles ------------------------------------------------------------------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  birth_date date,
  gender text check (gender in ('male', 'female', 'other')),
  height numeric,
  weight numeric,
  diabetes_type text not null default 'type2'
    check (diabetes_type in ('type1', 'type2', 'gestational', 'prediabetes')),
  insulin_types text[] not null default '{}',
  language text not null default 'en',
  target_low numeric not null default 70,
  target_high numeric not null default 180,
  carb_ratio numeric,
  correction_factor numeric,
  emergency_contact_name text,
  emergency_contact_phone text,
  doctor_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Meal scans ----------------------------------------------------------------
create table if not exists public.meal_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  image_url text,
  result jsonb not null,
  calories numeric,
  carbs numeric,
  sugar numeric,
  protein numeric,
  fat numeric,
  fiber numeric,
  glycemic_index numeric,
  confidence numeric,
  created_at timestamptz not null default now()
);
create index if not exists meal_scans_user_created_idx
  on public.meal_scans (user_id, created_at desc);

-- Glucose logs ---------------------------------------------------------------
create table if not exists public.glucose_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  value numeric not null,
  unit text not null default 'mg/dL' check (unit in ('mg/dL', 'mmol/L')),
  source text not null default 'manual' check (source in ('manual', 'device')),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists glucose_logs_user_created_idx
  on public.glucose_logs (user_id, created_at desc);

-- Insulin logs ---------------------------------------------------------------
create table if not exists public.insulin_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  insulin_type text not null check (insulin_type in ('rapid', 'long', 'mixed')),
  dose numeric not null,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists insulin_logs_user_created_idx
  on public.insulin_logs (user_id, created_at desc);

-- Chat history ---------------------------------------------------------------
create table if not exists public.chat_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  message text not null,
  language text not null default 'en',
  created_at timestamptz not null default now()
);
create index if not exists chat_history_user_created_idx
  on public.chat_history (user_id, created_at);

-- Notifications --------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- Doctor reports ---------------------------------------------------------------
create table if not exists public.doctor_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  pdf_url text not null,
  created_at timestamptz not null default now()
);

-- Settings ---------------------------------------------------------------------
create table if not exists public.settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  theme text not null default 'dark',
  language text not null default 'en',
  notifications_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Row Level Security: users only access their own rows -------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'meal_scans', 'glucose_logs', 'insulin_logs',
    'chat_history', 'notifications', 'doctor_reports', 'settings'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "own rows select" on public.%I for select using (auth.uid() = user_id)', t);
    execute format(
      'create policy "own rows insert" on public.%I for insert with check (auth.uid() = user_id)', t);
    execute format(
      'create policy "own rows update" on public.%I for update using (auth.uid() = user_id)', t);
    execute format(
      'create policy "own rows delete" on public.%I for delete using (auth.uid() = user_id)', t);
  end loop;
end
$$;

-- Storage buckets ---------------------------------------------------------------
insert into storage.buckets (id, name, public)
values
  ('meal-images', 'meal-images', false),
  ('profile-images', 'profile-images', false),
  ('medical-reports', 'medical-reports', false)
on conflict (id) do nothing;

create policy "own meal images" on storage.objects
  for all using (
    bucket_id in ('meal-images', 'profile-images', 'medical-reports')
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id in ('meal-images', 'profile-images', 'medical-reports')
    and (storage.foldername(name))[1] = auth.uid()::text
  );
