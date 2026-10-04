-- Store audit 2026-10 — C-11 (database half) and S-07.
--
-- ── C-11 · an insulin dose or a glucose reading the app refuses must not be
--    storable by any other writer ────────────────────────────────────────────
--
-- Every app writer already enforces the same two ranges:
--   · insulin  0 < dose <= 100 U   (log-insulin MAX_LOGGED_DOSE, aiLogger, the
--                                   bolus calculator caps lower still)
--   · glucose 20 <= value <= 900 mg/dL (bolusEngine MIN/MAX_TYPED_MGDL, aiLogger)
-- The columns never learned them, so "250" typed for "25,0" through any other
-- path — an old app build, the REST API — was stored and then counted as
-- insulin on board for hours. The constraints mirror the app's bounds exactly;
-- they invent no new clinical limit.
--
-- NOT VALID, as in 0031: enforced on every INSERT/UPDATE from now on without
-- scanning existing rows, so the migration cannot fail on historical data.
-- Once production data is confirmed clean:
--   alter table public.insulin_logs validate constraint insulin_logs_dose_range;
--   alter table public.glucose_logs validate constraint glucose_logs_value_range;

alter table public.insulin_logs
  add constraint insulin_logs_dose_range
  check (dose > 0 and dose <= 100) not valid;

alter table public.glucose_logs
  add constraint glucose_logs_value_range
  check (value >= 20 and value <= 900) not valid;

comment on constraint insulin_logs_dose_range on public.insulin_logs is
  'C-11: mirrors the app writers (log-insulin MAX_LOGGED_DOSE, aiLogger) — 0 < dose <= 100 U.';
comment on constraint glucose_logs_value_range on public.glucose_logs is
  'C-11: mirrors bolusEngine MIN_TYPED_MGDL / MAX_TYPED_MGDL — 20..900 mg/dL.';

-- ── S-07 · a patient could write any ai_usage row about themselves ─────────
--
-- 0007 let a patient insert ANY row for their own user_id (any kind, any cost).
-- The edge functions write their rows with the service role and need no
-- policy. The one client writer is the web voice call: Gemini Live runs in the
-- browser, so only the client sees its token counts (ai-call.tsx). The policy
-- now admits exactly that row — kind 'call', non-negative counts, a cost no
-- single call can reach — and nothing else.

drop policy if exists "own insert" on public.ai_usage;

create policy "own call usage insert" on public.ai_usage
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and kind = 'call'
    and input_tokens >= 0
    and output_tokens >= 0
    and audio_input_tokens >= 0
    and audio_output_tokens >= 0
    and cost_usd >= 0
    and cost_usd <= 5
  );
