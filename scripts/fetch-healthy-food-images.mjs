/**
 * Fills real photos for the curated healthy dishes from Wikimedia Commons
 * (hotlinking allowed) and writes src/data/healthyFoodImages.ts. Existing
 * good URLs are kept; missing ones (new dishes) and the ones listed in
 * REFETCH (previously mismatched) are re-fetched. Dishes with no match keep
 * their emoji hero. Run online:
 *
 *     cd glucoai && node scripts/fetch-healthy-food-images.mjs
 *     node scripts/gen-healthy-foods-sql.mjs   # then re-sync the DB mirror
 *
 * Photos are "best match" from a free collaborative database — eyeball the
 * result and drop in your own URL for any dish where the match is off.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import ts from 'typescript';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function loadModule(relPath) {
  const src = fs.readFileSync(path.join(root, relPath), 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
  }).outputText;
  const mod = { exports: {} };
  new Function('exports', 'module', 'require', js)(mod.exports, mod, () => ({}));
  return mod.exports;
}

const { HEALTHY_FOODS } = loadModule('src/data/healthyFoods.ts');
let existing = {};
try {
  existing = loadModule('src/data/healthyFoodImages.ts').HEALTHY_FOOD_IMAGES ?? {};
} catch {}

// Dishes where automated Commons search matches poorly (a bird for
// "oranges cinnamon"…). Skipped so re-runs keep the emoji hero — drop in a
// hand-picked URL for these in healthyFoodImages.ts instead.
const SKIP = new Set([
  'oranges-cannelle', 'jus-tomate-maison', 'poire-pochee-cannelle',
  'salade-chou-carotte', 'pomme-cuite-cannelle',
]);

// Previously mismatched photos — force a fresh lookup for these ids.
const REFETCH = new Set([
  'pomme-beurre-cacahuete', 'oranges-cannelle', 'zitoun', 'loubia-khadra-ail',
  'eau-citron-menthe', 'poisson-four', 'salade-fruits-cannelle', 'quinoa-legumes',
  'crevettes-ail', 'smoothie-vert', 'infusion-cannelle', 'steak-haricots-verts',
]);

// Hand-tuned search terms where the dish name alone matches poorly on Commons.
const QUERY = {
  'pomme-beurre-cacahuete': 'apple peanut butter snack',
  'oranges-cannelle': 'orange slices cinnamon dessert',
  'zitoun': 'green olives bowl',
  'loubia-khadra-ail': 'sauteed green beans garlic',
  'eau-citron-menthe': 'lemon mint infused water',
  'poisson-four': 'baked fish vegetables',
  'salade-fruits-cannelle': 'fresh fruit salad',
  'quinoa-legumes': 'quinoa vegetables bowl',
  'crevettes-ail': 'garlic shrimp plate',
  'smoothie-vert': 'green smoothie glass',
  'infusion-cannelle': 'cinnamon herbal tea',
  'steak-haricots-verts': 'grilled steak green beans',
};

const clean = (s) =>
  s.replace(/\(.*?\)/g, '').replace(/[—–].*$/, '').replace(/\s+/g, ' ').trim();

async function commonsImage(term, tries = 3) {
  const api =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json' +
    '&generator=search&gsrnamespace=6&gsrlimit=10&prop=imageinfo&iiprop=url' +
    '&iiurlwidth=1280&gsrsearch=' +
    encodeURIComponent(term);
  let res;
  for (let i = 0; i < tries; i++) {
    res = await fetch(api, {
      headers: { 'User-Agent': 'GluciAI-food-images/1.0 (patient education)' },
    });
    if (res.ok) break;
    await new Promise((r) => setTimeout(r, 1000 * (i + 1))); // back off on 429
  }
  if (!res || !res.ok) return null;
  const data = await res.json();
  const pages = Object.values(data?.query?.pages ?? {});
  pages.sort((a, b) => (a.index ?? 999) - (b.index ?? 999));
  for (const p of pages) {
    const t = (p.title || '').toLowerCase();
    if (!/\.(jpg|jpeg|png)$/.test(t)) continue;
    if (/logo|icon|map|diagram|chart|flag|coat_of_arms/.test(t)) continue;
    const info = p.imageinfo?.[0];
    if (info?.thumburl) return info.thumburl;
  }
  return null;
}

const out = {};
let fetched = 0;
let kept = 0;
for (const f of HEALTHY_FOODS) {
  if (SKIP.has(f.id)) {
    if (existing[f.id]) out[f.id] = existing[f.id]; // keep a hand-picked URL if present
    continue;
  }
  if (existing[f.id] && !REFETCH.has(f.id)) {
    out[f.id] = existing[f.id];
    kept++;
    continue;
  }
  const terms = [QUERY[f.id], clean(f.name_en), clean(f.name_fr)].filter(Boolean);
  let img = null;
  for (const term of terms) {
    try {
      img = await commonsImage(term);
    } catch {
      img = null;
    }
    if (img) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  if (img) {
    out[f.id] = img;
    fetched++;
    console.log(`  🖼  ${f.id} → ${img.split('/').pop()}`);
  } else {
    console.log(`  ⚠  ${f.id} — no match (emoji fallback)`);
  }
  await new Promise((r) => setTimeout(r, 400));
}

const body = HEALTHY_FOODS.filter((f) => out[f.id])
  .map((f) => `  ${JSON.stringify(f.id)}: ${JSON.stringify(out[f.id])},`)
  .join('\n');

const file = `/**
 * Real photos for the curated healthy foods — thumbnails served by
 * Wikimedia Commons (hotlinking allowed). Best-match results generated by
 * scripts/fetch-healthy-food-images.mjs; ids missing here fall back to the
 * emoji hero. Re-run the script (online) anytime, or replace any URL by hand.
 */
export const HEALTHY_FOOD_IMAGES: Record<string, string> = {
${body}
};
`;

fs.writeFileSync(path.join(root, 'src/data/healthyFoodImages.ts'), file, 'utf8');
console.log(`\n✅ ${fetched} fetched, ${kept} kept → src/data/healthyFoodImages.ts`);
