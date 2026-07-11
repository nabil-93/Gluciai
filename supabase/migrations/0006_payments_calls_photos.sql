-- ── Dashboard v2: monthly payments, AI call logs, chat visibility, meal photos ──

-- 1. Meal photos are shown in the dashboard via getPublicUrl() → the bucket
--    must be publicly readable (uploads stay locked to the owner's folder, 0001).
update storage.buckets set public = true where id = 'meal-images';

-- 2. Monthly payment history (one row = one month settled by the patient).
--    Months without a row between subscription start and today = unpaid.
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period date not null,                -- first day of the paid month
  amount numeric not null default 0,
  method text,                         -- cash / carte / virement…
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, period)
);
alter table public.payments enable row level security;
create index if not exists payments_user_idx on public.payments (user_id, period desc);

do $$ begin
  create policy "own select" on public.payments for select using (auth.uid() = user_id);
  create policy "doctor patients select" on public.payments for select using (public.is_my_patient(user_id));
  create policy "admin all" on public.payments for all using (public.is_admin()) with check (public.is_admin());
exception when duplicate_object then null; end $$;

-- 3. AI voice-call logs (duration tracked by the app when a call ends).
create table if not exists public.call_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  duration_sec integer not null default 0,
  language text,
  created_at timestamptz not null default now()
);
alter table public.call_logs enable row level security;
create index if not exists call_logs_user_idx on public.call_logs (user_id, created_at desc);

do $$ begin
  create policy "own insert" on public.call_logs for insert with check (auth.uid() = user_id);
  create policy "own select" on public.call_logs for select using (auth.uid() = user_id);
  create policy "doctor patients select" on public.call_logs for select using (public.is_my_patient(user_id));
  create policy "admin all" on public.call_logs for all using (public.is_admin()) with check (public.is_admin());
exception when duplicate_object then null; end $$;

-- 4. Doctors follow their patients' chatbot conversations too (admin already can).
do $$ begin
  create policy "doctor patients select" on public.chat_history for select using (public.is_my_patient(user_id));
exception when duplicate_object then null; end $$;
