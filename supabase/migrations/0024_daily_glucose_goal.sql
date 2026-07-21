-- Daily glucose objective (in mg/dL) -----------------------------------------
-- Replaces the percentage "time in range" goal with an absolute glucose
-- objective the patient sets for themselves (e.g. 180 mg/dL). It drives the
-- objective ring on the glycémie page: the green arc fills a full circle when
-- the day's glucose reaches the objective, the centre shows the % of the
-- objective, and the objective / reached / remaining rows are all in mg/dL.
-- Set at signup and editable from Profile → Medical settings.
alter table public.profiles
  add column if not exists daily_glucose_goal integer
    check (daily_glucose_goal is null or (daily_glucose_goal >= 40 and daily_glucose_goal <= 600));
