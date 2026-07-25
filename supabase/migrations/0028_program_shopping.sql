-- "Mon Programme" — the week's shopping, and the stock it becomes ----------
--
-- A coaching program that tells you what to eat but not what to buy is a
-- program you abandon on the second day, standing in a shop with no list.
-- So each week of the parcours gets ONE shopping list, written before the
-- week starts, and that list then behaves like a larder: every meal the
-- patient confirms eating draws its ingredients down from it.
--
-- Two decisions worth stating:
--
--  1. The list is EXACT, not a guess. The coach writes the week's seven days
--     first (day by day, as it always has, each one knowing the ones before
--     it); the list is the sum of those days' real ingredients, priced by
--     the nutrition databases. The days are stored but the app reveals them
--     one at a time — the patient shops for the week without being shown
--     the week, which is the whole point of a parcours you discover.
--
--  2. Consumption is NOT stored here. What is left of an item is computed
--     from the program days: the ingredients of the meals actually marked
--     eaten, scaled by the portion the patient said they had. One source of
--     truth means the larder can never drift from the journal, and it can
--     never claim the patient ate something they did not confirm.

create table if not exists public.program_shopping (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Which week of the parcours this covers (0 = the first).
  week_index integer not null check (week_index >= 0),
  start_date date not null,
  end_date date not null,
  -- The day the patient should go and buy it: the eve of the week, or today
  -- when the week has already started (nobody shops in the past).
  shop_date date not null,

  status text not null default 'planned'
    check (status in ('planned', 'stocked', 'done')),

  -- [{key, name, category, grams, unit, bought}]
  --   key      the generic English search name — the same key the meal
  --            ingredients carry, which is what lets consumption be matched
  --            back to a line of the list.
  --   grams    the week's total for that ingredient, rounded up to something
  --            you can actually ask for at a counter.
  --   bought   ticked by the patient in the shop, one line at a time.
  items jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (program_id, week_index)
);

create index if not exists program_shopping_user_week
  on public.program_shopping (user_id, start_date desc);

/* ── Row level security ─────────────────────────────────────────────── */
-- Same shape as the rest of the program tables (see 0027_programs): the
-- patient owns their rows, their doctor may read them, admins see all.

alter table public.program_shopping enable row level security;

drop policy if exists program_shopping_select_own on public.program_shopping;
create policy program_shopping_select_own on public.program_shopping
  for select using (auth.uid() = user_id);

drop policy if exists program_shopping_insert_own on public.program_shopping;
create policy program_shopping_insert_own on public.program_shopping
  for insert with check (auth.uid() = user_id);

drop policy if exists program_shopping_update_own on public.program_shopping;
create policy program_shopping_update_own on public.program_shopping
  for update using (auth.uid() = user_id);

drop policy if exists program_shopping_delete_own on public.program_shopping;
create policy program_shopping_delete_own on public.program_shopping
  for delete using (auth.uid() = user_id);

drop policy if exists "doctor patients select" on public.program_shopping;
create policy "doctor patients select" on public.program_shopping
  for select using (public.is_my_patient(user_id));

drop policy if exists "admin all" on public.program_shopping;
create policy "admin all" on public.program_shopping
  for all using (public.is_admin()) with check (public.is_admin());

/* ── updated_at maintenance ─────────────────────────────────────────── */

drop trigger if exists program_shopping_touch on public.program_shopping;
create trigger program_shopping_touch before update on public.program_shopping
  for each row execute function public.touch_updated_at();
