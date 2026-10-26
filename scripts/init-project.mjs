#!/usr/bin/env node
// Scaffolds a tester's project: folders, templates, scripts, package.json
// entries and dependencies. A tester runs this once and writes no code.
//
// It NEVER overwrites an existing file unless --force, and it never writes
// outside the target folder (hard rule 11).
//
//   node scripts/init-project.mjs --project <dir> [--mode pom|bdd]
//                                 [--no-install] [--dry-run] [--force]

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs, bold, dim, green, yellow, red, cyan } from './lib/out.mjs';

const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATES = path.join(SKILL_ROOT, 'templates');

const FOLDERS = [
  'credentials', 'features', 'generated/pages', 'generated/steps',
  'generated/specs', 'generated/fixtures', '.auth', 'scripts',
];

const PACKAGE_SCRIPTS = {
  'qa:check': 'node scripts/preflight.mjs',
  'qa:explore': 'node scripts/explore.mjs',
  'qa:features': 'node scripts/parse-features.mjs',
  'qa:inventory': 'node scripts/inventory.mjs',
  'qa:report': 'node scripts/report.mjs',
  'qa:open': 'playwright show-report outcome/latest/report',
};

function detectPackageManager(root) {
  if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(root, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

function copyDirInto(src, dest, actions, force) {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      actions.push({ type: 'mkdir', to });
      copyDirInto(from, to, actions, force);
    } else {
      actions.push({ type: fs.existsSync(to) && !force ? 'skip' : 'copy', from, to });
    }
  }
}

async function main() {
  const { flags } = parseArgs();
  if (!flags.project) {
    console.error('Usage: node scripts/init-project.mjs --project <dir> [--mode pom|bdd]');
    process.exitCode = 1;
    return;
  }
  const root = path.resolve(String(flags.project));
  const mode = String(flags.mode ?? 'pom');
  if (!['pom', 'bdd'].includes(mode)) throw new Error(`--mode must be pom or bdd, got "${mode}"`);
  const force = Boolean(flags.force);
  const dryRun = Boolean(flags['dry-run']);

  const inside = (p) => path.resolve(p).startsWith(root + path.sep) || path.resolve(p) === root;

  const actions = [];
  for (const folder of FOLDERS) actions.push({ type: 'mkdir', to: path.join(root, folder) });

  // Files that always land in the project root.
  const fileMap = [
    [path.join(TEMPLATES, 'qa.config.yaml'), path.join(root, 'qa.config.yaml')],
    [path.join(TEMPLATES, 'credentials.env.example'), path.join(root, 'credentials', '.env.example')],
    [path.join(TEMPLATES, 'code', 'tsconfig.json'), path.join(root, 'tsconfig.json')],
    [path.join(TEMPLATES, 'code', 'auth.setup.ts'), path.join(root, 'auth.setup.ts')],
    [path.join(TEMPLATES, 'code', `playwright.config.${mode}.ts`), path.join(root, 'playwright.config.ts')],
    [path.join(TEMPLATES, 'code', 'lib', 'qa-env.ts'), path.join(root, 'lib', 'qa-env.ts')],
    // Only bdd needs a fixtures file on day one (bddgen requires the test
    // instance). A pom project gets one when the agent generates page objects.
    // Nothing installed here may import a file that does not exist yet, or
    // `tsc` fails on a freshly scaffolded project.
    ...(mode === 'bdd'
      ? [[path.join(TEMPLATES, 'code', 'fixtures.bdd.initial.ts'),
          path.join(root, 'generated', 'fixtures', 'index.ts')]]
      : []),
  ];
  actions.push({ type: 'mkdir', to: path.join(root, 'lib') });
  for (const [from, to] of fileMap) {
    actions.push({ type: fs.existsSync(to) && !force ? 'skip' : 'copy', from, to });
  }

  // The scripts travel with the project so it runs in CI without the skill.
  copyDirInto(path.join(SKILL_ROOT, 'scripts'), path.join(root, 'scripts'), actions, force);

  for (const a of actions) {
    if (!inside(a.to)) throw new Error(`refusing to write outside ${root} (hard rule 11): ${a.to}`);
  }

  // ------------------------------------------------------------------- apply
  console.log(`\n${bold(dryRun ? 'Would scaffold' : 'Scaffolding')} ${cyan(root)}  ${dim(`mode: ${mode}`)}\n`);

  let copied = 0, skipped = 0;
  for (const a of actions) {
    if (a.type === 'mkdir') {
      if (!dryRun) fs.mkdirSync(a.to, { recursive: true });
    } else if (a.type === 'copy') {
      if (!dryRun) {
        fs.mkdirSync(path.dirname(a.to), { recursive: true });
        fs.copyFileSync(a.from, a.to);
      }
      copied++;
    } else {
      skipped++;
      console.log(`  ${yellow('kept')} ${path.relative(root, a.to)} ${dim('(already exists — not overwritten)')}`);
    }
  }
  console.log(`  ${green(`${copied} file(s) ${dryRun ? 'to copy' : 'copied'}`)}${skipped ? dim(`, ${skipped} kept`) : ''}`);

  // .gitignore — append, never replace, so an existing one is preserved.
  const gitignorePath = path.join(root, '.gitignore');
  const block = fs.readFileSync(path.join(TEMPLATES, 'gitignore.template'), 'utf8');
  if (!fs.existsSync(gitignorePath)) {
    if (!dryRun) fs.writeFileSync(gitignorePath, block);
    console.log(`  ${green('wrote')} .gitignore`);
  } else {
    const existing = fs.readFileSync(gitignorePath, 'utf8');
    const missing = block.split('\n').filter((l) => l.trim() && !l.startsWith('#') && !existing.includes(l.trim()));
    if (missing.length === 0) {
      console.log(`  ${dim('.gitignore already covers everything')}`);
    } else {
      if (!dryRun) fs.appendFileSync(gitignorePath, `\n# --- added by Playwright QA Agent ---\n${missing.join('\n')}\n`);
      console.log(`  ${green('appended')} ${missing.length} entr(ies) to .gitignore`);
    }
  }

  // package.json
  const pkgPath = path.join(root, 'package.json');
  const pkg = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, 'utf8')) : { name: path.basename(root), private: true, version: '0.0.0' };
  pkg.type ??= 'module';
  pkg.scripts ??= {};
  const testScript = mode === 'bdd' ? 'bddgen test && playwright test' : 'playwright test';
  const wanted = { ...PACKAGE_SCRIPTS, 'qa:test': testScript };
  const added = [];
  for (const [k, v] of Object.entries(wanted)) {
    if (!pkg.scripts[k]) { pkg.scripts[k] = v; added.push(k); }
  }
  if (!dryRun) fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`  ${green(added.length ? `added ${added.length} npm script(s)` : 'npm scripts already present')} ${dim(added.join(', '))}`);

  // ---------------------------------------------------------------- install
  const pm = detectPackageManager(root);
  const deps = ['@playwright/test', 'yaml', 'typescript', '@types/node', ...(mode === 'bdd' ? ['playwright-bdd'] : [])];
  // Install the browsers qa.config.yaml actually asks for.
  let browsers = ['chromium'];
  try {
    const cfgText = fs.readFileSync(path.join(root, 'qa.config.yaml'), 'utf8');
    const m = cfgText.match(/^\s*browsers:\s*\[([^\]]*)\]/m);
    if (m) {
      const named = m[1].split(',').map((b) => b.trim()).filter((b) => ['chromium', 'firefox', 'webkit'].includes(b));
      if (named.length) browsers = named;
    }
  } catch { /* fall back to chromium */ }
  if (flags['no-install'] || dryRun) {
    console.log(`\n  ${dim('skipped install. Run:')}\n    ${pm} ${pm === 'npm' ? 'install -D' : 'add -D'} ${deps.join(' ')}\n    npx playwright install --no-remove ${browsers.join(' ')}`);
  } else {
    console.log(`\n  installing with ${pm}: ${dim(deps.join(', '))}`);
    try {
      execFileSync(pm, [pm === 'npm' ? 'install' : 'add', '-D', ...deps], { cwd: root, stdio: 'inherit' });
      // --no-remove: `playwright install` otherwise deletes browser versions it
      // thinks are unused, which can break OTHER projects on this machine.
      execFileSync('npx', ['playwright', 'install', '--no-remove', ...browsers], { cwd: root, stdio: 'inherit' });
      console.log(`  ${green('dependencies installed')}`);
    } catch (e) {
      console.log(`  ${red('install failed')} — run it by hand:\n    ${pm} ${pm === 'npm' ? 'install -D' : 'add -D'} ${deps.join(' ')}`);
    }
  }

  // ------------------------------------------------------------- what's next
  console.log(`\n${bold('Next')}`);
  console.log(`  1. ${bold('You')}: copy credentials/.env.example to credentials/.env and fill in the real values.`);
  console.log(`     Use a dedicated TEST account and a staging URL. Never production.`);
  console.log(`  2. ${bold('You')}: write your first scenario in features/<module>/<name>.feature`);
  console.log(`  3. Then run: ${cyan('npm run qa:check')}`);
  console.log(`\n  ${dim('Nothing has been generated yet. preflight must pass first.')}\n`);
}

main().catch((e) => {
  console.error(`\n${e.message}\n`);
  process.exitCode = 1;
});
