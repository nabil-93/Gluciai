-- Daily "time in range" goal ---------------------------------------------------
-- The patient sets, for themselves, the percentage of the day their glucose
-- should stay inside their target range (target_low..target_high). It drives
-- the objective ring on the glycémie page. Stored as a percentage (1..100),
-- default 70 (the standard clinical TIR goal). Set during signup and editable
-- from the profile.
--
-- NOTE: until this is applied to the live DB, the app keeps daily_tir_goal
-- client-side only (services/data.ts strips it from the profiles upsert, and
-- services/sync.ts preserves the local value on hydrate). Once applied, remove
-- that strip so the goal syncs to the server (and the doctor dashboard).
alter table public.profiles
  add column if not exists daily_tir_goal integer
    check (daily_tir_goal is null or (daily_tir_goal >= 1 and daily_tir_goal <= 100));
