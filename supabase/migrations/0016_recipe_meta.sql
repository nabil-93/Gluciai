-- Shared cache for world-recipe AI enrichment: ONE Gemini call per dish
-- and per language ever, then every user reads the cached copy. Only the
-- world-recipes edge function (service role) reads/writes it — RLS is
-- enabled with no policies so clients cannot touch it directly.

create table if not exists public.recipe_meta (
  meal_id text not null,
  lang text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (meal_id, lang)
);

alter table public.recipe_meta enable row level security;
