/**
 * Generates a correct, appetizing photo for every dish MISSING from
 * healthyFoodImages.ts, using the `gen-dish-image` edge function (server-side
 * Gemini 2.5 Flash Image -> public dish-images storage bucket). Merges the
 * returned public URLs into src/data/healthyFoodImages.ts (existing Wikimedia
 * URLs are kept). Re-run to fill any that failed. Online:
 *
 *     cd glucoai && node scripts/gen-dish-images.mjs
 *     node scripts/gen-dish-images.mjs --only=id1,id2   (force specific ids)
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import ts from 'typescript';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const onlyArg = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
const ONLY = onlyArg ? new Set(onlyArg.split(',').map((s) => s.trim())) : null;

function env(key) {
  const m = fs.readFileSync(path.join(root, '.env'), 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'));
  return m ? m[1].trim() : '';
}
function loadModule(relPath) {
  const src = fs.readFileSync(path.join(root, relPath), 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
  }).outputText;
  const mod = { exports: {} };
  new Function('exports', 'module', 'require', js)(mod.exports, mod, () => ({}));
  return mod.exports;
}

const SUPABASE_URL = env('EXPO_PUBLIC_SUPABASE_URL');
// This function is admin-guarded server-side — call it with the service-role
// key (export it before running; never commit it), NOT the public anon key.
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || env('SUPABASE_SERVICE_ROLE_KEY');
if (!SERVICE) {
  console.error('✗ Missing SUPABASE_SERVICE_ROLE_KEY. Run:\n  export SUPABASE_SERVICE_ROLE_KEY=... && node scripts/gen-dish-images.mjs');
  process.exit(1);
}
const FN_URL = `${SUPABASE_URL}/functions/v1/gen-dish-image`;

const { HEALTHY_FOODS } = loadModule('src/data/healthyFoods.ts');
const imagesPath = path.join(root, 'src/data/healthyFoodImages.ts');
const images = { ...(loadModule('src/data/healthyFoodImages.ts').HEALTHY_FOOD_IMAGES ?? {}) };

const todo = HEALTHY_FOODS.filter((f) => (ONLY ? ONLY.has(f.id) : !images[f.id]));
console.log(`${HEALTHY_FOODS.length} dishes, ${Object.keys(images).length} already have a photo, ${todo.length} to generate.`);

async function genOne(f) {
  try {
    const r = await fetch(FN_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SERVICE}`, apikey: SERVICE, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: f.id, name_fr: f.name_fr, name_en: f.name_en, category: f.category }),
      signal: AbortSignal.timeout(120_000),
    });
    const d = await r.json().catch(() => ({}));
    if (d && d.ok && d.url) return { id: f.id, url: d.url };
    console.log(`  ⚠ ${f.id} — ${d?.error || 'HTTP ' + r.status}`);
    return null;
  } catch (e) {
    console.log(`  ⚠ ${f.id} — ${e}`);
    return null;
  }
}

const POOL = 4;
let done = 0;
for (let i = 0; i < todo.length; i += POOL) {
  const group = todo.slice(i, i + POOL);
  const settled = await Promise.all(group.map(genOne));
  for (const res of settled) if (res) { images[res.id] = res.url; done++; }
  console.log(`  ...${done}/${todo.length}`);
}

// Rewrite in dish order (existing + new), stable diff.
const ordered = HEALTHY_FOODS.filter((f) => images[f.id]);
const body = ordered.map((f) => `  ${JSON.stringify(f.id)}: ${JSON.stringify(images[f.id])},`).join('\n');
const file = `/**
 * Photos for the curated healthy foods. Wikimedia Commons thumbnails for the
 * common dishes; AI-generated (Gemini 2.5 Flash Image, stored in the Supabase
 * \`dish-images\` bucket) for the niche Moroccan ones. Ids missing here fall
 * back to the emoji hero. Regenerate the AI ones with
 * scripts/gen-dish-images.mjs; replace any URL by hand.
 */
export const HEALTHY_FOOD_IMAGES: Record<string, string> = {
${body}
};
`;
fs.writeFileSync(imagesPath, file, 'utf8');
console.log(`\n✅ ${done}/${todo.length} generated. ${Object.keys(images).length}/${HEALTHY_FOODS.length} dishes now have a photo.`);
