-- Shared barcode catalogue -------------------------------------------------
--
-- The scanner reads a barcode and asks Open Food Facts, USDA and friends for
-- the product. Those calls fail often enough to matter: the product may be
-- missing from every one of them (very common for Moroccan retail), the phone
-- may be on a bad connection, or the APIs may be rate-limiting.
--
-- This table is the app's own catalogue in front of them. Every product any
-- patient successfully resolves is written here, so the SECOND person to scan
-- that item gets it instantly and offline-tolerantly — and patients can add a
-- product no public database has, straight off the packaging label.
--
-- It is deliberately world-wide, not per country: a Moroccan patient buys
-- imported German and French products, and vice versa.

create table if not exists public.product_catalog (
  -- EAN-13 / UPC-A / EAN-8, digits only. The barcode IS the identity.
  barcode text primary key check (barcode ~ '^[0-9]{6,14}$'),
  name text not null check (length(trim(name)) > 0),
  brand text,
  image_url text,

  -- Everything per 100 g, matching the rest of the nutrition engine. NULL
  -- means "not declared" — which is NOT the same as 0 (bottled water really
  -- does have 0 kcal), so the columns stay nullable on purpose.
  calories numeric check (calories is null or calories >= 0),
  carbs numeric check (carbs is null or carbs >= 0),
  sugar numeric check (sugar is null or sugar >= 0),
  protein numeric check (protein is null or protein >= 0),
  fat numeric check (fat is null or fat >= 0),
  fiber numeric check (fiber is null or fiber >= 0),
  sodium numeric check (sodium is null or sodium >= 0),

  serving_grams numeric check (serving_grams is null or serving_grams > 0),
  glycemic_index numeric check (glycemic_index is null or glycemic_index between 0 and 200),

  -- 'openfoodfacts' | 'usda' | 'upcitemdb' | 'user' | 'label-photo'
  source text not null default 'user',
  -- Who first contributed it. Kept for moderation, never shown to others.
  contributed_by uuid references auth.users(id) on delete set null,
  -- How many patients have scanned it — a cheap confidence signal, and what
  -- the dashboard sorts by when reviewing user-entered products.
  scan_count integer not null default 1 check (scan_count >= 0),
  verified boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Name search, for "I know the product but the barcode is damaged".
create index if not exists product_catalog_name_idx
  on public.product_catalog using gin (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(brand, '')));
create index if not exists product_catalog_scan_count_idx
  on public.product_catalog (scan_count desc);

alter table public.product_catalog enable row level security;

-- The catalogue is a public good: any signed-in patient may read all of it
-- and add to it. It holds no personal data — only what is printed on a
-- package — so there is nothing here to scope per user.
drop policy if exists "product_catalog_read" on public.product_catalog;
create policy "product_catalog_read"
  on public.product_catalog for select
  to authenticated
  using (true);

drop policy if exists "product_catalog_insert" on public.product_catalog;
create policy "product_catalog_insert"
  on public.product_catalog for insert
  to authenticated
  with check (contributed_by is null or contributed_by = auth.uid());

-- Updates are allowed so a scan can bump the counter and so a later, richer
-- source can fill gaps — but a row that an admin has VERIFIED is frozen, and
-- nobody can rewrite the barcode a row is filed under.
drop policy if exists "product_catalog_update" on public.product_catalog;
create policy "product_catalog_update"
  on public.product_catalog for update
  to authenticated
  using (not verified)
  with check (not verified);

-- Bump-or-insert in one round trip. Fills empty columns from the new reading
-- without letting a sparse source blank out values that are already known.
create or replace function public.upsert_product(
  p_barcode text,
  p_name text,
  p_brand text default null,
  p_image_url text default null,
  p_calories numeric default null,
  p_carbs numeric default null,
  p_sugar numeric default null,
  p_protein numeric default null,
  p_fat numeric default null,
  p_fiber numeric default null,
  p_sodium numeric default null,
  p_serving_grams numeric default null,
  p_source text default 'user'
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.product_catalog as pc (
    barcode, name, brand, image_url,
    calories, carbs, sugar, protein, fat, fiber, sodium,
    serving_grams, source, contributed_by
  ) values (
    p_barcode, p_name, p_brand, p_image_url,
    p_calories, p_carbs, p_sugar, p_protein, p_fat, p_fiber, p_sodium,
    p_serving_grams, p_source, auth.uid()
  )
  on conflict (barcode) do update set
    -- A user reading the physical label beats a stale remote entry; anything
    -- else only fills what is still missing.
    name = case when p_source = 'user' or pc.name is null then excluded.name else pc.name end,
    brand = coalesce(pc.brand, excluded.brand),
    image_url = coalesce(pc.image_url, excluded.image_url),
    calories = case when p_source = 'user' then excluded.calories else coalesce(pc.calories, excluded.calories) end,
    carbs = case when p_source = 'user' then excluded.carbs else coalesce(pc.carbs, excluded.carbs) end,
    sugar = case when p_source = 'user' then excluded.sugar else coalesce(pc.sugar, excluded.sugar) end,
    protein = case when p_source = 'user' then excluded.protein else coalesce(pc.protein, excluded.protein) end,
    fat = case when p_source = 'user' then excluded.fat else coalesce(pc.fat, excluded.fat) end,
    fiber = case when p_source = 'user' then excluded.fiber else coalesce(pc.fiber, excluded.fiber) end,
    sodium = case when p_source = 'user' then excluded.sodium else coalesce(pc.sodium, excluded.sodium) end,
    serving_grams = coalesce(pc.serving_grams, excluded.serving_grams),
    scan_count = pc.scan_count + 1,
    updated_at = now()
  where not pc.verified;
end;
$$;

grant execute on function public.upsert_product to authenticated;
