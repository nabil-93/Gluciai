-- Restore the privilege BASELINE the whole migration chain was authored on top
-- of, so a fresh database reproduces the hosted project instead of a schema
-- nobody can read.
--
-- WHY THIS EXISTS
-- ---------------
-- Every migration from 0001 onward assumed the Supabase default that grants
-- the API roles full privileges on objects created in `public`. The hosted
-- project has that default; a database provisioned by the CLI does not:
--
--     default ACL for tables created by `postgres` in schema public
--       hosted : anon/authenticated/service_role = arwdDxtm   (full)
--       local  : anon/authenticated/service_role = Dxtm       (no a/r/w/d)
--
-- So on any fresh environment the 30 app tables ended up with TRUNCATE,
-- REFERENCES and TRIGGER but no SELECT/INSERT/UPDATE/DELETE, and the RLS
-- helper functions (is_admin, is_doctor, is_my_patient) had no EXECUTE at all.
-- Migrations all reported success and the resulting database returned HTTP 403
-- for every read and write. The chain was reproducible as DDL and inert as an
-- application.
--
-- ORDERING MATTERS
-- ----------------
-- This migration runs AFTER 0018, 0020 and 0029, which deliberately REVOKE
-- execute on privileged internals. A blanket grant alone would silently undo
-- that hardening, so every one of those revokes is re-applied below. The end
-- state is exactly what the hosted project reports today — measured, not
-- assumed: production carries ALL 7 privileges for all three roles on all 32
-- objects with zero exceptions, and its per-function grants reproduce as
-- (default ALL) + (explicit grants) − (these revokes).
--
-- This adds no privilege the hosted project does not already have. Note that
-- production parity means `anon` holds table-level DML it never exercises;
-- RLS is what actually protects the rows. Narrowing that is a separate,
-- deliberate decision (RU-16) and is intentionally NOT taken here.

/* ── 1. Baseline for objects that already exist ─────────────────────────── */
grant all     on all tables    in schema public to anon, authenticated, service_role;
grant all     on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;

/* ── 2. Baseline for objects created by later migrations ────────────────── */
alter default privileges in schema public grant all     on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all     on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

/* ── 3. Re-apply 0018 (SECURITY DEFINER hardening) ──────────────────────────
   Trigger internals and quota internals must not be reachable through
   /rest/v1/rpc. Verbatim from 0018_security_hardening.sql. */
revoke execute on function public.handle_new_user()                  from public, anon, authenticated;
revoke execute on function public.protect_profile_fields()           from public, anon, authenticated;
revoke execute on function public.lock_features_for_new_user(uuid)   from public, anon, authenticated;
revoke execute on function public.call_minutes_used_this_month(uuid) from public, anon, authenticated;
revoke execute on function public.redeem_promo_code(text)            from public, anon;
revoke execute on function public.my_call_minutes_left()             from public, anon;

/* ── 4. Re-apply 0020 (usage-quota internals) ───────────────────────────── */
revoke execute on function public.usage_used(uuid, text, text)       from public, anon, authenticated;
revoke execute on function public.usage_check(uuid, text)            from public, anon, authenticated;

/* ── 5. Re-apply 0029 (patient-initiated unlink) ────────────────────────────
   `revoke ... from public` alone leaves anon holding EXECUTE, so anon is
   revoked by name — same reasoning as the original migration. */
revoke all     on function public.unlink_my_doctor()                 from public;
revoke execute on function public.unlink_my_doctor()                 from anon;

/* The three RLS helpers keep EXECUTE for the api roles on purpose: policies
   evaluate with the caller's privileges, so `is_admin()`, `is_doctor()` and
   `is_my_patient()` must remain callable or every doctor/admin policy fails
   closed for the wrong reason. 0018 documents the same exception. */
