import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * F-1 — NO API KEY MAY SHIP INSIDE THE APP.
 * F-2 — OPEN FOOD FACTS TRAFFIC MUST IDENTIFY ITSELF.
 *
 * F-1. `usda.ts` and `barcodeLookup.ts` both read
 * `process.env.EXPO_PUBLIC_USDA_API_KEY || 'DEMO_KEY'` and called FDC straight
 * from the device. `EXPO_PUBLIC_*` is INLINED INTO THE BUNDLE at build time,
 * so the key was extractable from any distributed APK — and the `DEMO_KEY`
 * fallback capped a misconfigured build at 30 requests/hour and 50/day, which
 * the never-throw provider chain hid as "USDA rarely matches".
 *
 * F-2. Open Food Facts documents a custom User-Agent as mandatory and blocks
 * unidentified traffic. The `food-search` Edge Function always sent one; the
 * device-side calls sent none.
 *
 * These fixtures are the guard that neither returns. They are source
 * assertions because the modules import React Native, which the node runner
 * cannot parse — the convention this suite already uses.
 */
const src = (rel: string): string =>
  readFileSync(path.resolve(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');

/** Every file that ships inside the mobile bundle. */
const CLIENT_FILES = [
  'src/services/nutrition/providers/usda.ts',
  'src/services/nutrition/providers/barcodeLookup.ts',
  'src/services/nutrition/providers/remote.ts',
  'src/services/nutrition/providers/openfoodfacts.ts',
  'src/services/nutrition/providers/nutriments.ts',
  'src/services/nutrition/providers/productCatalog.ts',
  'src/services/nutrition/providers/moroccan.ts',
  'src/services/nutrition/engine.ts',
];

describe('F-1 — the USDA key is gone from everything the client ships', () => {
  it('THE FIX: no client file names the public USDA env var', () => {
    for (const f of CLIENT_FILES) {
      const code = src(f)
        // The comments explain the defect and name the variable on purpose.
        .replace(/\/\/[^\n]*/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');
      expect(code, `${f} still reads the key`).not.toContain(
        'EXPO_PUBLIC_USDA_API_KEY'
      );
    }
  });

  it('no client file falls back to DEMO_KEY', () => {
    for (const f of CLIENT_FILES) {
      const code = src(f)
        .replace(/\/\/[^\n]*/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');
      expect(code, `${f} still uses DEMO_KEY`).not.toContain('DEMO_KEY');
    }
  });

  it('no client file builds an api_key query parameter', () => {
    for (const f of CLIENT_FILES) {
      const code = src(f)
        .replace(/\/\/[^\n]*/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');
      expect(code, `${f} still sends api_key`).not.toContain('api_key=');
    }
  });

  it('the client never calls FDC directly any more', () => {
    for (const f of CLIENT_FILES) {
      const code = src(f)
        .replace(/\/\/[^\n]*/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');
      expect(code, `${f} still reaches api.nal.usda.gov`).not.toContain(
        'api.nal.usda.gov'
      );
    }
  });

  it('USDA is reached through the same proxy as the other keyed providers', () => {
    const remote = src('src/services/nutrition/providers/remote.ts');
    expect(remote).toContain("supabase.functions.invoke(\n          'nutrition-search'");
    expect(remote).toContain('usdaRemoteProvider');
    expect(remote).toContain('usdaGtinProvider');
    // usda.ts is now a thin re-export, not a caller.
    expect(src('src/services/nutrition/providers/usda.ts')).toContain(
      'export const usdaProvider = usdaRemoteProvider'
    );
  });

  it('the key lives only in the Edge Function, read from secrets', () => {
    const fn = src('supabase/functions/nutrition-search/index.ts');
    expect(fn).toContain("Deno.env.get('USDA_API_KEY')");
    // No silent degradation: a missing secret yields null and the chain falls
    // through, rather than quietly running on a 50/day demo quota. Comments
    // stripped — the header explains why that fallback is absent by naming it.
    const code = fn
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toContain('DEMO_KEY');
  });

  it('the setup template no longer tells anyone to set it as EXPO_PUBLIC_*', () => {
    /*
     * `.env.example` is what the next developer copies. While it listed
     * `EXPO_PUBLIC_USDA_API_KEY=`, the fix survived only until someone
     * followed the instructions — the key would be back in the bundle with
     * no code change to notice.
     */
    const env = src('.env.example');
    const active = env
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('#'))
      .join('\n');
    expect(active).not.toContain('EXPO_PUBLIC_USDA_API_KEY');
    // The template must point at the server-side secret instead.
    expect(env).toContain('supabase secrets set USDA_API_KEY');
  });

  it('no OTHER secret was introduced into the client', () => {
    // EXPO_PUBLIC_* is not a secret mechanism. Only the two published
    // Supabase values legitimately live there.
    const allowed = new Set([
      'EXPO_PUBLIC_SUPABASE_URL',
      'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    ]);
    for (const f of CLIENT_FILES) {
      // Comments stripped: the fix is documented by naming the variable that
      // used to be read here, and the explanation is not a usage.
      const code = src(f)
        .replace(/\/\/[^\n]*/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');
      const found = code.match(/EXPO_PUBLIC_[A-Z0-9_]+/g) ?? [];
      for (const v of found) {
        expect(allowed.has(v), `${f} introduces ${v}`).toBe(true);
      }
    }
  });
});

describe('F-1 — the proxy preserves what the direct call guaranteed', () => {
  const fn = () => src('supabase/functions/nutrition-search/index.ts');

  it('an absent FDC nutrient stays null, never 0', () => {
    // This is the clinically load-bearing part: a published 0 is a
    // measurement, an absent row is silence, and collapsing them would hand
    // the patient a measured "0 g of carbohydrate" that can reach a dose.
    const s = fn();
    expect(s).toContain('function fdcPick');
    expect(s).toContain('return null;');
    expect(s).toContain('carbs: fdcPick(nutrients, FDC_NUTRIENTS.carbs)');
  });

  it('the exact-GTIN rule moved with the request', () => {
    const s = fn();
    // FDC's /foods/search is a TEXT search: without this, a code it does not
    // hold returns an unrelated product's nutrition for the scanned barcode.
    expect(s).toContain('gtinUpc');
    expect(s).toContain("strip(String(f.gtinUpc ?? '')) === strip(barcode)");
  });

  it('both USDA entry points still report `usda` provenance', () => {
    const remote = src('src/services/nutrition/providers/remote.ts');
    // A second provenance value would change what SOURCE_LABEL, the report and
    // the doctor panel read for the same database.
    const usdaBlock = remote.slice(remote.indexOf('usdaRemoteProvider'));
    expect(usdaBlock).toContain("'usda'");
    expect(usdaBlock).toContain("'usda_gtin'");
  });

  it('the engine still lists USDA where it always did', () => {
    // Precedence is not part of this change.
    expect(src('src/services/nutrition/engine.ts')).toContain('usdaProvider');
  });
});

describe('F-2 — device-side Open Food Facts calls identify themselves', () => {
  it('THE FIX: a shared User-Agent constant exists in the documented format', () => {
    const ua = src('src/services/nutrition/providers/userAgent.ts');
    expect(ua).toContain('OFF_USER_AGENT');
    expect(ua).toContain('GluciAI/');
    // `AppName/Version (contact)` — what OFF's API documentation requires.
    expect(ua).toMatch(/GluciAI\/\$\{APP_VERSION\} \(.*contact:.*\)/);
  });

  it('the barcode path sends it', () => {
    const s = src('src/services/nutrition/providers/barcodeLookup.ts');
    expect(s).toContain("import { OFF_HEADERS } from './userAgent'");
    expect(s).toContain('headers: OFF_HEADERS');
  });

  it('the product-search path sends it', () => {
    const s = src('src/services/nutrition/providers/openfoodfacts.ts');
    expect(s).toContain("import { OFF_HEADERS } from './userAgent'");
    expect(s).toContain('headers: OFF_HEADERS');
  });

  it('the device and the Edge Function present the SAME identity', () => {
    // Two identities would look like two applications to OFF and split the
    // attribution their terms require.
    const ua = src('src/services/nutrition/providers/userAgent.ts');
    const fn = src('supabase/functions/food-search/index.ts');
    const contact = 'support@gluciai.app';
    expect(ua).toContain(contact);
    expect(fn).toContain(contact);
  });

  it('OFF calls stay on the device, keeping the per-user IP', () => {
    // OFF rate-limits per IP (15/min product reads). Routing these through an
    // Edge Function would put the whole user base behind one egress IP and
    // share a single budget — the opposite of a fix.
    const s = src('src/services/nutrition/providers/barcodeLookup.ts');
    expect(s).toContain('world.openfoodfacts.org');
    expect(s).not.toContain("invoke('food-search'");
  });

  it('the timeout and never-throw contract survived the header change', () => {
    const s = src('src/services/nutrition/providers/barcodeLookup.ts');
    expect(s).toContain('new AbortController()');
    expect(s).toContain('.catch(() => null)');
    expect(s).toContain('signal: c.signal, headers: OFF_HEADERS');
  });
});
