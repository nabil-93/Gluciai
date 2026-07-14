-- Lab (blood test) reports photographed by the patient and analyzed by the
-- AI: extracted values (jsonb), optional AI medical report and spoken
-- explanation script. Same local-first + server-mirror pattern as the other
-- log tables.

create table if not exists public.lab_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  lab_name text,
  report_date date,
  summary text,
  "values" jsonb not null default '[]'::jsonb,
  medical_report text,
  voice_script text,
  has_graphs boolean not null default true,
  image_thumb text,
  created_at timestamptz not null default now()
);

create index if not exists lab_reports_user_created_idx
  on public.lab_reports (user_id, created_at desc);

alter table public.lab_reports enable row level security;

drop policy if exists "lab_reports_select_own" on public.lab_reports;
create policy "lab_reports_select_own" on public.lab_reports
  for select using (auth.uid() = user_id);

drop policy if exists "lab_reports_insert_own" on public.lab_reports;
create policy "lab_reports_insert_own" on public.lab_reports
  for insert with check (auth.uid() = user_id);

drop policy if exists "lab_reports_update_own" on public.lab_reports;
create policy "lab_reports_update_own" on public.lab_reports
  for update using (auth.uid() = user_id);

drop policy if exists "lab_reports_delete_own" on public.lab_reports;
create policy "lab_reports_delete_own" on public.lab_reports
  for delete using (auth.uid() = user_id);

-- Doctors follow their patients and admins see everything from the
-- dashboard — same pattern as every other log table (0005_dashboard_roles).
drop policy if exists "doctor patients select" on public.lab_reports;
create policy "doctor patients select" on public.lab_reports
  for select using (public.is_my_patient(user_id));

drop policy if exists "admin all" on public.lab_reports;
create policy "admin all" on public.lab_reports
  for all using (public.is_admin()) with check (public.is_admin());
