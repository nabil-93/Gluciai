-- N-12 + N-13 — the catalogue's WRITE side. One migration, because the two
-- findings are the same boundary seen from two directions and fixing either
-- alone breaks the other (established in the Step 20B audit).
--
-- N-12: `product_catalog_update` was `using (not verified) with check (not
--       verified)` — ANY authenticated patient could rewrite ANY unverified row,
--       with no ownership predicate at all.
--
-- N-13: `upsert_product` treated `p_source = 'user'` as an OVERRIDE for the name
--       and every macro (`excluded.x`), where any other source only filled gaps
--       (`coalesce(pc.x, excluded.x)`). Worse, the ON CONFLICT branch never
--       updated the `source` column, so a user-claimed overwrite left the row
--       still labelled `openfoodfacts` — and the client's read-side trust rule
--       (Step 12) therefore went on treating it as authoritative.
--
-- WHY TOGETHER: `upsert_product` was `security invoker`, so it ran under the
-- caller's RLS. Tightening N-12's policy alone would have blocked the RPC's
-- legitimate scan-count bump and gap-fill on rows contributed by OTHER patients
-- — the catalogue's entire purpose as a shared resource.
--
-- THE SHAPE, therefore:
--   1. direct table UPDATE is restricted to the caller's OWN rows;
--   2. community contribution keeps working through the RPC, which becomes
--      `security definer` so it no longer needs the caller's UPDATE privilege;
--   3. the RPC's body is narrowed so that definer privilege cannot be abused:
--      fill-gaps-only for every source, and a trust label that can only ever
--      move DOWN.
--
-- What is NOT changed: the catalogue stays a public read (`product_catalog_read`),
-- anonymous contribution stays possible, verified rows stay frozen, and nothing
-- here makes the catalogue authoritative for patient-facing nutrition — Step 12's
-- client-side demotion is untouched.

-- ── 1. N-12: direct updates only on your own contributions ────────────────
--
-- The RPC below is the supported path for touching someone else's row (bumping
-- its scan count, filling a gap it left empty). A direct UPDATE is now limited
-- to rows the caller contributed, so one patient can no longer rewrite another
-- patient's carbohydrate by hand. Anonymous rows (contributed_by null) become
-- untouchable by direct update — deliberately: nobody owns them, so nobody may
-- rewrite them outside the audited function.
drop policy if exists "product_catalog_update" on public.product_catalog;
create policy "product_catalog_update"
  on public.product_catalog for update
  to authenticated
  using (not verified and contributed_by = auth.uid())
  with check (not verified and contributed_by = auth.uid());

-- ── 2 + 3. N-13: the RPC fills gaps, and never launders provenance ────────
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
-- DEFINER so that community contribution survives the ownership rule above.
-- The body is the security boundary: it writes exactly one table, it derives
-- `contributed_by` from auth.uid() rather than from any argument, it never
-- deletes, and it can only ever fill a NULL — so the extra privilege cannot be
-- used to rewrite anything that is already known.
security definer
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
    -- FILL GAPS ONLY — for every caller, including 'user'. The override branch
    -- that N-13 describes is gone: a value another source already established
    -- can no longer be replaced through this function by anybody.
    name          = coalesce(pc.name, excluded.name),
    brand         = coalesce(pc.brand, excluded.brand),
    image_url     = coalesce(pc.image_url, excluded.image_url),
    calories      = coalesce(pc.calories, excluded.calories),
    carbs         = coalesce(pc.carbs, excluded.carbs),
    sugar         = coalesce(pc.sugar, excluded.sugar),
    protein       = coalesce(pc.protein, excluded.protein),
    fat           = coalesce(pc.fat, excluded.fat),
    fiber         = coalesce(pc.fiber, excluded.fiber),
    sodium        = coalesce(pc.sodium, excluded.sodium),
    serving_grams = coalesce(pc.serving_grams, excluded.serving_grams),
    -- THE TRUST LABEL MOVES ONE WAY ONLY.
    --
    -- If this call is a patient's own reading ('user') and it actually filled a
    -- nutrition gap, the row now contains patient-entered data and must say so —
    -- otherwise it keeps an authoritative label it no longer deserves and the
    -- client's Step 12 rule goes on dosing from it.
    --
    -- No other transition is possible: a caller claiming 'openfoodfacts' can
    -- never RAISE a row's trust, which is what stops `bumpCatalogScan` (which
    -- sends p_source='openfoodfacts' with no values) from laundering a
    -- user-contributed row into an authoritative one.
    source = case
      when p_source = 'user' and (
        (pc.calories is null and excluded.calories is not null) or
        (pc.carbs    is null and excluded.carbs    is not null) or
        (pc.sugar    is null and excluded.sugar    is not null) or
        (pc.protein  is null and excluded.protein  is not null) or
        (pc.fat      is null and excluded.fat      is not null) or
        (pc.fiber    is null and excluded.fiber    is not null) or
        (pc.sodium   is null and excluded.sodium   is not null)
      ) then 'user'
      else pc.source
    end,
    scan_count = pc.scan_count + 1,
    updated_at = now()
  where not pc.verified;
end;
$$;

-- Unchanged: the function stays callable by signed-in patients. It is the only
-- write path that may touch a row the caller does not own.
grant execute on function public.upsert_product to authenticated;

comment on function public.upsert_product is
  'N-13: fills gaps only, for every source; never overwrites an established value; downgrades source to user when a patient fills a gap, and can never upgrade trust. SECURITY DEFINER so community contribution survives the ownership rule on direct updates (N-12).';
