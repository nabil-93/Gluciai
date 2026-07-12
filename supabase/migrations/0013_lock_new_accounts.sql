-- New accounts start FULLY LOCKED: scanner, ai_chat and ai_call are all
-- blocked until the admin grants access from the dashboard. Locks live in
-- feature_access (allowed=false = blocked). Patients can only SELECT their
-- own rows (no insert/update), so the rows are created server-side by the
-- signup trigger — a patient can never unlock themselves.

-- Features every new patient is locked out of by default.
create or replace function public.lock_features_for_new_user(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.feature_access (user_id, feature, allowed)
  values
    (p_user, 'scanner', false),
    (p_user, 'ai_chat', false),
    (p_user, 'ai_call', false)
  on conflict (user_id, feature) do nothing; -- never re-lock a granted feature
end $$;

-- Extend the existing signup handler to also create the default locks.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, email, role)
  values (new.id, new.email, 'patient')
  on conflict (user_id) do update set email = excluded.email;

  -- Only patients are locked by default (admins/doctors are created by the
  -- admin with an explicit role and shouldn't be gated).
  if coalesce((select role from public.profiles where user_id = new.id), 'patient') = 'patient' then
    perform public.lock_features_for_new_user(new.id);
  end if;

  return new;
end $$;

-- Backfill: lock every EXISTING patient who has no feature_access rows yet,
-- so the rule applies uniformly. Patients who already have some rows (the
-- admin already configured them) are left untouched.
do $$
declare r record;
begin
  for r in
    select p.user_id
    from public.profiles p
    where coalesce(p.role, 'patient') = 'patient'
      and not exists (
        select 1 from public.feature_access fa where fa.user_id = p.user_id
      )
  loop
    perform public.lock_features_for_new_user(r.user_id);
  end loop;
end $$;
