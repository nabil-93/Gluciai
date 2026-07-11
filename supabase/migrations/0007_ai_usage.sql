-- ── Exact per-user AI token usage & cost tracking ──
-- One row per Gemini call, with the EXACT token counts returned by the API
-- (usageMetadata) and the cost computed from Google's published prices at
-- write time (USD). Sources of rows:
--   - ai-chat edge fn      (kind 'chat' / 'voice')  gemini-2.5-flash
--   - analyze-meal edge fn (kind 'scan')            gemini-2.5-flash
--   - the app after a live voice call (kind 'call') gemini-3.1-flash-live-preview

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,                                -- chat | voice | scan | call
  model text not null,
  input_tokens integer not null default 0,           -- text/image prompt tokens
  output_tokens integer not null default 0,          -- text output tokens
  audio_input_tokens integer not null default 0,     -- live call only
  audio_output_tokens integer not null default 0,    -- live call only
  cost_usd numeric(12, 8) not null default 0,
  created_at timestamptz not null default now()
);
alter table public.ai_usage enable row level security;
create index if not exists ai_usage_user_idx on public.ai_usage (user_id, created_at desc);
create index if not exists ai_usage_created_idx on public.ai_usage (created_at desc);

do $$ begin
  create policy "own insert" on public.ai_usage for insert with check (auth.uid() = user_id);
  create policy "own select" on public.ai_usage for select using (auth.uid() = user_id);
  create policy "doctor patients select" on public.ai_usage for select using (public.is_my_patient(user_id));
  create policy "admin all" on public.ai_usage for all using (public.is_admin()) with check (public.is_admin());
exception when duplicate_object then null; end $$;
