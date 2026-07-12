-- Which meal of the day a scanned food belongs to (breakfast/lunch/dinner/
-- snack). Asked after a scan and by the AI in chat/voice, so the day report
-- and the doctor dashboard show meals grouped by moment.
alter table public.meal_scans
  add column if not exists meal_type text
  check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack'));
