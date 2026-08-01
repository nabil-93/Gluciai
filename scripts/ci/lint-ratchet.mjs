#!/usr/bin/env node
/**
 * Lint ratchet.
 *
 * The project is not lint-clean: five errors and two warnings pre-date this
 * pipeline, and each needs its own authorized fix (see docs/LINT-BASELINE.md).
 * Gating on zero would make CI red from day one; ignoring lint entirely would
 * lose the signal. So the baseline records every known finding by
 * FILE + LINE + RULE + SEVERITY, and CI fails the moment the set grows.
 *
 * Fails on:
 *   - a new finding anywhere
 *   - a known finding appearing at a different line (it shows up as one
 *     removal plus one addition — the addition fails)
 *
 * Does NOT fail on:
 *   - a finding disappearing. That means someone fixed it; the run prints the
 *     entries to drop and exits 0. Tightening is deliberate, never automatic:
 *     `node scripts/ci/lint-ratchet.mjs --update`.
 *
 * Uses `expo lint`, not a bare `eslint .`, so the scope matches exactly what
 * `npm run lint` checks. (`eslint .` additionally walks supabase/functions,
 * which is Deno source and reports ~250 unresolvable `jsr:` imports.)
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const BASELINE = path.join('.github', 'lint-baseline.json');
const update = process.argv.includes('--update');

/** Run the project's own lint command and return eslint's JSON results. */
function collect() {
  let raw;
  try {
    // Fixed command string — nothing here is interpolated from input.
    raw = execSync('npx expo lint -- --format json', {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    // eslint exits non-zero whenever findings exist, which is the normal case
    // here — the output on stdout is still the report we want.
    raw = err.stdout ?? '';
    if (!raw) {
      console.error('lint-ratchet: lint produced no output.\n', err.stderr ?? err.message);
      process.exit(2);
    }
  }

  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end === -1) {
    console.error('lint-ratchet: could not find a JSON report in the lint output.');
    process.exit(2);
  }

  let report;
  try {
    report = JSON.parse(raw.slice(start, end + 1));
  } catch (e) {
    console.error('lint-ratchet: lint output was not valid JSON:', e.message);
    process.exit(2);
  }

  const findings = [];
  for (const file of report) {
    const rel = path.relative(process.cwd(), file.filePath).split(path.sep).join('/');
    for (const m of file.messages ?? []) {
      findings.push({
        file: rel,
        line: m.line ?? 0,
        rule: m.ruleId ?? '(fatal)',
        severity: m.severity === 2 ? 'error' : 'warning',
      });
    }
  }
  return findings;
}

const key = (f) => `${f.file}|${f.line}|${f.rule}|${f.severity}`;
const show = (f) => `  ${f.severity.padEnd(7)} ${f.file}:${f.line}  ${f.rule}`;

const current = collect().sort((a, b) => key(a).localeCompare(key(b)));

if (update) {
  const payload = {
    $comment:
      'Known lint findings, recorded deliberately. CI fails if this set GROWS. ' +
      'Regenerate only as part of an authorized change: node scripts/ci/lint-ratchet.mjs --update',
    generatedFrom: 'npm run lint (expo lint)',
    counts: {
      errors: current.filter((f) => f.severity === 'error').length,
      warnings: current.filter((f) => f.severity === 'warning').length,
    },
    findings: current,
  };
  writeFileSync(BASELINE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`lint-ratchet: baseline written to ${BASELINE}`);
  console.log(`  ${payload.counts.errors} error(s), ${payload.counts.warnings} warning(s)`);
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
} catch {
  console.error(
    `lint-ratchet: no baseline at ${BASELINE}. Create one deliberately with --update.`
  );
  process.exit(2);
}

const known = new Set((baseline.findings ?? []).map(key));
const seen = new Set(current.map(key));

const added = current.filter((f) => !known.has(key(f)));
const removed = (baseline.findings ?? []).filter((f) => !seen.has(key(f)));

console.log(
  `lint-ratchet: ${current.length} finding(s) now, ${(baseline.findings ?? []).length} in baseline.`
);

if (removed.length) {
  console.log(`\n${removed.length} baseline finding(s) no longer reported — nice:`);
  for (const f of removed) console.log(show(f));
  console.log('\nTighten the baseline as part of that fix:');
  console.log('  node scripts/ci/lint-ratchet.mjs --update');
}

if (added.length) {
  console.error(`\nFAIL — ${added.length} lint finding(s) not in the baseline:`);
  for (const f of added) console.error(show(f));
  console.error(
    '\nFix them, or — if the change is intended — update the baseline deliberately:\n' +
      '  node scripts/ci/lint-ratchet.mjs --update\n' +
      'A known finding that MOVED lines shows up here too; that is intentional.'
  );
  process.exit(1);
}

console.log('\nOK — no new lint findings.');
