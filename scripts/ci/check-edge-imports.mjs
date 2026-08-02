/**
 * THE EDGE FUNCTIONS ARE TYPED BY NOTHING. THIS IS THE FLOOR UNDER THEM.
 *
 * WHY THIS EXISTS — the food scanner returned HTTP 500 on every single photo
 * for a whole release. The cause was one absent line: `analyze-meal/index.ts`
 * called `aiFetch(...)` and caught `AiUnavailableError` without ever importing
 * either from `_shared/aiFetch.ts`. The other three AI functions imported it
 * correctly; the scanner was the one that did not.
 *
 * Nothing caught it, and nothing could have:
 *   - `tsc --noEmit` never sees this directory — tsconfig.json excludes
 *     "supabase/functions", because it is Deno code with its own globals.
 *   - `supabase functions deploy` bundles with esbuild and does NOT typecheck.
 *     A free identifier is not an error to a bundler; it is assumed to be a
 *     global that will exist at runtime. So it deployed, ACTIVE and green.
 *
 * The failure only appeared when a patient photographed a meal: a
 * ReferenceError thrown before any network call, caught by the handler's outer
 * catch, returned as a 500 in ~450ms. From the outside it looked exactly like a
 * provider outage, which is what made it expensive to find.
 *
 * WHAT THIS CHECKS — for every `supabase/functions/<fn>/*.ts`: if the file
 * mentions a symbol that `_shared/*` exports, that symbol must be imported (or
 * declared locally, which legitimately shadows it). That is a narrow rule, but
 * it covers the entire class of bug above, needs no Deno toolchain, and runs in
 * milliseconds.
 *
 * WHAT IT DOES NOT CHECK — types, or free identifiers that no shared module
 * happens to export. A real `deno check` would subsume this; until the CI
 * runner has Deno, this is the floor.
 *
 * Run: npm run check:edge
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FN_DIR = 'supabase/functions';
const SHARED = join(FN_DIR, '_shared');

/** Every symbol the shared modules export → the module that exports it. */
function sharedExports() {
  const exported = new Map();
  for (const f of readdirSync(SHARED).filter((f) => f.endsWith('.ts'))) {
    const src = readFileSync(join(SHARED, f), 'utf8');
    const re =
      /^export\s+(?:async\s+)?(?:function|class|const|let|type|interface)\s+([A-Za-z0-9_$]+)/gm;
    for (const m of src.matchAll(re)) exported.set(m[1], f);
  }
  return exported;
}

/**
 * Blank out comments and string/template literals so a symbol named in prose or
 * inside a prompt is not mistaken for a use. Every replacement keeps the
 * delimiters, so offsets stay sane and the result still parses by eye.
 */
function stripCommentsAndStrings(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ')
    .replace(/`(?:\\[\s\S]|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
}

function analyse(path, exported) {
  const raw = readFileSync(path, 'utf8');
  const code = stripCommentsAndStrings(raw);

  // Names an import brings in — named, default or namespace. Read from the RAW
  // source: stripping strings empties the `from '...'` clause, and an import
  // regex anchored on it would then match nothing and report every symbol as
  // missing. (That mistake cost a round of false positives writing this.)
  const imported = new Set();
  for (const m of raw.matchAll(/import\s+([\s\S]*?)\s+from\s*['"][^'"]*['"]/g)) {
    for (const n of m[1].matchAll(/[A-Za-z0-9_$]+/g)) imported.add(n[0]);
  }

  // A local declaration of the same name legitimately shadows the shared one.
  const local = new Set();
  for (const m of code.matchAll(
    /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?(?:function|class|const|let|var|type|interface)\s+([A-Za-z0-9_$]+)/g
  ))
    local.add(m[1]);

  const problems = [];
  for (const [name, mod] of exported) {
    if (imported.has(name) || local.has(name)) continue;
    // Not preceded by a dot (a property access is not a free identifier).
    if (new RegExp(`(?<![.\\w$])${name}(?![\\w$])`).test(code)) {
      problems.push({ name, mod });
    }
  }
  return problems;
}

const exported = sharedExports();
let bad = 0;

for (const dir of readdirSync(FN_DIR).filter(
  (d) => d !== '_shared' && statSync(join(FN_DIR, d)).isDirectory()
)) {
  for (const file of readdirSync(join(FN_DIR, dir)).filter((f) => f.endsWith('.ts'))) {
    const path = join(FN_DIR, dir, file);
    for (const { name, mod } of analyse(path, exported)) {
      console.error(`MISSING IMPORT  ${path}\n                uses "${name}", exported by _shared/${mod}`);
      bad += 1;
    }
  }
}

if (bad > 0) {
  console.error(
    `\nFAIL — ${bad} symbol(s) used without an import.\n` +
      'This deploys green and throws ReferenceError on the first real request.\n' +
      'Add the import, or declare the symbol locally if the shadowing is intended.'
  );
  process.exit(1);
}

console.log(`OK — ${exported.size} shared symbols, every use imported.`);
