-- S-01 (store audit 2026-10-04) — the barcode catalogue could be poisoned
-- without an account, and its trust label was whatever the caller claimed.
--
-- WHAT WAS WRONG
-- --------------
-- 1. `upsert_product` is SECURITY DEFINER and EXECUTE was still granted to
--    `anon` (the Supabase default for new functions — 0033 granted it to
--    `authenticated` but never revoked the default). Anyone holding the public
--    anon key could create catalogue rows.
-- 2. The caller picks `p_source`. A NEW barcode inserted as 'openfoodfacts' was
--    read back by the client as an authoritative upstream row
--    (`isCatalogRowTrusted`), i.e. its carbohydrate seeded an insulin dose.
-- 3. A direct INSERT by any signed-in user could set `verified = true`: the
--    insert policy only checks `contributed_by`, and nothing guarded the column.
--
-- WHAT THIS DOES
-- --------------
--   · revokes the anon grant on `upsert_product` (signed-in patients keep it);
--   · makes `verified` server-owned: on any write that does not come from the
--     service role or an admin, a new row is unverified and an update cannot
--     change the flag;
--   · the client now trusts ONLY `verified` rows (src/services/nutrition/
--     providers/productCatalog.ts) — `source` stays a provenance label, never a
--     reason to dose. Unverified rows fall through to the live Open Food Facts /
--     USDA lookup on the device, exactly as patient contributions already did.
--
-- Also closes four anon EXECUTE grants the advisor reports on functions that
-- only make sense for a signed-in caller (they already return nothing for
-- anon, so no behaviour changes).
--
-- Measured before writing: product_catalog holds 1 row (source openfoodfacts,
-- unverified, attributed) — nothing to clean up.

/* ── 1. No anonymous catalogue writes ───────────────────────────────────── */
revoke execute on function public.upsert_product(
  text, text, text, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text
) from public, anon;
grant execute on function public.upsert_product(
  text, text, text, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text
) to authenticated;

/* ── 2. `verified` belongs to the server ────────────────────────────────── */
create or replace function public.product_catalog_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text := coalesce(auth.jwt() ->> 'role', '');
begin
  -- No JWT at all = a migration or the SQL editor; service_role = the edge
  -- functions and admin scripts; an admin may verify rows from the dashboard.
  if jwt_role in ('', 'service_role') or public.is_admin() then
    return new;
  end if;

  -- Attribution is already policed by RLS (insert: null or yourself; update:
  -- your own rows only). What nothing policed was the trust flag.
  if tg_op = 'INSERT' then
    new.verified := false;
  else
    new.verified := old.verified;
  end if;
  return new;
end;
$$;

revoke execute on function public.product_catalog_guard() from public, anon, authenticated;

drop trigger if exists product_catalog_guard_tg on public.product_catalog;
create trigger product_catalog_guard_tg
  before insert or update on public.product_catalog
  for each row execute function public.product_catalog_guard();

/* ── 3. Signed-in-only helpers lose their anon grant ────────────────────── */
revoke execute on function public.my_usage_status()      from public, anon;
revoke execute on function public.usage_status(uuid)     from public, anon;
revoke execute on function public.touch_last_seen()      from public, anon;
grant  execute on function public.my_usage_status()      to authenticated;
grant  execute on function public.usage_status(uuid)     to authenticated;
grant  execute on function public.touch_last_seen()      to authenticated;

/* ── 4. Per-user buckets accept images only, at a sane size ─────────────── */
-- They were created with no limit and no type restriction, so a public bucket
-- could host any file of any size. The app only ever uploads JPEG.
update storage.buckets
   set file_size_limit = 10485760, -- 10 MiB
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
 where id in ('meal-images', 'profile-images');
