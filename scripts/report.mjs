#!/usr/bin/env node
// Phase 6. Turn a finished Playwright run into something a tester and their
// client can read, then archive it under a timestamp.
//
// Reads  outcome/.current/results.json
// Writes outcome/<timestamp>/{SUMMARY.md,coverage.md,needs-human.md} and
//        repoints outcome/latest
//
//   node scripts/report.mjs [--project <dir>] [--features <json>] [--fixes <json>] [--json]
//
// --features  output of parse-features.mjs --out (gives coverage + blocked scenarios)
// --fixes     JSON array the agent writes during Phase 5:
//             [{ scenario, attempt, change, result, gaveUp?, suspectedAppBug? }]

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, bold, dim, green, yellow, red, cyan } from './lib/out.mjs';
import { resolveRoot, findConfigFile, loadConfigFile, validateConfig } from './lib/config.mjs';

const stripAnsi = (s) => String(s ?? '').replace(/\u001b\[[0-9;]*m/g, '');

// Never quote a session token or api key out of an error message into a report.
function redact(text) {
  return stripAnsi(text)
    .replace(/([?&](?:token|access_token|session|sid|key|api_key|auth|password)=)[^&\s"']+/gi, '$1[redacted]')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]{8,}/gi, '$1[redacted]');
}

function flattenSpecs(suites, acc = [], file = null) {
  for (const suite of suites ?? []) {
    const currentFile = suite.file ?? file;
    for (const spec of suite.specs ?? []) {
      acc.push({ ...spec, file: currentFile ?? spec.file });
    }
    flattenSpecs(suite.suites, acc, currentFile);
  }
  return acc;
}

/** Turn a Playwright error into one sentence a non-programmer can act on. */
function explain(errorText) {
  const text = redact(errorText);
  const locator = (text.match(/Locator:\s*(.+)/) ?? [])[1]?.trim();

  const expected = (text.match(/Expected string:\s*"([^"]*)"/) ?? text.match(/Expected pattern:\s*(.+)/) ?? [])[1];
  const received = (text.match(/Received string:\s*"([^"]*)"/) ?? [])[1];

  if (/element\(s\) not found/.test(text)) {
    return {
      plain: `Could not find ${locator ? `\`${locator}\`` : 'the expected element'} on the page.`,
      hint: 'Either the session expired and the browser is on the login page, or the locator is wrong. Check the URL in the trace FIRST (references/07-self-healing.md).',
    };
  }
  if (expected !== undefined && received !== undefined) {
    return {
      plain: `Expected \`${expected}\` but the page showed \`${received}\`.`,
      hint: 'If the locator is correct, this is probably an application bug, not a test problem.',
    };
  }
  if (/resolved to \d+ elements/.test(text)) {
    const n = (text.match(/resolved to (\d+) elements/) ?? [])[1];
    return {
      plain: `${locator ? `\`${locator}\`` : 'The locator'} matched ${n} elements, so Playwright refused to act.`,
      hint: 'Scope the locator to a container. Never add .first() — it may act on the wrong element.',
    };
  }
  if (/not visible/.test(text)) {
    return { plain: `${locator ? `\`${locator}\`` : 'The element'} exists but is not visible.`, hint: 'Assert whatever reveals it, then act on it.' };
  }
  if (/not enabled/.test(text)) {
    return { plain: `${locator ? `\`${locator}\`` : 'The element'} is disabled.`, hint: 'Assert the precondition that enables it.' };
  }
  if (/net::ERR|ECONNREFUSED|Timeout.*exceeded.*navigating|page\.goto/.test(text)) {
    return { plain: 'The page did not load.', hint: 'The environment may be down, the URL wrong, or a VPN needed. This is not a test problem.' };
  }
  if (/Test timeout of \d+ms exceeded/.test(text)) {
    return { plain: 'The test ran out of time.', hint: 'Usually a step waiting for something that never appeared — read the call log in the trace.' };
  }
  const firstLine = text.split('\n').map((l) => l.trim()).find((l) => l.length > 0 && !l.startsWith('at '));
  return { plain: firstLine ?? 'The test failed.', hint: null };
}

function timestampFrom(iso) {
  const d = iso ? new Date(iso) : new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

function humanDuration(ms) {
  const s = Math.round((ms ?? 0) / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

function humanDate(iso) {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function readJsonMaybe(file) {
  if (!file || !fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

async function main() {
  const { flags } = parseArgs();
  const root = resolveRoot(flags);

  const configFile = findConfigFile(root);
  if (!configFile) throw new Error('No qa.config.yaml found. Run: node scripts/preflight.mjs');
  const { data } = await loadConfigFile(configFile);
  const { config } = validateConfig(data);

  const outputDir = path.join(root, config.report.outputDir);
  const currentDir = path.join(outputDir, '.current');
  const resultsFile = path.join(currentDir, 'results.json');
  if (!fs.existsSync(resultsFile)) {
    throw new Error(`No run to report on (${path.relative(root, resultsFile)} is missing). Run the tests first.`);
  }

  const results = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
  const specs = flattenSpecs(results.suites);

  // The setup project is plumbing, not a test the tester cares about.
  const isSetup = (spec) => spec.tests?.every((t) => t.projectName === 'setup');
  const testSpecs = specs.filter((s) => !isSetup(s));
  const setupSpecs = specs.filter(isSetup);

  const rows = [];
  for (const spec of testSpecs) {
    for (const test of spec.tests ?? []) {
      const last = test.results?.[test.results.length - 1] ?? {};
      const errorText = [last.error?.message, ...(last.errors ?? []).map((e) => e.message)].filter(Boolean).join('\n');
      rows.push({
        title: spec.title,
        file: spec.file,
        line: spec.line ?? null,
        project: test.projectName,
        tags: spec.tags ?? [],
        role: (spec.tags ?? []).find((t) => t.startsWith('role:'))?.slice(5) ?? null,
        status: test.status,              // expected | unexpected | skipped | flaky
        attempts: test.results?.length ?? 0,
        duration: last.duration ?? 0,
        error: errorText || null,
        explanation: errorText ? explain(errorText) : null,
        attachments: (last.attachments ?? []).map((a) => ({
          name: a.name,
          path: a.path ? path.relative(currentDir, a.path) : null,
        })),
      });
    }
  }

  const passed = rows.filter((r) => r.status === 'expected');
  const failed = rows.filter((r) => r.status === 'unexpected');
  const flaky = rows.filter((r) => r.status === 'flaky');
  const skipped = rows.filter((r) => r.status === 'skipped');

  const features = readJsonMaybe(flags.features ? path.resolve(root, String(flags.features)) : path.join(currentDir, 'features.json'));
  const fixes = readJsonMaybe(flags.fixes ? path.resolve(root, String(flags.fixes)) : null) ?? [];

  const envDown = rows.length > 0 && failed.length === rows.length &&
    failed.every((r) => /did not load|environment may be down/.test(r.explanation?.hint ?? ''));

  // ----------------------------------------------------------------- SUMMARY
  const blocked = (features?.scenarios ?? []).filter((s) => s.status === 'needs-human');
  const lines = [];
  lines.push(`# Test run — ${humanDate(results.stats?.startTime)}`, '');
  lines.push(`**Application** ${config.app.name} · ${config.app.environment} · ${config.run.browsers.join(', ')} · ${config.run.workers} workers`);
  lines.push(`**Mode** ${config.mode}`);
  lines.push(`**Duration** ${humanDuration(results.stats?.duration)}`, '');

  if (envDown) {
    lines.push('> **Every test failed because the page did not load.** This looks like an environment problem, not a test problem. Check that the application is up and the URL is correct before reading further.', '');
  }

  lines.push('## Result', '', '| | Count |', '| --- | --- |');
  lines.push(`| Passed | ${passed.length} |`);
  lines.push(`| Failed | ${failed.length} |`);
  if (flaky.length) lines.push(`| Flaky (passed on retry) | ${flaky.length} |`);
  lines.push(`| Skipped | ${skipped.length} |`);
  if (blocked.length) lines.push(`| Not generated (needs a human) | ${blocked.length} |`);
  lines.push('');

  if (setupSpecs.length) {
    const reused = setupSpecs.filter((s) => s.tests?.[0]?.status === 'skipped').length;
    lines.push(`_Login: ${setupSpecs.length - reused} performed, ${reused} reused from a saved session._`, '');
  }

  if (failed.length) {
    lines.push('## Failures', '');
    failed.forEach((r, i) => {
      lines.push(`### ${i + 1}. ${r.title}${r.role ? ` _(as ${r.role})_` : ''}`, '');
      lines.push(`${r.explanation.plain}`, '');
      if (r.explanation.hint) lines.push(`**What to check** ${r.explanation.hint}`, '');
      lines.push(`**Where** \`${r.file}\`${r.line ? `:${r.line}` : ''} · project \`${r.project}\` · ${r.attempts} attempt(s)`);
      const useful = r.attachments.filter((a) => a.path && ['trace', 'screenshot', 'video'].includes(a.name));
      if (useful.length) lines.push(`**Evidence** ${useful.map((a) => `${a.name}: \`${a.path}\``).join(' · ')}`);
      lines.push('');
    });
    lines.push('> A trace contains the live session cookie. Fine for a private ticket; never attach one to a public issue tracker.', '');
  }

  if (flaky.length) {
    lines.push('## Flaky', '');
    lines.push('These failed and then passed on retry. Treat them as unreliable, not as passes.', '');
    for (const r of flaky) lines.push(`- ${r.title} _(${r.project})_`);
    lines.push('');
  }

  if (fixes.length) {
    lines.push('## Auto-fixes applied', '', '| Scenario | Attempt | Change | Result |', '| --- | --- | --- | --- |');
    for (const f of fixes) {
      lines.push(`| ${f.scenario ?? ''} | ${f.attempt ?? ''} | ${f.change ?? ''} | ${f.result ?? ''} |`);
    }
    lines.push('');
    const gaveUp = fixes.filter((f) => f.gaveUp);
    if (gaveUp.length) lines.push(`${gaveUp.length} scenario(s) hit the ${config.agent.maxAutoFixAttempts}-attempt limit. See \`needs-human.md\`.`, '');
  } else if (failed.length) {
    lines.push('## Auto-fixes applied', '', '_None recorded._', '');
  }

  if (blocked.length) {
    lines.push('## Needs a human', '', `${blocked.length} scenario(s) were not generated. See \`needs-human.md\`.`, '');
  }

  lines.push('---', '', '_Artifacts in this folder can contain session data. `outcome/` is git-ignored for that reason._', '');
  const summary = lines.join('\n');

  // ---------------------------------------------------------------- coverage
  const cov = ['# Coverage', ''];
  if (!features) {
    cov.push('_No parsed feature data. Run:_', '', '```', 'node scripts/parse-features.mjs --out outcome/.current/features.json', '```', '');
  } else {
    cov.push('Every scenario in `features/`, and what became of it.', '');
    cov.push('| Module | Scenario | Test | Status |', '| --- | --- | --- | --- |');
    for (const sc of features.scenarios ?? []) {
      const match = rows.find((r) => r.title === sc.name || sc.name.startsWith(r.title));
      const where = match ? `\`${match.file}${match.line ? `:${match.line}` : ''}\`` : '—';
      const status = sc.status === 'needs-human' ? 'needs human'
        : sc.status === 'skipped-by-tag' ? 'skipped by tag'
        : match ? ({ expected: 'passed', unexpected: 'failed', flaky: 'flaky', skipped: 'skipped' }[match.status] ?? match.status)
        : 'not generated';
      cov.push(`| ${sc.module} | ${sc.name} | ${where} | ${status} |`);
    }
    cov.push('');
    const orphans = (features.scenarios ?? []).filter(
      (sc) => sc.status === 'ready' && !rows.some((r) => r.title === sc.name || sc.name.startsWith(r.title)),
    );
    if (orphans.length) {
      cov.push('## Ready but never generated', '', 'These are a gap — they were automatable and nothing was produced.', '');
      for (const sc of orphans) cov.push(`- \`${sc.file}:${sc.line}\` ${sc.name}`);
      cov.push('');
    }
  }

  // ------------------------------------------------------------- needs-human
  const nh = ['# Needs a human', ''];
  const gaveUpFixes = fixes.filter((f) => f.gaveUp);
  const appBugs = fixes.filter((f) => f.suspectedAppBug);
  if (blocked.length === 0 && gaveUpFixes.length === 0 && appBugs.length === 0) {
    nh.push('Nothing is waiting on you. Every scenario was either generated and run, or skipped by a tag.', '');
  } else {
    if (blocked.length) {
      nh.push('## Scenarios that could not be automated as written', '');
      for (const sc of blocked) {
        nh.push(`### \`${sc.file}:${sc.line}\` — "${sc.name}"`, '');
        nh.push('**Why it was not generated**', '');
        for (const issue of sc.issues.filter((i) => i.severity === 'blocker')) {
          nh.push(`- ${issue.message}${issue.step ? `\n  - in: \`${issue.step}\`` : ''}`);
        }
        nh.push('', 'Please reword the step(s) above, or confirm what you meant, and run the skill again.', '');
      }
    }
    if (appBugs.length) {
      nh.push('## Suspected application bugs', '');
      nh.push('The test matches what you asked for and the locator is correct, so the application looks wrong.', '');
      for (const f of appBugs) nh.push(`- **${f.scenario}** — ${f.change ?? ''}`);
      nh.push('');
    }
    if (gaveUpFixes.length) {
      nh.push(`## Gave up after ${config.agent.maxAutoFixAttempts} attempts`, '');
      for (const f of gaveUpFixes) nh.push(`- **${f.scenario}** — last tried: ${f.change ?? 'n/a'}`);
      nh.push('');
    }
  }

  fs.writeFileSync(path.join(currentDir, 'SUMMARY.md'), summary);
  fs.writeFileSync(path.join(currentDir, 'coverage.md'), cov.join('\n'));
  fs.writeFileSync(path.join(currentDir, 'needs-human.md'), nh.join('\n'));

  // ------------------------------------------------------------- archive it
  const stamp = timestampFrom(results.stats?.startTime);
  let finalDir = path.join(outputDir, stamp);
  let n = 2;
  while (fs.existsSync(finalDir)) finalDir = path.join(outputDir, `${stamp}-${n++}`);
  fs.renameSync(currentDir, finalDir);

  const latest = path.join(outputDir, 'latest');
  try {
    if (fs.existsSync(latest) || fs.lstatSync(latest, { throwIfNoEntry: false })) fs.rmSync(latest, { recursive: true, force: true });
    fs.symlinkSync(path.basename(finalDir), latest, 'junction');
  } catch {
    // Symlinks can be unavailable (Windows without privileges). Leave a pointer.
    fs.writeFileSync(path.join(outputDir, 'latest.txt'), path.basename(finalDir));
  }

  // Prune old runs.
  const runs = fs.readdirSync(outputDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}_/.test(e.name))
    .map((e) => e.name).sort();
  const removed = [];
  while (runs.length > config.report.keepLastRuns) {
    const old = runs.shift();
    fs.rmSync(path.join(outputDir, old), { recursive: true, force: true });
    removed.push(old);
  }

  const out = {
    runDir: path.relative(root, finalDir),
    counts: { passed: passed.length, failed: failed.length, flaky: flaky.length, skipped: skipped.length, blocked: blocked.length },
    prunedRuns: removed,
  };

  if (flags.json) {
    console.log(JSON.stringify({ ...out, failures: failed.map((f) => ({ title: f.title, project: f.project, plain: f.explanation.plain, hint: f.explanation.hint })) }, null, 2));
    return;
  }

  console.log(`\n${bold('Report written')}  ${cyan(out.runDir)}`);
  console.log(`  ${green(`${passed.length} passed`)}  ${failed.length ? red(`${failed.length} failed`) : dim('0 failed')}  ${flaky.length ? yellow(`${flaky.length} flaky`) : dim('0 flaky')}  ${dim(`${skipped.length} skipped`)}${blocked.length ? `  ${yellow(`${blocked.length} need a human`)}` : ''}`);
  if (envDown) console.log(red('\n  Every test failed to load the page — check the environment before anything else.'));
  for (const f of failed) console.log(`\n  ${red('FAIL')} ${f.title}\n       ${f.explanation.plain}`);
  console.log(`\n  ${dim('read:')} ${out.runDir}/SUMMARY.md`);
  if (removed.length) console.log(`  ${dim(`pruned ${removed.length} old run(s)`)}`);
  console.log('');
}

main().catch((e) => {
  console.error(`\n${e.message}\n`);
  process.exitCode = 1;
});
