-- ── Monthly voice-call quota per patient (voice is the expensive feature) ──
-- null limit = unlimited. The app checks remaining minutes before answering
-- and blocks the call (LockedScreen) once the monthly budget is spent.

alter table public.subscriptions
  add column if not exists call_minutes_limit integer;  -- null = unlimited

-- Minutes of voice call the user has consumed in the current calendar month,
-- from call_logs (source of truth for duration). SECURITY DEFINER so the app
-- can call it for the signed-in user without exposing other rows.
create or replace function public.call_minutes_used_this_month(p_user uuid)
returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(ceil(sum(duration_sec)::numeric / 60), 0)::integer
  from call_logs
  where user_id = p_user
    and created_at >= date_trunc('month', now());
$$;

grant execute on function public.call_minutes_used_this_month(uuid) to authenticated;

-- Convenience for the app: remaining minutes for the signed-in user.
-- Returns a large number when the plan is unlimited (null limit).
create or replace function public.my_call_minutes_left()
returns integer
language sql stable security definer set search_path = public as $$
  select case
    when s.call_minutes_limit is null then 2147483647
    else greatest(0, s.call_minutes_limit - public.call_minutes_used_this_month(auth.uid()))
  end
  from (
    select call_minutes_limit from subscriptions where user_id = auth.uid()
    union all select null limit 1
  ) s
  limit 1;
$$;

grant execute on function public.my_call_minutes_left() to authenticated;
