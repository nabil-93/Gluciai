-- Per-meal insulin plan -------------------------------------------------------
-- The patient enters how many units of MEAL (rapid) insulin they take per
-- 10 g of carbohydrates, separately for breakfast / lunch / dinner (doctor-
-- prescribed, different at each meal), plus WHICH insulins they use:
-- the meal (rapid/bolus) insulin name and the basal (slow) insulin with its
-- daily dose and injection moment. The bolus engine and the AI (chat + call)
-- use these exact numbers — never generic ratios.
alter table public.profiles
  add column if not exists insulin_per_10g_breakfast numeric
    check (insulin_per_10g_breakfast is null or (insulin_per_10g_breakfast > 0 and insulin_per_10g_breakfast <= 20)),
  add column if not exists insulin_per_10g_lunch numeric
    check (insulin_per_10g_lunch is null or (insulin_per_10g_lunch > 0 and insulin_per_10g_lunch <= 20)),
  add column if not exists insulin_per_10g_dinner numeric
    check (insulin_per_10g_dinner is null or (insulin_per_10g_dinner > 0 and insulin_per_10g_dinner <= 20)),
  add column if not exists bolus_insulin_name text,
  add column if not exists basal_insulin_name text,
  add column if not exists basal_dose numeric
    check (basal_dose is null or (basal_dose > 0 and basal_dose <= 200)),
  add column if not exists basal_time text
    check (basal_time is null or basal_time in ('morning', 'evening', 'both'));
