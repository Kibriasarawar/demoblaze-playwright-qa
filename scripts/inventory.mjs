#!/usr/bin/env node
// Phase 1. Index what already exists in generated/ so the agent extends it
// instead of creating a second page object for the same page (hard rule 10).
//
// Also compares each file against .qa-manifest.json: a file whose hash changed
// has been edited by a human and must not be silently overwritten.
//
//   node scripts/inventory.mjs [--project <dir>] [--json] [--out <file>]

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseArgs, bold, dim, green, yellow, cyan, red } from './lib/out.mjs';
import { resolveRoot } from './lib/config.mjs';

const MANIFEST = '.qa-manifest.json';

function walk(dir, exts) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p, exts));
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(p);
  }
  return out;
}

const sha = (text) => crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);

// Strip comments and string bodies so patterns below cannot match inside them.
function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function extractPageObject(src, rel) {
  const code = codeOnly(src);
  const classes = [];
  const classRe = /export\s+(?:default\s+)?class\s+([A-Za-z0-9_]+)(?:\s+extends\s+([A-Za-z0-9_.]+))?/g;
  let m;
  while ((m = classRe.exec(code))) classes.push({ name: m[1], extends: m[2] ?? null, at: m.index });

  const methods = [];
  const methodRe = /^\s{2}(?:(?:public|private|protected|readonly|static)\s+)*(?:async\s+)?([A-Za-z0-9_]+)\s*\(([^)]*)\)\s*(?::\s*[^{]+)?\{/gm;
  while ((m = methodRe.exec(code))) {
    if (['constructor', 'if', 'for', 'while', 'switch', 'catch'].includes(m[1])) continue;
    methods.push({ name: m[1], params: m[2].trim() });
  }

  // Locator-bearing properties, and which Playwright locator API each uses.
  const locators = [];
  const locRe = /(?:readonly\s+|private\s+|public\s+)?([A-Za-z0-9_]+)\s*(?::\s*Locator)?\s*=\s*([^;\n]*?(?:getBy[A-Za-z]+|locator|frameLocator)\([^;\n]*)/g;
  while ((m = locRe.exec(code))) {
    const expr = m[2];
    const api = (expr.match(/getBy[A-Za-z]+|frameLocator|locator/) ?? ['locator'])[0];
    locators.push({ property: m[1], api, risky: api === 'locator' });
  }

  const urlPaths = [...src.matchAll(/goto\(\s*[`'"]([^`'"]*)[`'"]/g)].map((x) => x[1]);

  return { kind: 'page-object', file: rel, classes, methods, locators, urlPaths };
}

function extractSteps(src, rel) {
  const code = codeOnly(src);
  const steps = [];
  const re = /\b(Given|When|Then)\s*\(\s*(['"`])([\s\S]*?)\2/g;
  let m;
  while ((m = re.exec(code))) {
    steps.push({ keyword: m[1], pattern: m[3], line: code.slice(0, m.index).split('\n').length });
  }
  return { kind: 'steps', file: rel, steps };
}

function extractSpec(src, rel) {
  const code = codeOnly(src);
  const tests = [];
  const re = /\b(test|it)(?:\.(?:only|skip|fixme))?\s*\(\s*(['"`])([\s\S]*?)\2/g;
  let m;
  while ((m = re.exec(code))) {
    tests.push({ name: m[3], line: code.slice(0, m.index).split('\n').length });
  }
  const describes = [...code.matchAll(/\b(?:test\.)?describe(?:\.\w+)?\s*\(\s*(['"`])([\s\S]*?)\1/g)].map((x) => x[2]);
  const usedStorageState = [...src.matchAll(/storageState\s*:\s*['"`]([^'"`]+)['"`]/g)].map((x) => x[1]);

  // Rule violations worth surfacing without running anything.
  const smells = [];
  if (/waitForTimeout\s*\(/.test(code)) smells.push('uses waitForTimeout — hard rule 3 forbids fixed waits');
  if (/\.(skip|fixme)\s*\(/.test(code)) smells.push('contains a skipped test');
  if (/https?:\/\//.test(code)) smells.push('contains a hardcoded URL — hard rule 9');
  if (!/\bexpect\s*\(/.test(code)) smells.push('no expect() in this file — hard rule 4');

  return { kind: 'spec', file: rel, tests, describes, usedStorageState, smells };
}

function extractFixtures(src, rel) {
  const code = codeOnly(src);
  const exported = [...code.matchAll(/export\s+(?:const|function|type|interface)\s+([A-Za-z0-9_]+)/g)].map((x) => x[1]);
  const fixtureNames = [...code.matchAll(/^\s{2}([A-Za-z0-9_]+)\s*:\s*(?:async\s*)?\(/gm)].map((x) => x[1]);
  return { kind: 'fixture', file: rel, exported, fixtureNames };
}

function main() {
  const { flags } = parseArgs();
  const root = resolveRoot(flags);
  const generated = path.join(root, 'generated');

  const areas = [
    { dir: 'generated/pages', extract: extractPageObject },
    { dir: 'generated/steps', extract: extractSteps },
    { dir: 'generated/specs', extract: extractSpec },
    { dir: 'generated/fixtures', extract: extractFixtures },
  ];

  const manifestPath = path.join(generated, MANIFEST);
  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    : { files: {} };

  const result = {
    generatedAt: new Date().toISOString(),
    root,
    exists: fs.existsSync(generated),
    pages: [], steps: [], specs: [], fixtures: [],
    humanEdited: [], untracked: [], missing: [],
    stats: {},
  };

  for (const area of areas) {
    for (const file of walk(path.join(root, area.dir), ['.ts', '.js', '.mts'])) {
      const rel = path.relative(root, file);
      const src = fs.readFileSync(file, 'utf8');
      const hash = sha(src);
      const entry = { ...area.extract(src, rel), hash, lines: src.split('\n').length };

      const recorded = manifest.files?.[rel];
      if (!recorded) {
        result.untracked.push(rel);
        entry.ownership = 'untracked';
      } else if (recorded.hash !== hash) {
        result.humanEdited.push(rel);
        entry.ownership = 'human-edited';
      } else {
        entry.ownership = 'agent-owned';
      }

      const bucket = { 'page-object': 'pages', steps: 'steps', spec: 'specs', fixture: 'fixtures' }[entry.kind];
      result[bucket].push(entry);
    }
  }

  for (const rel of Object.keys(manifest.files ?? {})) {
    if (!fs.existsSync(path.join(root, rel))) result.missing.push(rel);
  }

  const allStepPatterns = result.steps.flatMap((f) => f.steps.map((s) => `${s.keyword} ${s.pattern}`));
  const duplicatePatterns = allStepPatterns.filter((p, i, a) => a.indexOf(p) !== i);

  result.stats = {
    pageObjects: result.pages.reduce((n, f) => n + f.classes.length, 0),
    pageFiles: result.pages.length,
    pageMethods: result.pages.reduce((n, f) => n + f.methods.length, 0),
    locators: result.pages.reduce((n, f) => n + f.locators.length, 0),
    riskyLocators: result.pages.reduce((n, f) => n + f.locators.filter((l) => l.risky).length, 0),
    stepDefinitions: allStepPatterns.length,
    duplicateStepPatterns: duplicatePatterns.length,
    specFiles: result.specs.length,
    tests: result.specs.reduce((n, f) => n + f.tests.length, 0),
    humanEdited: result.humanEdited.length,
    untracked: result.untracked.length,
    missing: result.missing.length,
  };
  result.duplicateStepPatterns = [...new Set(duplicatePatterns)];
  result.smells = result.specs.flatMap((f) => f.smells.map((m) => ({ file: f.file, message: m })));

  if (flags.out) {
    const dest = path.resolve(root, String(flags.out));
    if (!dest.startsWith(root)) throw new Error('refusing to write outside the project folder (hard rule 11)');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, JSON.stringify(result, null, 2));
  }

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const s = result.stats;
  console.log(`\n${bold('Existing test code')}  ${dim(root)}`);
  if (!result.exists) {
    console.log(`\n${dim('generated/ does not exist yet — nothing to reuse, everything will be new.')}\n`);
    return;
  }
  console.log(`\n${s.pageObjects} page object(s) in ${s.pageFiles} file(s), ${s.pageMethods} method(s), ${s.locators} locator(s)`);
  console.log(`${s.stepDefinitions} step definition(s), ${s.specFiles} spec file(s), ${s.tests} test(s)`);

  if (result.pages.length) {
    console.log(`\n${bold('Reuse these before writing a new page object')}`);
    for (const f of result.pages) {
      const own = f.ownership === 'human-edited' ? yellow(' [human-edited]') : f.ownership === 'untracked' ? dim(' [untracked]') : '';
      console.log(`  ${cyan(f.file)}${own}`);
      for (const c of f.classes) console.log(`    class ${bold(c.name)}${c.extends ? dim(` extends ${c.extends}`) : ''}`);
      if (f.methods.length) console.log(`    methods: ${f.methods.map((m) => `${m.name}()`).join(', ')}`);
      if (f.locators.length) console.log(`    locators: ${f.locators.map((l) => `${l.property}${l.risky ? red('*') : ''}`).join(', ')}`);
    }
    if (s.riskyLocators) console.log(dim(`\n  ${red('*')} raw .locator() / CSS — replace with getByRole or getByLabel when you touch these`));
  }

  if (result.steps.length) {
    console.log(`\n${bold('Reuse these step definitions')}`);
    for (const f of result.steps) {
      console.log(`  ${cyan(f.file)}`);
      for (const st of f.steps) console.log(`    ${st.keyword} ${st.pattern}`);
    }
  }

  if (result.duplicateStepPatterns.length) {
    console.log(`\n${red('Duplicate step definitions — these will clash at runtime')}`);
    for (const p of result.duplicateStepPatterns) console.log(`  ${p}`);
  }
  if (result.humanEdited.length) {
    console.log(`\n${yellow('Edited by a human — extend, do not overwrite')}`);
    for (const f of result.humanEdited) console.log(`  ${f}`);
  }
  if (result.missing.length) {
    console.log(`\n${dim('In the manifest but deleted from disk:')}`);
    for (const f of result.missing) console.log(`  ${f}`);
  }
  if (result.smells.length) {
    console.log(`\n${red('Hard-rule violations in existing code')}`);
    for (const x of result.smells) console.log(`  ${x.file}: ${x.message}`);
  }
  console.log('');
}

try {
  main();
} catch (e) {
  console.error(`\n${e.message}\n`);
  process.exitCode = 1;
}
