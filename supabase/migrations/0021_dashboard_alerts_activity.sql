-- ── Dashboard v2: in-app alerts, last-connection tracking, glucose risk ──
-- Adds three capabilities driven from the admin/doctor dashboard:
--   1. app_alerts   — a message the admin sends to a patient; the app shows
--                     it centered on screen with an optional contact button.
--   2. last_seen_at — a lightweight heartbeat so the dashboard can show and
--                     filter patients by their last app connection.
--   3. patient_overview gains last_seen_at + recent glucose out-of-range
--      stats so the dashboard can flag "at-risk" cases.

-- ── 1. In-app alerts (admin/doctor → patient) ──────────────────────────────
-- Delivered instantly via Supabase Realtime, then shown as a centered modal
-- in the app. `cta` decides the optional button:
--   none    → just an "OK" acknowledgement
--   support → "Contacter le support" (opens WhatsApp support)
--   doctor  → "Contacter mon médecin" (calls/WhatsApps the linked doctor)
create table if not exists public.app_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  body text not null,
  cta text not null default 'none' check (cta in ('none', 'support', 'doctor')),
  status text not null default 'sent' check (status in ('sent', 'seen')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  seen_at timestamptz
);
alter table public.app_alerts enable row level security;

-- Patient: reads and acknowledges (marks seen) only their own alerts.
do $$ begin
  create policy "own select" on public.app_alerts for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "own update" on public.app_alerts for update
    using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- Admin: full control (send to anyone, read everything).
do $$ begin
  create policy "admin all" on public.app_alerts for all
    using (public.is_admin()) with check (public.is_admin());
exception when duplicate_object then null; end $$;

-- Doctor: may send to and read the alerts of their own patients.
do $$ begin
  create policy "doctor patients select" on public.app_alerts for select
    using (public.is_my_patient(user_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "doctor patients insert" on public.app_alerts for insert
    with check (public.is_my_patient(user_id) and public.is_doctor());
exception when duplicate_object then null; end $$;

create index if not exists app_alerts_user_idx
  on public.app_alerts (user_id, created_at desc);
-- Fast lookup of the pending (unseen) alert the app must surface on open.
create index if not exists app_alerts_pending_idx
  on public.app_alerts (user_id, status) where status = 'sent';

-- Instant push to the app (initial fetch on open still covers cold starts).
do $$ begin
  alter publication supabase_realtime add table public.app_alerts;
exception
  when duplicate_object then null;
  when undefined_object then null; -- publication not present in some local stacks
end $$;

-- ── 2. Last connection heartbeat ───────────────────────────────────────────
-- Updated by the app on launch and when it returns to the foreground. This is
-- the true "last time the patient opened the app" — more meaningful than the
-- auth last_sign_in_at, since sessions persist for weeks.
alter table public.profiles add column if not exists last_seen_at timestamptz;

-- Let a patient stamp only their OWN heartbeat, nothing else. SECURITY DEFINER
-- so it bypasses the profile-field protection trigger without widening the
-- profiles update policy.
create or replace function public.touch_last_seen()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  update public.profiles set last_seen_at = now() where user_id = auth.uid();
end $$;
grant execute on function public.touch_last_seen() to authenticated;

-- ── 3. patient_overview: last connection + glucose risk window ──────────────
-- Rebuilt from migration 0009 with two additions:
--   • last_seen_at                → dernière connexion
--   • gly_14d / gly_out_14d /
--     gly_severe_14d / last_gly_at → recent glucose out-of-range stats used to
--                                    flag at-risk patients (target 70–180 mg/dL;
--                                    severe = < 54 or > 250).
drop view if exists public.patient_overview;
create view public.patient_overview with (security_invoker = true) as
select
  p.user_id, p.name, p.email, p.phone, p.doctor_id, p.diabetes_type, p.language,
  p.gender, p.birth_date, p.created_at, p.promo_code_used, p.last_seen_at,
  dp.name as doctor_name,
  (select count(*) from public.meal_scans m where m.user_id = p.user_id) as meals_count,
  (select count(*) from public.glucose_logs g where g.user_id = p.user_id) as glucose_count,
  (select count(*) from public.insulin_logs i where i.user_id = p.user_id) as insulin_count,
  (select count(*) from public.activity_logs a where a.user_id = p.user_id) as activity_count,
  (select count(*) from public.measure_logs x where x.user_id = p.user_id) as measures_count,
  greatest(
    (select max(m.created_at) from public.meal_scans m where m.user_id = p.user_id),
    (select max(g.created_at) from public.glucose_logs g where g.user_id = p.user_id),
    (select max(i.created_at) from public.insulin_logs i where i.user_id = p.user_id),
    (select max(a.created_at) from public.activity_logs a where a.user_id = p.user_id)
  ) as last_activity,
  -- Glucose risk window (last 14 days)
  (select count(*) from public.glucose_logs g
     where g.user_id = p.user_id and g.created_at > now() - interval '14 days') as gly_14d,
  (select count(*) from public.glucose_logs g
     where g.user_id = p.user_id and g.created_at > now() - interval '14 days'
       and (g.value < 70 or g.value > 180)) as gly_out_14d,
  (select count(*) from public.glucose_logs g
     where g.user_id = p.user_id and g.created_at > now() - interval '14 days'
       and (g.value < 54 or g.value > 250)) as gly_severe_14d,
  (select max(g.created_at) from public.glucose_logs g where g.user_id = p.user_id) as last_gly_at,
  s.plan, s.status, s.price, s.discount_pct, s.paid, s.paid_amount,
  s.starts_at, s.expires_at, s.call_minutes_limit
from public.profiles p
left join public.profiles dp on dp.user_id = p.doctor_id
left join public.subscriptions s on s.user_id = p.user_id
where p.role = 'patient';

grant select on public.patient_overview to authenticated;
