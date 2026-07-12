-- Account events: EVERY change the patient makes outside the classic logs
-- must be recorded too — activity status (sick/injured/paused/active) and
-- medical-parameter changes (targets, ratios, weight…). They show up in
-- the history/day report and feed the AI's context, so the assistant
-- always knows the patient's full, current situation.

create table if not exists public.event_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('status','profile')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.event_logs enable row level security;

do $$ begin
  create policy "own rows select" on public.event_logs for select using (auth.uid() = user_id);
  create policy "own rows insert" on public.event_logs for insert with check (auth.uid() = user_id);
  create policy "own rows update" on public.event_logs for update using (auth.uid() = user_id);
  create policy "own rows delete" on public.event_logs for delete using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "admin all" on public.event_logs for all
    using (public.is_admin()) with check (public.is_admin());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "doctor patients select" on public.event_logs for select
    using (public.is_my_patient(user_id));
exception when duplicate_object then null; end $$;

create index if not exists event_logs_user_created_idx
  on public.event_logs (user_id, created_at desc);
