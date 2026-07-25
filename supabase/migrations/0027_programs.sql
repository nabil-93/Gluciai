-- "Mon Programme" — the coaching parcours -----------------------------------
--
-- A month-long, fully personalised program: what to eat at every meal, what
-- to train, and a weekly weigh-in that re-plans the following week.
--
-- Two design decisions worth stating, because they are safety decisions:
--
--  1. The nutritional TARGETS are frozen onto the program row when it is
--     created (daily_kcal, carbs_g, …). They are computed by
--     `src/services/programEngine.ts` from published formulas — never by the
--     AI. Freezing them means a plan stays reproducible and auditable even
--     after the patient's weight changes, and a doctor reading the row sees
--     exactly the budget the patient was following.
--
--  2. Meals are stored with their RESOLVED macros. The AI invents the dish
--     freely (that is the whole point — a program adapted to this person,
--     not a catalogue pick), but the grams of carbohydrate come back from the
--     nutrition engine (USDA / Moroccan DB / Open Food Facts) because those
--     grams feed the INSULIN dose. An AI-estimated carb count must never
--     reach a syringe.

/* ── The program itself ─────────────────────────────────────────────── */

create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  goal text not null check (goal in ('lose', 'gain', 'stabilize', 'sport')),
  status text not null default 'active'
    check (status in ('active', 'paused', 'done', 'abandoned')),

  start_date date not null default (now() at time zone 'utc')::date,
  -- Length in weeks. Four is the default parcours; kept flexible so a
  -- "one more week" extension does not need a new table.
  weeks integer not null default 4 check (weeks between 1 and 52),

  -- Body snapshot at creation, so progress is measured against a fixed
  -- starting line rather than a profile that keeps moving.
  start_weight numeric check (start_weight is null or start_weight > 0),
  target_weight numeric check (target_weight is null or target_weight > 0),
  height_cm numeric check (height_cm is null or height_cm > 0),

  activity_level text not null default 'light'
    check (activity_level in
      ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  training_days_per_week integer not null default 3
    check (training_days_per_week between 0 and 7),
  -- Where the patient trains: shapes the workout library that is offered.
  training_place text not null default 'home'
    check (training_place in ('home', 'gym', 'outdoor', 'mixed')),

  /* ── Frozen targets from the program engine (see note 1 above) ── */
  bmr numeric,
  tdee numeric,
  daily_kcal numeric not null check (daily_kcal > 0),
  protein_g numeric not null default 0,
  fat_g numeric not null default 0,
  carbs_g numeric not null default 0,
  -- Per-meal carb budget, e.g. {"breakfast":47,"lunch":66,...}. The bolus
  -- ratios and the meal planner both read this.
  carbs_per_meal jsonb not null default '{}'::jsonb,
  rate_per_week numeric not null default 0,
  -- Engine warning codes shown to the patient (rateCapped, kcalFloored,
  -- insulinDosesWillChange…). Stored so the consent is on the record.
  warnings text[] not null default '{}',

  -- Everything the AI must respect while composing: allergies, dislikes,
  -- budget, cuisine, fasting (Ramadan), cooking time, equipment.
  constraints jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One live program at a time: a second active parcours would give the
-- patient two contradictory calorie budgets on the same day.
create unique index if not exists programs_one_active
  on public.programs (user_id) where status = 'active';
create index if not exists programs_user_created
  on public.programs (user_id, created_at desc);

/* ── The day-by-day plan ────────────────────────────────────────────── */

create table if not exists public.program_days (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  date date not null,
  day_index integer not null check (day_index >= 0),

  -- [{slot, title, emoji, ingredients:[{name, grams}], kcal, carbs, sugar,
  --   protein, fat, fiber, gi, source, recipe:[…], eaten_at, adapted}]
  -- `source` records where each number came from (usda / off / moroccan /
  --  ai_estimate) so the UI can be honest about confidence.
  meals jsonb not null default '[]'::jsonb,
  -- {title, place, blocks:[{name, sets, reps, rest_s, video_url}], est_kcal}
  workout jsonb,

  status text not null default 'planned'
    check (status in ('planned', 'partial', 'done', 'skipped')),
  -- Set when the day was re-targeted mid-course (a meal ran over, glucose
  -- was high…). The note is the human sentence shown to the patient.
  adapted_at timestamptz,
  adaptation_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (program_id, date)
);

create index if not exists program_days_user_date
  on public.program_days (user_id, date desc);

/* ── Weekly check-in ────────────────────────────────────────────────── */

create table if not exists public.program_checkins (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  week_index integer not null check (week_index >= 0),
  weight numeric check (weight is null or weight > 0),
  waist_cm numeric check (waist_cm is null or waist_cm > 0),
  -- Share of planned meals actually followed, 0…100.
  adherence_pct numeric check (adherence_pct is null or
    (adherence_pct >= 0 and adherence_pct <= 100)),
  note text,
  -- The coach's written summary of the week + what changes next week.
  ai_summary text,

  created_at timestamptz not null default now(),

  unique (program_id, week_index)
);

create index if not exists program_checkins_user
  on public.program_checkins (user_id, created_at desc);

/* ── Row level security ─────────────────────────────────────────────── */
-- Same shape as every other patient table (see 0015_lab_reports): the
-- patient owns their rows, their doctor may read them, admins see all.

alter table public.programs enable row level security;
alter table public.program_days enable row level security;
alter table public.program_checkins enable row level security;

do $$
declare
  tbl text;
begin
  foreach tbl in array array['programs', 'program_days', 'program_checkins']
  loop
    execute format(
      'drop policy if exists %I on public.%I', tbl || '_select_own', tbl);
    execute format(
      'create policy %I on public.%I for select using (auth.uid() = user_id)',
      tbl || '_select_own', tbl);

    execute format(
      'drop policy if exists %I on public.%I', tbl || '_insert_own', tbl);
    execute format(
      'create policy %I on public.%I for insert with check (auth.uid() = user_id)',
      tbl || '_insert_own', tbl);

    execute format(
      'drop policy if exists %I on public.%I', tbl || '_update_own', tbl);
    execute format(
      'create policy %I on public.%I for update using (auth.uid() = user_id)',
      tbl || '_update_own', tbl);

    execute format(
      'drop policy if exists %I on public.%I', tbl || '_delete_own', tbl);
    execute format(
      'create policy %I on public.%I for delete using (auth.uid() = user_id)',
      tbl || '_delete_own', tbl);

    -- A doctor following this patient reads the program like any other log.
    execute format(
      'drop policy if exists %I on public.%I', 'doctor patients select', tbl);
    execute format(
      'create policy %I on public.%I for select using (public.is_my_patient(user_id))',
      'doctor patients select', tbl);

    execute format('drop policy if exists %I on public.%I', 'admin all', tbl);
    execute format(
      'create policy %I on public.%I for all using (public.is_admin()) with check (public.is_admin())',
      'admin all', tbl);
  end loop;
end $$;

/* ── updated_at maintenance ─────────────────────────────────────────── */

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists programs_touch on public.programs;
create trigger programs_touch before update on public.programs
  for each row execute function public.touch_updated_at();

drop trigger if exists program_days_touch on public.program_days;
create trigger program_days_touch before update on public.program_days
  for each row execute function public.touch_updated_at();
