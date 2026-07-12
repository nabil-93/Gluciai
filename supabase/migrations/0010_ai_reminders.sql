-- AI reminders: the patient asks the assistant "rappelle-moi dans 1h de
-- prendre mon insuline" (chat / ai-log / voice call) and the app fires it
-- at the right time, then FOLLOWS UP: if nothing matching was logged
-- around the due time, the AI asks "did you do it?" and logs the answer.
-- status: pending → fired (shown) → done (logged/acknowledged) | missed.

create table if not exists public.ai_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message text not null,
  due_at timestamptz not null,
  follow_kind text not null default 'other'
    check (follow_kind in ('insulin','glucose','meal','activity','measure','other')),
  status text not null default 'pending'
    check (status in ('pending','fired','done','missed')),
  created_at timestamptz not null default now()
);

alter table public.ai_reminders enable row level security;

do $$ begin
  create policy "own rows select" on public.ai_reminders for select using (auth.uid() = user_id);
  create policy "own rows insert" on public.ai_reminders for insert with check (auth.uid() = user_id);
  create policy "own rows update" on public.ai_reminders for update using (auth.uid() = user_id);
  create policy "own rows delete" on public.ai_reminders for delete using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "admin all" on public.ai_reminders for all
    using (public.is_admin()) with check (public.is_admin());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "doctor patients select" on public.ai_reminders for select
    using (public.is_my_patient(user_id));
exception when duplicate_object then null; end $$;

create index if not exists ai_reminders_user_due_idx
  on public.ai_reminders (user_id, due_at);
