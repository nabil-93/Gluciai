-- Meal context for a logged insulin injection -------------------------------
-- When the patient logs an injection they can tag which meal it was for
-- (breakfast / lunch / dinner / snack), like the bolus calculator. Lets the
-- history and the AI correlate the shot with the right meal ratio.
alter table public.insulin_logs
  add column if not exists meal_type text
    check (meal_type is null or meal_type in ('breakfast', 'lunch', 'dinner', 'snack'));
