-- The follow-up 0031 and 0032 each asked for, plus one search_path hardening.
--
-- WHY THIS EXISTS NOW, AND NOT BEFORE
-- -----------------------------------
-- 0031 and 0032 added their CHECK constraints `NOT VALID` on purpose: enforce
-- every new INSERT and UPDATE, but do not scan history, so the migration cannot
-- fail on a deployment whose existing rows have never been audited. Both headers
-- name the follow-up explicitly — "once production data is confirmed clean, the
-- follow-up is one statement per constraint".
--
-- That audit has now been done. Measured against the hosted project on
-- 2026-08-09, before this migration was written:
--
--     profiles                                          15 rows
--       carb_ratio is not null and carb_ratio <= 0        0
--       correction_factor is not null and <= 0            0
--     meal_scans                                        44 rows
--       any of calories/carbs/sugar/protein/fat/fiber/
--       glycemic_index/confidence < 0                     0
--
-- So every existing row already satisfies all three constraints, and VALIDATE
-- is a pure metadata change here: it takes a SHARE UPDATE EXCLUSIVE lock, scans
-- the table once, finds nothing, and marks the constraint validated. It does not
-- rewrite the table and does not block reads.
--
-- IF A ROW DID VIOLATE ONE. The statement would fail and the whole migration
-- would roll back — which is the correct outcome, not a hazard: it would mean
-- the assumption above is wrong and the data must be examined before the
-- constraint is trusted. Nothing is deleted or coerced to make it pass.
--
-- WHAT THIS DOES NOT DO, deliberately:
--   · it does NOT add the `target_low <= target_high` constraint 0031 left
--     recorded. That gap is real and still open — but it is the same family of
--     "invent no bound here" reasoning, and adding it is a change to what the
--     database accepts, not a validation of what it already enforces.
--   · it does NOT widen or narrow any existing constraint.

/* ── 1. Validate what 0031 and 0032 already enforce going forward ────────── */
alter table public.profiles   validate constraint profiles_carb_ratio_positive;
alter table public.profiles   validate constraint profiles_correction_factor_positive;
alter table public.meal_scans validate constraint meal_scans_nonnegative;

/* ── 2. Pin search_path on the last function that lacks it ─────────────────
   `touch_updated_at` is the only function in `public` with a role-mutable
   search_path (Supabase advisor 0011_function_search_path_mutable).

   SCOPE, honestly stated: this is HARDENING, not a vulnerability fix. The
   function is SECURITY INVOKER (verified: pg_proc.prosecdef = false), so it
   already runs with the caller's own privileges and there is no elevated
   context for a hijacked search_path to capture. The two functions where it
   WOULD matter — handle_new_user and protect_profile_fields — are SECURITY
   DEFINER and both already carry `search_path=public`.

   It is fixed anyway because it costs one line and silences a standing advisor
   warning, so a future real finding is not lost in the noise. The body is
   unchanged. */
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
