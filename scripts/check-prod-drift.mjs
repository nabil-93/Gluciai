#!/usr/bin/env node
/**
 * DOES PRODUCTION STILL MATCH THIS REPOSITORY?
 *
 * WHY THIS EXISTS — the 2026-08-09 audit found migrations 0030-0033 sitting in
 * the repository, reviewed and committed, and never applied to the hosted
 * project. One of them (0033) closes an authorization hole. Nothing detected it
 * for the entire time it was open, and nothing could have:
 *
 *   · `ci-database.yml` boots a LOCAL stack and verifies migrations against it.
 *     That isolation is deliberate and correct — the workflow declares no
 *     secrets, so it has no credential that could reach a real project.
 *   · Consequently no gate in the project ever compared the repository to the
 *     hosted database. CI was green the whole time.
 *
 * So this check cannot live in that workflow, and it is not bolted onto it.
 * It is a LOCAL script, run deliberately by a human who is already linked to
 * the project, using the credentials they already have. It reads and compares;
 * it never writes, never pushes, never applies.
 *
 * USAGE
 *   node scripts/check-prod-drift.mjs
 *
 * Requires the Supabase CLI to be linked (`npx supabase link --project-ref …`).
 * Exits 0 when the repository and the hosted project agree, 1 when they do not,
 * and 2 when the comparison could not be made at all — which is NOT the same as
 * "no drift" and must never be read as a pass.
 */

import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');

/** Migration versions present in the repository, from the filenames. */
function repoVersions() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => f.split('_')[0])
    .sort();
}

/**
 * Migration versions the hosted project reports as applied.
 *
 * `migration list` prints a three-column table (Local | Remote | Time). We read
 * the REMOTE column only — the local column just restates the filenames we
 * already have, and conflating them is how a drift check accidentally compares
 * the repository to itself and always passes.
 */
function remoteVersions() {
  // `shell: true` is required on Windows, where `npx` is `npx.cmd` and a bare
  // execFileSync('npx', …) fails with ENOENT. Without it this check reported
  // "could not compare" on the exact platform the project is developed on.
  const out = execFileSync(
    'npx --yes supabase@2.110.0 migration list --linked',
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: true }
  );

  // The CLI emits EITHER a one-line JSON payload or a pretty table, depending
  // on version and on whether stdout is a TTY. `--output json` is not accepted
  // by `migration list` in 2.110, so both shapes are handled rather than
  // depending on which one happens to appear.
  //
  // In both cases only the REMOTE column is read. The local column just
  // restates the filenames we already have, and conflating the two is how a
  // drift check accidentally compares the repository to itself and always
  // passes.
  const jsonLine = out
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('{') && l.includes('"migrations"'))
    .pop();

  if (jsonLine) {
    return JSON.parse(jsonLine)
      .migrations.map((m) => String(m.remote ?? '').trim())
      .filter((v) => /^\d+$/.test(v))
      .sort();
  }

  //   Local  | Remote | Time (UTC)
  //   0029   | 0029   | …
  const rows = out
    .split('\n')
    .map((l) => l.split('|').map((c) => c.trim()))
    .filter((c) => c.length >= 2 && /^\d+$/.test(c[1]))
    .map((c) => c[1]);

  if (rows.length === 0) {
    throw new Error('could not parse `supabase migration list` output');
  }
  return rows.sort();
}

function main() {
  const repo = repoVersions();

  let remote;
  try {
    remote = remoteVersions();
  } catch (e) {
    console.error('✗ Could not read the hosted migration list.');
    console.error('  This is NOT a pass — the comparison did not happen.');
    console.error(`  ${String(e.message ?? e).split('\n')[0]}`);
    console.error('  Is the CLI linked?  npx supabase link --project-ref <ref>');
    process.exit(2);
  }

  const remoteSet = new Set(remote);
  const repoSet = new Set(repo);

  const unapplied = repo.filter((v) => !remoteSet.has(v));
  const unknown = remote.filter((v) => !repoSet.has(v));

  console.log(`repository : ${repo.length} migrations`);
  console.log(`production : ${remote.length} migrations`);

  if (unapplied.length === 0 && unknown.length === 0) {
    console.log('\n✓ No drift — every repository migration is applied, and');
    console.log('  production carries nothing the repository does not describe.');
    process.exit(0);
  }

  if (unapplied.length > 0) {
    console.error(`\n✗ ${unapplied.length} migration(s) in the repository are NOT applied:`);
    for (const v of unapplied) {
      const file = readdirSync(MIGRATIONS_DIR).find((f) => f.startsWith(`${v}_`));
      console.error(`    ${v}  ${file ?? ''}`);
    }
    console.error('\n  Review the SQL, then:  npx supabase db push');
  }

  if (unknown.length > 0) {
    console.error(`\n✗ ${unknown.length} migration(s) applied in production are NOT in the repository:`);
    for (const v of unknown) console.error(`    ${v}`);
    console.error('\n  Production carries schema this repository cannot reproduce.');
  }

  process.exit(1);
}

main();
