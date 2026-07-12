-- Free-text notes: ANYTHING the patient tells the assistant that isn't one
-- of the structured logs — "I drank a glass of water", "I had a coffee",
-- "I feel stressed", "I skipped breakfast". These can genuinely affect
-- glucose/insulin needs, so they must be recorded too (history + day
-- report) and read by the AI before it proposes a dose.
-- We reuse event_logs and just widen its kind check to include 'note'.

alter table public.event_logs drop constraint if exists event_logs_kind_check;
alter table public.event_logs
  add constraint event_logs_kind_check
  check (kind in ('status', 'profile', 'note'));
