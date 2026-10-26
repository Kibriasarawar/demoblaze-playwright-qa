#!/usr/bin/env node
// Phase 0. Verify the toolchain, the project layout, the config and the
// credentials BEFORE anything is generated or run.
//
// Prints key NAMES and statuses only — never a secret value, so the output is
// always safe to show the model or paste into a report.
//
//   node scripts/preflight.mjs [--project <dir>] [--json] [--check-url]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Report, parseArgs } from './lib/out.mjs';
import { resolveRoot, findConfigFile, loadConfigFile, validateConfig, requiredEnvKeys } from './lib/config.mjs';
import { loadEnv, describeKey, classifyUrl, checkGitSafety, scanTextForSecrets } from './lib/env.mjs';

const MIN_NODE_MAJOR = 18;

function browsersCacheDir() {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return process.env.PLAYWRIGHT_BROWSERS_PATH;
  const home = os.homedir();
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Caches', 'ms-playwright');
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA || home, 'ms-playwright');
  return path.join(home, '.cache', 'ms-playwright');
}

function resolvePackage(root, name) {
  try {
    const require = createRequire(path.join(root, 'package.json'));
    const pkgPath = require.resolve(`${name}/package.json`);
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
  } catch {
    return null;
  }
}

function listFeatureFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFeatureFiles(p));
    else if (entry.name.endsWith('.feature')) out.push(p);
  }
  return out;
}

async function main() {
  const { flags } = parseArgs();
  const root = resolveRoot(flags);
  const report = new Report('Playwright QA Agent — preflight', root);

  // ---------------------------------------------------------------- toolchain
  report.heading('Toolchain');

  const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10);
  if (nodeMajor >= MIN_NODE_MAJOR) report.pass(`Node ${process.versions.node}`);
  else report.fail(`Node ${process.versions.node} is too old`, `Playwright needs Node ${MIN_NODE_MAJOR} or newer.`);

  const pwVersion = resolvePackage(root, '@playwright/test');
  if (pwVersion) report.pass(`@playwright/test ${pwVersion}`);
  else report.fail('@playwright/test is not installed', 'Run: npm install -D @playwright/test');

  const cache = browsersCacheDir();
  const installedBrowsers = new Set(
    fs.existsSync(cache)
      ? fs.readdirSync(cache)
          .map((d) => (d.match(/^(chromium|firefox|webkit)(?:_headless_shell)?-/) ?? [])[1])
          .filter(Boolean)
      : [],
  );

  // ------------------------------------------------------------------- layout
  report.heading('Project layout');

  const configFile = findConfigFile(root);
  if (configFile) report.pass(`config found: ${path.basename(configFile)}`);
  else report.fail('no qa.config.yaml in this folder', 'Copy templates/qa.config.yaml into the project root.');

  const envFile = path.join(root, 'credentials', '.env');
  const env = loadEnv(envFile);
  if (env.exists) report.pass('credentials/.env found');
  else report.fail('credentials/.env is missing', 'Copy templates/credentials.env.example to credentials/.env and fill it in.');

  const featuresDir = path.join(root, 'features');
  const featureFiles = listFeatureFiles(featuresDir);
  if (featureFiles.length > 0) {
    const modules = new Set(featureFiles.map((f) => path.relative(featuresDir, f).split(path.sep)[0]));
    report.pass(`${featureFiles.length} .feature file(s) across ${modules.size} module(s)`);
  } else if (fs.existsSync(featuresDir)) {
    report.fail('features/ is empty', 'Add at least one .feature file, for example features/login/login.feature');
  } else {
    report.fail('features/ does not exist', 'Create features/<module>/<name>.feature');
  }

  for (const [name, hint] of [
    ['playwright.config.ts', 'Generated during setup — run the skill\'s project setup first.'],
    ['package.json', 'Run: npm init -y'],
  ]) {
    if (fs.existsSync(path.join(root, name))) report.pass(`${name} present`);
    else report.warn(`${name} is missing`, hint);
  }

  // ------------------------------------------------------------------- config
  report.heading('Config');

  let config = null;
  if (configFile) {
    try {
      const { data, parser } = await loadConfigFile(configFile);
      if (parser === 'yaml-lite') {
        report.warn('parsed with the built-in fallback parser', 'The `yaml` package is not installed, so unusual YAML may be misread. Run: npm install -D yaml');
      }
      const result = validateConfig(data);
      config = result.config;
      for (const e of result.errors) report.fail(e);
      for (const w of result.warnings) report.warn(w);
      if (result.errors.length === 0) {
        report.pass(`mode "${config.mode}", ${config.auth.roles.length} role(s), browsers: ${config.run.browsers.join(', ')}`);
      }
      // Check the browsers THIS config asks for, not just that some exist.
      const missingBrowsers = config.run.browsers.filter((b) => !installedBrowsers.has(b));
      if (missingBrowsers.length === 0) {
        report.pass(`browser(s) installed: ${config.run.browsers.join(', ')}`);
      } else {
        report.fail(
          `qa.config.yaml asks for ${missingBrowsers.join(', ')}, which is not installed`,
          `Run: npx playwright install --no-remove ${missingBrowsers.join(' ')}`,
        );
      }
      if (config.mode === 'bdd') {
        const bdd = resolvePackage(root, 'playwright-bdd');
        if (bdd) report.pass(`playwright-bdd ${bdd}`);
        else report.fail('mode is "bdd" but playwright-bdd is not installed', 'Run: npm install -D playwright-bdd');
      }
    } catch (e) {
      report.fail(`could not read ${path.basename(configFile)}`, e.message);
    }
  }

  // -------------------------------------------------------------- credentials
  report.heading('Credentials (names only — no values are read out)');

  if (config && env.exists) {
    const needed = requiredEnvKeys(config);
    const described = needed.map((k) => describeKey(env.vars, k));
    for (const d of described) {
      if (d.status === 'set') report.pass(`${d.key} is set (${d.length} characters)`);
      else if (d.status === 'empty') report.fail(`${d.key} is present but empty`);
      else if (d.status === 'placeholder') report.fail(`${d.key} still holds a placeholder value`);
      else report.fail(`${d.key} is missing from credentials/.env`);
    }
    const extra = [...env.vars.keys()].filter((k) => !needed.includes(k));
    if (extra.length > 0) report.info(`also defined (unused by this config): ${extra.join(', ')}`);
  } else if (!config) {
    report.info('skipped — config could not be read');
  }

  // ------------------------------------------------------------------- safety
  report.heading('Safety');

  if (config && env.exists) {
    const baseUrl = env.vars.get(config.app.baseUrlEnv);
    const verdict = classifyUrl(baseUrl);
    const where = `${config.app.baseUrlEnv} in credentials/.env`;
    if (verdict.verdict === 'non-production') {
      report.pass(`target looks like a test environment (${verdict.reason})`);
    } else if (verdict.verdict === 'production') {
      report.fail(`REFUSING TO RUN: ${config.app.baseUrlEnv} looks like production — ${verdict.reason}`,
        'Automated tests can create, change and delete real data. Point this at staging or QA.');
    } else if (verdict.verdict === 'unknown') {
      report.warn(`cannot confirm this is a test environment — ${verdict.reason}`,
        `Confirm with a human that ${verdict.host} is safe to test against before generating or running anything.`);
    } else if (verdict.verdict === 'credentials-in-url') {
      report.fail(`${where}: ${verdict.reason}`);
    } else {
      report.fail(`${where}: ${verdict.reason}`);
    }
  }

  // Directory patterns in .gitignore end in "/", and git check-ignore only
  // matches those when the path it is given also ends in "/".
  const outputDir = String(config?.report?.outputDir ?? 'outcome').replace(/\/$/, '');
  const gitPaths = ['credentials/.env', '.auth/', `${outputDir}/`];
  const git = checkGitSafety(root, gitPaths);
  if (!git.isRepo) {
    report.info('not a git repository — nothing can be committed by accident yet');
  } else {
    for (const r of git.results) {
      if (r.tracked) {
        report.fail(`${r.path} is TRACKED BY GIT`, `Run: git rm -r --cached ${r.path}   then commit. Secrets in history stay in history.`);
      } else if (r.ignored) {
        report.pass(`${r.path} is git-ignored`);
      } else {
        report.fail(`${r.path} is not git-ignored`, 'Add the entries from templates/gitignore.template to .gitignore.');
      }
    }
  }

  // Credentials pasted into files that DO get committed.
  for (const rel of ['qa.config.yaml', 'qa.config.yml', 'qa.config.json']) {
    const p = path.join(root, rel);
    if (!fs.existsSync(p)) continue;
    const hits = scanTextForSecrets(fs.readFileSync(p, 'utf8'));
    if (hits.length > 0) {
      report.fail(`${rel} appears to contain a credential`,
        `Line(s): ${hits.map((h) => h.line).join(', ')}. Move the value to credentials/.env and reference the variable name.`);
    }
  }
  for (const f of featureFiles) {
    const hits = scanTextForSecrets(fs.readFileSync(f, 'utf8'));
    if (hits.length > 0) {
      report.fail(`${path.relative(root, f)} appears to contain a credential`,
        `Line(s): ${hits.map((h) => h.line).join(', ')}. Use a @role tag instead of writing a password in Gherkin.`);
    }
  }

  // ------------------------------------------------------------ optional ping
  if (flags['check-url'] && config && env.exists) {
    report.heading('Reachability');
    const baseUrl = env.vars.get(config.app.baseUrlEnv);
    try {
      const res = await fetch(baseUrl, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(15000) });
      if (res.ok) report.pass(`responded ${res.status}`);
      else report.warn(`responded ${res.status} ${res.statusText}`);
    } catch (e) {
      report.fail('the app did not respond', `${e.message}. Check the URL, a VPN requirement, or whether the environment is up.`);
    }
  }

  report.finish({ json: Boolean(flags.json) });
}

main().catch((e) => {
  console.error(`preflight crashed: ${e.stack}`);
  process.exitCode = 1;
});
