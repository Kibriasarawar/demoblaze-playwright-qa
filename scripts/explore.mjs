#!/usr/bin/env node
// Phase 3 fallback for when Playwright MCP is not available.
//
// Opens one real page using the saved session for a role and writes what is
// actually there: the accessibility tree, every interactive element with a
// ready-to-use locator, and which of those locators are ambiguous.
//
// It is READ-ONLY. It never clicks, submits or types, so it cannot trigger a
// destructive action while exploring.
//
//   node scripts/explore.mjs /checkout [--role admin] [--project <dir>] [--json]

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { parseArgs, bold, dim, green, yellow, red, cyan } from './lib/out.mjs';
import { resolveRoot, findConfigFile, loadConfigFile, validateConfig } from './lib/config.mjs';
import { loadEnv, classifyUrl } from './lib/env.mjs';

// Roles worth generating locators for; "text" and generic containers are noise.
const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'checkbox', 'radio', 'combobox', 'listbox', 'option',
  'slider', 'spinbutton', 'switch', 'tab', 'menuitem', 'menuitemcheckbox', 'searchbox',
]);
const LANDMARK_ROLES = new Set(['heading', 'alert', 'status', 'dialog', 'table', 'row', 'cell', 'list', 'listitem', 'img']);

function flatten(nodes, out = [], depth = 0) {
  for (const node of nodes ?? []) {
    out.push({ ...node, depth });
    if (node.children) flatten(node.children, out, depth + 1);
  }
  return out;
}

function escapeForQuotes(s) {
  return String(s).replace(/'/g, "\\'");
}

function suggestLocator(node) {
  const name = node.name ? `, { name: '${escapeForQuotes(node.name)}' }` : '';
  return `getByRole('${node.role}'${name})`;
}

async function main() {
  const { flags, positional } = parseArgs();
  const root = resolveRoot(flags);
  const target = positional[0];
  if (!target) {
    console.error('Usage: node scripts/explore.mjs <path-or-url> [--role <name>] [--json]');
    process.exitCode = 1;
    return;
  }

  const configFile = findConfigFile(root);
  if (!configFile) throw new Error('No qa.config.yaml found. Run: node scripts/preflight.mjs');
  const { data } = await loadConfigFile(configFile);
  const { config, errors } = validateConfig(data);
  if (errors.length > 0) {
    throw new Error(`qa.config.yaml has errors. Run: node scripts/preflight.mjs\n  ${errors.join('\n  ')}`);
  }

  const env = loadEnv(path.join(root, 'credentials', '.env'));
  const baseUrl = env.vars.get(config.app.baseUrlEnv);
  if (!baseUrl) throw new Error(`${config.app.baseUrlEnv} is not set in credentials/.env`);

  const verdict = classifyUrl(baseUrl);
  if (verdict.verdict === 'production') {
    throw new Error(`Refusing to explore: ${config.app.baseUrlEnv} looks like production (${verdict.reason}).`);
  }

  const url = /^https?:\/\//i.test(target) ? target : new URL(target, baseUrl).toString();
  const role = String(flags.role ?? config.auth.defaultRole ?? 'default');
  const storagePath = path.join(root, '.auth', `${role}.json`);
  const hasSession = fs.existsSync(storagePath);

  const require = createRequire(path.join(root, 'package.json'));
  let playwright;
  try {
    playwright = require('playwright');
  } catch {
    throw new Error('Playwright is not installed in this project. Run: npm install -D @playwright/test');
  }

  const browserName = config.run.browsers[0] ?? 'chromium';
  const browser = await playwright[browserName].launch({ headless: !flags.headed });
  const context = await browser.newContext({
    viewport: config.run.viewport,
    // Reference the session file by path. Its contents are never read into logs.
    ...(hasSession ? { storageState: storagePath } : {}),
  });
  await context.addInitScript(() => {});
  const page = await context.newPage();

  const result = { url, role, browser: browserName, usedSession: hasSession, warnings: [] };

  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.run.navigationTimeoutMs });
    result.status = response?.status() ?? null;
    await page.waitForLoadState('load', { timeout: config.run.navigationTimeoutMs }).catch(() => {});
    result.finalUrl = page.url();
    result.title = await page.title();

    // The single most common cause of confusing failures.
    if (config.auth.loginPath && result.finalUrl.includes(config.auth.loginPath) && !url.includes(config.auth.loginPath)) {
      result.warnings.push(
        hasSession
          ? `Redirected to ${config.auth.loginPath} — the saved session for "${role}" has expired. Delete .auth/ and re-run the setup project.`
          : `Redirected to ${config.auth.loginPath} — there is no saved session for "${role}". Run the tests once so the setup project can log in.`,
      );
    }
    if (!hasSession) {
      result.warnings.push(`.auth/${role}.json does not exist, so this page was opened logged out.`);
    }

    result.ariaSnapshot = await page.locator('body').ariaSnapshot();
    const tree = await page.locator('body').ariaSnapshotJSON();
    const flat = flatten(tree);

    // Count role+name pairs so we can tell unique locators from ambiguous ones.
    const counts = new Map();
    for (const n of flat) {
      if (!n.role) continue;
      const key = `${n.role}\u0000${n.name ?? ''}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const seen = new Set();
    result.elements = [];
    for (const n of flat) {
      if (!n.role) continue;
      if (!INTERACTIVE_ROLES.has(n.role) && !LANDMARK_ROLES.has(n.role)) continue;
      const key = `${n.role}\u0000${n.name ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const count = counts.get(key);
      result.elements.push({
        role: n.role,
        name: n.name ?? null,
        count,
        interactive: INTERACTIVE_ROLES.has(n.role),
        locator: suggestLocator(n),
        unique: count === 1,
      });
    }

    // DOM-level detail the aria tree does not carry.
    const testIdAttr = config.agent.testIdAttribute;
    result.formControls = await page.evaluate((attr) => {
      const labelFor = (el) => {
        if (el.labels && el.labels.length > 0) return el.labels[0].textContent.trim();
        const aria = el.getAttribute('aria-label');
        if (aria) return aria.trim();
        const wrapping = el.closest('label');
        return wrapping ? wrapping.textContent.trim() : null;
      };
      return [...document.querySelectorAll('input, select, textarea')]
        .filter((el) => el.type !== 'hidden')
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute('type'),
          label: labelFor(el),
          placeholder: el.getAttribute('placeholder'),
          testId: el.getAttribute(attr),
          name: el.getAttribute('name'),
          required: el.hasAttribute('required'),
          disabled: el.disabled,
        }));
    }, testIdAttr);

    result.testIds = await page.evaluate(
      (attr) => [...document.querySelectorAll(`[${attr}]`)].map((el) => el.getAttribute(attr)),
      testIdAttr,
    );
    result.frames = page.frames().slice(1).map((f) => ({ name: f.name(), url: f.url() }));
  } finally {
    await browser.close();
  }

  // ---------------------------------------------------------------- write it
  const slug = (target.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'home');
  const outRel = flags.out ? String(flags.out) : path.posix.join(config.report.outputDir, 'exploration', `${slug}.md`);
  const dest = path.resolve(root, outRel);
  if (!dest.startsWith(root)) throw new Error('refusing to write outside the project folder (hard rule 11)');

  const md = renderMarkdown(result, config);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, md);

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`\n${bold('Explored')} ${cyan(result.url)}  ${dim(`as "${role}" in ${browserName}`)}`);
  console.log(`${dim('title:')} ${result.title}   ${dim('status:')} ${result.status}`);
  for (const w of result.warnings) console.log(`${yellow('warn')}  ${w}`);

  const interactive = result.elements.filter((e) => e.interactive);
  const ambiguous = result.elements.filter((e) => !e.unique);
  console.log(`\n${interactive.length} interactive element(s), ${result.formControls.length} form control(s)`);
  if (ambiguous.length) {
    console.log(`${red(`${ambiguous.length} locator(s) are ambiguous`)} ${dim('— scope them to a container, do not use .first()')}`);
    for (const e of ambiguous.slice(0, 8)) console.log(`  ${red(String(e.count) + '×')} ${e.locator}`);
  }
  console.log(`\n${bold('Use these locators')} ${dim('(copy exactly — they came from the real page)')}`);
  for (const e of interactive.filter((x) => x.unique).slice(0, 25)) {
    console.log(`  ${green('ok')} ${e.locator}`);
  }
  console.log(`\nFull snapshot written to ${cyan(path.relative(root, dest))}\n`);
}

function renderMarkdown(r, config) {
  const lines = [];
  lines.push(`# Page snapshot — ${r.url}`, '');
  lines.push(`- **Opened as role** \`${r.role}\`${r.usedSession ? ' (saved session)' : ' (no session — logged out)'}`);
  lines.push(`- **Browser** ${r.browser}`);
  lines.push(`- **HTTP status** ${r.status}`);
  lines.push(`- **Final URL** ${r.finalUrl}`);
  lines.push(`- **Title** ${r.title}`, '');

  if (r.warnings.length) {
    lines.push('## Warnings', '');
    for (const w of r.warnings) lines.push(`- ${w}`);
    lines.push('');
  }

  const interactive = r.elements.filter((e) => e.interactive);
  const ambiguous = r.elements.filter((e) => !e.unique);

  lines.push('## Locators you may use', '');
  lines.push('Copy these exactly. They were read from the live page, so they satisfy hard rule 1.', '');
  if (interactive.filter((e) => e.unique).length === 0) {
    lines.push('_No uniquely addressable interactive elements found._', '');
  } else {
    lines.push('| Locator | Role | Accessible name |', '| --- | --- | --- |');
    for (const e of interactive.filter((x) => x.unique)) {
      lines.push(`| \`${e.locator}\` | ${e.role} | ${e.name ?? '_(none)_'} |`);
    }
    lines.push('');
  }

  if (ambiguous.length) {
    lines.push('## Ambiguous — do NOT use as-is', '');
    lines.push('These match more than one element. Scope them to a container; never add `.first()` (hard rule, see references/03-locator-rules.md).', '');
    lines.push('| Locator | Matches |', '| --- | --- |');
    for (const e of ambiguous) lines.push(`| \`${e.locator}\` | ${e.count} elements |`);
    lines.push('');
  }

  if (r.formControls.length) {
    lines.push('## Form controls', '');
    lines.push('| Tag | Type | Label | Placeholder | testId | Required | Suggested locator |', '| --- | --- | --- | --- | --- | --- | --- |');
    for (const f of r.formControls) {
      const suggested = f.label
        ? `getByLabel('${String(f.label).replace(/'/g, "\\'")}')`
        : f.placeholder
          ? `getByPlaceholder('${String(f.placeholder).replace(/'/g, "\\'")}')`
          : f.testId
            ? `getByTestId('${f.testId}')`
            : '_none — ask for a data-testid_';
      lines.push(`| ${f.tag} | ${f.type ?? ''} | ${f.label ?? ''} | ${f.placeholder ?? ''} | ${f.testId ?? ''} | ${f.required ? 'yes' : ''} | \`${suggested}\` |`);
    }
    lines.push('');
  }

  const ids = [...new Set(r.testIds.filter(Boolean))];
  if (ids.length) {
    lines.push(`## \`${config.agent.testIdAttribute}\` values present`, '', ids.map((t) => `\`${t}\``).join(', '), '');
  }

  if (r.frames.length) {
    lines.push('## Iframes', '');
    lines.push('Reach inside with `page.frameLocator(...)`. A third-party payment iframe may block automation entirely — report that rather than working around it.', '');
    for (const f of r.frames) lines.push(`- \`${f.name || '(unnamed)'}\` → ${f.url}`);
    lines.push('');
  }

  lines.push('## Accessibility tree', '', '```yaml', r.ariaSnapshot, '```', '');
  return lines.join('\n');
}

main().catch((e) => {
  console.error(`\n${e.message}\n`);
  process.exitCode = 1;
});
