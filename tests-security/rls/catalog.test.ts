import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { admin, createUser, deleteUser, type TestUser } from '../_users';

/**
 * BOUNDARY — the shared product catalogue.
 *
 * `product_catalog` is deliberately a common good: every signed-in patient may
 * read all of it and contribute to it. The boundaries that DO exist are:
 *   - contributions must be attributed to the caller, not to someone else
 *   - a row an admin has VERIFIED is frozen
 *   - the barcode a row is filed under cannot be rewritten
 *
 * This table is the object of the audit's single CRITICAL (P2-003 / P6-001 /
 * P7-001): it is rank-1 unconditional in the barcode path, so whatever it says
 * becomes carbohydrate, and carbohydrate becomes an insulin dose. These tests
 * characterize the boundary as it stands; they do not fix it.
 */

let userA: TestUser;
let userB: TestUser;
const created: string[] = [];

const barcode = () => String(Math.floor(1e12 + Math.random() * 8e12));

beforeAll(async () => {
  userA = await createUser('catalog-a');
  userB = await createUser('catalog-b');
});

afterAll(async () => {
  for (const b of created) await admin.from('product_catalog').delete().eq('barcode', b);
  await deleteUser(userA.id);
  await deleteUser(userB.id);
});

describe('shared read/write by design', () => {
  it('any signed-in user may read the whole catalogue', async () => {
    const b = barcode();
    created.push(b);
    await admin.from('product_catalog').insert({ barcode: b, name: 'Shared Product', carbs: 10 });

    const { data, error } = await userB.client
      .from('product_catalog')
      .select('barcode, name')
      .eq('barcode', b);
    expect(error).toBeNull();
    expect(data).toHaveLength(1); // not scoped per user — intentional
  });

  it('a user may contribute a product attributed to themselves', async () => {
    const b = barcode();
    created.push(b);
    const { error } = await userA.client
      .from('product_catalog')
      .insert({ barcode: b, name: 'A Product', contributed_by: userA.id, carbs: 12 });
    expect(error).toBeNull();
  });

  it('a user may contribute anonymously (contributed_by null)', async () => {
    const b = barcode();
    created.push(b);
    const { error } = await userA.client
      .from('product_catalog')
      .insert({ barcode: b, name: 'Anon Product', contributed_by: null });
    expect(error).toBeNull();
  });
});

describe('attribution cannot be forged', () => {
  it('a user cannot attribute a contribution to someone else', async () => {
    const b = barcode();
    const { error } = await userA.client
      .from('product_catalog')
      .insert({ barcode: b, name: 'Forged', contributed_by: userB.id });
    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');
  });
});

describe('verified rows are frozen', () => {
  /**
   * FIXED IN STEP 20B — N-12.
   *
   * BEFORE: `product_catalog_update` was `using (not verified) with check (not
   * verified)`, so this same call succeeded and returned the rewritten row —
   * any signed-in patient could rewrite any unverified row's carbohydrate by
   * hand. It was recorded here as "shared editability, by design".
   *
   * AFTER: a direct UPDATE reaches only rows the caller contributed. Community
   * contribution to someone else's row now goes through `upsert_product`, which
   * fills gaps and cannot overwrite (see the N-13 block below).
   */
  it('a direct update cannot touch a row the caller did not contribute', async () => {
    const b = barcode();
    created.push(b);
    // contributed_by is null here: an anonymous row belongs to nobody.
    await admin.from('product_catalog').insert({ barcode: b, name: 'Editable', carbs: 5 });

    const { data, error } = await userB.client
      .from('product_catalog')
      .update({ carbs: 42 })
      .eq('barcode', b)
      .select();
    expect(error).toBeNull(); // RLS filters rather than raising
    expect(data).toEqual([]); // …and nothing was updated

    const { data: stored } = await admin
      .from('product_catalog')
      .select('carbs')
      .eq('barcode', b)
      .single();
    expect(Number(stored!.carbs)).toBe(5); // untouched
  });

  it('a contributor may still correct their OWN row directly', async () => {
    const b = barcode();
    created.push(b);
    await userA.client
      .from('product_catalog')
      .insert({ barcode: b, name: 'Mine', carbs: 5, contributed_by: userA.id });

    const { data, error } = await userA.client
      .from('product_catalog')
      .update({ carbs: 12 })
      .eq('barcode', b)
      .select();
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('another patient cannot rewrite that row either', async () => {
    const b = barcode();
    created.push(b);
    await userA.client
      .from('product_catalog')
      .insert({ barcode: b, name: 'A\'s row', carbs: 30, contributed_by: userA.id });

    const { data } = await userB.client
      .from('product_catalog')
      .update({ carbs: 1 })
      .eq('barcode', b)
      .select();
    expect(data).toEqual([]);

    const { data: stored } = await admin
      .from('product_catalog')
      .select('carbs')
      .eq('barcode', b)
      .single();
    expect(Number(stored!.carbs)).toBe(30);
  });

  it('a VERIFIED row cannot be updated', async () => {
    const b = barcode();
    created.push(b);
    await admin
      .from('product_catalog')
      .insert({ barcode: b, name: 'Verified', carbs: 20, verified: true });

    const { data, error } = await userA.client
      .from('product_catalog')
      .update({ carbs: 500 })
      .eq('barcode', b)
      .select();
    expect(error).toBeNull();
    expect(data).toEqual([]); // frozen

    const { data: stored } = await admin
      .from('product_catalog')
      .select('carbs')
      .eq('barcode', b)
      .single();
    expect(Number(stored!.carbs)).toBe(20);
  });

  it('upsert_product leaves a verified row untouched', async () => {
    const b = barcode();
    created.push(b);
    await admin
      .from('product_catalog')
      .insert({ barcode: b, name: 'Verified Upsert', carbs: 20, verified: true, scan_count: 1 });

    const { error } = await userA.client.rpc('upsert_product', {
      p_barcode: b,
      p_name: 'Overwritten',
      p_carbs: 900,
      p_source: 'user',
    });
    expect(error).toBeNull(); // succeeds, but the WHERE NOT verified guard applies

    const { data: stored } = await admin
      .from('product_catalog')
      .select('name, carbs, scan_count')
      .eq('barcode', b)
      .single();
    expect(stored!.name).toBe('Verified Upsert');
    expect(Number(stored!.carbs)).toBe(20);
    expect(stored!.scan_count).toBe(1); // counter not bumped either
  });
});

describe('KNOWN-BAD BASELINE — the catalogue is a shared, low-friction write path', () => {
  /**
   * KNOWN-BAD BASELINE — P2-003 / P6-001 / P7-001 (the audit's CRITICAL)
   *
   * Any signed-in user can write carbohydrate values into a row every other
   * patient's barcode scan will read. Nothing at the database level validates
   * plausibility or provenance.
   *
   * The 20 U clamp is not a barrier in the plausible range: 10 g vs 60 g of
   * carbohydrate is 1.0 U vs 6.0 U, both unflagged.
   *
   * STILL NOT FIXED HERE, deliberately — and the assertions below are unchanged
   * by Step 12, because Step 12 changed no policy, no RPC and no schema. The
   * WRITE remains possible exactly as recorded.
   *
   * What changed is what the client does with such a row (Step 12, source-based
   * demotion, pinned in `tests/domain/catalogTrust.golden.test.ts`): an
   * unverified patient contribution is no longer rank-1 authoritative, the
   * public providers are consulted first, and when it is used its carbohydrate
   * arrives `carbs_known: false` — visible, unedited, and not dosable until the
   * patient confirms it against the packaging. So the poisoned 60 g below can
   * still be written and still be read; it can no longer silently become an
   * insulin dose.
   *
   * Owning remediation for the write side: RU-1 (authenticated writes to
   * unverified rows, `p_source = 'user'` overwrite, admin verification
   * workflow) — see REMEDIATION-PLAN N-12, N-13, N-14.
   */
  it('a patient can write a carbohydrate value other patients will dose against', async () => {
    const b = barcode();
    created.push(b);

    const { error } = await userA.client.rpc('upsert_product', {
      p_barcode: b,
      p_name: 'Poisoned Product',
      p_carbs: 60,
      p_source: 'user',
    });
    expect(error).toBeNull();

    // A different patient reads it back as fact.
    const { data } = await userB.client
      .from('product_catalog')
      .select('name, carbs, verified')
      .eq('barcode', b)
      .single();
    expect(Number(data!.carbs)).toBe(60);
    expect(data!.verified).toBe(false); // unverified, yet fully readable and trusted
  });

  it('no plausibility bound exists on catalogue carbohydrate', async () => {
    const b = barcode();
    created.push(b);
    const { error } = await userA.client
      .from('product_catalog')
      .insert({ barcode: b, name: 'Implausible', carbs: 9999, contributed_by: userA.id });
    expect(error).toBeNull(); // only `carbs >= 0` is enforced
  });
});

describe('FIXED IN STEP 20B — N-13: the RPC fills gaps and cannot launder provenance', () => {
  /**
   * BEFORE: `upsert_product` treated `p_source = 'user'` as an OVERRIDE for the
   * name and every macro (`excluded.x`), while any other source only filled
   * gaps. And the ON CONFLICT branch never touched `source`, so a user-claimed
   * overwrite left the row still labelled `openfoodfacts` — which the client's
   * Step 12 read-side rule then went on trusting.
   *
   * AFTER: fill-gaps-only for every caller, and the trust label can only move
   * DOWN (to 'user', and only when a patient's call actually filled a gap).
   */

  it('a user-sourced call can no longer overwrite an authoritative value', async () => {
    const b = barcode();
    created.push(b);
    await admin.from('product_catalog').insert({
      barcode: b,
      name: 'Official Yoghurt',
      carbs: 12,
      calories: 90,
      source: 'openfoodfacts',
    });

    const { error } = await userA.client.rpc('upsert_product', {
      p_barcode: b,
      p_name: 'Rewritten',
      p_carbs: 60,
      p_calories: 400,
      p_source: 'user',
    });
    expect(error).toBeNull(); // the call succeeds…

    const { data } = await admin
      .from('product_catalog')
      .select('name, carbs, calories, source, scan_count')
      .eq('barcode', b)
      .single();
    expect(Number(data!.carbs)).toBe(12); // …and changed nothing
    expect(Number(data!.calories)).toBe(90);
    expect(data!.name).toBe('Official Yoghurt');
    expect(data!.source).toBe('openfoodfacts'); // no downgrade: nothing was filled
    expect(data!.scan_count).toBe(2); // …but the community counter still bumped
  });

  it('a patient filling a genuine GAP is recorded, and downgrades the trust label', async () => {
    const b = barcode();
    created.push(b);
    await admin.from('product_catalog').insert({
      barcode: b,
      name: 'Partial Entry',
      calories: 120,
      carbs: null, // the gap
      source: 'openfoodfacts',
    });

    const { error } = await userA.client.rpc('upsert_product', {
      p_barcode: b,
      p_name: 'Partial Entry',
      p_carbs: 24,
      p_source: 'user',
    });
    expect(error).toBeNull();

    const { data } = await admin
      .from('product_catalog')
      .select('carbs, calories, source')
      .eq('barcode', b)
      .single();
    expect(Number(data!.carbs)).toBe(24); // the gap is filled — contribution works
    expect(Number(data!.calories)).toBe(120); // the known value is untouched
    expect(data!.source).toBe('user'); // …and the row now says who filled it
  });

  it('a caller cannot UPGRADE a row trust label by claiming an authoritative source', async () => {
    const b = barcode();
    created.push(b);
    await userA.client.rpc('upsert_product', {
      p_barcode: b,
      p_name: 'Patient Entry',
      p_carbs: 30,
      p_source: 'user',
    });

    // `bumpCatalogScan` sends exactly this: an authoritative-sounding source
    // with no values at all.
    const { error } = await userB.client.rpc('upsert_product', {
      p_barcode: b,
      p_name: 'Patient Entry',
      p_source: 'openfoodfacts',
    });
    expect(error).toBeNull();

    const { data } = await admin
      .from('product_catalog')
      .select('source, carbs, scan_count')
      .eq('barcode', b)
      .single();
    expect(data!.source).toBe('user'); // trust cannot be laundered upward
    expect(Number(data!.carbs)).toBe(30);
    expect(data!.scan_count).toBe(2); // the scan still counted
  });

  it('the RPC still lets one patient contribute to another patient\'s row', async () => {
    // The reason N-12 and N-13 had to move together: direct updates are now
    // owner-only, so community contribution depends on this path working.
    const b = barcode();
    created.push(b);
    await userA.client.rpc('upsert_product', {
      p_barcode: b,
      p_name: 'A contributed',
      p_carbs: 10,
      p_source: 'user',
    });

    const { error } = await userB.client.rpc('upsert_product', {
      p_barcode: b,
      p_name: 'A contributed',
      p_sugar: 3, // a column A left empty
      p_source: 'user',
    });
    expect(error).toBeNull();

    const { data } = await admin
      .from('product_catalog')
      .select('carbs, sugar, scan_count')
      .eq('barcode', b)
      .single();
    expect(Number(data!.carbs)).toBe(10); // A's value stands
    expect(Number(data!.sugar)).toBe(3); // B's gap-fill landed
    expect(data!.scan_count).toBe(2);
  });

  it('a verified row is still frozen against the RPC', async () => {
    const b = barcode();
    created.push(b);
    await admin.from('product_catalog').insert({
      barcode: b,
      name: 'Verified',
      carbs: 20,
      verified: true,
      scan_count: 1,
    });

    await userA.client.rpc('upsert_product', {
      p_barcode: b,
      p_name: 'Nope',
      p_carbs: 900,
      p_source: 'user',
    });

    const { data } = await admin
      .from('product_catalog')
      .select('name, carbs, scan_count')
      .eq('barcode', b)
      .single();
    expect(data!.name).toBe('Verified');
    expect(Number(data!.carbs)).toBe(20);
    expect(data!.scan_count).toBe(1);
  });
});
