-- ── GluciAI Dashboard: roles, doctors, promo codes, subscriptions, feature locks ──
-- Roles: patient (default) | doctor | admin.
-- Doctors see only their linked patients; admin sees everything.
-- Patients link to a doctor by redeeming that doctor's promo code (-10% on subscription).

-- ── 1. profiles: role + doctor link + email mirror ─────────────────────────
alter table public.profiles add column if not exists role text not null default 'patient';
alter table public.profiles add column if not exists doctor_id uuid references auth.users(id) on delete set null;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists promo_code_used text;

do $$ begin
  alter table public.profiles add constraint profiles_role_check check (role in ('patient','doctor','admin'));
exception when duplicate_object then null; end $$;

create index if not exists profiles_doctor_id_idx on public.profiles (doctor_id);

-- ── 2. missing log tables (the app already inserts into them) ──────────────
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text,
  duration_min numeric,
  intensity text,
  notes text,
  created_at timestamptz not null default now()
);
create table if not exists public.measure_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text,
  value numeric,
  unit text,
  created_at timestamptz not null default now()
);
alter table public.activity_logs enable row level security;
alter table public.measure_logs enable row level security;

do $$ begin
  create policy "own rows select" on public.activity_logs for select using (auth.uid() = user_id);
  create policy "own rows insert" on public.activity_logs for insert with check (auth.uid() = user_id);
  create policy "own rows update" on public.activity_logs for update using (auth.uid() = user_id);
  create policy "own rows delete" on public.activity_logs for delete using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "own rows select" on public.measure_logs for select using (auth.uid() = user_id);
  create policy "own rows insert" on public.measure_logs for insert with check (auth.uid() = user_id);
  create policy "own rows update" on public.measure_logs for update using (auth.uid() = user_id);
  create policy "own rows delete" on public.measure_logs for delete using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

create index if not exists activity_logs_user_idx on public.activity_logs (user_id, created_at desc);
create index if not exists measure_logs_user_idx on public.measure_logs (user_id, created_at desc);

-- ── 3. role helpers (security definer → no RLS recursion) ──────────────────
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists(select 1 from profiles where user_id = auth.uid() and role = 'admin') $$;

create or replace function public.is_doctor() returns boolean
language sql stable security definer set search_path = public as
$$ select exists(select 1 from profiles where user_id = auth.uid() and role = 'doctor') $$;

create or replace function public.is_my_patient(p_user uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists(select 1 from profiles where user_id = p_user and doctor_id = auth.uid()) $$;

-- ── 4. promo codes ──────────────────────────────────────────────────────────
create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  doctor_id uuid not null references auth.users(id) on delete cascade,
  discount_pct numeric not null default 10,
  active boolean not null default true,
  uses_count integer not null default 0,
  max_uses integer,
  created_at timestamptz not null default now()
);
alter table public.promo_codes enable row level security;
create index if not exists promo_codes_doctor_idx on public.promo_codes (doctor_id);

do $$ begin
  create policy "doctor own select" on public.promo_codes for select using (doctor_id = auth.uid());
  create policy "doctor own insert" on public.promo_codes for insert with check (doctor_id = auth.uid() and public.is_doctor());
  create policy "doctor own update" on public.promo_codes for update using (doctor_id = auth.uid());
exception when duplicate_object then null; end $$;

-- ── 5. subscriptions (managed manually from the dashboard for now) ─────────
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free',
  status text not null default 'none',
  price numeric not null default 0,
  discount_pct numeric not null default 0,
  paid boolean not null default false,
  paid_amount numeric not null default 0,
  promo_code text,
  starts_at timestamptz,
  expires_at timestamptz,
  notes text,
  updated_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;

do $$ begin
  create policy "own select" on public.subscriptions for select using (auth.uid() = user_id);
  create policy "doctor patients select" on public.subscriptions for select using (public.is_my_patient(user_id));
exception when duplicate_object then null; end $$;

-- ── 6. per-user feature locks (no row = allowed) ────────────────────────────
create table if not exists public.feature_access (
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null,
  allowed boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, feature)
);
alter table public.feature_access enable row level security;

do $$ begin
  create policy "own select" on public.feature_access for select using (auth.uid() = user_id);
  create policy "doctor patients select" on public.feature_access for select using (public.is_my_patient(user_id));
exception when duplicate_object then null; end $$;

-- ── 7. doctor read access on patient data, admin full access ────────────────
do $$ begin
  create policy "doctor patients select" on public.profiles for select using (doctor_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$
declare t text;
begin
  foreach t in array array['meal_scans','glucose_logs','insulin_logs','activity_logs','measure_logs','doctor_reports'] loop
    begin
      execute format('create policy "doctor patients select" on public.%I for select using (public.is_my_patient(user_id))', t);
    exception when duplicate_object then null; end;
  end loop;
  foreach t in array array['profiles','meal_scans','glucose_logs','insulin_logs','activity_logs','measure_logs',
                           'chat_history','notifications','doctor_reports','settings','promo_codes','subscriptions','feature_access'] loop
    begin
      execute format('create policy "admin all" on public.%I for all using (public.is_admin()) with check (public.is_admin())', t);
    exception when duplicate_object then null; end;
  end loop;
end $$;

-- ── 8. protect role/doctor_id from self-service tampering ──────────────────
create or replace function public.protect_profile_fields() returns trigger
language plpgsql security definer set search_path = public as $$
declare allowed boolean;
begin
  allowed := (auth.uid() is null)                                   -- service role / server side
             or coalesce(current_setting('app.redeeming', true), '') = '1'  -- redeem_promo_code RPC
             or public.is_admin();
  if allowed then return new; end if;
  if tg_op = 'INSERT' then
    new.role := 'patient';
    new.doctor_id := null;
    new.promo_code_used := null;
  else
    new.role := old.role;
    new.doctor_id := old.doctor_id;
    new.promo_code_used := old.promo_code_used;
  end if;
  return new;
end $$;

drop trigger if exists protect_profile_fields_tg on public.profiles;
create trigger protect_profile_fields_tg
  before insert or update on public.profiles
  for each row execute function public.protect_profile_fields();

-- ── 9. auto profile row + email mirror on signup ────────────────────────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, email, role)
  values (new.id, new.email, 'patient')
  on conflict (user_id) do update set email = excluded.email;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- backfill existing users
insert into public.profiles (user_id, email)
select u.id, u.email from auth.users u
on conflict (user_id) do update set email = excluded.email;

-- ── 10. promo redemption RPC (called from the app wizard) ───────────────────
create or replace function public.redeem_promo_code(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_promo public.promo_codes%rowtype;
  v_uid uuid := auth.uid();
  v_doctor_name text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'auth'); end if;
  select * into v_promo from promo_codes
    where upper(code) = upper(trim(p_code)) and active
      and (max_uses is null or uses_count < max_uses)
    limit 1;
  if not found then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;

  perform set_config('app.redeeming', '1', true);
  update profiles set doctor_id = v_promo.doctor_id, promo_code_used = v_promo.code where user_id = v_uid;
  if not found then
    insert into profiles (user_id, role, doctor_id, promo_code_used)
    values (v_uid, 'patient', v_promo.doctor_id, v_promo.code);
  end if;
  update promo_codes set uses_count = uses_count + 1 where id = v_promo.id;
  insert into subscriptions (user_id, discount_pct, promo_code)
  values (v_uid, v_promo.discount_pct, v_promo.code)
  on conflict (user_id) do update
    set discount_pct = excluded.discount_pct, promo_code = excluded.promo_code, updated_at = now();

  select name into v_doctor_name from profiles where user_id = v_promo.doctor_id;
  return jsonb_build_object('ok', true, 'discount', v_promo.discount_pct, 'doctor', coalesce(v_doctor_name, ''));
end $$;

grant execute on function public.redeem_promo_code(text) to authenticated;

-- ── 11. dashboard views (security invoker → RLS of the caller applies) ─────
drop view if exists public.patient_overview;
create view public.patient_overview with (security_invoker = true) as
select
  p.user_id, p.name, p.email, p.doctor_id, p.diabetes_type, p.language,
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
  s.plan, s.status, s.price, s.discount_pct, s.paid, s.paid_amount, s.starts_at, s.expires_at
from public.profiles p
left join public.profiles dp on dp.user_id = p.doctor_id
left join public.subscriptions s on s.user_id = p.user_id
where p.role = 'patient';

drop view if exists public.doctor_overview;
create view public.doctor_overview with (security_invoker = true) as
select
  p.user_id, p.name, p.email, p.created_at,
  (select count(*) from public.profiles x where x.doctor_id = p.user_id) as patients_count,
  (select count(*) from public.promo_codes c where c.doctor_id = p.user_id) as codes_count,
  (select coalesce(sum(c.uses_count), 0) from public.promo_codes c where c.doctor_id = p.user_id) as referred_count
from public.profiles p
where p.role = 'doctor';

grant select on public.patient_overview to authenticated;
grant select on public.doctor_overview to authenticated;

-- ── 12. bootstrap: make Nabil the admin ─────────────────────────────────────
insert into public.profiles (user_id, email, name, role)
values ('e40b51e2-6a19-4948-b2fa-b0a1791875a7', 'nab.ouhaddou@gmail.com', 'Nabil', 'admin')
on conflict (user_id) do update set role = 'admin';
