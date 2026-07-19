-- ── Per-feature usage limits (quotas) — day / week / month ──────────────────
-- Generalises the monthly call quota (0008) to all four AI features:
--   scanner  → meal photo scans     (count)   source: meal_scans
--   ai_chat  → chat messages         (count)   source: chat_history (role='user')
--   ai_call  → voice-call minutes    (minutes) source: call_logs.duration_sec
--   labs     → lab report analyses   (count)   source: lab_reports
--
-- Two layers, resolved override → default:
--   usage_default_limits : one global row per feature, editable by the admin.
--   usage_limits         : an OPTIONAL per-user override (no row = use default;
--                          a row with limit_value NULL = explicitly unlimited).
-- Counts are computed live from the tables above inside the current period
-- window (local Morocco time), so nothing new has to be written per action and
-- the quota resets by itself at the start of the next day / week / month.

-- ── 1. tables ───────────────────────────────────────────────────────────────
create table if not exists public.usage_default_limits (
  feature text primary key check (feature in ('scanner','ai_chat','ai_call','labs')),
  limit_value integer check (limit_value is null or limit_value >= 0), -- null = unlimited
  period text not null default 'day' check (period in ('day','week','month')),
  updated_at timestamptz not null default now()
);
alter table public.usage_default_limits enable row level security;

do $$ begin
  create policy "read authenticated" on public.usage_default_limits
    for select using (auth.uid() is not null);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "admin write" on public.usage_default_limits
    for all using (public.is_admin()) with check (public.is_admin());
exception when duplicate_object then null; end $$;

-- Confirmed defaults (per day): scan 5 · chat 15 · call 5 min · labs 2.
insert into public.usage_default_limits (feature, limit_value, period) values
  ('scanner', 5,  'day'),
  ('ai_chat', 15, 'day'),
  ('ai_call', 5,  'day'),
  ('labs',    2,  'day')
on conflict (feature) do nothing;

create table if not exists public.usage_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null check (feature in ('scanner','ai_chat','ai_call','labs')),
  limit_value integer check (limit_value is null or limit_value >= 0), -- null = unlimited
  period text not null default 'day' check (period in ('day','week','month')),
  updated_at timestamptz not null default now(),
  primary key (user_id, feature)
);
alter table public.usage_limits enable row level security;

do $$ begin
  create policy "own select" on public.usage_limits for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "doctor patients select" on public.usage_limits for select using (public.is_my_patient(user_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "admin all" on public.usage_limits for all using (public.is_admin()) with check (public.is_admin());
exception when duplicate_object then null; end $$;

grant select on public.usage_default_limits to authenticated;
grant all    on public.usage_default_limits to service_role;
grant select, insert, update, delete on public.usage_limits to authenticated;
grant all    on public.usage_limits to service_role;

-- ── 2. period window (local Morocco time → resets at local midnight) ─────────
create or replace function public.usage_period_start(p_period text)
returns timestamptz
language sql stable
set search_path = public as $$
  select case p_period
    when 'week'  then (date_trunc('week',  (now() at time zone 'Africa/Casablanca')) at time zone 'Africa/Casablanca')
    when 'month' then (date_trunc('month', (now() at time zone 'Africa/Casablanca')) at time zone 'Africa/Casablanca')
    else              (date_trunc('day',   (now() at time zone 'Africa/Casablanca')) at time zone 'Africa/Casablanca')
  end;
$$;

-- ── 3. how much has this user consumed in the current window ─────────────────
-- SECURITY DEFINER so the doctor/admin (via usage_status) and the server (via
-- usage_check) can read across users; never granted to callers directly.
create or replace function public.usage_used(p_user uuid, p_feature text, p_period text)
returns integer
language sql stable security definer
set search_path = public as $$
  select coalesce(case p_feature
    when 'scanner' then (select count(*) from public.meal_scans
                          where user_id = p_user and created_at >= public.usage_period_start(p_period))
    when 'labs'    then (select count(*) from public.lab_reports
                          where user_id = p_user and created_at >= public.usage_period_start(p_period))
    when 'ai_chat' then (select count(*) from public.chat_history
                          where user_id = p_user and role = 'user'
                            and created_at >= public.usage_period_start(p_period))
    when 'ai_call' then (select ceil(coalesce(sum(duration_sec), 0)::numeric / 60) from public.call_logs
                          where user_id = p_user and created_at >= public.usage_period_start(p_period))
    else 0
  end, 0)::integer;
$$;

-- ── 4. full status for one user: every feature, override→default resolved ────
create or replace function public.usage_status(p_user uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public as $$
declare v_result jsonb;
begin
  -- only the user themselves, their doctor, or an admin may read a status
  if not (auth.uid() = p_user or public.is_admin() or public.is_my_patient(p_user)) then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'feature',   e.feature,
      'period',    e.per,
      'limit',     e.lim,
      'unlimited', e.lim is null,
      'used',      uu.u,
      'remaining', case when e.lim is null then null else greatest(0, e.lim - uu.u) end,
      'exceeded',  case when e.lim is null then false else uu.u >= e.lim end
    ) order by e.ord
  ), '[]'::jsonb) into v_result
  from (
    select f.feature, f.ord,
      case when o.user_id is not null then o.limit_value else d.limit_value end as lim,
      case when o.user_id is not null then o.period      else coalesce(d.period, 'day') end as per
    from (values ('scanner',1),('ai_chat',2),('ai_call',3),('labs',4)) as f(feature, ord)
    left join public.usage_limits         o on o.user_id = p_user and o.feature = f.feature
    left join public.usage_default_limits d on d.feature = f.feature
  ) e
  cross join lateral (select public.usage_used(p_user, e.feature, e.per) as u) uu;

  return v_result;
end;
$$;

-- Signed-in user's own status (profile screen + app gates).
create or replace function public.my_usage_status()
returns jsonb
language sql stable security definer
set search_path = public as $$
  select public.usage_status(auth.uid());
$$;

-- ── 5. single-feature check for server-side enforcement (service role) ───────
-- Does NOT depend on auth.uid(): the edge functions call it with the service
-- role before spending Gemini quota. Not granted to app users.
create or replace function public.usage_check(p_user uuid, p_feature text)
returns jsonb
language sql stable security definer
set search_path = public as $$
  select jsonb_build_object(
    'feature',  p_feature,
    'period',   e.per,
    'limit',    e.lim,
    'used',     uu.u,
    'exceeded', case when e.lim is null then false else uu.u >= e.lim end
  )
  from (
    select
      case when o.user_id is not null then o.limit_value else d.limit_value end as lim,
      case when o.user_id is not null then o.period      else coalesce(d.period, 'day') end as per
    from (select p_feature as feature) f
    left join public.usage_limits         o on o.user_id = p_user and o.feature = p_feature
    left join public.usage_default_limits d on d.feature = p_feature
  ) e
  cross join lateral (select public.usage_used(p_user, p_feature, e.per) as u) uu;
$$;

-- ── 6. rewrite the call-minutes RPC onto the new system ─────────────────────
-- ai-call.tsx keeps working unchanged (it only checks the value <= 0), but the
-- limit now honours the per-user override and its day/week/month period.
create or replace function public.my_call_minutes_left()
returns integer
language sql stable security definer
set search_path = public as $$
  select case
    when (c->>'limit') is null then 2147483647
    else greatest(0, (c->>'limit')::int - (c->>'used')::int)
  end
  from (select public.usage_check(auth.uid(), 'ai_call') as c) x;
$$;

-- ── 7. grants (internal helpers stay owner-only) ────────────────────────────
-- usage_used / usage_check have NO internal auth guard, so they must never be
-- reachable from the exposed API. Supabase default privileges grant EXECUTE to
-- anon/authenticated on new functions, hence the explicit role revokes.
revoke execute on function public.usage_used(uuid, text, text)   from public, anon, authenticated;
revoke execute on function public.usage_check(uuid, text)        from public, anon, authenticated;
grant  execute on function public.usage_check(uuid, text)        to service_role;
grant  execute on function public.usage_status(uuid)             to authenticated;
grant  execute on function public.my_usage_status()              to authenticated;
grant  execute on function public.my_call_minutes_left()         to authenticated;

-- ── 8. migrate existing monthly call limits into the new override table ──────
insert into public.usage_limits (user_id, feature, limit_value, period)
select user_id, 'ai_call', call_minutes_limit, 'month'
from public.subscriptions
where call_minutes_limit is not null
on conflict (user_id, feature) do nothing;
