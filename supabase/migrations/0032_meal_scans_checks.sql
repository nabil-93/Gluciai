-- N-7 — `meal_scans` accepts nutrition that cannot exist.
--
-- The mirror columns (0001_init.sql:32-39) are all bare `numeric`: a negative
-- calorie count, a negative carbohydrate or a negative confidence are all
-- storable today.
--
-- SCOPE — domain impossibility ONLY, and this boundary is the whole point:
--
--   · A negative mass or a negative energy is not a value with a plausibility
--     question attached; it is not a quantity at all. Rejecting it invents no
--     clinical threshold.
--   · An IMPLAUSIBLE-but-positive value (95 g of carbohydrate in 10 g of food)
--     is deliberately NOT rejected here. Step 11a decided that such a figure is
--     FLAGGED and shown to the patient, never silently dropped, and a database
--     constraint would overrule that decision from underneath.
--   · The offline queue makes that distinction load-bearing. Since Step 14 an
--     event is minted on the device, kept locally and re-pushed idempotently
--     until the server confirms it. A row that violates a constraint can NEVER
--     be confirmed, so it would retry forever — a silent, permanent divergence
--     between the phone and the doctor's dashboard. Constraining only values the
--     app cannot produce keeps that queue drainable by construction: no writer
--     in the codebase emits a negative (the engine floors at 0, the normalizers
--     use Math.max(0, …), the plausibility layer flags rather than negates).
--
-- NOT VALID for the same reason as 0031: enforce from now on, never fail a
-- deployment on unaudited history. Follow-up once production data is confirmed:
--   alter table public.meal_scans validate constraint meal_scans_nonnegative;

alter table public.meal_scans
  add constraint meal_scans_nonnegative
  check (
    (calories        is null or calories        >= 0) and
    (carbs           is null or carbs           >= 0) and
    (sugar           is null or sugar           >= 0) and
    (protein         is null or protein         >= 0) and
    (fat             is null or fat             >= 0) and
    (fiber           is null or fiber           >= 0) and
    (glycemic_index  is null or glycemic_index  >= 0) and
    (confidence      is null or confidence      >= 0)
  ) not valid;

comment on constraint meal_scans_nonnegative on public.meal_scans is
  'N-7: domain impossibility only (no negative mass/energy/confidence). Deliberately NOT a plausibility bound — Step 11a flags implausible values, and a rejecting constraint would strand them in the Step 14 offline queue.';
