-- Lock down SECURITY DEFINER functions that PostgREST exposed to anon /
-- authenticated (Supabase linter 0028 / 0029). Applied to production on
-- 2026-07-17 (mcp apply_migration security_hardening_definer_fns).
--
-- NOT touched: is_admin() / is_doctor() / is_my_patient(uuid) — they are
-- referenced inside RLS policies, which evaluate with the caller's
-- privileges, so api roles must keep EXECUTE on them.

-- Trigger functions: only the trigger machinery calls these — no api role
-- ever needs to invoke them through /rest/v1/rpc.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.protect_profile_fields() from public, anon, authenticated;
revoke execute on function public.lock_features_for_new_user(uuid) from public, anon, authenticated;

-- Quota internals: the app goes through my_call_minutes_left() (security
-- definer, runs as owner) and the dashboard uses service-role SQL — nobody
-- should be able to query ANOTHER user's consumption via rpc.
revoke execute on function public.call_minutes_used_this_month(uuid) from public, anon, authenticated;

-- Signed-in-only RPCs: keep authenticated, drop anon/public.
revoke execute on function public.redeem_promo_code(text) from public, anon;
revoke execute on function public.my_call_minutes_left() from public, anon;
