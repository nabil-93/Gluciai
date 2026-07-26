-- Let a patient detach themselves from their doctor ------------------------
--
-- The consent the patient accepts when they enter a doctor's code says, in
-- every language, "vous pouvez le retirer à tout moment". Nothing in the app
-- could do it: `protect_profile_fields` (0005) deliberately freezes
-- `doctor_id` against self-service writes, so the promise had no mechanism
-- behind it and the only way out was to ask an admin.
--
-- The asymmetry is the point. ATTACHING yourself to a doctor must stay
-- server-checked — it grants someone read access to your health data, and a
-- patient must not be able to claim a doctor who never issued them a code.
-- DETACHING only ever REMOVES access, so the patient may always do it, for
-- themselves, with no code and no approval.

create or replace function public.unlink_my_doctor()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'auth');
  end if;

  -- Same escape hatch redeem_promo_code uses, so the protect trigger lets
  -- this write through. Scoped to the caller's own row and nothing else.
  perform set_config('app.redeeming', '1', true);

  update profiles
     set doctor_id = null,
         promo_code_used = null,
         updated_at = now()
   where user_id = v_uid;

  -- The subscription discount came from the doctor's code, so it goes with
  -- the link. Leaving a discount attached to a doctor who no longer follows
  -- the patient is a billing claim nobody can justify later.
  update subscriptions
     set discount_pct = 0,
         promo_code = null,
         updated_at = now()
   where user_id = v_uid;

  return jsonb_build_object('ok', true);
end $$;

-- `revoke ... from public` alone leaves anon holding EXECUTE, because
-- Supabase's default privileges grant it to anon and authenticated at
-- creation time. Anon is revoked by name so an unauthenticated caller
-- cannot even reach the auth.uid() check inside.
revoke all on function public.unlink_my_doctor() from public;
revoke execute on function public.unlink_my_doctor() from anon;
grant execute on function public.unlink_my_doctor() to authenticated;
