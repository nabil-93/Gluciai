-- N-17 — the columns behind a dose must reject values the engine already refuses.
--
-- Step 13 established the contract in one place (`clinicalNumber`, bolusEngine.ts):
-- a ratio or a correction factor is usable only when it is FINITE and > 0. Zero,
-- negatives, NaN and ±Infinity are not clinical parameters, and since Step 13 the
-- engine treats such a value as UNAVAILABLE and falls back explicitly.
--
-- The columns never learned that. `profiles.carb_ratio` and
-- `profiles.correction_factor` are bare `numeric` (0001_init.sql:17-18), while
-- `insulin_per_10g_*` — added later, in 0022 — carry
-- `is null or (x > 0 and x <= 20)`. So the app's own inputs cannot produce a
-- bad value (NumField strips '-', the wizard uses parsePositive) but the
-- database still accepts one from any other writer.
--
-- WHAT THIS DOES NOT DO, deliberately:
--   · it does NOT copy 0022's `<= 20` upper bound. That bound is a clinical
--     judgement about a per-meal ratio; a carbohydrate ratio in g/U and a
--     correction factor in mg/dL per U are different quantities with different
--     ranges, and inventing one here is exactly what Step 20B was told not to do.
--   · it does NOT touch `target_low` / `target_high`, which have the same gap
--     (no CHECK, no ordering constraint, despite Step 13 requiring both > 0 and
--     low <= high). That is the same finding family and is left recorded, not
--     silently widened.
--
-- NOT VALID is deliberate: it enforces the rule on every INSERT and UPDATE from
-- now on without scanning rows that already exist, so the migration cannot fail
-- on a deployment whose historical data has not been audited. Once production
-- data is confirmed clean, the follow-up is one statement per constraint:
--   alter table public.profiles validate constraint profiles_carb_ratio_positive;
-- (Both validate cleanly on a fresh local database — asserted in the security
-- suite, tests-security/rls/clinicalParams.test.ts.)

alter table public.profiles
  add constraint profiles_carb_ratio_positive
  check (carb_ratio is null or carb_ratio > 0) not valid;

alter table public.profiles
  add constraint profiles_correction_factor_positive
  check (correction_factor is null or correction_factor > 0) not valid;

comment on constraint profiles_carb_ratio_positive on public.profiles is
  'N-17: mirrors bolusEngine clinicalNumber() — finite and > 0, or absent. No upper bound is implied.';
comment on constraint profiles_correction_factor_positive on public.profiles is
  'N-17: mirrors bolusEngine clinicalNumber() — finite and > 0, or absent. No upper bound is implied.';
