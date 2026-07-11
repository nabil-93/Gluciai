-- ── Patient phone number (collected at signup, shown in the dashboard,
--    used for WhatsApp renewal reminders) ──

alter table public.profiles add column if not exists phone text;

-- patient_overview must expose it for the dashboard tables
drop view if exists public.patient_overview;
create view public.patient_overview with (security_invoker = true) as
select
  p.user_id, p.name, p.email, p.phone, p.doctor_id, p.diabetes_type, p.language,
  p.gender, p.birth_date, p.created_at, p.promo_code_used,
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
  s.plan, s.status, s.price, s.discount_pct, s.paid, s.paid_amount,
  s.starts_at, s.expires_at, s.call_minutes_limit
from public.profiles p
left join public.profiles dp on dp.user_id = p.doctor_id
left join public.subscriptions s on s.user_id = p.user_id
where p.role = 'patient';

grant select on public.patient_overview to authenticated;
